# Invio Smart Assistant — Full Product Design

**Date:** 2026-03-27
**Version:** 1.0
**Status:** Approved for implementation

---

## Overview

Invio is a fully AI-powered accountant assistant for Indian small businesses. Users speak invoices in Hindi, Marathi, or English, and the AI extracts fields, manages GST compliance, tracks payments, and answers queries conversationally.

**Target users:** Small teams (owner + 1-2 staff)

---

## Core Decisions

| Decision | Choice |
|----------|--------|
| Auth | Email + password |
| Database | Supabase Postgres |
| PDF | 4 customizable templates |
| AI | Conversational (natural language + follow-up actions) |
| Notifications | Email + wa.me links |
| GST Compliance | All invoice types (tax, export, SEZ, credit/debit notes) |
| HSN Detection | AI auto-detect + business learns over time |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 + shadcn/ui |
| Auth | Supabase Auth |
| Database | Supabase Postgres |
| Storage | Supabase Storage (logos, signatures, PDFs) |
| AI/Voice | Groq Whisper + Llama 3.3 70B |
| PDF | @react-pdf/renderer |
| Email | Resend |
| HSN Database | Local JSON (~8k codes) |
| Deployment | Vercel |

---

## Database Schema

### businesses
```sql
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  gstin TEXT,
  pan TEXT,
  state_code TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  signature_url TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_name TEXT,
  invoice_prefix TEXT DEFAULT 'INV',
  next_invoice_number INTEGER DEFAULT 1,
  financial_year TEXT DEFAULT '24-25',
  default_template TEXT DEFAULT 'professional',
  accent_color TEXT DEFAULT '#4f46e5',
  terms_conditions TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  business_id UUID REFERENCES businesses(id),
  email TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'staff' CHECK (role IN ('owner', 'staff')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### customers
```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  gstin TEXT,
  pan TEXT,
  address TEXT,
  state_code TEXT,
  customer_type TEXT DEFAULT 'unregistered' CHECK (customer_type IN (
    'registered', 'unregistered', 'composition', 'sez', 'export', 'consumer'
  )),
  country TEXT DEFAULT 'India',
  currency TEXT DEFAULT 'INR',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### invoices
```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) NOT NULL,
  customer_id UUID REFERENCES customers(id),
  invoice_number TEXT NOT NULL,
  invoice_type TEXT DEFAULT 'tax_invoice' CHECK (invoice_type IN (
    'tax_invoice', 'bill_of_supply', 'credit_note', 'debit_note',
    'export_invoice', 'sez_invoice', 'deemed_export', 'delivery_challan'
  )),
  date DATE DEFAULT CURRENT_DATE,
  due_date DATE,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled')),

  -- Amounts
  subtotal NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  taxable_value NUMERIC(12,2) DEFAULT 0,
  cgst_amount NUMERIC(12,2) DEFAULT 0,
  sgst_amount NUMERIC(12,2) DEFAULT 0,
  igst_amount NUMERIC(12,2) DEFAULT 0,
  cess_amount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  amount_paid NUMERIC(12,2) DEFAULT 0,
  balance_due NUMERIC(12,2) DEFAULT 0,

  -- GST details
  place_of_supply TEXT,
  is_igst BOOLEAN DEFAULT FALSE,
  reverse_charge BOOLEAN DEFAULT FALSE,

  -- Export fields
  export_type TEXT CHECK (export_type IN ('with_igst', 'without_igst')),
  lut_number TEXT,
  port_code TEXT,
  shipping_bill_number TEXT,
  shipping_bill_date DATE,

  -- Credit/Debit note
  original_invoice_id UUID REFERENCES invoices(id),

  -- Other
  shipping_address TEXT,
  notes TEXT,
  pdf_url TEXT,
  ewaybill_number TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### invoice_items
```sql
CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  hsn_sac_code TEXT,
  quantity NUMERIC(10,3) DEFAULT 1,
  unit TEXT,
  rate NUMERIC(12,2) DEFAULT 0,
  discount NUMERIC(12,2) DEFAULT 0,
  taxable_value NUMERIC(12,2) DEFAULT 0,
  cgst_percent NUMERIC(5,2) DEFAULT 0,
  cgst_amount NUMERIC(12,2) DEFAULT 0,
  sgst_percent NUMERIC(5,2) DEFAULT 0,
  sgst_amount NUMERIC(12,2) DEFAULT 0,
  igst_percent NUMERIC(5,2) DEFAULT 0,
  igst_amount NUMERIC(12,2) DEFAULT 0,
  cess_percent NUMERIC(5,2) DEFAULT 0,
  cess_amount NUMERIC(12,2) DEFAULT 0,
  amount NUMERIC(12,2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);
