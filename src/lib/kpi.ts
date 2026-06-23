/**
 * Dashboard KPI engine — pure functions over raw rows, so every figure is
 * testable and the dashboard stays a thin view.
 *
 * Conventions (Indian SMB accounting):
 * - Periods follow the Indian financial year (Apr 1 – Mar 31); quarters are
 *   FY quarters (Q1 = Apr–Jun).
 * - Documents are bucketed by their DOCUMENT date (invoice_date / bill_date /
 *   expense_date), falling back to created_at — never by row creation alone.
 * - Receivables exclude drafts (an unsent invoice is not money owed) and
 *   cancelled invoices. Overdue = past due_date or explicitly marked.
 * - GST position = output tax on issued invoices (liability arises on issue,
 *   not payment) minus input tax credit on purchase bills.
 */

export type PeriodKey = "all" | "this_month" | "last_month" | "this_quarter" | "this_fy";

export interface InvoiceRow {
  status: string;
  total: number | null;
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
  invoice_date?: string | null;
  due_date?: string | null;
  created_at: string;
  customer_name?: string | null;
}

export interface PurchaseRow {
  status: string;
  total: number | null;
  amount_paid: number | null;
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
  bill_date?: string | null;
  created_at: string;
}

export interface ExpenseRow {
  amount: number | null;
  expense_date?: string | null;
  created_at: string;
}

interface DateRange {
  start: Date | null; // null = unbounded
  end: Date | null;
}

export interface PeriodInfo {
  current: DateRange;
  previous: DateRange | null; // comparison window; null for "all"
  label: string;
}

// ── Period windows ────────────────────────────────────────────────────────────

export function getPeriodInfo(period: PeriodKey, now = new Date()): PeriodInfo {
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (period) {
    case "this_month": {
      return {
        current: { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59, 999) },
        previous: { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59, 999) },
        label: now.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      };
    }
    case "last_month": {
      return {
        current: { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59, 999) },
        previous: { start: new Date(y, m - 2, 1), end: new Date(y, m - 1, 0, 23, 59, 59, 999) },
        label: new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      };
    }
    case "this_quarter": {
      // Indian FY quarters: Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar
      const fyQuarterStartMonth = m >= 3 ? 3 + Math.floor((m - 3) / 3) * 3 : 0;
      const qStart = new Date(y, fyQuarterStartMonth, 1);
      const qNum = m >= 3 ? Math.floor((m - 3) / 3) + 1 : 4;
      return {
        current: { start: qStart, end: new Date(y, fyQuarterStartMonth + 3, 0, 23, 59, 59, 999) },
        previous: {
          start: new Date(y, fyQuarterStartMonth - 3, 1),
          end: new Date(y, fyQuarterStartMonth, 0, 23, 59, 59, 999),
        },
        label: `Q${qNum} FY${String((m >= 3 ? y : y - 1) % 100).padStart(2, "0")}–${String((m >= 3 ? y + 1 : y) % 100).padStart(2, "0")}`,
      };
    }
    case "this_fy": {
      const fyStartYear = m >= 3 ? y : y - 1;
      return {
        current: {
          start: new Date(fyStartYear, 3, 1),
          end: new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999),
        },
        previous: {
          start: new Date(fyStartYear - 1, 3, 1),
          end: new Date(fyStartYear, 2, 31, 23, 59, 59, 999),
        },
        label: `FY ${fyStartYear}–${String((fyStartYear + 1) % 100).padStart(2, "0")}`,
      };
    }
    default:
      return { current: { start: null, end: null }, previous: null, label: "All time" };
  }
}

function inRange(dateStr: string | null | undefined, range: DateRange): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  if (range.start && d < range.start) return false;
  if (range.end && d > range.end) return false;
  return true;
}

const invDate = (i: InvoiceRow) => i.invoice_date || i.created_at;
const purDate = (p: PurchaseRow) => p.bill_date || p.created_at;
const expDate = (e: ExpenseRow) => e.expense_date || e.created_at;

/** % change vs previous period; null when no meaningful baseline. */
function delta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

const sum = (ns: (number | null | undefined)[]) => ns.reduce((s: number, n) => s + (n || 0), 0);
const taxOf = (r: { cgst?: number | null; sgst?: number | null; igst?: number | null }) =>
  (r.cgst || 0) + (r.sgst || 0) + (r.igst || 0);

// Document-status predicates
const isIssued = (i: InvoiceRow) => i.status !== "draft" && i.status !== "cancelled";
const isCollected = (i: InvoiceRow) => i.status === "paid";
const isOutstanding = (i: InvoiceRow) => i.status === "sent" || i.status === "overdue";
const isOverdue = (i: InvoiceRow, today: Date) =>
  isOutstanding(i) && (i.status === "overdue" || (!!i.due_date && new Date(i.due_date) < today));

// ── KPI computation ───────────────────────────────────────────────────────────

export interface MonthPoint {
  label: string; // "Jun"
  fullLabel: string; // "Jun 2026"
  collected: number;
  billed: number;
}

export interface Debtor {
  name: string;
  outstanding: number;
  overdue: boolean;
  count: number;
}

