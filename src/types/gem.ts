// GeM Bid Finder — Type Definitions

// ── Status ────────────────────────────────────────────────────────────────────
export type GemBidStatus =
  | "new"
  | "shortlisted"
  | "analyzing"
  | "analyzed"
  | "interested"
  | "applied"
  | "won"
  | "lost"
  | "expired";

// ── Bid ───────────────────────────────────────────────────────────────────────
export interface GemBid {
  id: string;
  business_id: string;
  gem_bid_id: string;
  title: string;
  category: string | null;
  quantity: string | null;
  uom: string | null;
  department: string | null;
  organization: string | null;
  start_date: string | null;
  end_date: string | null;
  estimated_value: number | null;
  bid_type: string | null;
  status: GemBidStatus;
  ai_summary: string | null;
  ai_eligibility: AIEligibility | null;
  ai_requirements: AIRequirement[] | null;
  ai_doc_checklist: AIDocChecklistItem[] | null;
  ai_match_score: number | null;
  ai_match_reason: string | null;
  ai_risk_assessment: string | null;
  ai_evaluation_method: string | null;
  ai_emd_amount: number | null;
  ai_delivery_date: string | null;
  ai_price_suggestion: Record<string, any> | null;
  raw_html: string | null;
  raw_full_text: string | null;
  bid_url: string | null;
  scraped_at: string;
  created_at: string;
  updated_at: string;
}

// ── AI Sub-types ──────────────────────────────────────────────────────────────
export interface AIEligibility {
  eligible: boolean;
  confidence: number;
  reasons: string[];
  missing_docs: string[];
  missing_criteria: string[];
}

export interface AIRequirement {
  category: string;
  title: string;
  description: string;
  mandatory: boolean;
  met: boolean | null;
}

export interface AIDocChecklistItem {
  doc_name: string;
  doc_type: "mandatory" | "optional" | "conditional";
  description: string;
  can_generate: boolean;
  generated: boolean;
  notes: string | null;
}

// ── Document ──────────────────────────────────────────────────────────────────
export interface GemBidDocument {
  id: string;
  gem_bid_id: string;
  doc_type: GemDocType;
  category: "specification" | "boq" | "other" | null;
  file_name: string;
  file_url: string;
  ai_analysis: string | null;
  is_generated: boolean;
  created_at: string;
}

export type GemDocType =
  | "tender_document"
  | "atc"
  | "bot"
  | "corrigendum"
  | "cover_letter"
  | "compliance_matrix"
  | "experience_cert"
  | "undertaking"
  | "other";

// ── Scan Log ──────────────────────────────────────────────────────────────────
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

// ── Config (credentials removed) ─────────────────────────────────────────────
export interface GemConfig {
  categories: string[];
  keywords: string[];
  scan_frequency: "manual" | "30min" | "1hr" | "6hr" | "daily";
  notifications_enabled: boolean;
}

// ── Business Capability Profile ───────────────────────────────────────────────
export interface GemBusinessProfile {
  id: string;
  business_id: string;
  msme_category: "micro" | "small" | "medium" | "none" | null;
  udyam_number: string | null;
  turnover_fy1: number | null;
  turnover_fy2: number | null;
  turnover_fy3: number | null;
  turnover_fy_labels: string[] | null;
  years_in_business: number | null;
  gem_seller_registered: boolean;
  gem_seller_id: string | null;
  certifications: string[] | null;
  supply_states: string[] | null;
  ai_capability_summary: string | null;
  ai_recommended_categories: AIRecommendedCategory[] | null;
  ai_typical_bid_min: number | null;
  ai_typical_bid_max: number | null;
  ai_eligibility_gaps: string[] | null;
  ai_product_categories: string[] | null;
  setup_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface AIRecommendedCategory {
  category: string;
  confidence: number;
  reasoning: string;
}

// ── Bid Participation ─────────────────────────────────────────────────────────
export type GemParticipationStatus =
  | "draft"
  | "preparing"
  | "awaiting_consent"
  | "approved"
  | "in_session"
  | "awaiting_final_submit"
  | "submitted"
  | "failed"
  | "cancelled";

export interface GemParticipationSession {
  id: string;
  business_id: string;
  bid_id: string;
  status: GemParticipationStatus;
  created_by: string;
  consent_given_at: string | null;
  consent_given_by: string | null;
  final_submit_confirmed_at: string | null;
  submission_ref: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface GemParticipationField {
  id: string;
  session_id: string;
  field_key: string;
  field_label: string;
  input_type: "text" | "number" | "textarea" | "boolean";
  ai_suggested_value: string | null;
  ai_source: string | null;
  ai_reasoning: string | null;
  user_value: string | null;
  status: "suggested" | "approved" | "edited" | "rejected";
  reviewed_at: string | null;
  created_at: string;
}

export interface GemParticipationDocument {
  id: string;
  session_id: string;
  source_doc_id: string | null;
  file_name: string;
  purpose: string | null;
  sha256: string | null;
  status: "proposed" | "approved" | "rejected" | "uploaded";
  reviewed_at: string | null;
  created_at: string;
}

export interface GemAuditLog {
  id: string;
  actor: "ai" | "user" | "system";
  actor_user_id: string | null;
  action: string;
  payload: Record<string, unknown> | null;
  payload_hash: string;
  prev_hash: string | null;
  created_at: string;
}

export interface GemCredsStatus {
  encryptionAvailable: boolean;
  hasGem: boolean;
  gemUserId?: string | null;
  hasGmail: boolean;
  gmailEmail?: string | null;
  deviceLabel?: string;
  error?: string;
}

export interface GemParticipationEvent {
  sessionId: string;
  type: string;
  payload: Record<string, unknown>;
  ts: string;
}

// ── API response shapes ───────────────────────────────────────────────────────
export interface ScanResult {
  scan_id: string;
  status: "completed" | "failed" | "captcha_blocked";
  bids_found: number;
  bids_new: number;
  duration_ms: number;
  error?: string;
  captcha_screenshot?: string;
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

export interface ShortlistResult {
  shortlisted: number;
  scored: number;
}