```

### payments
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  method TEXT CHECK (method IN ('cash', 'upi', 'bank', 'cheque', 'card', 'other')),
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### item_catalog (with inventory)
```sql
CREATE TABLE item_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) NOT NULL,
  name TEXT NOT NULL,
  aliases TEXT[], -- ["chawal", "basmati", "rice"]
  hsn_sac_code TEXT,
  default_gst_percent NUMERIC(5,2),
  default_cess_percent NUMERIC(5,2) DEFAULT 0,
  default_unit TEXT,
  default_rate NUMERIC(12,2),

  -- Inventory fields
  track_inventory BOOLEAN DEFAULT FALSE,
  current_stock NUMERIC(12,3) DEFAULT 0,
  minimum_stock NUMERIC(12,3) DEFAULT 0,
  purchase_price NUMERIC(12,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, name)
);
```

### stock_movements
```sql
CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) NOT NULL,
  item_id UUID REFERENCES item_catalog(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'sale', 'adjustment', 'return')),
  quantity NUMERIC(12,3) NOT NULL, -- positive for in, negative for out
  unit_price NUMERIC(12,2),
  reference_type TEXT CHECK (reference_type IN ('invoice', 'manual', 'purchase_order')),
  reference_id UUID, -- invoice_id or purchase_order_id
  notes TEXT,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for item stock queries
CREATE INDEX idx_stock_movements_item ON stock_movements(item_id);
CREATE INDEX idx_stock_movements_date ON stock_movements(business_id, date);
```

### purchase_orders
```sql
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) NOT NULL,
  po_number TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  supplier_gstin TEXT,
  date DATE DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'received', 'partial', 'cancelled')),
  subtotal NUMERIC(12,2) DEFAULT 0,
  gst_amount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### purchase_order_items
```sql
CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE NOT NULL,
  item_id UUID REFERENCES item_catalog(id),
  name TEXT NOT NULL,
  quantity NUMERIC(10,3) DEFAULT 1,
  unit TEXT,
  rate NUMERIC(12,2) DEFAULT 0,
  gst_percent NUMERIC(5,2) DEFAULT 0,
  amount NUMERIC(12,2) DEFAULT 0,
  received_quantity NUMERIC(10,3) DEFAULT 0
);
```

### hsn_master
```sql
CREATE TABLE hsn_master (
  hsn_code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  gst_rate NUMERIC(5,2) NOT NULL,
  cess_rate NUMERIC(5,2) DEFAULT 0,
  category TEXT
);
```

