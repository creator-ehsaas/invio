// Functional test for src/lib/kpi.ts — run: node scripts/test-kpi.js
// (compiles the module standalone first via npx tsc)
const { computeKpis, getPeriodInfo, formatINR } = require("../.tmp-test/kpi");

const NOW = new Date("2026-06-12T10:00:00"); // mid-June → FY 2026-27, Q1

const invoices = [
  // paid this month
  { status: "paid", total: 118000, cgst: 9000, sgst: 9000, igst: 0, invoice_date: "2026-06-05", created_at: "2026-06-05", customer_name: "Sharma Traders" },
  // sent this month, due in future → receivable, not overdue
  { status: "sent", total: 59000, cgst: 4500, sgst: 4500, igst: 0, invoice_date: "2026-06-08", due_date: "2026-07-08", created_at: "2026-06-08", customer_name: "Gupta & Sons" },
  // sent in May, past due → overdue receivable, NOT in this_month, in quarter
  { status: "sent", total: 23600, cgst: 0, sgst: 0, igst: 3600, invoice_date: "2026-05-02", due_date: "2026-06-01", created_at: "2026-05-02", customer_name: "Sharma Traders" },
  // draft → must NOT count anywhere
  { status: "draft", total: 999999, cgst: 0, sgst: 0, igst: 152542, invoice_date: "2026-06-10", created_at: "2026-06-10", customer_name: "Draft Co" },
  // cancelled → must NOT count
  { status: "cancelled", total: 50000, cgst: 0, sgst: 0, igst: 0, invoice_date: "2026-06-09", created_at: "2026-06-09" },
  // paid LAST month → delta baseline
  { status: "paid", total: 100000, cgst: 0, sgst: 0, igst: 15254, invoice_date: "2026-05-15", created_at: "2026-05-15", customer_name: "Verma Industries" },
];

const purchases = [
  // pending bill this month: payable 40000-10000, ITC 5400
  { status: "partial", total: 40000, amount_paid: 10000, cgst: 2700, sgst: 2700, igst: 0, bill_date: "2026-06-03", created_at: "2026-06-03" },
  // paid bill this month: ITC counts, payable doesn't, cash out 23600
  { status: "paid", total: 23600, amount_paid: 23600, cgst: 1800, sgst: 1800, igst: 0, bill_date: "2026-06-06", created_at: "2026-06-06" },
  // cancelled → nothing
  { status: "cancelled", total: 11111, amount_paid: 0, cgst: 999, sgst: 999, igst: 0, bill_date: "2026-06-07", created_at: "2026-06-07" },
];

const expenses = [
  { amount: 5000, expense_date: "2026-06-04", created_at: "2026-06-04" },
  { amount: 2500, expense_date: "2026-05-20", created_at: "2026-05-20" }, // last month
];

const k = computeKpis(invoices, purchases, expenses, "this_month", NOW);

const checks = {
  "billed excludes draft+cancelled (118000+59000)": k.billed === 177000,
  "collected = paid only": k.collected === 118000,
  "receivables exclude drafts": k.receivables === 59000,
  "overdue empty this month (May inv out of period)": k.overdueCount === 0,
  "payables = total - paid on open bills": k.payables === 30000,
  "expenses this month": k.expenses === 5000,
  "GST output = tax on issued (18000+9000)": k.gstOutput === 27000,
  "GST ITC excludes cancelled (5400+3600)": k.gstItc === 9000,
  "GST net payable": k.gstNet === 18000,
  "cash out = expenses + purchase payments (5000+33600)": k.cashOut === 38600,
  "net cash": k.netCash === 118000 - 38600,
  "collected delta vs May (+18%)": Math.round(k.collectedDelta) === 18,
  "expenses delta vs May (+100%)": Math.round(k.expensesDelta) === 100,
  "collection rate ~66.7%": Math.abs(k.collectionRate - (118000 / 177000) * 100) < 0.01,
  "12 trend points": k.monthlyTrend.length === 12,
  "trend current month collected": k.monthlyTrend[11].collected === 118000,
  "trend May collected": k.monthlyTrend[10].collected === 100000,
};

// Quarter view picks up the overdue May invoice
const kq = computeKpis(invoices, purchases, expenses, "this_quarter", NOW);
checks["quarter receivables include May (59000+23600)"] = kq.receivables === 82600;
checks["quarter overdue = May invoice"] = kq.overdueAmount === 23600 && kq.overdueCount === 1;
checks["quarter label"] = kq.periodLabel === "Q1 FY26–27";
checks["top debtor is Gupta in month"] = k.topDebtors[0]?.name === "Gupta & Sons";
checks["quarter top debtor Sharma (23600) vs Gupta (59000) → Gupta first"] =
  kq.topDebtors[0]?.name === "Gupta & Sons" && kq.topDebtors[1]?.name === "Sharma Traders" && kq.topDebtors[1]?.overdue === true;

// FY window
const fy = getPeriodInfo("this_fy", NOW);
checks["FY starts Apr 1 2026"] =
  fy.current.start.getFullYear() === 2026 && fy.current.start.getMonth() === 3 && fy.current.start.getDate() === 1;
checks["FY label"] = fy.label === "FY 2026–27";

// Formatting
checks["formatINR plain"] = formatINR(123456) === "₹1,23,456";
checks["formatINR lakh"] = formatINR(123456, true) === "₹1.23L";
checks["formatINR crore"] = formatINR(12345678, true) === "₹1.23Cr";
checks["formatINR negative"] = formatINR(-500) === "−₹500";

let ok = true;
for (const [name, pass] of Object.entries(checks)) {
  console.log(pass ? "PASS" : "FAIL", "-", name);
  if (!pass) ok = false;
}
if (!ok) process.exit(1);
console.log("\nALL OK");
