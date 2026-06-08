"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  IndianRupee,
  Building2,
  Calendar,
  FileText,
  Download,
  Eye,
  FilePlus,
  Star,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Shield,
  Truck,
  Receipt,
  ClipboardList,
  Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GemBid, GemBidDocument, GemBidStatus, AIRequirement, AIDocChecklistItem } from "@/types/gem";

const STATUS_OPTIONS: { value: GemBidStatus; label: string; color: string }[] = [
  { value: "new", label: "New", color: "bg-blue-500" },
  { value: "analyzed", label: "Analyzed", color: "bg-purple-500" },
  { value: "interested", label: "Interested", color: "bg-emerald-500" },
  { value: "applied", label: "Applied", color: "bg-sky-500" },
  { value: "won", label: "Won", color: "bg-green-500" },
  { value: "lost", label: "Lost", color: "bg-red-500" },
  { value: "expired", label: "Expired", color: "bg-gray-500" },
];

const CATEGORY_ICONS: Record<string, any> = {
  Technical: ClipboardList,
  Financial: IndianRupee,
  Documentation: FileText,
  Delivery: Truck,
  Penalty: AlertTriangle,
  Compliance: Shield,
};

const GEN_DOC_TYPES = [
  { type: "cover_letter", label: "Cover Letter", icon: FileText },
  { type: "compliance_matrix", label: "Compliance Matrix", icon: ClipboardList },
  { type: "experience_cert", label: "Work Experience Certificate", icon: Briefcase },
  { type: "undertaking", label: "Self-Declaration / Undertaking", icon: Shield },
] as const;