### notification_log
```sql
CREATE TABLE notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) NOT NULL,
  invoice_id UUID REFERENCES invoices(id),
  customer_id UUID REFERENCES customers(id),
  type TEXT CHECK (type IN ('invoice_sent', 'reminder', 'payment_received', 'weekly_summary')),
  channel TEXT CHECK (channel IN ('email', 'whatsapp')),
  status TEXT DEFAULT 'sent',
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Pages & Navigation

| Route | Page | Description |
|-------|------|-------------|
| `/` | Dashboard | Today's sales, pending, overdue, charts |
| `/login` | Login | Email + password |
| `/signup` | Signup | Create account + business |
| `/invoices` | Invoice List | Filter by status, date, customer |
| `/invoices/new` | Create Invoice | Voice + manual creation |
| `/invoices/[id]` | Invoice Detail | View, edit, PDF, payments |
| `/customers` | Customer List | Search, add, filter |
| `/customers/[id]` | Customer Detail | Info, invoice history |
| `/reports` | Reports | GST summaries, GSTR-1/3B, export |
| `/settings` | Settings | Business profile, templates, team |
| `/settings/templates` | PDF Templates | Choose template, customize colors |
| `/settings/team` | Team | Invite staff, manage roles |

**Floating voice button** — available on all pages for conversational AI.

---

## Conversational AI Commands

### Invoice Creation
| User says | AI action |
|-----------|-----------|
| "Create invoice for Ramesh, 5kg rice at ₹50, 18% GST" | Creates invoice, shows preview |
| "Add 2kg dal at ₹120" | Adds item to current invoice |
| "Remove rice" | Removes item |
| "Change GST to 12%" | Updates GST for all items |
| "Apply 5% discount" | Adds discount |
| "Save and send" | Saves, generates PDF, emails customer |

### Queries
| User says | AI responds |
|-----------|-------------|
| "Ramesh ka kya baki hai?" | "₹15,000 across 2 invoices (#45, #52)" |
| "Show unpaid invoices" | Lists pending invoices with amounts |
| "Aaj ki sale kitni hui?" | "₹42,500 from 8 invoices" |
| "This month GST?" | "CGST: ₹12,400, SGST: ₹12,400, Total: ₹24,800" |
| "Who owes me most?" | "Sharma Traders: ₹85,000 (45 days overdue)" |
| "Show Ramesh history" | Lists all invoices for customer |

### Actions
| User says | AI action |
|-----------|-----------|
| "Send reminder to Ramesh" | Sends email + shows wa.me link |
| "Mark invoice 45 as paid" | Updates status, records payment |
| "Mark 45 partially paid, ₹5000 received" | Records partial payment |
| "Download GSTR-1 for March" | Generates and downloads report |
| "Create same invoice for Suresh" | Duplicates invoice with new customer |

### Follow-ups
| Conversation flow |
|-------------------|
| User: "Show overdue invoices" |
| AI: "3 invoices overdue: #42 (₹5k, Sharma), #45 (₹15k, Ramesh), #51 (₹8k, Gupta)" |
| User: "Send reminder to all" |
| AI: "Sent email reminders to 3 customers. WhatsApp links ready." |
| User: "What about #45?" |
| AI: "Invoice #45: Ramesh, ₹15,000, 12 days overdue. Last reminder sent 3 days ago." |

---

## HSN Auto-Detection

### Flow
```
User: "5kg rice ₹50"
         ↓
AI checks item_catalog for "rice" (or aliases)
         ↓
    Found? → Auto-fill HSN 1006, GST 5%
    Not found? → AI matches to hsn_master
         ↓
    AI: "Rice → HSN 1006, GST 5%. Save for future?"
         ↓
    User confirms → Save to item_catalog with aliases
```

### Learning
- First use: AI suggests HSN, user confirms
- Subsequent use: Auto-fills without asking
- User can add aliases: "rice" = ["chawal", "basmati", "चावल"]

---

## PDF Templates

### 4 Templates
1. **Minimal** — Clean white, simple table, freelancer-friendly
2. **Professional** — Logo prominent, accent color, modern design
3. **GST Formal** — All GST fields, HSN column, formal B2B layout
4. **Export** — LUT details, port code, currency conversion, shipping info

### Customization
- Business logo (top left/center)
- Accent color (headers, borders)
- Digital signature image
- Bank details with UPI QR code
- Terms & conditions
- Footer message
- Watermarks: PAID / DUPLICATE / ORIGINAL / CANCELLED

### PDF Content
- Invoice header (business info, invoice number, date)
- Customer details (name, GSTIN, address)
- Items table (HSN, qty, rate, GST breakdown, amount)
- Tax summary (CGST, SGST, IGST, Cess)
- Total in words
- Bank details + QR code
- Terms & conditions
- Digital signature
- QR code with invoice verification data

---

## Notifications

### Email Triggers
| Event | To | Content |
|-------|-----|---------|
| Invoice created | Customer | PDF attached, payment details |
| Reminder: 3 days before due | Customer | Friendly reminder |
| Reminder: On due date | Customer | Payment due today |
| Reminder: 7 days overdue | Customer | Overdue notice |
| Payment received | Customer | Thank you + receipt |
| Weekly summary (Monday 9am) | Owner | Week's sales, pending, overdue |

### WhatsApp (wa.me links)
Pre-filled message template:
```
Hi {customer_name},