export interface Kpis {
  periodLabel: string;
  // Sales
  billed: number;
  billedCount: number;
  collected: number;
  collectedDelta: number | null;
  collectionRate: number | null; // collected / billed, 0..100
  // Balances
  receivables: number;
  receivablesCount: number;
  overdueAmount: number;
  overdueCount: number;
  payables: number;
  payablesCount: number;
  // Spend
  expenses: number;
  expensesDelta: number | null;
  // GST
  gstOutput: number;
  gstItc: number;
  gstNet: number; // > 0 payable, < 0 credit carried
  // Cash
  cashIn: number;
  cashOut: number;
  netCash: number;
  // Series
  monthlyTrend: MonthPoint[];
  topDebtors: Debtor[];
}

export function computeKpis(
  invoices: InvoiceRow[],
  purchases: PurchaseRow[],
  expenses: ExpenseRow[],
  period: PeriodKey,
  now = new Date()
): Kpis {
  const { current, previous, label } = getPeriodInfo(period, now);

  const inv = invoices.filter((i) => inRange(invDate(i), current));
  const pur = purchases.filter((p) => inRange(purDate(p), current));
  const exp = expenses.filter((e) => inRange(expDate(e), current));

  const issued = inv.filter(isIssued);
  const collectedInv = inv.filter(isCollected);
  const outstandingInv = inv.filter(isOutstanding);
  const overdueInv = inv.filter((i) => isOverdue(i, now));

  const billed = sum(issued.map((i) => i.total));
  const collected = sum(collectedInv.map((i) => i.total));
  const receivables = sum(outstandingInv.map((i) => i.total));
  const overdueAmount = sum(overdueInv.map((i) => i.total));

  const activePur = pur.filter((p) => p.status !== "cancelled");
  const unpaidPur = activePur.filter((p) => p.status !== "paid");
  const payables = sum(unpaidPur.map((p) => (p.total || 0) - (p.amount_paid || 0)));
  const purchasePaid = sum(activePur.map((p) => p.amount_paid));

  const expensesTotal = sum(exp.map((e) => e.amount));

  // GST: liability on issue, credit on purchase bill
  const gstOutput = sum(issued.map(taxOf));
  const gstItc = sum(activePur.map(taxOf));
  const gstNet = gstOutput - gstItc;

  const cashIn = collected;
  const cashOut = expensesTotal + purchasePaid;

  // vs previous equivalent period
  let collectedDelta: number | null = null;
  let expensesDelta: number | null = null;
  if (previous) {
    const prevCollected = sum(
      invoices.filter((i) => inRange(invDate(i), previous) && isCollected(i)).map((i) => i.total)
    );
    const prevExpenses = sum(
      expenses.filter((e) => inRange(expDate(e), previous)).map((e) => e.amount)
    );
    collectedDelta = delta(collected, prevCollected);
    expensesDelta = delta(expensesTotal, prevExpenses);
  }

  // 12-month revenue trend — independent of the period filter
  const monthlyTrend: MonthPoint[] = [];
  for (let k = 11; k >= 0; k--) {
    const mStart = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const mRange: DateRange = {
      start: mStart,
      end: new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0, 23, 59, 59, 999),
    };
    const monthInvoices = invoices.filter((i) => inRange(invDate(i), mRange));
    monthlyTrend.push({
      label: mStart.toLocaleDateString("en-IN", { month: "short" }),
      fullLabel: mStart.toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
      collected: sum(monthInvoices.filter(isCollected).map((i) => i.total)),
      billed: sum(monthInvoices.filter(isIssued).map((i) => i.total)),
    });
  }

  // Who owes the most (within the selected period's invoices)
  const debtorMap = new Map<string, Debtor>();
  for (const i of outstandingInv) {
    const name = i.customer_name || "Unknown";
    const d = debtorMap.get(name) || { name, outstanding: 0, overdue: false, count: 0 };
    d.outstanding += i.total || 0;
    d.count += 1;
    if (isOverdue(i, now)) d.overdue = true;
    debtorMap.set(name, d);
  }
  const topDebtors = [...debtorMap.values()].sort((a, b) => b.outstanding - a.outstanding).slice(0, 5);

  return {
    periodLabel: label,
    billed,
    billedCount: issued.length,
    collected,
    collectedDelta,
    collectionRate: billed > 0 ? (collected / billed) * 100 : null,
    receivables,
    receivablesCount: outstandingInv.length,
    overdueAmount,
    overdueCount: overdueInv.length,
    payables,
    payablesCount: unpaidPur.length,
    expenses: expensesTotal,
    expensesDelta,
    gstOutput,
    gstItc,
    gstNet,
    cashIn,
    cashOut,
    netCash: cashIn - cashOut,
    monthlyTrend,
    topDebtors,
  };
}

/** Compact Indian currency: 1,23,456 → ₹1.23L; 1,23,45,678 → ₹1.23Cr */
export function formatINR(n: number, compact = false): string {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  if (compact && abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)}Cr`;
  if (compact && abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)}L`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}
