"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Mic,
  MicOff,
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Check,
  X,
  AlertCircle,
  Package,
  User,
  Calendar,
  Info,
  ChevronDown,
  ChevronUp,
  Upload,
  FileText,
  Percent,
  Coins,
  ShieldAlert,
} from "lucide-react";
import { isIntraState, INDIAN_STATES, getStateFromGSTIN } from "@/types/database";

interface InvoiceItem {
  description: string;
  long_description?: string;
  hsn_code: string;
  quantity: number;
  unit: string;
  rate: number;
  gst_rate: number;
  discount_percent: number;
}

interface Customer {
  id: string;
  name: string;
  business_name?: string;
  gstin?: string | null;
  billing_address?: any;
  shipping_address?: any;
  email?: string | null;
  phone?: string | null;
}

interface BusinessInfo {
  id: string;
  name: string;
  address: string | null;
  gstin: string | null;
  state_code: string | null;
  invoice_prefix: string;
  next_invoice_number: number;
  phone: string | null;
  email: string | null;
  terms_conditions: string | null;
}

interface PastInvoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  total: number;
  invoice_date: string;
}

export default function NewInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Business settings / Supplier info
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  const [showSupplierDetails, setShowSupplierDetails] = useState(false);

  // Form state
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [isInvoiceNumberEdited, setIsInvoiceNumberEdited] = useState(false);
  const [invoiceNumberError, setInvoiceNumberError] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");
  
  // Customer selection & details
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerGstin, setCustomerGstin] = useState<string>("");
  const [customerBillingStreet, setCustomerBillingStreet] = useState("");
  const [customerBillingCity, setCustomerBillingCity] = useState("");
  const [customerBillingState, setCustomerBillingState] = useState(""); // state name
  const [customerBillingPincode, setCustomerBillingPincode] = useState("");
  const [customerShippingStreet, setCustomerShippingStreet] = useState("");
  const [customerShippingCity, setCustomerShippingCity] = useState("");
  const [customerShippingState, setCustomerShippingState] = useState(""); // state name
  const [customerShippingPincode, setCustomerShippingPincode] = useState("");
  const [customerPlaceOfSupply, setCustomerPlaceOfSupply] = useState(""); // state code (e.g. "27")
  const [supplyType, setSupplyType] = useState<"regular" | "sez" | "export">("regular");
  const [shippingSameAsBilling, setShippingSameAsBilling] = useState(true);

  const [customers, setCustomers] = useState<Customer[]>([]);
  
  // Items state
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: "", long_description: "", hsn_code: "", quantity: 1, unit: "pcs", rate: 0, gst_rate: 18, discount_percent: 0 },
  ]);
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  
  // Discount & Notes
  const [overallDiscountVal, setOverallDiscountVal] = useState(0);
  const [overallDiscountType, setOverallDiscountType] = useState<"percent" | "amount">("percent");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [reverseCharge, setReverseCharge] = useState(false);

  // Save states
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"draft" | "sent">("draft");

  // Import Invoice Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTab, setImportTab] = useState<"upload" | "duplicate">("upload");
  const [pastInvoices, setPastInvoices] = useState<PastInvoice[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedPastInvoiceId, setSelectedPastInvoiceId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Imported fields confirmation states
  const [unconfirmedFields, setUnconfirmedFields] = useState<Record<string, boolean>>({});
  const [showConfirmBanner, setShowConfirmBanner] = useState(false);

  // UI state: validation errors per item index
  const [itemValidationErrors, setItemValidationErrors] = useState<Record<number, Record<string, string>>>({});
  const [customerTouched, setCustomerTouched] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    fetchCustomersAndBusiness();
    // Set default due date to 15 days from now
    const due = new Date();
    due.setDate(due.getDate() + 15);
    setDueDate(due.toISOString().split("T")[0]);

    // Pre-fill from AI assistant params
    const aiCustomer = searchParams.get("customer");
    const aiItems = searchParams.get("items");
    if (aiCustomer) setCustomerName(aiCustomer);
    if (aiItems) {
      autoParseItems(aiItems);
    }
  }, []);

  // Update default invoice number when prefix, next_number, or date changes
  useEffect(() => {
    if (!isInvoiceNumberEdited && businessInfo) {
      recalculateDefaultInvoiceNumber(invoiceDate);
    }
  }, [businessInfo, invoiceDate, isInvoiceNumberEdited]);

  // Sync shipping address to billing address if flag is enabled
  useEffect(() => {
    if (shippingSameAsBilling) {
      setCustomerShippingStreet(customerBillingStreet);
      setCustomerShippingCity(customerBillingCity);
      setCustomerShippingState(customerBillingState);
      setCustomerShippingPincode(customerBillingPincode);
    }
  }, [shippingSameAsBilling, customerBillingStreet, customerBillingCity, customerBillingState, customerBillingPincode]);

  const getFinancialYear = (dateStr: string): string => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed, 3 = April
    const fyStart = month >= 3 ? year : year - 1;
    const fyEnd = (fyStart + 1).toString().slice(-2);
    return `${year.toString().slice(-2)}-${fyEnd}`;
  };

  const recalculateDefaultInvoiceNumber = async (dateStr: string) => {
    if (!businessInfo) return;
    const supabase = createClient();
    const { count } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .eq("business_id", businessInfo.id);

    const prefix = businessInfo.invoice_prefix || "INV";
    const fy = getFinancialYear(dateStr);
    const nextNum = businessInfo.next_invoice_number || (count || 0) + 1;
    const sequenceStr = String(nextNum).padStart(4, "0");
    setInvoiceNumber(`${prefix}/${fy}/${sequenceStr}`);
  };

  const checkDuplicateInvoiceNumber = async (num: string) => {
    if (!num || !businessInfo) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("invoices")
      .select("id")
      .eq("business_id", businessInfo.id)
      .eq("invoice_number", num)
      .maybeSingle();

    if (data) {
      setInvoiceNumberError("⚠️ Invoice number already exists.");
    } else {
      setInvoiceNumberError("");
    }
  };

  const autoParseItems = async (text: string) => {
    setIsProcessing(true);
    try {
      const res = await fetch("/api/parse-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      if (res.ok) {
        const { data } = await res.json();
        if (data?.items?.length) {
          setItems(data.items.map((item: any) => ({
            description: item.description || "",
            long_description: item.long_description || "",
            hsn_code: item.hsn_code || "",
            quantity: item.quantity || 1,
            unit: item.unit || "pcs",
            rate: item.rate || 0,
            gst_rate: item.gst_rate ?? 18,
            discount_percent: 0,
          })));
        }
        if (data?.customer_name && !searchParams.get("customer")) {
          setCustomerName(data.customer_name);
        }
      }
    } catch { /* silently fail */ }
    setIsProcessing(false);
  };

  const fetchCustomersAndBusiness = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch user's business info
    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();

    if (userData?.business_id) {
      const businessId = userData.business_id;

      // Fetch business details
      const { data: business } = await supabase
        .from("businesses")
        .select("id, name, address, gstin, state_code, invoice_prefix, next_invoice_number, phone, email, terms_conditions")
        .eq("id", businessId)
        .single();

      if (business) {
        setBusinessInfo(business);
        if (business.terms_conditions) setTerms(business.terms_conditions);
      }

      // Fetch customers for this business
      const { data: customersData } = await supabase
        .from("customers")
        .select("id, name, business_name, gstin, billing_address, shipping_address, email, phone")
        .eq("business_id", businessId);

      if (customersData) setCustomers(customersData);

      // Fetch past invoices for duplication list
      const { data: pastInvs } = await supabase
        .from("invoices")
        .select("id, invoice_number, customer_name, total, invoice_date")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(15);

      if (pastInvs) setPastInvoices(pastInvs);
    }
  };

  // Handle customer selection from combobox autocomplete list
  const handleCustomerNameChange = (name: string) => {
    setCustomerName(name);
    
    // Check if confirming imported fields
    if (unconfirmedFields.customerName) {
      confirmField("customerName");
    }

    const matchedCustomer = customers.find(
      c => c.name.toLowerCase() === name.toLowerCase()
    );
    if (matchedCustomer) {
      setCustomerId(matchedCustomer.id);
      setCustomerGstin(matchedCustomer.gstin || "");
      
      const bStreet = matchedCustomer.billing_address?.street || "";
      const bCity = matchedCustomer.billing_address?.city || "";
      const bState = matchedCustomer.billing_address?.state || "";
      const bPincode = matchedCustomer.billing_address?.pincode || "";

      setCustomerBillingStreet(bStreet);
      setCustomerBillingCity(bCity);
      setCustomerBillingState(bState);
      setCustomerBillingPincode(bPincode);

      const sStreet = matchedCustomer.shipping_address?.street || "";
      const sCity = matchedCustomer.shipping_address?.city || "";
      const sState = matchedCustomer.shipping_address?.state || "";
      const sPincode = matchedCustomer.shipping_address?.pincode || "";

      setCustomerShippingStreet(sStreet);
      setCustomerShippingCity(sCity);
      setCustomerShippingState(sState);
      setCustomerShippingPincode(sPincode);

      // check if shipping is same
      if (bStreet === sStreet && bCity === sCity && bState === sState && bPincode === sPincode && bStreet !== "") {
        setShippingSameAsBilling(true);
      } else {
        setShippingSameAsBilling(false);
      }

      // set place of supply based on customer state
      const stateCode = getStateFromGSTIN(matchedCustomer.gstin) || 
                        INDIAN_STATES.find(s => s.name === bState)?.code || 
                        businessInfo?.state_code || "";
      setCustomerPlaceOfSupply(stateCode);
    } else {
      setCustomerId("");
      // Reset details but allow user to write custom ones
      setCustomerGstin("");
      setCustomerBillingStreet("");
      setCustomerBillingCity("");
      setCustomerBillingState("");
      setCustomerBillingPincode("");
      setCustomerShippingStreet("");
      setCustomerShippingCity("");
      setCustomerShippingState("");
      setCustomerShippingPincode("");
      setShippingSameAsBilling(true);
      setCustomerPlaceOfSupply(businessInfo?.state_code || "");
    }
  };

  // Set preset days for Due Date
  const setDueDatePreset = (days: number) => {
    if (!invoiceDate) return;
    const baseDate = new Date(invoiceDate);
    baseDate.setDate(baseDate.getDate() + days);
    setDueDate(baseDate.toISOString().split("T")[0]);
    if (unconfirmedFields.invoiceDate) {
      confirmField("invoiceDate");
    }
  };

  // Convert number to Indian currency words
  const toIndianRupeesWords = (amount: number): string => {
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    const numToWords = (n: number): string => {
      if (n === 0) return "";
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
      if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + numToWords(n % 100) : "");
      if (n < 100000) return numToWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + numToWords(n % 1000) : "");
      if (n < 10000000) return numToWords(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + numToWords(n % 100000) : "");
      return numToWords(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + numToWords(n % 10000000) : "");
    };

    const roundedAmount = Math.round(amount);
    if (roundedAmount === 0) return "Rupees Zero Only";
    
    const words = numToWords(roundedAmount);
    return `Rupees ${words} Only`;
  };

  const calculateTotals = () => {
    let grossSubtotal = 0;
    let itemDiscountsTotal = 0;
    let totalGst = 0;

    items.forEach((item) => {
      const lineAmount = item.quantity * item.rate;
      const lineDiscount = (lineAmount * (item.discount_percent || 0)) / 100;
      const taxableAmount = lineAmount - lineDiscount;
      grossSubtotal += lineAmount;
      itemDiscountsTotal += lineDiscount;
      totalGst += (taxableAmount * item.gst_rate) / 100;
    });

    const netSubtotal = grossSubtotal - itemDiscountsTotal;
    
    // Overall discount calculation
    let overallDiscountAmt = 0;
    let overallDiscountPercent = 0;
    
    if (overallDiscountType === "percent") {
      overallDiscountPercent = overallDiscountVal;
      overallDiscountAmt = (netSubtotal * overallDiscountVal) / 100;
    } else {
      overallDiscountAmt = overallDiscountVal;
      overallDiscountPercent = netSubtotal > 0 ? (overallDiscountVal / netSubtotal) * 100 : 0;
    }

    const taxableValue = netSubtotal - overallDiscountAmt;

    // Recalculate GST on final discounted amount if overall discount is applied
    if (overallDiscountAmt > 0) {
      totalGst = 0;
      items.forEach((item) => {
        const lineAmount = item.quantity * item.rate;
        const lineDiscount = (lineAmount * (item.discount_percent || 0)) / 100;
        // Apply proportional overall discount to each line
        const taxableAmount = (lineAmount - lineDiscount) * (1 - overallDiscountPercent / 100);
        totalGst += (taxableAmount * item.gst_rate) / 100;
      });
    }

    // Determine tax breakup based on Place of Supply state code vs Business settings state code
    const isLocal = !businessInfo?.state_code || !customerPlaceOfSupply || businessInfo.state_code === customerPlaceOfSupply;
    
    // For export, GST is typically 0% or IGST with refund. If Export flag is set, set taxes based on rate
    const isExport = supplyType === "export";
    const finalGst = isExport ? 0 : totalGst;

    return {
      subtotal: grossSubtotal,
      itemDiscounts: itemDiscountsTotal,
      netSubtotal,
      overallDiscount: overallDiscountAmt,
      overallDiscountPercent,
      taxableValue: Math.max(0, taxableValue),
      cgst: isLocal && !isExport ? finalGst / 2 : 0,
      sgst: isLocal && !isExport ? finalGst / 2 : 0,
      igst: !isLocal && !isExport ? finalGst : 0,
      total: Math.max(0, taxableValue) + finalGst,
      isIntraState: isLocal,
    };
  };

  const totals = calculateTotals();

  // Validate fields dynamically
  const validateItemField = (index: number, field: string, val: any) => {
    const errors = { ...itemValidationErrors };
    if (!errors[index]) errors[index] = {};

    if (field === "description") {
      if (!val || val.trim() === "") {
        errors[index].description = "Description is required";
      } else {
        delete errors[index].description;
      }
    }
    if (field === "quantity") {
      if (Number(val) <= 0) {
        errors[index].quantity = "Qty must be > 0";
      } else {
        delete errors[index].quantity;
      }
    }
    if (field === "rate") {
      if (Number(val) < 0) {
        errors[index].rate = "Rate cannot be negative";
      } else {
        delete errors[index].rate;
      }
    }
    if (field === "discount_percent") {
      if (Number(val) < 0 || Number(val) > 100) {
        errors[index].discount_percent = "Discount between 0-100%";
      } else {
        delete errors[index].discount_percent;
      }
    }

    if (Object.keys(errors[index]).length === 0) {
      delete errors[index];
    }
    setItemValidationErrors(errors);
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
    validateItemField(index, field, value);

    if (unconfirmedFields.items) {
      confirmField("items");
    }
  };

  const addItem = () => {
    setItems([
      ...items,
      { description: "", long_description: "", hsn_code: "", quantity: 1, unit: "pcs", rate: 0, gst_rate: 18, discount_percent: 0 },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
      const errors = { ...itemValidationErrors };
      delete errors[index];
      setItemValidationErrors(errors);
    }
  };

  const toggleRowExpansion = (index: number) => {
    setExpandedRows(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const handleKeyDownOnLastInput = (e: React.KeyboardEvent<any>, index: number) => {
    if (e.key === "Tab" && !e.shiftKey) {
      // If it's the last input row and the last column, add new row
      if (index === items.length - 1) {
        e.preventDefault();
        addItem();
        // Focus the description input on next tick
        setTimeout(() => {
          const inputs = document.querySelectorAll('[placeholder="Item description"]');
          if (inputs.length > 0) {
            (inputs[inputs.length - 1] as HTMLInputElement).focus();
          }
        }, 10);
      }
    }
  };

  // Confirmation handling
  const confirmField = (field: string) => {
    setUnconfirmedFields(prev => {
      const updated = { ...prev };
      delete updated[field];
      
      // If no unconfirmed fields left, close banner
      if (Object.keys(updated).length === 0) {
        setShowConfirmBanner(false);
      }
      return updated;
    });
  };

  const confirmAllFields = () => {
    setUnconfirmedFields({});
    setShowConfirmBanner(false);
  };

  // OCR file upload triggers
  const handleOcrFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setError(null);
    setShowImportModal(false);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/parse-invoice-image", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to parse document");
      }

      const { data } = await res.json();

      if (data) {
        // Map extracted data to form
        if (data.customer_name) setCustomerName(data.customer_name);
        if (data.customer_gstin) setCustomerGstin(data.customer_gstin);
        
        // Find matching customer
        const matched = customers.find(
          c => c.name.toLowerCase() === (data.customer_name || "").toLowerCase()
        );
        if (matched) {
          setCustomerId(matched.id);
          setCustomerBillingStreet(matched.billing_address?.street || "");
          setCustomerBillingCity(matched.billing_address?.city || "");
          setCustomerBillingState(matched.billing_address?.state || "");
          setCustomerBillingPincode(matched.billing_address?.pincode || "");
          setShippingSameAsBilling(true);
        } else {
          setCustomerId("");
        }

        if (data.invoice_date) setInvoiceDate(data.invoice_date);
        
        // Map items
        if (data.items && data.items.length > 0) {
          setItems(data.items.map((item: any) => ({
            description: item.description || "Imported Item",
            long_description: "",
            hsn_code: item.hsn_code || "",
            quantity: Number(item.quantity) || 1,
            unit: item.unit || "pcs",
            rate: Number(item.rate) || 0,
            gst_rate: Number(item.gst_rate) || 18,
            discount_percent: 0,
          })));
        }

        // Set Place of Supply
        if (data.customer_gstin) {
          const extractedCode = getStateFromGSTIN(data.customer_gstin);
          if (extractedCode) setCustomerPlaceOfSupply(extractedCode);
        }

        if (data.notes) setNotes(data.notes);

        // Highlight fields that need validation review
        setUnconfirmedFields({
          customerName: true,
          customerGstin: true,
          invoiceDate: true,
          customerPlaceOfSupply: true,
          items: true,
          totals: true,
        });
        setShowConfirmBanner(true);
      }
    } catch (err: any) {
      setError(err.message || "Failed to process past invoice OCR");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Duplicate active invoice details
  const duplicatePastInvoice = async () => {
    if (!selectedPastInvoiceId) return;

    setIsImporting(true);
    setError(null);
    setShowImportModal(false);

    try {
      const supabase = createClient();
      
      // Fetch invoice record
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", selectedPastInvoiceId)
        .single();

      if (invErr) throw invErr;

      // Fetch items
      const { data: invItems, error: itemsErr } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", selectedPastInvoiceId);

      if (itemsErr) throw itemsErr;

      // Map values
      if (inv) {
        setCustomerName(inv.customer_name || "");
        setCustomerId(inv.customer_id || "");
        setNotes(inv.notes || "");
        setTerms(inv.terms || "");
        
        // Find customer record to get addresses
        const matched = customers.find(c => c.id === inv.customer_id);
        if (matched) {
          setCustomerGstin(matched.gstin || "");
          setCustomerBillingStreet(matched.billing_address?.street || "");
          setCustomerBillingCity(matched.billing_address?.city || "");
          setCustomerBillingState(matched.billing_address?.state || "");
          setCustomerBillingPincode(matched.billing_address?.pincode || "");
          setCustomerShippingStreet(matched.shipping_address?.street || "");
          setCustomerShippingCity(matched.shipping_address?.city || "");
          setCustomerShippingState(matched.shipping_address?.state || "");
          setCustomerShippingPincode(matched.shipping_address?.pincode || "");
          
          const bStreet = matched.billing_address?.street || "";
          const sStreet = matched.shipping_address?.street || "";
          setShippingSameAsBilling(bStreet === sStreet && bStreet !== "");
          
          const code = getStateFromGSTIN(matched.gstin) || 
                       INDIAN_STATES.find(s => s.name === matched.billing_address?.state)?.code || 
                       businessInfo?.state_code || "";
          setCustomerPlaceOfSupply(code);
        }

        // Apply items (duplicating UOM, HSN, discounts)
        if (invItems) {
          setItems(invItems.map((item: any) => ({
            description: item.description,
            long_description: item.long_description || "",
            hsn_code: item.hsn_code || "",
            quantity: item.quantity,
            unit: item.unit || "pcs",
            rate: item.rate,
            gst_rate: item.gst_rate,
            discount_percent: item.discount_percent || 0,
          })));
        }

        // Note: Invoice Date and Invoice Number are NOT copied, keeping current defaults!
        setUnconfirmedFields({
          customerName: true,
          items: true,
          totals: true,
        });
        setShowConfirmBanner(true);
      }
    } catch (err: any) {
      setError(err.message || "Failed to duplicate past invoice");
    } finally {
      setIsImporting(false);
    }
  };

  const handleSaveAction = (status: "draft" | "sent") => {
    setSaveStatus(status);
    handleSubmit(status);
  };

  const handleSubmit = async (status: "draft" | "sent") => {
    setSaving(true);
    setError(null);

    // Frontend validations
    let hasValidationError = false;
    const errors = { ...itemValidationErrors };

    items.forEach((item, idx) => {
      if (!item.description || item.description.trim() === "") {
        if (!errors[idx]) errors[idx] = {};
        errors[idx].description = "Description is required";
        hasValidationError = true;
      }
      if (item.quantity <= 0) {
        if (!errors[idx]) errors[idx] = {};
        errors[idx].quantity = "Qty must be > 0";
        hasValidationError = true;
      }
      if (item.rate < 0) {
        if (!errors[idx]) errors[idx] = {};
        errors[idx].rate = "Rate cannot be negative";
        hasValidationError = true;
      }
    });

    setCustomerTouched(true);
    if (!customerName || customerName.trim() === "") {
      hasValidationError = true;
    }

    if (invoiceNumberError) {
      hasValidationError = true;
    }

    if (hasValidationError) {
      setItemValidationErrors(errors);
      setError("Please fix the validation errors on the form.");
      setSaving(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Subscription check
      const { data: userSubscription } = await supabase
        .from("users")
        .select("subscription_plan, invoices_this_month, invoices_reset_date")
        .eq("id", user.id)
        .single();

      const plan = userSubscription?.subscription_plan || "free";
      const isPro = plan === "pro_monthly" || plan === "pro_yearly";
      let invoicesUsed = userSubscription?.invoices_this_month || 0;

      const resetDate = userSubscription?.invoices_reset_date
        ? new Date(userSubscription.invoices_reset_date)
        : null;
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      if (!resetDate || resetDate < monthStart) {
        await supabase
          .from("users")
          .update({ invoices_this_month: 0, invoices_reset_date: new Date().toISOString() })
          .eq("id", user.id);
        invoicesUsed = 0;
      }

      if (!isPro && invoicesUsed >= 50) {
        setError("You've reached the free plan limit of 50 invoices/month. Upgrade to Pro for unlimited invoices.");
        setSaving(false);
        return;
      }

      if (!businessInfo?.id) throw new Error("No business profile found");
      const businessId = businessInfo.id;
      let finalCustomerId = customerId;

      // Save/Create Customer
      const customerPayload = {
        business_id: businessId,
        name: customerName,
        gstin: customerGstin || null,
        billing_address: {
          street: customerBillingStreet,
          city: customerBillingCity,
          state: customerBillingState,
          pincode: customerBillingPincode,
        },
        shipping_address: {
          street: customerShippingStreet,
          city: customerShippingCity,
          state: customerShippingState,
          pincode: customerShippingPincode,
        },
      };

      if (customerId) {
        // Update customer details in case user edited them in summary card
        await supabase.from("customers").update(customerPayload).eq("id", customerId);
      } else if (customerName) {
        // Auto-create customer
        const { data: existingCustomers } = await supabase
          .from("customers")
          .select("id")
          .eq("business_id", businessId)
          .ilike("name", `%${customerName}%`);

        if (existingCustomers && existingCustomers.length > 0) {
          finalCustomerId = existingCustomers[0].id;
          await supabase.from("customers").update(customerPayload).eq("id", finalCustomerId);
        } else {
          const { data: newCustomer, error: customerError } = await supabase
            .from("customers")
            .insert(customerPayload)
            .select()
            .single();

          if (!customerError && newCustomer) {
            finalCustomerId = newCustomer.id;
          }
        }
      }

      // Add to inventory items dynamically if not present
      const { data: existingItems } = await supabase
        .from("inventory_items")
        .select("id, name")
        .eq("business_id", businessId);

      const existingNames = new Set((existingItems || []).map(i => i.name.toLowerCase()));

      for (const item of items) {
        if (!item.description) continue;
        const itemNameLower = item.description.toLowerCase();
        if (!existingNames.has(itemNameLower)) {
          await supabase.from("inventory_items").insert({
            business_id: businessId,
            name: item.description,
            unit: item.unit,
            unit_price: item.rate,
            current_stock: 0,
            reorder_level: 10,
            gst_rate: item.gst_rate,
            hsn_code: item.hsn_code || null,
          });
          existingNames.add(itemNameLower);
        }
      }

      const calculatedTotals = calculateTotals();

      // Check one last time if invoice number is duplicate
      const { data: duplicateCheck } = await supabase
        .from("invoices")
        .select("id")
        .eq("business_id", businessId)
        .eq("invoice_number", invoiceNumber)
        .maybeSingle();

      if (duplicateCheck) {
        throw new Error(`Invoice number "${invoiceNumber}" is duplicate. Please edit sequence.`);
      }

      // Create invoice record
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          business_id: businessId,
          customer_id: finalCustomerId || null,
          customer_name: customerName,
          invoice_number: invoiceNumber,
          invoice_date: invoiceDate,
          due_date: dueDate,
          subtotal: calculatedTotals.subtotal,
          discount_percent: calculatedTotals.overallDiscountPercent,
          discount_amount: calculatedTotals.overallDiscount,
          cgst: calculatedTotals.cgst,
          sgst: calculatedTotals.sgst,
          igst: calculatedTotals.igst,
          total: calculatedTotals.total,
          status: status,
          notes,
          terms,
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Create invoice line items
      const invoiceItems = items.map((item) => {
        const lineAmount = item.quantity * item.rate;
        const lineDiscount = (lineAmount * (item.discount_percent || 0)) / 100;
        const taxableAmount = (lineAmount - lineDiscount) * (1 - calculatedTotals.overallDiscountPercent / 100);
        const itemGst = (taxableAmount * item.gst_rate) / 100;
        
        return {
          invoice_id: invoice.id,
          description: item.description,
          long_description: item.long_description || null,
          hsn_code: item.hsn_code || null,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          discount_percent: item.discount_percent || 0,
          discount_amount: lineDiscount,
          gst_rate: item.gst_rate,
          cgst: calculatedTotals.isIntraState && supplyType !== "export" ? itemGst / 2 : 0,
          sgst: calculatedTotals.isIntraState && supplyType !== "export" ? itemGst / 2 : 0,
          igst: !calculatedTotals.isIntraState && supplyType !== "export" ? itemGst : 0,
          amount: taxableAmount + (supplyType === "export" ? 0 : itemGst),
        };
      });

      const { error: itemsError } = await supabase.from("invoice_items").insert(invoiceItems);
      if (itemsError) throw itemsError;

      // Update business's next invoice number sequence
      const parsedSeq = parseInt(invoiceNumber.split("/").pop() || "");
      if (!isNaN(parsedSeq) && parsedSeq >= (businessInfo.next_invoice_number || 0)) {
        await supabase
          .from("businesses")
          .update({ next_invoice_number: parsedSeq + 1 })
          .eq("id", businessId);
      }

      // Increment count on free plan
      if (!isPro) {
        await supabase
          .from("users")
          .update({ invoices_this_month: invoicesUsed + 1 })
          .eq("id", user.id);
      }

      // Send feedback to AI
      if (transcript && dataParsingFeedback(calculatedTotals)) {
        // fire and forget feedback call
        fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            originalTranscript: transcript,
            aiParsed: { buyer_name: customerName, items: items },
            userCorrected: { buyer_name: customerName, items: items },
          }),
        }).catch(() => {});
      }

      router.push(`/invoices/${invoice.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to create invoice");
    } finally {
      setSaving(false);
    }
  };

  const dataParsingFeedback = (t: any) => {
    return true; // simple flag
  };

  // Voice recording triggers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
    } catch {
      setError("Microphone access blocked. Please grant permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const transcribeRes = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!transcribeRes.ok) throw new Error("Audio transcription failed");
      const { transcript: text } = await transcribeRes.json();
      setTranscript(text);

      if (!text || text.trim() === "") {
        setError("Could not capture speech. Speak closer to the microphone.");
        return;
      }

      // Check command palette commands
      const cmdRes = await fetch("/api/parse-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (cmdRes.ok) {
        const { command } = await cmdRes.json();
        if (command && command.action !== "add_items") {
          executeCommand(command);
          return;
        }
      }

      // General parse
      const parseRes = await fetch("/api/parse-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });

      if (!parseRes.ok) throw new Error("AI parsing failed");
      const { invoice: parsed } = await parseRes.json();

      if (parsed) {
        if (parsed.buyer_name) handleCustomerNameChange(parsed.buyer_name);
        if (parsed.items && parsed.items.length > 0) {
          setItems(parsed.items.map((i: any) => ({
            description: i.name || i.description || "Voice item",
            long_description: "",
            hsn_code: i.hsn_code || "",
            quantity: i.quantity || 1,
            unit: i.unit || "pcs",
            rate: i.rate || i.price || 0,
            gst_rate: i.gst_percent || 18,
            discount_percent: 0,
          })));
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to process voice input");
    } finally {
      setIsProcessing(false);
    }
  };

  const executeCommand = (command: any) => {
    switch (command.action) {
      case "set_gst":
        setItems(items.map(i => ({ ...i, gst_rate: command.value || 0 })));
        break;
      case "set_customer":
        handleCustomerNameChange(command.value || "");
        break;
      case "clear_items":
        setItems([{ description: "", long_description: "", hsn_code: "", quantity: 1, unit: "pcs", rate: 0, gst_rate: 18, discount_percent: 0 }]);
        break;
      case "set_notes":
        setNotes(command.value || "");
        break;
      default:
        break;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 px-4 md:px-0">
      
      {/* Mapped Confirms Banner */}
      {showConfirmBanner && (
        <div className="bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm text-foreground">Imported Past Invoice Details</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Review and confirm the highlighted fields (GSTIN, Rates, Totals) before saving.
              </p>
            </div>
          </div>
          <button
            onClick={confirmAllFields}
            className="text-xs font-semibold px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors shadow-sm"
          >
            Confirm All Fields
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/invoices"
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">Create Invoice</h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 dark:bg-amber-500/20">
                Draft
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Generate a tax invoice or save as draft</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Collapsible Supplier Info Trigger */}
          <button
            onClick={() => setShowSupplierDetails(!showSupplierDetails)}
            className="flex items-center gap-2 text-xs font-medium px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-secondary transition-colors text-muted-foreground"
          >
            {showSupplierDetails ? "Hide Supplier Info" : "Show Supplier Info"}
            {showSupplierDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {/* Import Past Invoice Trigger */}
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl bg-secondary hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-foreground transition-all shadow-sm"
          >
            <Upload className="w-3.5 h-3.5" />
            Import Past Invoice
          </button>
        </div>
      </div>

      {/* Supplier details settings card */}
      {showSupplierDetails && businessInfo && (
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-5 shadow-sm space-y-3 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Supplier (Your Business)</h3>
            <span className="text-xs text-muted-foreground font-mono">{businessInfo.gstin || "No GSTIN"}</span>
          </div>
          <div className="grid md:grid-cols-3 gap-4 text-xs text-foreground">
            <div>
              <p className="font-semibold">{businessInfo.name}</p>
              <p className="text-muted-foreground mt-0.5">{businessInfo.address || "Address not provided"}</p>
            </div>
            <div>
              <p className="font-semibold">Place of Supply</p>
              <p className="text-muted-foreground mt-0.5">
                {INDIAN_STATES.find(s => s.code === businessInfo.state_code)?.name || "State not set"} ({businessInfo.state_code || "-"})
              </p>
            </div>
            <div>
              <p className="font-semibold">Contact Info</p>
              <p className="text-muted-foreground mt-0.5">{businessInfo.phone || "No phone"} • {businessInfo.email || "No email"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Voice Assistant */}
      <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="relative">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessing}
              className={`h-16 w-16 rounded-full flex items-center justify-center transition-all duration-300 relative z-10 shadow-lg ${
                isRecording
                  ? "bg-red-500 animate-pulse text-white hover:bg-red-600"
                  : isProcessing
                  ? "bg-slate-200 dark:bg-slate-800 text-slate-400"
                  : "bg-gradient-to-br from-primary to-blue-500 text-white hover:scale-105 active:scale-95"
              }`}
            >
              {isProcessing ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : isRecording ? (
                <MicOff className="w-6 h-6" />
              ) : (
                <Mic className="w-6 h-6" />
              )}
            </button>
            {isRecording && (
              <span className="absolute -inset-2 rounded-full bg-red-500/20 animate-ping z-0" />
            )}
          </div>
          <div className="flex-1 text-center md:text-left space-y-1">
            <div className="flex items-center justify-center md:justify-start gap-2.5">
              <span className={`h-2.5 w-2.5 rounded-full ${isRecording ? "bg-red-500 animate-pulse" : "bg-slate-400"}`} />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {isRecording ? "Voice Assistant: Listening..." : "Voice Assistant: Stopped"}
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Speak invoice details like: <i>"Add TMT Fe-500 500 kg at 60 rupees with 18% GST for M/s Steel Traders"</i>
            </p>
          </div>
        </div>
        {transcript && (
          <div className="mt-4 p-4 bg-secondary/50 border rounded-xl text-left">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Transcript:</p>
            <p className="text-xs text-foreground font-medium leading-relaxed">{transcript}</p>
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-2 flex items-center gap-1 font-semibold">
              <Info className="w-3.5 h-3.5" /> AI parsed details. Review populated fields below.
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Invoice Details Form */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          
          {/* Header & Date Section */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              
              {/* Invoice Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invoice Number</label>
                <input
                  type="text"
                  placeholder="Prefix/FY/Sequence"
                  value={invoiceNumber}
                  maxLength={16}
                  onChange={(e) => {
                    setInvoiceNumber(e.target.value);
                    setIsInvoiceNumberEdited(true);
                    setInvoiceNumberError("");
                  }}
                  onBlur={(e) => checkDuplicateInvoiceNumber(e.target.value)}
                  className={`w-full bg-secondary border rounded-xl px-3 py-2.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none font-mono ${
                    invoiceNumberError ? "border-red-500" : "border-transparent"
                  }`}
                />
                {invoiceNumberError && (
                  <p className="text-[10px] text-red-500 font-semibold">{invoiceNumberError}</p>
                )}
                <p className="text-[9px] text-muted-foreground font-mono">Max 16 chars. Alphanumeric + / or -</p>
              </div>

              {/* Invoice Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invoice Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full bg-secondary border border-transparent rounded-xl pl-9 pr-3 py-2.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
              </div>

              {/* Due Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => {
                      setDueDate(e.target.value);
                      if (unconfirmedFields.invoiceDate) confirmField("invoiceDate");
                    }}
                    className="w-full bg-secondary border border-transparent rounded-xl pl-9 pr-3 py-2.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Presets Row */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-900">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase mr-1">Presets:</span>
              {[7, 15, 30, 45].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDueDatePreset(d)}
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-md border hover:bg-secondary hover:text-foreground transition-all text-muted-foreground"
                >
                  Net {d}
                </button>
              ))}
            </div>
          </div>

          {/* Customer profile selection */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Customer / Recipient</h2>
            
            <div className="grid sm:grid-cols-2 gap-4">
              
              {/* Customer Selector */}
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer Name</label>
                <input
                  type="text"
                  placeholder="Select or enter customer name"
                  value={customerName}
                  onChange={(e) => handleCustomerNameChange(e.target.value)}
                  list="customers-list"
                  className={`w-full bg-secondary border rounded-xl px-4 py-3 text-xs focus:ring-2 focus:ring-primary/20 outline-none ${
                    customerTouched && !customerName ? "border-red-500" : "border-transparent"
                  } ${unconfirmedFields.customerName ? "border-amber-500" : ""}`}
                />
                <datalist id="customers-list">
                  {customers.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
                {unconfirmedFields.customerName && (
                  <button onClick={() => confirmField("customerName")} className="text-[9px] text-amber-500 font-bold hover:underline flex items-center gap-0.5 mt-0.5">
                    ⚠️ Mapped - Click to confirm
                  </button>
                )}
              </div>
            </div>

            {/* Customer Details Summary Card (Visible always once customerName is populated) */}
            {customerName && (
              <div className="p-5 border border-slate-200/60 dark:border-slate-800/60 rounded-xl bg-slate-500/5 space-y-4 animate-in fade-in duration-200">
                <div className="flex flex-col sm:flex-row justify-between gap-3 pb-3 border-b border-slate-200/50 dark:border-slate-800/50">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Customer Profile Summary</span>
                    <h4 className="text-xs font-bold text-foreground font-mono">{customerName}</h4>
                  </div>
                  
                  {/* Supply Type Dropdown */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Supply:</span>
                    <select
                      value={supplyType}
                      onChange={(e: any) => setSupplyType(e.target.value)}
                      className="bg-secondary text-xs rounded-lg px-2.5 py-1 border-none focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      <option value="regular">Regular (GST)</option>
                      <option value="sez">SEZ</option>
                      <option value="export">Export</option>
                    </select>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {/* GSTIN and Place of Supply */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Customer GSTIN</label>
                      <input
                        type="text"
                        placeholder="GSTIN (Unregistered if blank)"
                        value={customerGstin}
                        maxLength={15}
                        onChange={(e) => {
                          setCustomerGstin(e.target.value);
                          if (unconfirmedFields.customerGstin) confirmField("customerGstin");
                        }}
                        className={`w-full bg-secondary border border-transparent rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20 outline-none ${
                          unconfirmedFields.customerGstin ? "border-amber-500" : ""
                        }`}
                      />
                      {unconfirmedFields.customerGstin && (
                        <button onClick={() => confirmField("customerGstin")} className="text-[9px] text-amber-500 font-bold hover:underline">
                          ⚠️ Click to confirm GSTIN
                        </button>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Place of Supply (State)</label>
                      <select
                        value={customerPlaceOfSupply}
                        onChange={(e) => {
                          setCustomerPlaceOfSupply(e.target.value);
                          if (unconfirmedFields.customerPlaceOfSupply) confirmField("customerPlaceOfSupply");
                        }}
                        className={`w-full bg-secondary border border-transparent rounded-lg px-2.5 py-2 text-xs focus:ring-2 focus:ring-primary/20 outline-none ${
                          unconfirmedFields.customerPlaceOfSupply ? "border-amber-500" : ""
                        }`}
                      >
                        <option value="">Select State</option>
                        {INDIAN_STATES.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.code} - {s.name}
                          </option>
                        ))}
                      </select>
                      {unconfirmedFields.customerPlaceOfSupply && (
                        <button onClick={() => confirmField("customerPlaceOfSupply")} className="text-[9px] text-amber-500 font-bold hover:underline">
                          ⚠️ Click to confirm Place
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Billing Address */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Billing Address</span>
                    <input
                      type="text"
                      placeholder="Street/Area"
                      value={customerBillingStreet}
                      onChange={(e) => setCustomerBillingStreet(e.target.value)}
                      className="w-full bg-secondary border-none rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="City"
                        value={customerBillingCity}
                        onChange={(e) => setCustomerBillingCity(e.target.value)}
                        className="w-full bg-secondary border-none rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                      <input
                        type="text"
                        placeholder="State"
                        value={customerBillingState}
                        onChange={(e) => setCustomerBillingState(e.target.value)}
                        className="w-full bg-secondary border-none rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Pincode"
                        value={customerBillingPincode}
                        onChange={(e) => setCustomerBillingPincode(e.target.value)}
                        className="w-full bg-secondary border-none rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Shipping address toggle */}
                <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800/50 space-y-3">
                  <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={shippingSameAsBilling}
                      onChange={(e) => setShippingSameAsBilling(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-800 text-primary focus:ring-primary/20"
                    />
                    Shipping address is same as billing address
                  </label>

                  {!shippingSameAsBilling && (
                    <div className="grid md:grid-cols-2 gap-4 pt-1 animate-in slide-in-from-top-2 duration-150">
                      <div className="col-span-2 space-y-2">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Shipping/Delivery Address</span>
                        <input
                          type="text"
                          placeholder="Street/Area"
                          value={customerShippingStreet}
                          onChange={(e) => setCustomerShippingStreet(e.target.value)}
                          className="w-full bg-secondary border-none rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="text"
                            placeholder="City"
                            value={customerShippingCity}
                            onChange={(e) => setCustomerShippingCity(e.target.value)}
                            className="w-full bg-secondary border-none rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none"
                          />
                          <input
                            type="text"
                            placeholder="State"
                            value={customerShippingState}
                            onChange={(e) => setCustomerShippingState(e.target.value)}
                            className="w-full bg-secondary border-none rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none"
                          />
                          <input
                            type="text"
                            placeholder="Pincode"
                            value={customerShippingPincode}
                            onChange={(e) => setCustomerShippingPincode(e.target.value)}
                            className="w-full bg-secondary border-none rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Line Items Grid */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Line Items</h2>
              {unconfirmedFields.items && (
                <button onClick={() => confirmField("items")} className="text-[10px] text-amber-500 font-bold hover:underline flex items-center gap-1">
                  ⚠️ Items imported - Click to confirm
                </button>
              )}
            </div>

            <div className="space-y-4">
              {/* Responsive Headers (Desktop) */}
              <div className="hidden md:grid md:grid-cols-12 gap-2 pb-2 border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                <div className="col-span-3">Item Description</div>
                <div className="col-span-1.5">HSN/SAC</div>
                <div className="col-span-1">Qty</div>
                <div className="col-span-1.5">Unit</div>
                <div className="col-span-1.5">Rate</div>
                <div className="col-span-1">Disc %</div>
                <div className="col-span-1.5">Tax (GST)</div>
                <div className="col-span-1 text-right">Amount</div>
              </div>

              {/* Rows */}
              {items.map((item, index) => {
                const lineAmount = item.quantity * item.rate;
                const lineDiscount = (lineAmount * (item.discount_percent || 0)) / 100;
                const lineTaxable = lineAmount - lineDiscount;
                const lineGst = (lineTaxable * item.gst_rate) / 100;
                const lineTotal = lineTaxable + (supplyType === "export" ? 0 : lineGst);
                
                const isLocal = !businessInfo?.state_code || !customerPlaceOfSupply || businessInfo.state_code === customerPlaceOfSupply;

                return (
                  <div
                    key={index}
                    className={`p-4 md:p-0 bg-secondary/30 md:bg-transparent rounded-xl border border-slate-200 dark:border-slate-800 md:border-none space-y-3 md:space-y-0 ${
                      unconfirmedFields.items ? "border-amber-500/30" : ""
                    }`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                      
                      {/* Description column */}
                      <div className="md:col-span-3 space-y-1.5">
                        <span className="md:hidden text-[9px] font-bold text-muted-foreground uppercase">Description</span>
                        <input
                          type="text"
                          placeholder="Item description"
                          value={item.description}
                          onChange={(e) => updateItem(index, "description", e.target.value)}
                          className={`w-full bg-secondary border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/45 focus:ring-2 focus:ring-primary/20 outline-none ${
                            itemValidationErrors[index]?.description ? "border-red-500 bg-red-500/5" : "border-transparent"
                          }`}
                        />
                        {itemValidationErrors[index]?.description && (
                          <p className="text-[9px] text-red-500 font-semibold">{itemValidationErrors[index].description}</p>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleRowExpansion(index)}
                          className="text-[10px] font-semibold text-primary hover:underline"
                        >
                          {expandedRows[index] ? "Collapse Details" : "Add details"}
                        </button>
                      </div>

                      {/* HSN/SAC */}
                      <div className="md:col-span-1.5 space-y-1.5">
                        <span className="md:hidden text-[9px] font-bold text-muted-foreground uppercase">HSN/SAC</span>
                        <input
                          type="text"
                          placeholder="HSN/SAC"
                          value={item.hsn_code}
                          onChange={(e) => updateItem(index, "hsn_code", e.target.value)}
                          className="w-full bg-secondary border border-transparent rounded-lg px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/45 focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                      </div>

                      {/* Qty */}
                      <div className="md:col-span-1 space-y-1.5">
                        <span className="md:hidden text-[9px] font-bold text-muted-foreground uppercase">Qty</span>
                        <input
                          type="number"
                          placeholder="Qty"
                          min={1}
                          value={item.quantity || ""}
                          onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                          className={`w-full bg-secondary border rounded-lg px-2 py-1.5 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none ${
                            itemValidationErrors[index]?.quantity ? "border-red-500" : "border-transparent"
                          }`}
                        />
                        {itemValidationErrors[index]?.quantity && (
                          <p className="text-[9px] text-red-500 font-semibold">{itemValidationErrors[index].quantity}</p>
                        )}
                      </div>

                      {/* Unit select */}
                      <div className="md:col-span-1.5 space-y-1.5">
                        <span className="md:hidden text-[9px] font-bold text-muted-foreground uppercase">Unit</span>
                        <select
                          value={item.unit}
                          onChange={(e) => updateItem(index, "unit", e.target.value)}
                          className="w-full bg-secondary border border-transparent rounded-lg px-2.5 py-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                        >
                          <option value="pcs">pcs (Pieces)</option>
                          <option value="kg">kg (Kilograms)</option>
                          <option value="nos">nos (Numbers)</option>
                          <option value="box">box (Box)</option>
                          <option value="bag">bag (Bag)</option>
                          <option value="mtr">mtr (Meters)</option>
                          <option value="set">set (Set)</option>
                          <option value="ton">ton (Metric Tons)</option>
                          <option value="hrs">hrs (Hours)</option>
                          <option value="sqf">sqf (Square Feet)</option>
                        </select>
                      </div>

                      {/* Rate */}
                      <div className="md:col-span-1.5 space-y-1.5">
                        <span className="md:hidden text-[9px] font-bold text-muted-foreground uppercase">Rate</span>
                        <input
                          type="number"
                          placeholder="Rate"
                          min={0}
                          value={item.rate || ""}
                          onChange={(e) => updateItem(index, "rate", Number(e.target.value))}
                          className={`w-full bg-secondary border rounded-lg px-2 py-1.5 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none ${
                            itemValidationErrors[index]?.rate ? "border-red-500 font-semibold" : "border-transparent"
                          }`}
                        />
                        {itemValidationErrors[index]?.rate && (
                          <p className="text-[9px] text-red-500 font-semibold">{itemValidationErrors[index].rate}</p>
                        )}
                      </div>

                      {/* Disc % */}
                      <div className="md:col-span-1 space-y-1.5">
                        <span className="md:hidden text-[9px] font-bold text-muted-foreground uppercase">Disc %</span>
                        <input
                          type="number"
                          placeholder="Disc"
                          min={0}
                          max={100}
                          value={item.discount_percent || ""}
                          onChange={(e) => updateItem(index, "discount_percent", Number(e.target.value))}
                          className={`w-full bg-secondary border rounded-lg px-2 py-1.5 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none ${
                            itemValidationErrors[index]?.discount_percent ? "border-red-500" : "border-transparent"
                          }`}
                        />
                      </div>

                      {/* Tax dropdown */}
                      <div className="md:col-span-1.5 space-y-1.5">
                        <span className="md:hidden text-[9px] font-bold text-muted-foreground uppercase">Tax (GST)</span>
                        <select
                          value={item.gst_rate}
                          onChange={(e) => {
                            updateItem(index, "gst_rate", Number(e.target.value));
                            handleKeyDownOnLastInput(e as any, index);
                          }}
                          onKeyDown={(e) => handleKeyDownOnLastInput(e, index)}
                          className="w-full bg-secondary border border-transparent rounded-lg px-2.5 py-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                        >
                          <option value={0}>0% GST</option>
                          <option value={5}>5% GST</option>
                          <option value={12}>12% GST</option>
                          <option value={18}>18% GST</option>
                          <option value={28}>28% GST</option>
                        </select>
                      </div>

                      {/* Line Amount */}
                      <div className="md:col-span-1 text-right py-1.5 space-y-1">
                        <span className="md:hidden block text-left text-[9px] font-bold text-muted-foreground uppercase mb-1">Line Amount</span>
                        <p className="font-bold text-xs text-foreground">
                          ₹{lineTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </p>
                        
                        {/* GST Splits */}
                        {item.gst_rate > 0 && supplyType !== "export" && (
                          <p className="text-[8px] text-muted-foreground/80 font-medium">
                            {isLocal ? (
                              `₹${(lineGst / 2).toFixed(1)} CGST + ₹${(lineGst / 2).toFixed(1)} SGST`
                            ) : (
                              `₹${lineGst.toFixed(1)} IGST`
                            )}
                          </p>
                        )}
                        {supplyType === "export" && (
                          <span className="text-[8px] font-semibold text-emerald-600">Export (0% Tax)</span>
                        )}
                      </div>
                    </div>

                    {/* Expandable details field */}
                    {expandedRows[index] && (
                      <div className="grid grid-cols-12 gap-2 mt-2 animate-in slide-in-from-top-1 duration-150">
                        <div className="col-span-12 md:col-start-1 md:col-end-12 space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase">Long Description / Details</label>
                          <textarea
                            placeholder="Add scope details, serial numbers, periods, etc. (rendered below the item on PDF)"
                            value={item.long_description || ""}
                            onChange={(e) => updateItem(index, "long_description", e.target.value)}
                            rows={2}
                            className="w-full bg-secondary border border-transparent rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/45 focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                          />
                        </div>
                      </div>
                    )}

                    {/* Remove row button on mobile / spacing */}
                    {items.length > 1 && (
                      <div className="flex justify-end md:inline-flex md:absolute md:right-[-32px] md:top-[6px]">
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/5 transition-all"
                          title="Delete Row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add Line button */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-900">
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1 text-xs font-semibold px-4 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 hover:bg-secondary hover:text-primary hover:border-primary/50 transition-all text-muted-foreground"
              >
                <Plus className="w-4 h-4" />
                Add line item
              </button>
            </div>
          </div>

          {/* Discount & Notes */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground mb-3">Overall Discount</h2>
              <div className="flex items-center gap-3">
                
                {/* Discount type toggle */}
                <div className="flex rounded-xl bg-secondary p-0.5 border border-slate-200/20">
                  <button
                    type="button"
                    onClick={() => {
                      setOverallDiscountType("percent");
                      setOverallDiscountVal(0);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      overallDiscountType === "percent"
                        ? "bg-white dark:bg-slate-900 shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Percent className="w-3.5 h-3.5" /> Percent
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOverallDiscountType("amount");
                      setOverallDiscountVal(0);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      overallDiscountType === "amount"
                        ? "bg-white dark:bg-slate-900 shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Coins className="w-3.5 h-3.5" /> Amount (₹)
                  </button>
                </div>

                <div className="flex-1 max-w-[160px]">
                  <input
                    type="number"
                    placeholder="0"
                    min={0}
                    value={overallDiscountVal || ""}
                    onChange={(e) => setOverallDiscountVal(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-secondary border-none rounded-xl px-4 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none text-center font-bold"
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {overallDiscountType === "percent" ? "% off invoice subtotal" : "flat rupees discount"}
                </span>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-900 pt-4">
              {/* Additional notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Additional Notes</label>
                <textarea
                  placeholder="Additional notes for this invoice..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none resize-none min-h-[70px] overflow-hidden"
                  onInput={(e) => {
                    const el = e.target as HTMLTextAreaElement;
                    el.style.height = "auto";
                    el.style.height = el.scrollHeight + "px";
                  }}
                />
                <p className="text-[9px] text-muted-foreground">
                  Shown on invoice footer, e.g., payment instructions or business policies.
                </p>
              </div>

              {/* Terms Conditions */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Terms & Conditions</label>
                <textarea
                  placeholder="Add terms and conditions..."
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  rows={2}
                  className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none resize-none min-h-[70px] overflow-hidden"
                  onInput={(e) => {
                    const el = e.target as HTMLTextAreaElement;
                    el.style.height = "auto";
                    el.style.height = el.scrollHeight + "px";
                  }}
                />
                <p className="text-[9px] text-muted-foreground">
                  Printed in formal layout under signatory box.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Totals Summary Sidebar */}
        <div className="space-y-6">
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm sticky top-24 space-y-5">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Summary Breakup</h2>
              {unconfirmedFields.totals && (
                <button onClick={() => confirmField("totals")} className="text-[9px] text-amber-500 font-bold hover:underline">
                  ⚠️ Verify
                </button>
              )}
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal (Gross)</span>
                <span className="font-semibold text-foreground">₹{totals.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>

              {totals.itemDiscounts > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Item Discounts</span>
                  <span>-₹{totals.itemDiscounts.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              )}

              <div className="flex justify-between text-muted-foreground border-t border-dashed pt-2.5">
                <span>Net Subtotal</span>
                <span className="font-semibold text-foreground">₹{totals.netSubtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>

              {totals.overallDiscount > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Overall Discount</span>
                  <span>-₹{totals.overallDiscount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              )}

              <div className="flex justify-between text-foreground border-t pt-2.5 font-bold">
                <span>Taxable Value</span>
                <span>₹{totals.taxableValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>

              {/* GST Splits Breakup */}
              {supplyType !== "export" && (
                <div className="bg-secondary/30 rounded-xl p-3 space-y-2 border border-slate-100 dark:border-slate-900 mt-1">
                  {totals.isIntraState ? (
                    <>
                      <div className="flex justify-between text-muted-foreground text-[11px]">
                        <span>Central GST (CGST)</span>
                        <span className="font-medium text-foreground">₹{totals.cgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground text-[11px]">
                        <span>State GST (SGST)</span>
                        <span className="font-medium text-foreground">₹{totals.sgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between text-muted-foreground text-[11px]">
                      <span>Integrated GST (IGST)</span>
                      <span className="font-medium text-foreground">₹{totals.igst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </div>
              )}

              {supplyType === "export" && (
                <div className="p-2.5 rounded-lg bg-emerald-500/5 text-emerald-600 text-center font-bold text-[10px]">
                  Zero Tax Export Supply
                </div>
              )}

              {/* Reverse charge check */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-900">
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={reverseCharge}
                    onChange={(e) => setReverseCharge(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-800 text-primary focus:ring-primary/20"
                  />
                  Reverse Charge Applicable
                </label>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-3.5 flex justify-between items-baseline">
                <span className="font-extrabold text-sm text-foreground uppercase tracking-wider">Grand Total</span>
                <span className="font-black text-xl text-foreground font-mono">
                  ₹{totals.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Amount in words */}
            <div className="p-3 bg-secondary/40 border border-slate-200/50 dark:border-slate-800/50 rounded-xl text-[10px] text-muted-foreground leading-relaxed">
              <span className="font-bold text-foreground block mb-0.5 uppercase tracking-wide">Amount in Words</span>
              {toIndianRupeesWords(totals.total)}
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-3">
              <button
                type="button"
                onClick={() => handleSaveAction("sent")}
                disabled={saving || !customerName}
                className="w-full py-3 bg-gradient-to-br from-primary to-blue-500 hover:opacity-95 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && saveStatus === "sent" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Issuing Invoice...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save & Issue Invoice
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSaveAction("draft")}
                disabled={saving || !customerName}
                className="w-full py-3 border hover:bg-secondary text-foreground font-bold text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && saveStatus === "draft" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving Draft...
                  </>
                ) : (
                  "Save as Draft"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Import Invoice Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-6 border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-md font-extrabold text-foreground">Import Past Invoice</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Loads details in Draft status</p>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="p-2 hover:bg-secondary rounded-xl transition-all"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex rounded-xl bg-secondary p-0.5 border border-slate-200/20">
              <button
                type="button"
                onClick={() => setImportTab("upload")}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                  importTab === "upload"
                    ? "bg-white dark:bg-slate-900 shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Upload Bill/PDF (OCR)
              </button>
              <button
                type="button"
                onClick={() => setImportTab("duplicate")}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                  importTab === "duplicate"
                    ? "bg-white dark:bg-slate-900 shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Duplicate In-app Invoice
              </button>
            </div>

            {/* Tab content: OCR Upload */}
            {importTab === "upload" && (
              <div className="space-y-4 text-center py-6">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleOcrFileSelect}
                  accept="image/*,application/pdf"
                  className="hidden"
                />
                
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 dark:border-slate-800 hover:border-primary/50 rounded-2xl p-8 cursor-pointer hover:bg-secondary/20 transition-all space-y-3"
                >
                  <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Click to upload document</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Supports PNG, JPG, or PDF (max 10MB)</p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Our accountant AI will extract items, rates, and values into Draft mode for verification.
                </p>
              </div>
            )}

            {/* Tab content: Duplication selection */}
            {importTab === "duplicate" && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Select Past Invoice</label>
                  <select
                    value={selectedPastInvoiceId}
                    onChange={(e) => setSelectedPastInvoiceId(e.target.value)}
                    className="w-full bg-secondary border border-transparent rounded-xl px-3 py-2.5 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                  >
                    <option value="">-- Select Invoice --</option>
                    {pastInvoices.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_number} ({inv.customer_name}) - ₹{inv.total.toLocaleString("en-IN")}
                      </option>
                    ))}
                  </select>
                </div>
                
                <button
                  type="button"
                  onClick={duplicatePastInvoice}
                  disabled={!selectedPastInvoiceId}
                  className="w-full py-2.5 bg-primary hover:bg-primary/95 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  Duplicate selected
                </button>
                <p className="text-[10px] text-center text-muted-foreground">
                  Creates a new Draft containing identical items, UOM, and customer details, keeping current dates.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Global Import loading overlay */}
      {isImporting && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center z-[100] gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-white" />
          <p className="text-xs font-semibold text-white tracking-wider uppercase">AI extracting fields...</p>
        </div>
      )}
    </div>
  );
}
