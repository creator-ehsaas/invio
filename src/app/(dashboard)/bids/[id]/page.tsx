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
import { toast } from "sonner";
import type { GemBid, GemBidDocument, GemBidStatus, AIRequirement, AIDocChecklistItem } from "@/types/gem";
import { isElectron, gemFetchDoc, openExternal } from "@/lib/electron";

const STATUS_OPTIONS: { value: GemBidStatus; label: string; color: string }[] = [
  { value: "new", label: "New", color: "bg-blue-500" },
  { value: "shortlisted", label: "Shortlisted", color: "bg-violet-500" },
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
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["summary", "eligibility", "spec"]));
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [selectedPOs, setSelectedPOs] = useState<Set<string>>(new Set());
  const [priceSuggestion, setPriceSuggestion] = useState<any | null>(null);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [docFormModalOpen, setDocFormModalOpen] = useState(false);
  const [docFormFields, setDocFormFields] = useState<{ field: string; label: string; type: string }[]>([]);
  const [docFormValues, setDocFormValues] = useState<Record<string, string>>({});
  const [pendingDocType, setPendingDocType] = useState<string | null>(null);

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
    // Show the stored price suggestion — it only changes when regenerated
    if (bidData.ai_price_suggestion) setPriceSuggestion(bidData.ai_price_suggestion);

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
        toast.success("AI analysis complete.");
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "AI analysis failed. Try again.");
      }
    } catch (err: any) {
      toast.error(err.message || "AI analysis failed.");
    }
    setAnalyzing(false);
  };

  // Resolve a document to a downloadable URL — storage-hosted files live in a
  // private bucket, so the download API issues a short-lived signed URL.
  const handleOpenDocument = async (doc: GemBidDocument) => {
    if (doc.file_url.startsWith("http")) {
      openExternal(doc.file_url);
      return;
    }
    try {
      const res = await fetch(`/api/gem-scraper/download?doc_id=${doc.id}`);
      const data = await res.json();
      if (!res.ok || !data.url) {
        toast.error(data.error || "Could not download document");
        return;
      }
      openExternal(data.url);
    } catch (err: any) {
      toast.error(err.message || "Could not download document");
    }
  };

  const handleFetchDetails = async () => {
    if (!bid) return;
    if (!isElectron()) {
      toast.error("Fetching bid documents requires the Invio desktop app.");
      return;
    }
    setFetchingDetails(true);
    try {
      const result = await gemFetchDoc({ bidUrl: bid.bid_url ?? `https://bidplus.gem.gov.in/showbidDocument/${bid.gem_bid_id}` });
      if (!result || result.error) {
        toast.error(result?.error || "Failed to fetch bid document");
        setFetchingDetails(false);
        return;
      }

      await fetch("/api/gem-scraper/save-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bid_id: bid.id,
          text: result.text,
          doc_links: result.docLinks,
          pdfText: result.pdfText,
          financials: result.financials,
          specDocs: result.specDocs,
        }),
      });

      await fetchBid();
      const docCount = result.specDocs?.length || 0;
      toast.success(
        docCount > 0
          ? `Fetched bid + ${docCount} linked document(s) (${result.crawl?.discovered || docCount} discovered). Running AI analysis...`
          : "Bid document fetched. Running AI analysis..."
      );

      // Auto-trigger analyze with the fresh content
      setAnalyzing(true);
      const analyzeRes = await fetch("/api/gem-scraper/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bid_id: bid.id }),
      });
      if (analyzeRes.ok) {
        await fetchBid();
        toast.success("AI analysis complete.");
      } else {
        const data = await analyzeRes.json().catch(() => null);
        toast.error(data?.error || "AI analysis failed. Try again.");
      }
      setAnalyzing(false);
    } catch (err: any) {
      toast.error(err.message);
    }
    setFetchingDetails(false);
  };

  const handleGenerateDoc = async (docType: string, formData?: Record<string, string>) => {
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
          form_data: formData || {},
        }),
      });
      const data = await res.json();

      // Handle dynamic form requirement
      if (data.requires_input && data.missing_fields) {
        setDocFormFields(data.missing_fields);
        setDocFormValues({});
        setPendingDocType(docType);
        setDocFormModalOpen(true);
        setGeneratingDoc(null);
        return;
      }

      if (res.ok) {
        const label = GEN_DOC_TYPES.find(d => d.type === docType)?.label || "Document";
        if (data.warning) toast.warning(data.warning);
        else toast.success(`${label} generated!`);
        // Trigger download immediately if we have content
        if (data.content && data.file_name) {
          const blob = new Blob([data.content], { type: "application/msword" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = data.file_name;
          a.click();
          URL.revokeObjectURL(url);
        }
        await fetchBid();
      } else {
        toast.error(data.error || "Document generation failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Document generation failed");
    }
    setGeneratingDoc(null);
  };

  const handleDocFormSubmit = async () => {
    if (!pendingDocType) return;
    setDocFormModalOpen(false);
    await handleGenerateDoc(pendingDocType, docFormValues);
    setPendingDocType(null);
    setDocFormFields([]);
    setDocFormValues({});
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

    // Sales invoices = work done for clients = valid work experience proof
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, total, customer_name, status")
      .eq("business_id", userData.business_id)
      .in("status", ["paid", "sent"])
      .order("total", { ascending: false })
      .limit(20);

    setPurchaseOrders(invoices || []);
    setPoModalOpen(true);
  };

  // User-verified market rate: recompute subtotal, cost total and the
  // recommended price locally when a component rate is edited
  const updateBreakdownRate = (idx: number, rate: number) => {
    setPriceSuggestion((prev: any) => {
      if (!prev?.cost_breakdown?.length) return prev;
      const breakdown = prev.cost_breakdown.map((row: any, i: number) =>
        i === idx
          ? { ...row, indicative_unit_rate: rate, subtotal: Math.round((row.qty || 1) * rate) }
          : row
      );
      const overheadTotal = (prev.overheads || []).reduce((s: number, o: any) => s + (o.amount || 0), 0);
      const costTotal = breakdown.reduce((s: number, r: any) => s + (r.subtotal || 0), 0) + overheadTotal;
      const margin = prev.margin_percent ?? 15;
      const recommended = Math.round(costTotal * (1 + margin / 100));
      return {
        ...prev,
        cost_breakdown: breakdown,
        estimated_cost_total: costTotal,
        recommended_price: recommended,
        price_range: { aggressive: Math.round(recommended * 0.93), comfortable: Math.round(recommended * 1.07) },
        user_adjusted: true,
      };
    });
  };

  const handleSuggestPrice = async () => {
    if (!bid) return;
    setFetchingPrice(true);
    setPriceSuggestion(null);
    try {
      const res = await fetch("/api/gem-scraper/suggest-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bid_id: bid.id }),
      });
      const data = await res.json();
      if (res.ok) setPriceSuggestion(data);
      else toast.error(data.error || "Failed to get price suggestion");
    } catch (err: any) {
      toast.error(err.message);
    }
    setFetchingPrice(false);
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

          {bid.bid_url && (
            <Button
              onClick={() => openExternal(bid.bid_url!)}
              variant="outline"
              size="sm"
              className="rounded-md"
            >
              <ArrowUpRight className="w-4 h-4 mr-1.5" />
              View on GeM
            </Button>
          )}
          <Button
            onClick={handleFetchDetails}
            disabled={fetchingDetails || analyzing}
            variant="outline"
            size="sm"
            className="rounded-md"
          >
            {fetchingDetails || analyzing ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Eye className="w-4 h-4 mr-1.5" />
            )}
            {fetchingDetails ? "Fetching..." : analyzing ? "Analyzing..." : bid.raw_full_text ? "Refresh & Analyze" : "Fetch & Analyze"}
          </Button>
          {bid.ai_summary && (
            <span className="text-[11px] text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Analyzed
            </span>
          )}
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
          {/* Bid Overview — always shown */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-primary" />
              Bid Overview
            </h3>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
              {[
                { label: "Bid Number", value: bid.gem_bid_id },
                { label: "Category", value: bid.category },
                { label: "Organization", value: bid.organization },
                { label: "Department", value: bid.department },
                { label: "Bid Type", value: bid.bid_type },
                { label: "Quantity", value: bid.quantity ? `${bid.quantity} ${bid.uom || ""}`.trim() : null },
                { label: "Estimated Value", value: bid.estimated_value ? `₹${bid.estimated_value.toLocaleString("en-IN")}` : null },
                { label: "EMD Amount", value: bid.ai_emd_amount ? `₹${bid.ai_emd_amount.toLocaleString("en-IN")}` : null },
                { label: "Delivery By", value: bid.ai_delivery_date || null },
                { label: "Evaluation Method", value: bid.ai_evaluation_method || null },
                { label: "Start Date", value: bid.start_date ? new Date(bid.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null },
                { label: "Closing Date", value: bid.end_date ? new Date(bid.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null },
              ].filter(item => item.value).map((item) => (
                <div key={item.label} className="flex flex-col">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{item.label}</span>
                  <span className="text-xs font-medium text-foreground mt-0.5">{item.value}</span>
                </div>
              ))}
            </div>
            {(bid.ai_match_score != null || bid.ai_match_reason) && (
              <div className="mt-3 pt-3 border-t border-border flex items-start gap-3">
                {bid.ai_match_score != null && (
                  <div className="shrink-0 flex flex-col items-center bg-primary/10 rounded-lg px-3 py-1.5">
                    <span className="text-lg font-bold text-primary">{bid.ai_match_score}</span>
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Match</span>
                  </div>
                )}
                {bid.ai_match_reason && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{bid.ai_match_reason}</p>
                )}
              </div>
            )}
            {!bid.raw_full_text && (
              <div className="mt-1 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Click <span className="font-medium text-foreground">"Fetch &amp; Analyze"</span> to download the full tender document and run AI analysis.
                </p>
              </div>
            )}
          </div>

          {/* AI Summary */}
          {bid.ai_summary && (
            <CollapsibleCard
              title="Tender Analysis"
              icon={<Sparkles className="w-4 h-4 text-purple-600" />}
              expanded={expandedSections.has("summary")}
              onToggle={() => toggleSection("summary")}
              gradient
            >
              <SummaryDisplay content={bid.ai_summary} />
            </CollapsibleCard>
          )}

          {/* Bid Specification */}
          {bid.raw_full_text && (
            <CollapsibleCard
              title="Bid Specification"
              icon={<FileText className="w-4 h-4 text-sky-600" />}
              expanded={expandedSections.has("spec")}
              onToggle={() => toggleSection("spec")}
              badge={<span className="text-[10px] text-muted-foreground">From tender document</span>}
            >
              <SpecDisplay content={bid.raw_full_text} />
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
                      {doc.category === "specification" && (
                        <span className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400">
                          Spec
                        </span>
                      )}
                      {doc.category === "boq" && (
                        <span className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400">
                          BOQ
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleOpenDocument(doc)}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-xs"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      Open
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No spec + no analysis prompt */}
          {!bid.raw_full_text && !bid.ai_summary && !analyzing && !fetchingDetails && (
            <div className="bg-gradient-to-br from-sky-50 to-purple-50 dark:from-sky-950/20 dark:to-purple-950/20 border border-sky-200 dark:border-sky-800/50 rounded-xl p-6 text-center">
              <Eye className="w-8 h-8 text-sky-600 mx-auto mb-3" />
              <h3 className="font-semibold text-foreground mb-1">Full Specifications Not Loaded</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                Click "Fetch &amp; Analyze" to download the complete tender document including all technical specifications, EMD, eligibility criteria, and AI analysis.
              </p>
              {isElectron() ? (
                <Button onClick={handleFetchDetails} className="rounded-full px-6">
                  <Eye className="w-4 h-4 mr-1.5" />
                  Fetch &amp; Analyze Tender
                </Button>
              ) : (
                <p className="text-xs text-amber-600 font-medium">Requires the Invio desktop app</p>
              )}
            </div>
          )}
          {bid.raw_full_text && !bid.ai_summary && !analyzing && (
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 border border-purple-200 dark:border-purple-800/50 rounded-xl p-6 text-center">
              <Sparkles className="w-8 h-8 text-purple-600 mx-auto mb-3" />
              <h3 className="font-semibold text-foreground mb-1">Spec Loaded — Run AI Analysis</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                Tender document fetched. Run AI analysis to get eligibility, requirements, document checklist, and risk assessment.
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
              {bid.ai_delivery_date && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Delivery By</span>
                  <span className="font-medium text-amber-600">{bid.ai_delivery_date}</span>
                </div>
              )}
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
              {bid.ai_emd_amount && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">EMD Amount</span>
                  <span className="font-medium text-foreground">
                    ₹{bid.ai_emd_amount.toLocaleString("en-IN")}
                  </span>
                </div>
              )}
              {bid.quantity && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Quantity</span>
                  <span className="font-medium text-foreground">
                    {bid.quantity} {bid.uom || ""}
                  </span>
                </div>
              )}
            </div>
            <Button
              onClick={handleSuggestPrice}
              disabled={fetchingPrice}
              size="sm"
              className="w-full mt-3 rounded-lg text-xs"
            >
              {fetchingPrice ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              )}
              {fetchingPrice ? "Calculating..." : "Suggest Winning Bid Price"}
            </Button>
          </div>

          {/* Price Suggestion */}
          {priceSuggestion && (
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <IndianRupee className="w-4 h-4 text-emerald-600" />
                  Recommended Bid Price
                </h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  priceSuggestion.strategy?.includes("Aggressive")
                    ? "bg-amber-100 dark:bg-amber-950/30 text-amber-700"
                    : "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700"
                }`}>
                  {priceSuggestion.strategy || "Balanced"}
                </span>
              </div>

              <div className="text-center py-2">
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {priceSuggestion.recommended_price != null
                    ? `₹${priceSuggestion.recommended_price.toLocaleString("en-IN")}`
                    : "Not enough data"}
                </p>
                {priceSuggestion.confidence && (
                  <p className={`text-[10px] font-medium uppercase tracking-wide mt-0.5 ${
                    priceSuggestion.confidence === "high" ? "text-emerald-600" :
                    priceSuggestion.confidence === "medium" ? "text-amber-600" : "text-red-500"
                  }`}>
                    {priceSuggestion.confidence} confidence
                    {priceSuggestion.user_adjusted ? " · rates adjusted by you" : ""}
                  </p>
                )}
                {priceSuggestion.pricing_basis && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {priceSuggestion.pricing_basis === "buyer_estimate" ? "Based on the buyer's disclosed estimate"
                      : priceSuggestion.pricing_basis === "extracted_rates" ? "Based on rates stated in the tender documents"
                      : priceSuggestion.pricing_basis === "component_estimate" ? "Built up from component-wise market estimates"
                      : ""}
                  </p>
                )}
                {priceSuggestion.unit_price && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ≈ ₹{priceSuggestion.unit_price.toLocaleString("en-IN")} {priceSuggestion.unit_price_label}
                  </p>
                )}
                {priceSuggestion.discount_from_estimate != null && (
                  <p className="text-xs text-emerald-600 font-medium mt-1">
                    {priceSuggestion.discount_from_estimate}% below buyer's estimate
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white/60 dark:bg-white/5 rounded-lg p-2 text-center">
                  <p className="text-muted-foreground text-[10px] mb-0.5">Aggressive Low</p>
                  <p className="font-semibold text-foreground">
                    ₹{priceSuggestion.price_range?.aggressive?.toLocaleString("en-IN") ?? "—"}
                  </p>
                </div>
                <div className="bg-white/60 dark:bg-white/5 rounded-lg p-2 text-center">
                  <p className="text-muted-foreground text-[10px] mb-0.5">Comfortable High</p>
                  <p className="font-semibold text-foreground">
                    ₹{priceSuggestion.price_range?.comfortable?.toLocaleString("en-IN") ?? "—"}
                  </p>
                </div>
              </div>

              {/* Component-wise cost build-up (used when buyer hides the estimate) */}
              {priceSuggestion.cost_breakdown?.length > 0 && (
                <div className="space-y-2 border-t border-emerald-200/50 dark:border-emerald-800/30 pt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground">Cost Build-up</p>
                    {priceSuggestion.seller_approach && (
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-white/60 dark:bg-white/10 text-muted-foreground">
                        {String(priceSuggestion.seller_approach).replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-amber-600 flex items-start gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                    Indicative market rates — edit any rate to recalculate the price. Verify with suppliers before bidding.
                  </p>
                  <div className="space-y-1">
                    {priceSuggestion.cost_breakdown.map((row: any, idx: number) => (
                      <div key={idx} className="bg-white/60 dark:bg-white/5 rounded-lg p-2 text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground truncate" title={row.spec || ""}>{row.component}</span>
                          <span className="font-semibold text-foreground shrink-0">₹{(row.subtotal ?? 0).toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-muted-foreground">
                          <span className="shrink-0">{row.qty} {row.unit} ×</span>
                          <input
                            type="number"
                            value={row.indicative_unit_rate ?? 0}
                            onChange={(e) => updateBreakdownRate(idx, Number(e.target.value) || 0)}
                            className="w-20 px-1.5 py-0.5 text-[11px] rounded border border-border bg-background text-foreground"
                          />
                          {row.rate_basis && <span className="truncate text-[9px] italic" title={row.rate_basis}>{row.rate_basis}</span>}
                        </div>
                      </div>
                    ))}
                    {(priceSuggestion.overheads || []).map((o: any, idx: number) => (
                      <div key={`oh-${idx}`} className="flex items-center justify-between text-[11px] px-2 py-1 text-muted-foreground">
                        <span>{o.label}</span>
                        <span className="font-medium text-foreground">₹{(o.amount ?? 0).toLocaleString("en-IN")}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-[11px] px-2 py-1 border-t border-emerald-200/50 dark:border-emerald-800/30">
                      <span className="font-semibold text-foreground">
                        Cost total {priceSuggestion.margin_percent != null ? `+ ${priceSuggestion.margin_percent}% margin` : ""}
                      </span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">
                        ₹{(priceSuggestion.estimated_cost_total ?? 0).toLocaleString("en-IN")} → ₹{(priceSuggestion.recommended_price ?? 0).toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>
                  {priceSuggestion.verification_notes?.length > 0 && (
                    <div className="space-y-0.5">
                      {priceSuggestion.verification_notes.map((n: string, i: number) => (
                        <p key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                          <span className="shrink-0">☐</span> {n}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {priceSuggestion.profit_margin_estimate && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Est. Profit Margin</span>
                  <span className="font-medium text-emerald-600">{priceSuggestion.profit_margin_estimate}</span>
                </div>
              )}

              {priceSuggestion.reasoning && (
                <p className="text-xs text-muted-foreground leading-relaxed border-t border-emerald-200/50 dark:border-emerald-800/30 pt-2">
                  {priceSuggestion.reasoning}
                </p>
              )}

              {priceSuggestion.market_context && (
                <p className="text-xs text-muted-foreground/80 italic">
                  {priceSuggestion.market_context}
                </p>
              )}

              {priceSuggestion.cautions?.length > 0 && (
                <div className="space-y-1">
                  {priceSuggestion.cautions.map((c: string, i: number) => (
                    <p key={i} className="text-xs text-amber-600 flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                      {c}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Risk Assessment */}
          {bid.ai_risk_assessment && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Risk Assessment
              </h3>
              <p className={`text-xs font-medium ${
                bid.ai_risk_assessment.startsWith("Low") ? "text-emerald-600" :
                bid.ai_risk_assessment.startsWith("Medium") ? "text-amber-600" : "text-red-600"
              }`}>
                {bid.ai_risk_assessment}
              </p>
            </div>
          )}

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
                        <button
                          onClick={() => handleOpenDocument(existingDoc)}
                          className="text-[10px] text-primary underline"
                        >
                          Download
                        </button>
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
                  Attach Sales Invoices (Work Experience)
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </button>
              {selectedPOs.size > 0 && (
                <p className="text-[10px] text-emerald-600 ml-6 font-medium">
                  {selectedPOs.size} invoice(s) selected
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
                    <button
                      onClick={() => handleOpenDocument(doc)}
                      className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-700 flex items-center"
                    >
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
              onClick={() => router.push(`/bids/${bid.id}/participate`)}
              size="sm"
              className="w-full rounded-md bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
            >
              <Sparkles className="w-4 h-4 mr-1.5" />
              Participate in this Bid
            </Button>
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
                Select Sales Invoices (Work Experience Proof)
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
                  No paid or sent sales invoices found. Create sales invoices from the Invoices section to use as work experience proof.
                </p>
              ) : (
                purchaseOrders.map((inv) => (
                  <label
                    key={inv.id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                      selectedPOs.has(inv.id)
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted border border-transparent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPOs.has(inv.id)}
                      onChange={() => {
                        setSelectedPOs((prev) => {
                          const next = new Set(prev);
                          if (next.has(inv.id)) next.delete(inv.id);
                          else next.add(inv.id);
                          return next;
                        });
                      }}
                      className="rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">
                        {inv.invoice_number}
                        {inv.customer_name && (
                          <span className="text-muted-foreground ml-2 font-normal">{inv.customer_name}</span>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(inv.invoice_date).toLocaleDateString("en-IN")} • ₹{inv.total?.toLocaleString("en-IN")}
                      </p>
                    </div>
                  </label>
                ))
              )}
            </div>
            <div className="border-t border-border p-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {selectedPOs.size} invoice{selectedPOs.size !== 1 ? "s" : ""} selected
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

      {/* Dynamic Form Modal for Missing Document Info */}
      {docFormModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Additional Information Required
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Please provide the following details to generate the document
                </p>
              </div>
              <button
                onClick={() => {
                  setDocFormModalOpen(false);
                  setPendingDocType(null);
                }}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {docFormFields.map((field) => (
                <div key={field.field} className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    {field.label} <span className="text-red-500">*</span>
                  </label>
                  {field.type === "textarea" ? (
                    <textarea
                      value={docFormValues[field.field] || ""}
                      onChange={(e) =>
                        setDocFormValues((prev) => ({
                          ...prev,
                          [field.field]: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                      rows={3}
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                    />
                  ) : (
                    <input
                      type="text"
                      value={docFormValues[field.field] || ""}
                      onChange={(e) =>
                        setDocFormValues((prev) => ({
                          ...prev,
                          [field.field]: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="border-t border-border p-4 flex items-center justify-end gap-2">
              <Button
                onClick={() => {
                  setDocFormModalOpen(false);
                  setPendingDocType(null);
                }}
                variant="outline"
                size="sm"
                className="rounded-md"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDocFormSubmit}
                size="sm"
                className="rounded-md"
                disabled={docFormFields.some((f) => !docFormValues[f.field]?.trim())}
              >
                Generate Document
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Renders extracted spec text — detects [Section] headers and Key: Value pairs
function SpecDisplay({ content }: { content: string }) {
  const lines = content.split("\n").filter(Boolean);
  return (
    <div className="max-h-[500px] overflow-y-auto space-y-0.5">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        // Section header like [Generic Parameters]
        if (/^\[.+\]$/.test(trimmed)) {
          return (
            <p key={i} className="text-[11px] font-bold text-foreground mt-3 mb-1 first:mt-0">
              {trimmed.slice(1, -1)}
            </p>
          );
        }
        // Key: value pair
        const colonIdx = trimmed.indexOf(": ");
        if (colonIdx > 0 && colonIdx < 60 && !trimmed.startsWith("http")) {
          const key = trimmed.slice(0, colonIdx);
          const val = trimmed.slice(colonIdx + 2);
          return (
            <div key={i} className="flex gap-2 text-[11px] py-0.5 border-b border-border/30">
              <span className="text-muted-foreground shrink-0 w-44 truncate">{key}</span>
              <span className="font-medium text-foreground flex-1">{val}</span>
            </div>
          );
        }
        // Pipe-separated multi-column
        if (trimmed.includes(" | ")) {
          const cols = trimmed.split(" | ");
          return (
            <div key={i} className="flex gap-3 text-[11px] py-0.5 border-b border-border/30 flex-wrap">
              {cols.map((c, ci) => (
                <span key={ci} className={ci === 0 ? "font-medium text-foreground" : "text-muted-foreground"}>{c}</span>
              ))}
            </div>
          );
        }
        // Plain text
        return (
          <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">{trimmed}</p>
        );
      })}
    </div>
  );
}

const SECTION_LABELS: Record<string, string> = {
  overview: "Overview",
  items_and_specs: "Items & Specifications",
  financial_details: "Financial Details",
  delivery_and_logistics: "Delivery & Logistics",
  eligibility_criteria: "Eligibility Criteria",
  terms_and_conditions: "Terms & Conditions",
  key_risks: "Key Risks",
};

interface ItemDetail {
  item_name: string;
  quantity: number;
  unit: string;
  specifications: string;
  make_model?: string;
  unit_price_estimate?: number | null;
}

function SummaryDisplay({ content }: { content: string }) {
  // Try to parse as JSON (new format with sections)
  let parsed: {
    summary?: string;
    sections?: Record<string, string>;
    item_details?: ItemDetail[];
  } | null = null;
  try { parsed = JSON.parse(content); } catch {}

  if (parsed?.sections && Object.keys(parsed.sections).length > 0) {
    return (
      <div className="space-y-4">
        {parsed.summary && (
          <p className="text-sm text-foreground leading-relaxed font-medium border-b border-border pb-3">
            {parsed.summary}
          </p>
        )}
        {Object.entries(parsed.sections).map(([key, value]) => {
          if (!value || value.trim() === "N/A" || value.trim() === "null") return null;
          const label = SECTION_LABELS[key] || key.replace(/_/g, " ");
          return (
            <div key={key}>
              <p className="text-xs font-semibold text-foreground mb-1">{label}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{value}</p>
            </div>
          );
        })}

        {/* Item Details Table */}
        {parsed.item_details && parsed.item_details.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5" />
              Item-wise Specifications ({parsed.item_details.length} items)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-2 border border-border font-semibold">Item</th>
                    <th className="text-center p-2 border border-border font-semibold w-20">Qty</th>
                    <th className="text-left p-2 border border-border font-semibold">Specifications</th>
                    {parsed.item_details.some(i => i.make_model) && (
                      <th className="text-left p-2 border border-border font-semibold w-28">Make/Model</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {parsed.item_details.map((item, idx) => (
                    <tr key={idx} className="hover:bg-muted/30">
                      <td className="p-2 border border-border font-medium text-foreground">
                        {item.item_name}
                      </td>
                      <td className="p-2 border border-border text-center text-muted-foreground">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="p-2 border border-border text-muted-foreground">
                        {item.specifications}
                      </td>
                      {parsed.item_details?.some(i => i.make_model) && (
                        <td className="p-2 border border-border text-muted-foreground">
                          {item.make_model || "—"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Fallback: plain text or old markdown format
  return (
    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{content}</p>
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
