// GeM Bid Finder — Type Definitions

export interface GemBid {
  id: string;
  business_id: string;
  gem_bid_id: string; // e.g. "GEM/2026/B/12345"
  title: string;
  category: string | null;
  quantity: string | null;
  uom: string | null;
  department: string | null;
  organization: string | null;
  start_date: string | null;
  end_date: string | null;
  estimated_value: number | null;
  bid_type: string | null; // "open" | "limited" | "RA"
  status: GemBidStatus;
  ai_summary: string | null;
  ai_eligibility: AIEligibility | null;
  ai_requirements: AIRequirement[] | null;
  ai_doc_checklist: AIDocChecklistItem[] | null;
  raw_html: string | null;
  bid_url: string | null;
  scraped_at: string;
  created_at: string;
  updated_at: string;
}

export type GemBidStatus =
  | "new"
  | "analyzing"
  | "analyzed"
  | "interested"
  | "applied"
  | "won"
  | "lost"
  | "expired";

export interface AIEligibility {
  eligible: boolean;
  confidence: number; // 0-100
  reasons: string[];
  missing_docs: string[];
  missing_criteria: string[];
}

export interface AIRequirement {
  category: string; // "Technical" | "Financial" | "Documentation" | "Delivery" | "Penalty"
  title: string;
  description: string;
  mandatory: boolean;
  met: boolean | null; // null = unknown, true = met, false = not met
}

export interface AIDocChecklistItem {
  doc_name: string;
  doc_type: "mandatory" | "optional" | "conditional";
  description: string;
  can_generate: boolean; // true = AI can auto-generate this
  generated: boolean;
  notes: string | null;
}

export interface GemBidDocument {
  id: string;
  gem_bid_id: string;
  doc_type: GemDocType;
  file_name: string;
  file_url: string;
  ai_analysis: string | null;
  is_generated: boolean;
  created_at: string;
}

export type GemDocType =
  | "tender_document"
  | "atc" // Additional Terms & Conditions
  | "bot" // Bid Opening Terms
  | "corrigendum"
  | "cover_letter"
  | "compliance_matrix"
  | "experience_cert"
  | "undertaking"
  | "other";

export interface GemScanLog {
  id: string;
  business_id: string;
  scan_type: "full" | "incremental" | "manual";
  bids_found: number;
  bids_new: number;
  status: "running" | "completed" | "failed" | "captcha_blocked";
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface GemConfig {
  gem_username: string;
  gem_password: string;
  categories: string[];
  keywords: string[];
  scan_frequency: "manual" | "30min" | "1hr" | "6hr" | "daily";
  notifications_enabled: boolean;
}

// Scraper response types
export interface ScanResult {
  scan_id: string;
  status: "completed" | "failed" | "captcha_blocked";
  bids_found: number;
  bids_new: number;
  duration_ms: number;
  error?: string;
  captcha_screenshot?: string; // base64 if captcha blocked
}

export interface AnalyzeResult {
  bid_id: string;
  summary: string;
  eligibility: AIEligibility;
  requirements: AIRequirement[];
  doc_checklist: AIDocChecklistItem[];
}

export interface GenerateDocResult {
  doc_id: string;
  doc_type: GemDocType;
  file_name: string;
  file_url: string;
}