export default function BidDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [bid, setBid] = useState<GemBid | null>(null);
  const [documents, setDocuments] = useState<GemBidDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["summary", "eligibility"]));
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [selectedPOs, setSelectedPOs] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchBid();
  }, [params.id]);

  const fetchBid = async () => {
    const supabase = createClient();

    const { data: bidData, error } = await supabase
      .from("gem_bids")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error || !bidData) {
      router.push("/bids");
      return;
    }

    setBid(bidData);

    // Fetch documents
    const { data: docs } = await supabase
      .from("gem_bid_documents")
      .select("*")
      .eq("gem_bid_id", params.id)
      .order("created_at", { ascending: false });

    setDocuments(docs || []);
    setLoading(false);
  };

  const handleAnalyze = async () => {
    if (!bid) return;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/gem-scraper/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bid_id: bid.id }),
      });
      if (res.ok) {
        await fetchBid();
      }
    } catch (err) {
      console.error(err);
    }
    setAnalyzing(false);
  };

  const handleGenerateDoc = async (docType: string) => {
    if (!bid) return;
    setGeneratingDoc(docType);
    try {
      const res = await fetch("/api/gem-scraper/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bid_id: bid.id,
          doc_type: docType,
          po_ids: Array.from(selectedPOs),
        }),
      });
      if (res.ok) {
        await fetchBid();
      }
    } catch (err) {
      console.error(err);
    }
    setGeneratingDoc(null);
  };

  const handleStatusChange = async (newStatus: GemBidStatus) => {
    if (!bid) return;
    const supabase = createClient();
    await supabase
      .from("gem_bids")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", bid.id);
    setBid({ ...bid, status: newStatus });
  };

  const fetchPurchaseOrders = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();
    if (!userData?.business_id) return;

    const { data: pos } = await supabase
      .from("purchase_invoices")
      .select("id, bill_number, bill_date, total, supplier_name, status")
      .eq("business_id", userData.business_id)
      .eq("status", "paid")
      .order("total", { ascending: false })
      .limit(20);

    setPurchaseOrders(pos || []);
    setPoModalOpen(true);
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!bid) return null;

  const eligibility = bid.ai_eligibility;
  const requirements = (bid.ai_requirements || []) as AIRequirement[];
  const docChecklist = (bid.ai_doc_checklist || []) as AIDocChecklistItem[];
  const tenderDocs = documents.filter((d) => !d.is_generated);
  const generatedDocs = documents.filter((d) => d.is_generated);

  // Group requirements by category
  const reqByCategory: Record<string, AIRequirement[]> = {};
  requirements.forEach((r) => {
    const cat = r.category || "Other";
    if (!reqByCategory[cat]) reqByCategory[cat] = [];
    reqByCategory[cat].push(r);
  });

  const getCountdown = (endDate: string | null) => {
    if (!endDate) return null;
    const diff = new Date(endDate).getTime() - Date.now();
    if (diff <= 0) return { text: "Expired", urgent: true, expired: true };
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days === 0) return { text: `${hours} hours left`, urgent: true, expired: false };
    if (days <= 3) return { text: `${days}d ${hours}h left`, urgent: true, expired: false };
    return { text: `${days} days left`, urgent: false, expired: false };
  };

  const countdown = getCountdown(bid.end_date);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/bids" className="p-2 rounded-xl hover:bg-muted transition-colors mt-1">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-mono text-primary font-bold">{bid.gem_bid_id}</span>
              {countdown && (
                <span
                  className={`text-xs font-medium flex items-center gap-1 px-2 py-0.5 rounded-full ${
                    countdown.expired
                      ? "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                      : countdown.urgent
                      ? "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  {countdown.text}
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground mt-1 leading-tight">
              {bid.title || "Untitled Bid"}
            </h1>
            {bid.department && (
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                <Building2 className="w-4 h-4" />
                {bid.department}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Selector */}
          <select
            value={bid.status}
            onChange={(e) => handleStatusChange(e.target.value as GemBidStatus)}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-border bg-card text-foreground"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <Button
            onClick={handleAnalyze}
            disabled={analyzing}
            variant="outline"
            size="sm"
            className="rounded-md"
          >
            {analyzing ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-1.5" />
            )}
            {analyzing ? "Analyzing..." : "AI Analyze"}
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Panel - 2/3 width */}
        <div className="lg:col-span-2 space-y-4">
          {/* AI Summary */}
          {bid.ai_summary && (
            <CollapsibleCard
              title="AI Summary"
              icon={<Sparkles className="w-4 h-4 text-purple-600" />}
              expanded={expandedSections.has("summary")}
              onToggle={() => toggleSection("summary")}
              gradient
            >
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {bid.ai_summary}
              </p>
            </CollapsibleCard>
          )}

          {/* Eligibility Assessment */}
          {eligibility && (
            <CollapsibleCard
              title="Eligibility Assessment"
              icon={
                eligibility.eligible ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                )
              }
              expanded={expandedSections.has("eligibility")}
              onToggle={() => toggleSection("eligibility")}
              badge={
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    eligibility.eligible
                      ? "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700"
                      : "bg-amber-100 dark:bg-amber-950/30 text-amber-700"
                  }`}
                >
                  {eligibility.eligible ? "Eligible" : "Review Needed"} •{" "}
                  {eligibility.confidence}% confidence
                </span>
              }
            >
              <div className="space-y-3">
                {eligibility.reasons.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-1.5">Assessment Reasons</p>
                    <ul className="space-y-1">
                      {eligibility.reasons.map((r, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {eligibility.missing_docs.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-600 mb-1.5">Missing Documents</p>
                    <ul className="space-y-1">
                      {eligibility.missing_docs.map((d, i) => (
                        <li key={i} className="text-xs text-red-600/80 flex items-start gap-2">
                          <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {eligibility.missing_criteria.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-600 mb-1.5">Missing Criteria</p>
                    <ul className="space-y-1">
                      {eligibility.missing_criteria.map((c, i) => (
                        <li key={i} className="text-xs text-amber-600/80 flex items-start gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CollapsibleCard>
          )}

          {/* Requirements Breakdown */}
          {Object.keys(reqByCategory).length > 0 && (
            <CollapsibleCard
              title="Requirements Breakdown"
              icon={<ClipboardList className="w-4 h-4 text-sky-600" />}
              expanded={expandedSections.has("requirements")}
              onToggle={() => toggleSection("requirements")}
              badge={
                <span className="text-[10px] text-muted-foreground">
                  {requirements.length} items
                </span>
              }
            >
              <div className="space-y-4">
                {Object.entries(reqByCategory).map(([category, reqs]) => {
                  const CatIcon = CATEGORY_ICONS[category] || ClipboardList;
                  return (
                    <div key={category}>
                      <p className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2">
                        <CatIcon className="w-3.5 h-3.5" />
                        {category}
                        <span className="text-muted-foreground font-normal">({reqs.length})</span>
                      </p>
                      <div className="space-y-1.5 pl-5">
                        {reqs.map((req, i) => (
                          <div key={i} className="text-xs">
                            <div className="flex items-start gap-2">
                              <span
                                className={`shrink-0 mt-1 w-1.5 h-1.5 rounded-full ${
                                  req.mandatory ? "bg-red-500" : "bg-muted-foreground/40"
                                }`}
                              />
                              <div>
                                <span className="font-medium text-foreground">
                                  {req.title}
                                  {req.mandatory && (
                                    <span className="text-red-500 ml-1 text-[10px]">*</span>
                                  )}
                                </span>
                                <p className="text-muted-foreground mt-0.5">{req.description}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleCard>
          )}

          {/* Document Checklist */}
          {docChecklist.length > 0 && (
            <CollapsibleCard
              title="Documents Required"
              icon={<FileText className="w-4 h-4 text-indigo-600" />}
              expanded={expandedSections.has("checklist")}
              onToggle={() => toggleSection("checklist")}
              badge={
                <span className="text-[10px] text-muted-foreground">
                  {docChecklist.filter((d) => d.doc_type === "mandatory").length} mandatory
                </span>
              }
            >
              <div className="space-y-2">
                {docChecklist.map((doc, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 text-xs p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div
                      className={`mt-0.5 shrink-0 w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold ${
                        doc.doc_type === "mandatory"
                          ? "bg-red-100 dark:bg-red-950/30 text-red-700"
                          : doc.doc_type === "optional"
                          ? "bg-muted text-muted-foreground"
                          : "bg-amber-100 dark:bg-amber-950/30 text-amber-700"
                      }`}
                    >
                      {doc.doc_type === "mandatory" ? "M" : doc.doc_type === "optional" ? "O" : "C"}
                    </div>
                    <div className="flex-1">
                      <span className="font-medium text-foreground">{doc.doc_name}</span>
                      <p className="text-muted-foreground mt-0.5">{doc.description}</p>
                      {doc.can_generate && (
                        <span className="text-primary text-[10px] font-medium">
                          ✦ Can be auto-generated
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleCard>
          )}

          {/* Tender Documents */}
          {tenderDocs.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-foreground" />
                Tender Documents ({tenderDocs.length})
              </h3>
              <div className="space-y-2">
                {tenderDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium text-foreground truncate">
                        {doc.file_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No analysis prompt */}
          {!bid.ai_summary && !analyzing && (
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 border border-purple-200 dark:border-purple-800/50 rounded-xl p-6 text-center">
              <Sparkles className="w-8 h-8 text-purple-600 mx-auto mb-3" />
              <h3 className="font-semibold text-foreground mb-1">AI Analysis Not Run Yet</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                Run AI analysis to get a comprehensive breakdown of eligibility, requirements, document checklist, and risk assessment.
              </p>
              <Button onClick={handleAnalyze} className="rounded-full px-6">
                <Sparkles className="w-4 h-4 mr-1.5" />
                Analyze This Tender
              </Button>
            </div>
          )}
        </div>

        {/* Right Panel - 1/3 width */}
        <div className="space-y-4">
          {/* Key Dates */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Key Dates
            </h3>
            <div className="space-y-2.5">
              {[
                { label: "Start Date", value: bid.start_date },
                { label: "Closing Date", value: bid.end_date },
              ].map((item) => (
                <div key={item.label} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium text-foreground">
                    {item.value
                      ? new Date(item.value).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Financial */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <IndianRupee className="w-4 h-4" />
              Financial
            </h3>
            <div className="space-y-2.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Estimated Value</span>
                <span className="font-bold text-foreground">
                  {bid.estimated_value
                    ? `₹${bid.estimated_value.toLocaleString("en-IN")}`
                    : "—"}
                </span>
              </div>
              {bid.quantity && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Quantity</span>
                  <span className="font-medium text-foreground">
                    {bid.quantity} {bid.uom || ""}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* AI Document Generator */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <FilePlus className="w-4 h-4 text-primary" />
              Generate Documents
            </h3>
            <div className="space-y-2">
              {GEN_DOC_TYPES.map(({ type, label, icon: Icon }) => {
                const existingDoc = generatedDocs.find((d) => d.doc_type === type);
                return (
                  <div key={type}>
                    <button
                      onClick={() => handleGenerateDoc(type)}
                      disabled={generatingDoc === type}
                      className="w-full flex items-center gap-2 p-2.5 rounded-lg text-left hover:bg-muted transition-colors text-xs disabled:opacity-50"
                    >
                      {generatingDoc === type ? (
                        <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                      ) : (
                        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="flex-1 font-medium text-foreground">{label}</span>
                      {existingDoc ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <FilePlus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      )}
                    </button>
                    {existingDoc && (
                      <div className="ml-6 mb-1 flex items-center gap-2">
                        <span className="text-[10px] text-emerald-600 font-medium">Generated</span>
                        <button className="text-[10px] text-primary underline">Download</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Attach PO */}
            <div className="mt-3 pt-3 border-t border-border">
              <button
                onClick={fetchPurchaseOrders}
                className="w-full flex items-center gap-2 p-2.5 rounded-lg text-left hover:bg-muted transition-colors text-xs"
              >
                <Receipt className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1 font-medium text-foreground">
                  Attach PO (Work Experience)
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </button>
              {selectedPOs.size > 0 && (
                <p className="text-[10px] text-emerald-600 ml-6 font-medium">
                  {selectedPOs.size} PO(s) selected
                </p>
              )}
            </div>
          </div>

          {/* Generated Documents List */}
          {generatedDocs.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Generated Documents ({generatedDocs.length})
              </h3>
              <div className="space-y-1.5">
                {generatedDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 text-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="flex-1 font-medium text-foreground truncate">
                      {doc.file_name}
                    </span>
                    <button className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-700">
                      <Download className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status Actions */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground mb-2">Quick Actions</h3>
            <Button
              onClick={() => handleStatusChange("interested")}
              disabled={bid.status === "interested"}
              variant={bid.status === "interested" ? "default" : "outline"}
              size="sm"
              className="w-full rounded-md"
            >
              <Star className="w-4 h-4 mr-1.5" />
              {bid.status === "interested" ? "Marked Interested" : "Mark Interested"}
            </Button>
            <Button
              onClick={() => handleStatusChange("applied")}
              disabled={bid.status === "applied"}
              variant={bid.status === "applied" ? "default" : "outline"}
              size="sm"
              className="w-full rounded-md"
            >
              <ArrowUpRight className="w-4 h-4 mr-1.5" />
              {bid.status === "applied" ? "Marked Applied" : "Mark Applied"}
            </Button>
          </div>
        </div>
      </div>

      {/* PO Selection Modal */}
      {poModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="text-sm font-bold text-foreground">
                Select Purchase Orders (Work Experience Proof)
              </h3>
              <button
                onClick={() => setPoModalOpen(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto p-4 space-y-1.5">
              {purchaseOrders.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  No completed purchase orders found.
                </p>
              ) : (
                purchaseOrders.map((po) => (
                  <label
                    key={po.id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                      selectedPOs.has(po.id)
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted border border-transparent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPOs.has(po.id)}
                      onChange={() => {
                        setSelectedPOs((prev) => {
                          const next = new Set(prev);
                          if (next.has(po.id)) next.delete(po.id);
                          else next.add(po.id);
                          return next;
                        });
                      }}
                      className="rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">
                        {po.bill_number}
                        <span className="text-muted-foreground ml-2">{po.supplier_name}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(po.bill_date).toLocaleDateString("en-IN")} •{" "}
                        ₹{po.total?.toLocaleString("en-IN")}
                      </p>
                    </div>
                  </label>
                ))
              )}
            </div>
            <div className="border-t border-border p-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {selectedPOs.size} selected
              </span>
              <Button
                onClick={() => setPoModalOpen(false)}
                size="sm"
                className="rounded-md"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Collapsible Card Component
function CollapsibleCard({
  title,
  icon,
  badge,
  expanded,
  onToggle,
  children,
  gradient,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  gradient?: boolean;
}) {
  return (
    <div
      className={`border border-border rounded-xl overflow-hidden ${
        gradient
          ? "bg-gradient-to-br from-purple-50/50 to-blue-50/50 dark:from-purple-950/10 dark:to-blue-950/10"
          : "bg-card"
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-4 text-left hover:bg-muted/30 transition-colors"
      >
        {icon}
        <span className="text-sm font-semibold text-foreground flex-1">{title}</span>
        {badge}
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
