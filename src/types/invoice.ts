export interface InvoiceItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  gst_percent: number | null;
  amount: number | null;
}

export interface Invoice {
  buyer_name: string | null;
  items: InvoiceItem[];
  subtotal: number | null;
  gst_amount: number | null;
  total: number | null;
  notes: string | null;
}

export type Language = "hi-IN" | "mr-IN" | "en-IN";

export const LANGUAGES: { code: Language; label: string; webSpeechCode: string }[] = [
  { code: "hi-IN", label: "हिंदी", webSpeechCode: "hi-IN" },
  { code: "mr-IN", label: "मराठी", webSpeechCode: "mr-IN" },
  { code: "en-IN", label: "English", webSpeechCode: "en-IN" },
];
