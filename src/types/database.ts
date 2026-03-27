export interface Business {
  id: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  state_code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  signature_url: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  upi_id: string | null;
  invoice_prefix: string;
  next_invoice_number: number;
  financial_year: string;
  default_template: "minimal" | "professional" | "gst_formal" | "export";
  accent_color: string;
  terms_conditions: string | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  business_id: string | null;
  email: string;
  name: string | null;
  role: "owner" | "staff";
  created_at: string;
  updated_at: string;
}

export interface BusinessInsert {
  name: string;
  gstin?: string | null;
  pan?: string | null;
  state_code?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface BusinessUpdate {
  name?: string;
  gstin?: string | null;
  pan?: string | null;
  state_code?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  signature_url?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  upi_id?: string | null;
  invoice_prefix?: string;
  financial_year?: string;
  default_template?: "minimal" | "professional" | "gst_formal" | "export";
  accent_color?: string;
  terms_conditions?: string | null;
}

export interface UserInsert {
  id: string;
  business_id: string;
  email: string;
  name?: string | null;
  role?: "owner" | "staff";
}

export const INDIAN_STATES = [
  { code: "01", name: "Jammu & Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra & Nagar Haveli and Daman & Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman & Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
] as const;

export type StateCode = typeof INDIAN_STATES[number]["code"];

// Helper to get state names as a string array
export const INDIAN_STATE_NAMES = INDIAN_STATES.map(s => s.name);

// Helper to extract state code from GSTIN (first 2 digits)
export function getStateFromGSTIN(gstin: string | null | undefined): string | null {
  if (!gstin || gstin.length < 2) return null;
  const stateCode = gstin.substring(0, 2);
  // Validate it's a valid state code
  const isValid = INDIAN_STATES.some(s => s.code === stateCode);
  return isValid ? stateCode : null;
}

// Determine if transaction is intra-state (CGST+SGST) or inter-state (IGST)
export function isIntraState(businessGstin: string | null | undefined, customerGstin: string | null | undefined): boolean {
  const businessState = getStateFromGSTIN(businessGstin);
  const customerState = getStateFromGSTIN(customerGstin);

  // If either party doesn't have GSTIN, default to intra-state (CGST+SGST)
  if (!businessState || !customerState) return true;

  return businessState === customerState;
}

// Customer types
export interface Customer {
  id: string;
  business_id: string;
  name: string;
  business_name?: string | null;
  email?: string | null;
  phone?: string | null;
  gstin?: string | null;
  billing_address?: {
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
  } | null;
  shipping_address?: {
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
  } | null;
  created_at: string;
  updated_at: string;
}

// Inventory types
export interface InventoryItem {
  id: string;
  business_id: string;
  name: string;
  sku?: string | null;
  description?: string | null;
  hsn_code?: string | null;
  unit: string;
  unit_price: number;
  current_stock: number;
  reorder_level: number;
  gst_rate: number;
  created_at: string;
  updated_at: string;
}

// Invoice types
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export interface Invoice {
  id: string;
  business_id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date?: string | null;
  status: InvoiceStatus;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  notes?: string | null;
  terms?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  inventory_item_id?: string | null;
  description: string;
  hsn_code?: string | null;
  quantity: number;
  unit: string;
  rate: number;
  gst_rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  amount: number;
  created_at: string;
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number?: string | null;
  notes?: string | null;
  created_at: string;
}
