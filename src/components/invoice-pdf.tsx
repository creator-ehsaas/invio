"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  pdf,
} from "@react-pdf/renderer";

// Register fonts for Indian language support
Font.register({
  family: "Roboto",
  fonts: [
    { src: "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5Q.ttf", fontWeight: 400 },
    { src: "https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlvAw.ttf", fontWeight: 700 },
  ],
});

export interface InvoicePDFData {
  invoice: {
    invoice_number: string;
    invoice_date: string;
    due_date?: string;
    status: string;
    customer_name: string;
    subtotal: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
    notes?: string;
  };
  items: Array<{
    description: string;
    hsn_code?: string;
    quantity: number;
    unit: string;
    rate: number;
    gst_rate: number;
    amount: number;
  }>;
  business?: {
    name: string;
    address?: string;
    gstin?: string;
    phone?: string;
    email?: string;
    bank_name?: string;
    bank_account_number?: string;
    bank_ifsc?: string;
    upi_id?: string;
  };
  template: "minimal" | "professional" | "gst_formal" | "export";
  accentColor?: string;
}

const formatCurrency = (amount: number) => {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// Minimal Template Styles
const minimalStyles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Roboto", fontSize: 10, color: "#333" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 30 },
  title: { fontSize: 28, fontWeight: 700, color: "#111" },
  invoiceNumber: { fontSize: 12, color: "#666", marginTop: 4 },
  status: { fontSize: 10, padding: "4 12", borderRadius: 12, marginTop: 8 },
  infoSection: { flexDirection: "row", justifyContent: "space-between", marginBottom: 30 },
  infoBlock: { maxWidth: "45%" },
  label: { fontSize: 9, color: "#888", marginBottom: 2, textTransform: "uppercase" },
  value: { fontSize: 11, marginBottom: 8 },
  table: { marginBottom: 30 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#ddd", paddingBottom: 8, marginBottom: 8 },
  tableRow: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  colItem: { flex: 3 },
  colHsn: { flex: 1, textAlign: "center" },
  colQty: { flex: 1, textAlign: "center" },
  colRate: { flex: 1.5, textAlign: "right" },
  colGst: { flex: 1, textAlign: "center" },
  colAmount: { flex: 1.5, textAlign: "right" },
  headerText: { fontWeight: 700, fontSize: 9, color: "#666", textTransform: "uppercase" },
  totalsSection: { alignItems: "flex-end", marginTop: 20 },
  totalsTable: { width: 200 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalLabel: { color: "#666" },
  totalValue: { fontWeight: 700 },
  grandTotal: { borderTopWidth: 2, borderTopColor: "#111", paddingTop: 8, marginTop: 4 },
  grandTotalLabel: { fontSize: 12, fontWeight: 700 },
  grandTotalValue: { fontSize: 14, fontWeight: 700 },
  notes: { marginTop: 30, padding: 12, backgroundColor: "#f9f9f9", borderRadius: 4 },
  notesLabel: { fontSize: 9, color: "#888", marginBottom: 4, textTransform: "uppercase" },
  notesText: { fontSize: 10, color: "#666" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, textAlign: "center", fontSize: 9, color: "#999" },
});

// Professional Template Styles
const professionalStyles = StyleSheet.create({
  page: { padding: 0, fontFamily: "Roboto", fontSize: 10, color: "#333" },
  headerBand: { backgroundColor: "#1e3a5f", padding: 30, paddingBottom: 20 },
  headerContent: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  businessInfo: { color: "#fff" },
  businessName: { fontSize: 22, fontWeight: 700, marginBottom: 8 },
  businessDetail: { fontSize: 9, color: "#ccc", marginBottom: 2 },
  invoiceInfo: { alignItems: "flex-end" },
  invoiceTitle: { fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 4 },
  invoiceNum: { fontSize: 12, color: "#88b4e7" },
  body: { padding: 30 },
  infoCards: { flexDirection: "row", marginBottom: 25, gap: 15 },
  infoCard: { flex: 1, padding: 15, backgroundColor: "#f8fafc", borderRadius: 6 },
  cardLabel: { fontSize: 9, color: "#64748b", marginBottom: 4, textTransform: "uppercase" },
  cardValue: { fontSize: 11, fontWeight: 700 },
  table: { marginBottom: 25 },
  tableHeader: { flexDirection: "row", backgroundColor: "#f1f5f9", padding: 10, borderRadius: 4 },
  tableRow: { flexDirection: "row", padding: 10, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  colItem: { flex: 3 },
  colHsn: { flex: 1, textAlign: "center" },
  colQty: { flex: 1, textAlign: "center" },
  colRate: { flex: 1.5, textAlign: "right" },
  colGst: { flex: 1, textAlign: "center" },
  colAmount: { flex: 1.5, textAlign: "right" },
  headerText: { fontWeight: 700, fontSize: 9, color: "#475569", textTransform: "uppercase" },
  summarySection: { flexDirection: "row", justifyContent: "space-between", marginTop: 20 },
  bankDetails: { flex: 1, padding: 15, backgroundColor: "#f8fafc", borderRadius: 6 },
  bankLabel: { fontSize: 9, color: "#64748b", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 },
  bankRow: { flexDirection: "row", marginBottom: 4 },
  bankKey: { fontSize: 9, color: "#64748b", width: 80 },
  bankValue: { fontSize: 9 },
  totalsCard: { width: 220, padding: 15, backgroundColor: "#1e3a5f", borderRadius: 6 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalLabel: { color: "#94a3b8", fontSize: 10 },
  totalValue: { color: "#fff", fontSize: 10 },
  grandTotal: { borderTopWidth: 1, borderTopColor: "#3b5a7f", paddingTop: 8, marginTop: 8 },
  grandTotalLabel: { fontSize: 12, fontWeight: 700, color: "#fff" },
  grandTotalValue: { fontSize: 16, fontWeight: 700, color: "#fff" },
  notes: { marginTop: 20, padding: 15, backgroundColor: "#fffbeb", borderRadius: 6, borderLeftWidth: 3, borderLeftColor: "#f59e0b" },
  notesLabel: { fontSize: 9, color: "#92400e", marginBottom: 4, textTransform: "uppercase", fontWeight: 700 },
  notesText: { fontSize: 10, color: "#78350f" },
  footer: { position: "absolute", bottom: 20, left: 30, right: 30, textAlign: "center", fontSize: 9, color: "#94a3b8" },
});

// GST Formal Template Styles
const gstFormalStyles = StyleSheet.create({
  page: { padding: 30, fontFamily: "Roboto", fontSize: 9, color: "#000" },
  header: { textAlign: "center", marginBottom: 15, borderBottomWidth: 2, borderBottomColor: "#000", paddingBottom: 10 },
  title: { fontSize: 16, fontWeight: 700 },
  subtitle: { fontSize: 10, marginTop: 2 },
  businessSection: { marginBottom: 15, padding: 10, borderWidth: 1, borderColor: "#000" },
  businessName: { fontSize: 14, fontWeight: 700, textAlign: "center", marginBottom: 5 },
  businessDetail: { fontSize: 9, textAlign: "center", marginBottom: 2 },
  gstin: { fontSize: 10, fontWeight: 700, textAlign: "center", marginTop: 5 },
  infoGrid: { flexDirection: "row", marginBottom: 15 },
  infoBox: { flex: 1, padding: 8, borderWidth: 1, borderColor: "#000" },
  infoLabel: { fontSize: 8, fontWeight: 700, marginBottom: 3 },
  infoValue: { fontSize: 9 },
  table: { marginBottom: 15 },
  tableHeader: { flexDirection: "row", backgroundColor: "#e5e5e5", borderWidth: 1, borderColor: "#000" },
  tableRow: { flexDirection: "row", borderWidth: 1, borderTopWidth: 0, borderColor: "#000" },
  cell: { padding: 6, borderRightWidth: 1, borderRightColor: "#000" },
  lastCell: { padding: 6 },
  colSno: { width: 30, textAlign: "center" },
  colItem: { flex: 2 },
  colHsn: { width: 60, textAlign: "center" },
  colQty: { width: 50, textAlign: "center" },
  colUnit: { width: 40, textAlign: "center" },
  colRate: { width: 70, textAlign: "right" },
  colTaxable: { width: 80, textAlign: "right" },
  colGst: { width: 50, textAlign: "center" },
  colAmount: { width: 80, textAlign: "right" },
  headerText: { fontWeight: 700, fontSize: 8 },
  totalsSection: { flexDirection: "row", justifyContent: "flex-end" },
  totalsTable: { width: 250, borderWidth: 1, borderColor: "#000" },
  totalRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#000" },
  totalLabel: { flex: 1, padding: 5, borderRightWidth: 1, borderRightColor: "#000", fontWeight: 700 },
  totalValue: { width: 100, padding: 5, textAlign: "right" },
  grandTotal: { backgroundColor: "#e5e5e5" },
  amountWords: { marginTop: 15, padding: 8, borderWidth: 1, borderColor: "#000" },
  amountWordsLabel: { fontSize: 8, fontWeight: 700 },
  amountWordsValue: { fontSize: 9, marginTop: 3 },
  bankSection: { marginTop: 15, padding: 8, borderWidth: 1, borderColor: "#000" },
  bankLabel: { fontSize: 9, fontWeight: 700, marginBottom: 5 },
  bankRow: { flexDirection: "row", marginBottom: 2 },
  bankKey: { fontSize: 8, width: 100 },
  bankValue: { fontSize: 8 },
  signatureSection: { flexDirection: "row", justifyContent: "space-between", marginTop: 40 },
  signatureBox: { width: 150, textAlign: "center" },
  signatureLine: { borderTopWidth: 1, borderTopColor: "#000", marginBottom: 5 },
  signatureLabel: { fontSize: 8 },
  terms: { marginTop: 15, fontSize: 8 },
  termsLabel: { fontWeight: 700, marginBottom: 3 },
});

// Export Template Styles
const exportStyles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Roboto", fontSize: 10, color: "#1a1a1a" },
  watermark: { position: "absolute", top: 300, left: 100, fontSize: 60, color: "#f0f0f0", transform: "rotate(-30deg)" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 30 },
  businessSection: {},
  businessName: { fontSize: 20, fontWeight: 700, marginBottom: 5 },
  businessDetail: { fontSize: 9, color: "#666", marginBottom: 2 },
  invoiceSection: { alignItems: "flex-end" },
  invoiceTitle: { fontSize: 24, fontWeight: 700, color: "#c41e3a", marginBottom: 5 },
  invoiceDetail: { fontSize: 10, marginBottom: 2 },
  divider: { height: 2, backgroundColor: "#c41e3a", marginBottom: 20 },
  infoSection: { flexDirection: "row", marginBottom: 25 },
  infoBox: { flex: 1, padding: 15, marginRight: 10, backgroundColor: "#fafafa", borderLeftWidth: 3, borderLeftColor: "#c41e3a" },
  infoLabel: { fontSize: 9, color: "#888", marginBottom: 4, textTransform: "uppercase" },
  infoValue: { fontSize: 11 },
  table: { marginBottom: 25 },
  tableHeader: { flexDirection: "row", backgroundColor: "#c41e3a", padding: 10 },
  tableRow: { flexDirection: "row", padding: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
  tableRowAlt: { flexDirection: "row", padding: 10, borderBottomWidth: 1, borderBottomColor: "#eee", backgroundColor: "#fafafa" },
  colItem: { flex: 3, color: "#fff" },
  colHsn: { flex: 1, textAlign: "center", color: "#fff" },
  colQty: { flex: 1, textAlign: "center", color: "#fff" },
  colRate: { flex: 1.5, textAlign: "right", color: "#fff" },
  colAmount: { flex: 1.5, textAlign: "right", color: "#fff" },
  headerText: { fontWeight: 700, fontSize: 9, textTransform: "uppercase" },
  bodyColItem: { flex: 3 },
  bodyColHsn: { flex: 1, textAlign: "center" },
  bodyColQty: { flex: 1, textAlign: "center" },
  bodyColRate: { flex: 1.5, textAlign: "right" },
  bodyColAmount: { flex: 1.5, textAlign: "right" },
  summarySection: { flexDirection: "row", justifyContent: "flex-end" },
  totalsBox: { width: 250 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#eee" },
  totalLabel: { color: "#666" },
  totalValue: {},
  grandTotal: { backgroundColor: "#c41e3a", padding: 10, marginTop: 5 },
  grandTotalLabel: { fontSize: 12, fontWeight: 700, color: "#fff" },
  grandTotalValue: { fontSize: 14, fontWeight: 700, color: "#fff" },
  declaration: { marginTop: 30, padding: 15, backgroundColor: "#fff9e6", borderWidth: 1, borderColor: "#ffd700" },
  declarationLabel: { fontSize: 9, fontWeight: 700, marginBottom: 5 },
  declarationText: { fontSize: 9, color: "#666" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 10 },
  footerText: { fontSize: 8, color: "#999", textAlign: "center" },
});

// Number to words conversion for amounts
const numberToWords = (num: number): string => {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  if (num === 0) return "Zero";
  if (num < 20) return ones[num];
  if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? " " + ones[num % 10] : "");
  if (num < 1000) return ones[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " " + numberToWords(num % 100) : "");
  if (num < 100000) return numberToWords(Math.floor(num / 1000)) + " Thousand" + (num % 1000 ? " " + numberToWords(num % 1000) : "");
  if (num < 10000000) return numberToWords(Math.floor(num / 100000)) + " Lakh" + (num % 100000 ? " " + numberToWords(num % 100000) : "");
  return numberToWords(Math.floor(num / 10000000)) + " Crore" + (num % 10000000 ? " " + numberToWords(num % 10000000) : "");
};

// Minimal Template
const MinimalTemplate = ({ data }: { data: InvoicePDFData }) => (
  <Document>
    <Page size="A4" style={minimalStyles.page}>
      <View style={minimalStyles.header}>
        <View>
          <Text style={minimalStyles.title}>INVOICE</Text>
          <Text style={minimalStyles.invoiceNumber}>{data.invoice.invoice_number}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[minimalStyles.status, { backgroundColor: data.invoice.status === "paid" ? "#d1fae5" : "#f1f5f9", color: data.invoice.status === "paid" ? "#059669" : "#64748b" }]}>
            {data.invoice.status.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={minimalStyles.infoSection}>
        <View style={minimalStyles.infoBlock}>
          <Text style={minimalStyles.label}>Bill To</Text>
          <Text style={minimalStyles.value}>{data.invoice.customer_name}</Text>
        </View>
        <View style={[minimalStyles.infoBlock, { alignItems: "flex-end" }]}>
          <Text style={minimalStyles.label}>Invoice Date</Text>
          <Text style={minimalStyles.value}>{formatDate(data.invoice.invoice_date)}</Text>
          {data.invoice.due_date && (
            <>
              <Text style={minimalStyles.label}>Due Date</Text>
              <Text style={minimalStyles.value}>{formatDate(data.invoice.due_date)}</Text>
            </>
          )}
        </View>
      </View>

      <View style={minimalStyles.table}>
        <View style={minimalStyles.tableHeader}>
          <Text style={[minimalStyles.colItem, minimalStyles.headerText]}>Item</Text>
          <Text style={[minimalStyles.colHsn, minimalStyles.headerText]}>HSN</Text>
          <Text style={[minimalStyles.colQty, minimalStyles.headerText]}>Qty</Text>
          <Text style={[minimalStyles.colRate, minimalStyles.headerText]}>Rate</Text>
          <Text style={[minimalStyles.colGst, minimalStyles.headerText]}>GST</Text>
          <Text style={[minimalStyles.colAmount, minimalStyles.headerText]}>Amount</Text>
        </View>
        {data.items.map((item, i) => (
          <View key={i} style={minimalStyles.tableRow}>
            <Text style={minimalStyles.colItem}>{item.description}</Text>
            <Text style={minimalStyles.colHsn}>{item.hsn_code || "-"}</Text>
            <Text style={minimalStyles.colQty}>{item.quantity} {item.unit}</Text>
            <Text style={minimalStyles.colRate}>{formatCurrency(item.rate)}</Text>
            <Text style={minimalStyles.colGst}>{item.gst_rate}%</Text>
            <Text style={minimalStyles.colAmount}>{formatCurrency(item.amount)}</Text>
          </View>
        ))}
      </View>

      <View style={minimalStyles.totalsSection}>
        <View style={minimalStyles.totalsTable}>
          <View style={minimalStyles.totalRow}>
            <Text style={minimalStyles.totalLabel}>Subtotal</Text>
            <Text>{formatCurrency(data.invoice.subtotal)}</Text>
          </View>
          {data.invoice.cgst > 0 && (
            <View style={minimalStyles.totalRow}>
              <Text style={minimalStyles.totalLabel}>CGST</Text>
              <Text>{formatCurrency(data.invoice.cgst)}</Text>
            </View>
          )}
          {data.invoice.sgst > 0 && (
            <View style={minimalStyles.totalRow}>
              <Text style={minimalStyles.totalLabel}>SGST</Text>
              <Text>{formatCurrency(data.invoice.sgst)}</Text>
            </View>
          )}
          {data.invoice.igst > 0 && (
            <View style={minimalStyles.totalRow}>
              <Text style={minimalStyles.totalLabel}>IGST</Text>
              <Text>{formatCurrency(data.invoice.igst)}</Text>
            </View>
          )}
          <View style={[minimalStyles.totalRow, minimalStyles.grandTotal]}>
            <Text style={minimalStyles.grandTotalLabel}>Total</Text>
            <Text style={minimalStyles.grandTotalValue}>{formatCurrency(data.invoice.total)}</Text>
          </View>
        </View>
      </View>

      {data.invoice.notes && (
        <View style={minimalStyles.notes}>
          <Text style={minimalStyles.notesLabel}>Notes</Text>
          <Text style={minimalStyles.notesText}>{data.invoice.notes}</Text>
        </View>
      )}

      <Text style={minimalStyles.footer}>Thank you for your business!</Text>
    </Page>
  </Document>
);

// Professional Template
const ProfessionalTemplate = ({ data }: { data: InvoicePDFData }) => (
  <Document>
    <Page size="A4" style={professionalStyles.page}>
      <View style={professionalStyles.headerBand}>
        <View style={professionalStyles.headerContent}>
          <View style={professionalStyles.businessInfo}>
            <Text style={professionalStyles.businessName}>{data.business?.name || "Your Business"}</Text>
            {data.business?.address && <Text style={professionalStyles.businessDetail}>{data.business.address}</Text>}
            {data.business?.gstin && <Text style={professionalStyles.businessDetail}>GSTIN: {data.business.gstin}</Text>}
            {data.business?.phone && <Text style={professionalStyles.businessDetail}>{data.business.phone}</Text>}
          </View>
          <View style={professionalStyles.invoiceInfo}>
            <Text style={professionalStyles.invoiceTitle}>INVOICE</Text>
            <Text style={professionalStyles.invoiceNum}>{data.invoice.invoice_number}</Text>
          </View>
        </View>
      </View>

      <View style={professionalStyles.body}>
        <View style={professionalStyles.infoCards}>
          <View style={professionalStyles.infoCard}>
            <Text style={professionalStyles.cardLabel}>Bill To</Text>
            <Text style={professionalStyles.cardValue}>{data.invoice.customer_name}</Text>
          </View>
          <View style={professionalStyles.infoCard}>
            <Text style={professionalStyles.cardLabel}>Invoice Date</Text>
            <Text style={professionalStyles.cardValue}>{formatDate(data.invoice.invoice_date)}</Text>
          </View>
          <View style={professionalStyles.infoCard}>
            <Text style={professionalStyles.cardLabel}>Due Date</Text>
            <Text style={professionalStyles.cardValue}>{data.invoice.due_date ? formatDate(data.invoice.due_date) : "On Receipt"}</Text>
          </View>
          <View style={professionalStyles.infoCard}>
            <Text style={professionalStyles.cardLabel}>Status</Text>
            <Text style={professionalStyles.cardValue}>{data.invoice.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={professionalStyles.table}>
          <View style={professionalStyles.tableHeader}>
            <Text style={[professionalStyles.colItem, professionalStyles.headerText]}>Description</Text>
            <Text style={[professionalStyles.colHsn, professionalStyles.headerText]}>HSN</Text>
            <Text style={[professionalStyles.colQty, professionalStyles.headerText]}>Qty</Text>
            <Text style={[professionalStyles.colRate, professionalStyles.headerText]}>Rate</Text>
            <Text style={[professionalStyles.colGst, professionalStyles.headerText]}>GST</Text>
            <Text style={[professionalStyles.colAmount, professionalStyles.headerText]}>Amount</Text>
          </View>
          {data.items.map((item, i) => (
            <View key={i} style={professionalStyles.tableRow}>
              <Text style={professionalStyles.colItem}>{item.description}</Text>
              <Text style={professionalStyles.colHsn}>{item.hsn_code || "-"}</Text>
              <Text style={professionalStyles.colQty}>{item.quantity} {item.unit}</Text>
              <Text style={professionalStyles.colRate}>{formatCurrency(item.rate)}</Text>
              <Text style={professionalStyles.colGst}>{item.gst_rate}%</Text>
              <Text style={professionalStyles.colAmount}>{formatCurrency(item.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={professionalStyles.summarySection}>
          {data.business?.bank_name && (
            <View style={professionalStyles.bankDetails}>
              <Text style={professionalStyles.bankLabel}>Bank Details</Text>
              <View style={professionalStyles.bankRow}>
                <Text style={professionalStyles.bankKey}>Bank:</Text>
                <Text style={professionalStyles.bankValue}>{data.business.bank_name}</Text>
              </View>
              {data.business.bank_account_number && (
                <View style={professionalStyles.bankRow}>
                  <Text style={professionalStyles.bankKey}>Account:</Text>
                  <Text style={professionalStyles.bankValue}>{data.business.bank_account_number}</Text>
                </View>
              )}
              {data.business.bank_ifsc && (
                <View style={professionalStyles.bankRow}>
                  <Text style={professionalStyles.bankKey}>IFSC:</Text>
                  <Text style={professionalStyles.bankValue}>{data.business.bank_ifsc}</Text>
                </View>
              )}
              {data.business.upi_id && (
                <View style={professionalStyles.bankRow}>
                  <Text style={professionalStyles.bankKey}>UPI:</Text>
                  <Text style={professionalStyles.bankValue}>{data.business.upi_id}</Text>
                </View>
              )}
            </View>
          )}
          <View style={professionalStyles.totalsCard}>
            <View style={professionalStyles.totalRow}>
              <Text style={professionalStyles.totalLabel}>Subtotal</Text>
              <Text style={professionalStyles.totalValue}>{formatCurrency(data.invoice.subtotal)}</Text>
            </View>
            {data.invoice.cgst > 0 && (
              <View style={professionalStyles.totalRow}>
                <Text style={professionalStyles.totalLabel}>CGST</Text>
                <Text style={professionalStyles.totalValue}>{formatCurrency(data.invoice.cgst)}</Text>
              </View>
            )}
            {data.invoice.sgst > 0 && (
              <View style={professionalStyles.totalRow}>
                <Text style={professionalStyles.totalLabel}>SGST</Text>
                <Text style={professionalStyles.totalValue}>{formatCurrency(data.invoice.sgst)}</Text>
              </View>
            )}
            {data.invoice.igst > 0 && (
              <View style={professionalStyles.totalRow}>
                <Text style={professionalStyles.totalLabel}>IGST</Text>
                <Text style={professionalStyles.totalValue}>{formatCurrency(data.invoice.igst)}</Text>
              </View>
            )}
            <View style={[professionalStyles.totalRow, professionalStyles.grandTotal]}>
              <Text style={professionalStyles.grandTotalLabel}>Total</Text>
              <Text style={professionalStyles.grandTotalValue}>{formatCurrency(data.invoice.total)}</Text>
            </View>
          </View>
        </View>

        {data.invoice.notes && (
          <View style={professionalStyles.notes}>
            <Text style={professionalStyles.notesLabel}>Notes</Text>
            <Text style={professionalStyles.notesText}>{data.invoice.notes}</Text>
          </View>
        )}
      </View>

      <Text style={professionalStyles.footer}>Thank you for your business! • Generated with Invio</Text>
    </Page>
  </Document>
);

// GST Formal Template
const GSTFormalTemplate = ({ data }: { data: InvoicePDFData }) => (
  <Document>
    <Page size="A4" style={gstFormalStyles.page}>
      <View style={gstFormalStyles.header}>
        <Text style={gstFormalStyles.title}>TAX INVOICE</Text>
        <Text style={gstFormalStyles.subtitle}>(Original for Recipient)</Text>
      </View>

      <View style={gstFormalStyles.businessSection}>
        <Text style={gstFormalStyles.businessName}>{data.business?.name || "Your Business Name"}</Text>
        {data.business?.address && <Text style={gstFormalStyles.businessDetail}>{data.business.address}</Text>}
        {data.business?.phone && <Text style={gstFormalStyles.businessDetail}>Phone: {data.business.phone}</Text>}
        {data.business?.gstin && <Text style={gstFormalStyles.gstin}>GSTIN: {data.business.gstin}</Text>}
      </View>

      <View style={gstFormalStyles.infoGrid}>
        <View style={gstFormalStyles.infoBox}>
          <Text style={gstFormalStyles.infoLabel}>Invoice No:</Text>
          <Text style={gstFormalStyles.infoValue}>{data.invoice.invoice_number}</Text>
          <Text style={gstFormalStyles.infoLabel}>Date:</Text>
          <Text style={gstFormalStyles.infoValue}>{formatDate(data.invoice.invoice_date)}</Text>
        </View>
        <View style={gstFormalStyles.infoBox}>
          <Text style={gstFormalStyles.infoLabel}>Bill To:</Text>
          <Text style={gstFormalStyles.infoValue}>{data.invoice.customer_name}</Text>
        </View>
      </View>

      <View style={gstFormalStyles.table}>
        <View style={gstFormalStyles.tableHeader}>
          <Text style={[gstFormalStyles.cell, gstFormalStyles.colSno, gstFormalStyles.headerText]}>S.No</Text>
          <Text style={[gstFormalStyles.cell, gstFormalStyles.colItem, gstFormalStyles.headerText]}>Description</Text>
          <Text style={[gstFormalStyles.cell, gstFormalStyles.colHsn, gstFormalStyles.headerText]}>HSN/SAC</Text>
          <Text style={[gstFormalStyles.cell, gstFormalStyles.colQty, gstFormalStyles.headerText]}>Qty</Text>
          <Text style={[gstFormalStyles.cell, gstFormalStyles.colUnit, gstFormalStyles.headerText]}>Unit</Text>
          <Text style={[gstFormalStyles.cell, gstFormalStyles.colRate, gstFormalStyles.headerText]}>Rate</Text>
          <Text style={[gstFormalStyles.cell, gstFormalStyles.colGst, gstFormalStyles.headerText]}>GST%</Text>
          <Text style={[gstFormalStyles.lastCell, gstFormalStyles.colAmount, gstFormalStyles.headerText]}>Amount</Text>
        </View>
        {data.items.map((item, i) => (
          <View key={i} style={gstFormalStyles.tableRow}>
            <Text style={[gstFormalStyles.cell, gstFormalStyles.colSno]}>{i + 1}</Text>
            <Text style={[gstFormalStyles.cell, gstFormalStyles.colItem]}>{item.description}</Text>
            <Text style={[gstFormalStyles.cell, gstFormalStyles.colHsn]}>{item.hsn_code || "-"}</Text>
            <Text style={[gstFormalStyles.cell, gstFormalStyles.colQty]}>{item.quantity}</Text>
            <Text style={[gstFormalStyles.cell, gstFormalStyles.colUnit]}>{item.unit}</Text>
            <Text style={[gstFormalStyles.cell, gstFormalStyles.colRate]}>{formatCurrency(item.rate)}</Text>
            <Text style={[gstFormalStyles.cell, gstFormalStyles.colGst]}>{item.gst_rate}%</Text>
            <Text style={[gstFormalStyles.lastCell, gstFormalStyles.colAmount]}>{formatCurrency(item.amount)}</Text>
          </View>
        ))}
      </View>

      <View style={gstFormalStyles.totalsSection}>
        <View style={gstFormalStyles.totalsTable}>
          <View style={gstFormalStyles.totalRow}>
            <Text style={gstFormalStyles.totalLabel}>Taxable Amount</Text>
            <Text style={gstFormalStyles.totalValue}>{formatCurrency(data.invoice.subtotal)}</Text>
          </View>
          {data.invoice.cgst > 0 && (
            <View style={gstFormalStyles.totalRow}>
              <Text style={gstFormalStyles.totalLabel}>CGST</Text>
              <Text style={gstFormalStyles.totalValue}>{formatCurrency(data.invoice.cgst)}</Text>
            </View>
          )}
          {data.invoice.sgst > 0 && (
            <View style={gstFormalStyles.totalRow}>
              <Text style={gstFormalStyles.totalLabel}>SGST</Text>
              <Text style={gstFormalStyles.totalValue}>{formatCurrency(data.invoice.sgst)}</Text>
            </View>
          )}
          {data.invoice.igst > 0 && (
            <View style={gstFormalStyles.totalRow}>
              <Text style={gstFormalStyles.totalLabel}>IGST</Text>
              <Text style={gstFormalStyles.totalValue}>{formatCurrency(data.invoice.igst)}</Text>
            </View>
          )}
          <View style={[gstFormalStyles.totalRow, gstFormalStyles.grandTotal]}>
            <Text style={gstFormalStyles.totalLabel}>Grand Total</Text>
            <Text style={gstFormalStyles.totalValue}>{formatCurrency(data.invoice.total)}</Text>
          </View>
        </View>
      </View>

      <View style={gstFormalStyles.amountWords}>
        <Text style={gstFormalStyles.amountWordsLabel}>Amount in Words:</Text>
        <Text style={gstFormalStyles.amountWordsValue}>Indian Rupees {numberToWords(Math.round(data.invoice.total))} Only</Text>
      </View>

      {data.business?.bank_name && (
        <View style={gstFormalStyles.bankSection}>
          <Text style={gstFormalStyles.bankLabel}>Bank Details:</Text>
          <View style={gstFormalStyles.bankRow}>
            <Text style={gstFormalStyles.bankKey}>Bank Name:</Text>
            <Text style={gstFormalStyles.bankValue}>{data.business.bank_name}</Text>
          </View>
          {data.business.bank_account_number && (
            <View style={gstFormalStyles.bankRow}>
              <Text style={gstFormalStyles.bankKey}>Account No:</Text>
              <Text style={gstFormalStyles.bankValue}>{data.business.bank_account_number}</Text>
            </View>
          )}
          {data.business.bank_ifsc && (
            <View style={gstFormalStyles.bankRow}>
              <Text style={gstFormalStyles.bankKey}>IFSC Code:</Text>
              <Text style={gstFormalStyles.bankValue}>{data.business.bank_ifsc}</Text>
            </View>
          )}
        </View>
      )}

      <View style={gstFormalStyles.signatureSection}>
        <View style={gstFormalStyles.signatureBox}>
          <View style={gstFormalStyles.signatureLine} />
          <Text style={gstFormalStyles.signatureLabel}>Customer Signature</Text>
        </View>
        <View style={gstFormalStyles.signatureBox}>
          <View style={gstFormalStyles.signatureLine} />
          <Text style={gstFormalStyles.signatureLabel}>Authorized Signatory</Text>
        </View>
      </View>

      <View style={gstFormalStyles.terms}>
        <Text style={gstFormalStyles.termsLabel}>Terms & Conditions:</Text>
        <Text>1. Goods once sold will not be taken back.</Text>
        <Text>2. Interest @ 18% p.a. will be charged if payment is not made within due date.</Text>
        <Text>3. Subject to local jurisdiction.</Text>
      </View>
    </Page>
  </Document>
);

// Export Template
const ExportTemplate = ({ data }: { data: InvoicePDFData }) => (
  <Document>
    <Page size="A4" style={exportStyles.page}>
      <Text style={exportStyles.watermark}>EXPORT</Text>

      <View style={exportStyles.header}>
        <View style={exportStyles.businessSection}>
          <Text style={exportStyles.businessName}>{data.business?.name || "Your Business"}</Text>
          {data.business?.address && <Text style={exportStyles.businessDetail}>{data.business.address}</Text>}
          {data.business?.gstin && <Text style={exportStyles.businessDetail}>GSTIN: {data.business.gstin}</Text>}
          {data.business?.email && <Text style={exportStyles.businessDetail}>{data.business.email}</Text>}
        </View>
        <View style={exportStyles.invoiceSection}>
          <Text style={exportStyles.invoiceTitle}>EXPORT INVOICE</Text>
          <Text style={exportStyles.invoiceDetail}>{data.invoice.invoice_number}</Text>
          <Text style={exportStyles.invoiceDetail}>Date: {formatDate(data.invoice.invoice_date)}</Text>
        </View>
      </View>

      <View style={exportStyles.divider} />

      <View style={exportStyles.infoSection}>
        <View style={exportStyles.infoBox}>
          <Text style={exportStyles.infoLabel}>Bill To / Ship To</Text>
          <Text style={exportStyles.infoValue}>{data.invoice.customer_name}</Text>
        </View>
        <View style={[exportStyles.infoBox, { marginRight: 0 }]}>
          <Text style={exportStyles.infoLabel}>Payment Terms</Text>
          <Text style={exportStyles.infoValue}>
            {data.invoice.due_date ? `Due: ${formatDate(data.invoice.due_date)}` : "On Receipt"}
          </Text>
        </View>
      </View>

      <View style={exportStyles.table}>
        <View style={exportStyles.tableHeader}>
          <Text style={[exportStyles.colItem, exportStyles.headerText]}>Description of Goods</Text>
          <Text style={[exportStyles.colHsn, exportStyles.headerText]}>HSN</Text>
          <Text style={[exportStyles.colQty, exportStyles.headerText]}>Qty</Text>
          <Text style={[exportStyles.colRate, exportStyles.headerText]}>Unit Price</Text>
          <Text style={[exportStyles.colAmount, exportStyles.headerText]}>Amount</Text>
        </View>
        {data.items.map((item, i) => (
          <View key={i} style={i % 2 === 0 ? exportStyles.tableRow : exportStyles.tableRowAlt}>
            <Text style={exportStyles.bodyColItem}>{item.description}</Text>
            <Text style={exportStyles.bodyColHsn}>{item.hsn_code || "-"}</Text>
            <Text style={exportStyles.bodyColQty}>{item.quantity} {item.unit}</Text>
            <Text style={exportStyles.bodyColRate}>{formatCurrency(item.rate)}</Text>
            <Text style={exportStyles.bodyColAmount}>{formatCurrency(item.amount)}</Text>
          </View>
        ))}
      </View>

      <View style={exportStyles.summarySection}>
        <View style={exportStyles.totalsBox}>
          <View style={exportStyles.totalRow}>
            <Text style={exportStyles.totalLabel}>Subtotal</Text>
            <Text style={exportStyles.totalValue}>{formatCurrency(data.invoice.subtotal)}</Text>
          </View>
          <View style={exportStyles.totalRow}>
            <Text style={exportStyles.totalLabel}>IGST (0% - Export)</Text>
            <Text style={exportStyles.totalValue}>{formatCurrency(0)}</Text>
          </View>
          <View style={[exportStyles.totalRow, exportStyles.grandTotal]}>
            <Text style={exportStyles.grandTotalLabel}>Total Amount</Text>
            <Text style={exportStyles.grandTotalValue}>{formatCurrency(data.invoice.total)}</Text>
          </View>
        </View>
      </View>

      <View style={exportStyles.declaration}>
        <Text style={exportStyles.declarationLabel}>Declaration:</Text>
        <Text style={exportStyles.declarationText}>
          We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
          This is a supply meant for export under LUT without payment of IGST.
        </Text>
      </View>

      <View style={exportStyles.footer}>
        <Text style={exportStyles.footerText}>
          This is a computer-generated invoice and does not require a physical signature. • Generated with Invio
        </Text>
      </View>
    </Page>
  </Document>
);

// Main component to render appropriate template
export const InvoicePDF = ({ data }: { data: InvoicePDFData }) => {
  switch (data.template) {
    case "professional":
      return <ProfessionalTemplate data={data} />;
    case "gst_formal":
      return <GSTFormalTemplate data={data} />;
    case "export":
      return <ExportTemplate data={data} />;
    default:
      return <MinimalTemplate data={data} />;
  }
};

// Function to generate and download PDF
export const downloadInvoicePDF = async (data: InvoicePDFData): Promise<void> => {
  const blob = await pdf(<InvoicePDF data={data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${data.invoice.invoice_number}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