Invoice #{invoice_number} for ₹{amount} is {status}.

Pay via:
• UPI: {upi_id}
• Bank: {bank_details}

View invoice: {pdf_link}

Thank you!
{business_name}
```

---

## GST Reports

### GSTR-1 Summary
- B2B invoices (with GSTIN)
- B2C large (> ₹2.5 lakh)
- B2C small (< ₹2.5 lakh)
- Credit/Debit notes
- Export invoices
- HSN-wise summary

### GSTR-3B Summary
- Outward taxable supplies
- Inward supplies (reverse charge)
- Tax liability (CGST, SGST, IGST, Cess)
- ITC available (manual input for now)

### Export Formats
- JSON (GST portal format)
- Excel
- PDF summary

---

## Inventory Management

### Features
- **Item Stock Tracking** — Track current stock levels for products
- **Low Stock Alerts** — Dashboard alerts when stock falls below minimum
- **Stock Movements** — Automatic tracking on invoice creation
- **Purchase Orders** — Create POs to suppliers, receive stock
- **Stock Adjustments** — Manual corrections with notes
- **Stock Valuation** — FIFO-based valuation for accounting

### Inventory Flow
```
Purchase Order → Receive Stock → current_stock increases
                      ↓
              stock_movement created (type: 'purchase')

Invoice Created → Items sold → current_stock decreases
                      ↓
              stock_movement created (type: 'sale')

Manual Adjustment → Correct discrepancies
                      ↓
              stock_movement created (type: 'adjustment')
```

### Conversational AI for Inventory
| User says | AI action |
|-----------|-----------|
| "Stock kitna hai rice ka?" | Shows current stock for rice |
| "Low stock items?" | Lists items below minimum stock |
| "Add 50kg rice to stock" | Creates stock adjustment |
| "Create PO for 100kg rice from ABC Suppliers" | Creates purchase order |
| "Receive PO #12" | Marks PO received, updates stock |

### Pages
| Route | Description |
|-------|-------------|
| `/inventory` | Stock levels, low stock alerts |
| `/inventory/items` | Item catalog with stock toggle |
| `/inventory/movements` | Stock movement history |
| `/inventory/purchase-orders` | PO list |
| `/inventory/purchase-orders/new` | Create PO |

---

## Implementation Phases

| Phase | Features | Files | Est. |
|-------|----------|-------|------|
| **P1** | Supabase setup, Auth, Business profile | 15 files | 2 days |
| **P2** | Customers CRUD, auto-complete | 8 files | 1 day |
| **P3** | Invoices CRUD, GST calculations, all types | 20 files | 3 days |
| **P4** | Item catalog, HSN auto-detect | 6 files | 1 day |
| **P5** | PDF templates, customization | 10 files | 2 days |
| **P6** | Payments, partial payments, status | 5 files | 1 day |
| **P7** | Inventory management, stock tracking | 12 files | 2 days |
| **P8** | Purchase orders, receiving stock | 8 files | 1 day |
| **P9** | Conversational AI, voice commands | 10 files | 2 days |
| **P10** | GST reports, GSTR-1/3B, export | 8 files | 2 days |
| **P11** | Email notifications, reminders | 6 files | 1 day |
| **P12** | Dashboard, charts, alerts | 5 files | 1 day |

**Total: ~19 days**

---

## Success Criteria

- [ ] User can sign up, create business profile with GSTIN
- [ ] Voice invoice creation works in Hindi/Marathi/English
- [ ] All GST invoice types supported with correct calculations
- [ ] HSN auto-detection with learning
- [ ] 4 PDF templates with customization
- [ ] Payment tracking with partial payments
- [ ] Inventory tracking with low stock alerts
- [ ] Purchase orders with stock receiving
- [ ] Conversational AI understands queries and actions
- [ ] GST reports exportable for filing
- [ ] Email reminders sent automatically
- [ ] Dashboard shows real-time business metrics

---

## Out of Scope (Future)

- WhatsApp Business API (use wa.me links for now)
- Bank reconciliation
- Multi-business support
- Mobile app (PWA first)
- Tally/Zoho export (future phase)
- AI tax optimization suggestions
