"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, Loader2, Sparkles, CheckCircle2, AlertTriangle,
  ShieldCheck, KeyRound, Mail, Bot, FileText, Pencil, Check, X,
  MonitorPlay, LogIn, ClipboardList, Camera, Send, Download, Lock,
  ScrollText, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type {
  GemBid, GemParticipationSession, GemParticipationField,
  GemParticipationDocument, GemCredsStatus, GemAuditLog,
} from "@/types/gem";
import {
  isElectron, gemCredsStatus, gemCredsSave, gemGmailSave,
  gemParticipateOpen, gemParticipateLogin, gemParticipateOtp,
  gemParticipateGoto, gemParticipateFill, gemParticipateAttach,
  gemParticipateScreenshot, gemParticipateSubmit, gemParticipateConfirmation,
  gemParticipateClose, onGemParticipationEvent,
} from "@/lib/electron";

const STEPS = [
  { key: "setup", label: "Setup" },
  { key: "prepare", label: "AI Prepare" },
  { key: "consent", label: "Review & Consent" },
  { key: "portal", label: "GeM Portal" },
  { key: "done", label: "Submitted" },
] as const;

// Automation events emitted by Electron main that we forward into the
// permanent audit trail
const FORWARDED_EVENTS = new Set([
  "navigated", "login_started", "login_filled", "otp_listening", "otp_filled",
  "form_filled", "doc_attached", "submit_clicked",
]);

export default function ParticipatePage() {
  const params = useParams();
  const router = useRouter();
  const bidId = params.id as string;

  const [bid, setBid] = useState<GemBid | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [session, setSession] = useState<GemParticipationSession | null>(null);
  const [fields, setFields] = useState<GemParticipationField[]>([]);
  const [docs, setDocs] = useState<GemParticipationDocument[]>([]);
  const [creds, setCreds] = useState<GemCredsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Setup forms
  const [gemUser, setGemUser] = useState("");
  const [gemPass, setGemPass] = useState("");
  const [gmailEmail, setGmailEmail] = useState("");
  const [gmailPass, setGmailPass] = useState("");

  // Review
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentText, setConsentText] = useState("");

  // Portal
  const [eventFeed, setEventFeed] = useState<{ type: string; detail: string; ts: string }[]>([]);
  const [manualOtp, setManualOtp] = useState("");
  const [otpNeeded, setOtpNeeded] = useState(false);
  const [submissionRef, setSubmissionRef] = useState("");
  const [finalConfirmOpen, setFinalConfirmOpen] = useState(false);
  const [finalChecked, setFinalChecked] = useState(false);

  // Audit
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<GemAuditLog[]>([]);
  const [chainStatus, setChainStatus] = useState<{ valid: boolean; entries: number } | null>(null);

  const lastNavUrl = useRef<string>("");
  const sessionRef = useRef<GemParticipationSession | null>(null);
  sessionRef.current = session;

  const postEvent = useCallback(async (type: string, payload?: Record<string, unknown>, screenshotBase64?: string) => {
    const s = sessionRef.current;
    if (!s) return null;
    try {
      const res = await fetch("/api/gem-participation/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: s.id, type, payload: payload || {}, screenshot_base64: screenshotBase64 }),
      });
      const data = await res.json();
      if (res.ok && data.status && data.status !== s.status) {
        setSession({ ...s, status: data.status });
      }
      return res.ok ? data : null;
    } catch {
      return null;
    }
  }, []);

  const addFeed = (type: string, detail: string) =>
    setEventFeed((prev) => [...prev.slice(-60), { type, detail, ts: new Date().toLocaleTimeString("en-IN") }]);

  // Forward Electron automation events into the audit trail + local feed
  useEffect(() => {
    const unsub = onGemParticipationEvent((evt) => {
      const s = sessionRef.current;
      if (!s || evt.sessionId !== s.id) return;
      if (evt.type === "navigated") {
        const url = String(evt.payload.url || "");
        if (url === lastNavUrl.current) return;
        lastNavUrl.current = url;
        addFeed("navigated", url);
        postEvent("navigated", { url });
        return;
      }
      if (evt.type === "otp_manual_required") { setOtpNeeded(true); addFeed("otp", "OTP not auto-detected — enter it manually below"); return; }
      if (evt.type === "window_closed") { addFeed("window", "GeM window closed"); return; }
      addFeed(evt.type, JSON.stringify(evt.payload).substring(0, 140));
      if (FORWARDED_EVENTS.has(evt.type)) postEvent(evt.type, evt.payload);
    });
    return unsub;
  }, [postEvent]);

  const loadSessionDetail = useCallback(async (sessionId: string) => {
    const res = await fetch(`/api/gem-participation/sessions?id=${sessionId}`);
    if (!res.ok) return;
    const data = await res.json();
    setSession(data.session);
    setFields(data.fields || []);
    setDocs(data.documents || []);
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: bidData } = await supabase.from("gem_bids").select("*").eq("id", bidId).single();
      if (!bidData) { router.push("/bids"); return; }
      setBid(bidData);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userData } = await supabase.from("users").select("business_id").eq("id", user.id).single();
        if (userData?.business_id) {
          setBusinessId(userData.business_id);
          if (isElectron()) {
            const status = await gemCredsStatus(userData.business_id);
            if (status && !status.error) setCreds(status);
          }
        }
      }

      const res = await fetch(`/api/gem-participation/sessions?bid_id=${bidId}`);
      if (res.ok) {
        const data = await res.json();
        const active = (data.sessions || []).find(
          (s: GemParticipationSession) => !["failed", "cancelled"].includes(s.status)
        );
        if (active) await loadSessionDetail(active.id);
      }
      setLoading(false);
    })();
  }, [bidId, router, loadSessionDetail]);

  // ── Setup actions ───────────────────────────────────────────────────────────

  const syncCredsMeta = async (status: GemCredsStatus) => {
    if (!businessId) return;
    const supabase = createClient();
    await supabase.from("gem_credentials").upsert({
      business_id: businessId,
      gem_user_id: status.gemUserId || null,
      device_label: status.deviceLabel || null,
      has_gem_password: status.hasGem,
      gmail_email: status.gmailEmail || null,
      has_gmail_password: status.hasGmail,
      updated_at: new Date().toISOString(),
    }, { onConflict: "business_id" });
  };

  const handleSaveGemCreds = async () => {
    if (!businessId || !gemUser.trim() || !gemPass) { toast.error("Enter your GeM seller ID and password"); return; }
    setBusy("gem-creds");
    const res = await gemCredsSave({ businessId, gemUserId: gemUser.trim(), gemPassword: gemPass });
    if (res?.error) toast.error(res.error);
    else {
      toast.success("GeM credentials encrypted and stored on this device");
      setGemPass("");
      const status = await gemCredsStatus(businessId);
      if (status && !status.error) { setCreds(status); await syncCredsMeta(status); }
    }
    setBusy(null);
  };

  const handleSaveGmail = async () => {
    if (!businessId || !gmailEmail.trim() || !gmailPass) { toast.error("Enter your Gmail address and app password"); return; }
    setBusy("gmail-creds");
    const res = await gemGmailSave({ businessId, email: gmailEmail.trim(), appPassword: gmailPass.replace(/\s+/g, "") });
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Gmail connected — OTP detection enabled");
      setGmailPass("");
      const status = await gemCredsStatus(businessId);
      if (status && !status.error) { setCreds(status); await syncCredsMeta(status); }
    }
    setBusy(null);
  };

  // ── Prepare ─────────────────────────────────────────────────────────────────

  const handlePrepare = async () => {
    setBusy("prepare");
    try {
      let s = session;
      if (!s) {
        const res = await fetch("/api/gem-participation/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bid_id: bidId }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || "Could not start session"); setBusy(null); return; }
        s = data.session;
        setSession(s);
      }
      const res = await fetch("/api/gem-participation/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: s!.id }),
      });
      const data = await res.json();
      if (!res.ok) toast.error(data.error || "AI preparation failed");
      else toast.success(`AI suggested ${data.fields?.length || 0} fields — review each one before anything is filled`);
      await loadSessionDetail(s!.id);
    } catch (err: any) {
      toast.error(err.message);
    }
    setBusy(null);
  };

  // ── Review actions ──────────────────────────────────────────────────────────

  const reviewField = async (field: GemParticipationField, action: "approve" | "edit" | "reject", value?: string) => {
    if (!session) return;
    const res = await fetch("/api/gem-participation/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session.id, field_id: field.id, action, value }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || "Failed"); return; }
    setFields((prev) => prev.map((f) => (f.id === field.id ? data.field : f)));
    setEditingField(null);
  };

  const reviewDoc = async (doc: GemParticipationDocument, action: "approve" | "reject") => {
    if (!session) return;
    const res = await fetch("/api/gem-participation/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session.id, document_id: doc.id, action }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || "Failed"); return; }
    setDocs((prev) => prev.map((d) => (d.id === doc.id ? data.document : d)));
  };

  const handleConsent = async () => {
    if (!session) return;
    setBusy("consent");
    const res = await fetch("/api/gem-participation/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session.id, confirm_text: consentText.trim() }),
    });
    const data = await res.json();
    if (!res.ok) toast.error(data.error || "Consent failed");
    else {
      toast.success("Consent recorded. Only the approved values can now be filled.");
      await loadSessionDetail(session.id);
    }
    setBusy(null);
  };

  // ── Portal actions ──────────────────────────────────────────────────────────

  const handleOpenPortal = async () => {
    if (!session) return;
    setBusy("portal-open");
    const res = await gemParticipateOpen({ sessionId: session.id });
    if (res?.error) toast.error(res.error);
    else {
      await postEvent("session_opened", {});
      addFeed("session", "GeM portal window opened (isolated session)");
    }
    setBusy(null);
  };

  const handleLogin = async () => {
    if (!session || !businessId) return;
    setBusy("login");
    addFeed("login", "Filling credentials and watching Gmail for OTP…");
    const res = await gemParticipateLogin({ sessionId: session.id, businessId });
    if (res?.error) toast.error(res.error);
    else if (res?.manualOtpRequired) setOtpNeeded(true);
    else if (res?.otpApplied) toast.success("OTP detected from Gmail and applied");
    setBusy(null);
  };

  const handleManualOtp = async () => {
    if (!session || !manualOtp.trim()) return;
    const res = await gemParticipateOtp({ sessionId: session.id, otp: manualOtp.trim() });
    if (res?.error) toast.error(res.error);
    else {
      setOtpNeeded(false);
      setManualOtp("");
    }
  };

  const handleGotoBid = async () => {
    if (!session || !bid?.bid_url) { toast.error("This bid has no GeM URL"); return; }
    const res = await gemParticipateGoto({ sessionId: session.id, url: bid.bid_url });
    if (res?.error) toast.error(res.error);
  };

  const approvedFields = fields.filter((f) => f.status === "approved" || f.status === "edited");
  const approvedDocs = docs.filter((d) => d.status === "approved");

  const handleFill = async () => {
    if (!session) return;
    setBusy("fill");
    const res = await gemParticipateFill({
      sessionId: session.id,
      fields: approvedFields.map((f) => ({ field_key: f.field_key, field_label: f.field_label, value: f.user_value || "" })),
    });
    if (res?.error) toast.error(res.error);
    else {
      const r = res?.report;
      toast.success(`Filled ${r?.filled?.length || 0} field(s); ${r?.unmatched?.length || 0} not found on this page`);
      // Evidence screenshot
      const shot = await gemParticipateScreenshot({ sessionId: session.id });
      if (shot?.base64) await postEvent("screenshot_captured", { context: "after_fill", page_url: shot.url }, shot.base64);
    }
    setBusy(null);
  };

  const handleAttachDocs = async () => {
    if (!session) return;
    setBusy("attach");
    let attached = 0;
    for (const doc of approvedDocs) {
      if (!doc.source_doc_id) continue;
      try {
        const urlRes = await fetch(`/api/gem-scraper/download?doc_id=${doc.source_doc_id}`);
        const urlData = await urlRes.json();
        if (!urlRes.ok || !urlData.url) { toast.error(`${doc.file_name}: ${urlData.error || "no URL"}`); continue; }
        const res = await gemParticipateAttach({
          sessionId: session.id,
          url: urlData.url,
          fileName: doc.file_name,
          sha256: doc.sha256,
          inputIndex: attached,
        });
        if (res?.error) toast.error(`${doc.file_name}: ${res.error}`);
        else attached++;
      } catch (err: any) {
        toast.error(`${doc.file_name}: ${err.message}`);
      }
    }
    if (attached) toast.success(`Attached ${attached} document(s) — verify them in the GeM window`);
    setBusy(null);
  };

  const handleScreenshot = async () => {
    if (!session) return;
    const shot = await gemParticipateScreenshot({ sessionId: session.id });
    if (shot?.base64) {
      await postEvent("screenshot_captured", { context: "manual", page_url: shot.url }, shot.base64);
      toast.success("Screenshot saved to the audit trail");
    } else if (shot?.error) toast.error(shot.error);
  };

  const handleReadyForSubmit = async () => {
    await postEvent("ready_for_submit", { approved_fields: approvedFields.length, approved_documents: approvedDocs.length });
    setFinalConfirmOpen(true);
  };

  const handleFinalSubmit = async () => {
    if (!session || !finalChecked) return;
    setBusy("submit");
    setFinalConfirmOpen(false);
    await postEvent("final_submit_confirmed", { approved_fields: approvedFields.length, approved_documents: approvedDocs.length });
    const res = await gemParticipateSubmit({ sessionId: session.id });
    if (res?.error) { toast.error(res.error); setBusy(null); return; }
    if (!res?.clicked) toast.warning("No submit button found — click Submit inside the GeM window, then capture confirmation below.");
    // Give GeM a moment, then try to scrape the confirmation
    await new Promise((r) => setTimeout(r, 4000));
    const conf = await gemParticipateConfirmation({ sessionId: session.id });
    if (conf?.reference) setSubmissionRef(conf.reference);
    const shot = await gemParticipateScreenshot({ sessionId: session.id });
    if (shot?.base64) await postEvent("screenshot_captured", { context: "after_submit", page_url: shot.url }, shot.base64);
    toast.info("Verify the confirmation in the GeM window, then record the reference number below.");
    setBusy(null);
  };

  const handleConfirmSubmitted = async () => {
    if (!session) return;
    setBusy("confirm-submitted");
    const ok = await postEvent("submitted", { reference: submissionRef.trim() || null });
    if (ok) {
      await gemParticipateClose({ sessionId: session.id });
      await postEvent("session_closed", {});
      await loadSessionDetail(session.id);
      toast.success("Participation recorded. Session closed and portal cookies wiped.");
    }
    setBusy(null);
  };

  const handleCancel = async () => {
    if (!session) return;
    if (!confirm("Cancel this participation session? The audit trail is kept.")) return;
    await postEvent("cancelled", {});
    await gemParticipateClose({ sessionId: session.id });
    await loadSessionDetail(session.id);
  };

  // ── Audit ───────────────────────────────────────────────────────────────────

  const loadAudit = async () => {
    if (!session) return;
    const res = await fetch(`/api/gem-participation/audit?session_id=${session.id}&verify=1`);
    if (res.ok) {
      const data = await res.json();
      setAuditLogs(data.logs || []);
      if (data.chain) setChainStatus(data.chain);
    }
    setAuditOpen(true);
  };

  const exportAudit = async () => {
    if (!session) return;
    const res = await fetch(`/api/gem-participation/audit?session_id=${session.id}&format=csv`);
    if (!res.ok) { toast.error("Export failed"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gem-audit-${session.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!bid) return null;

  const status = session?.status || "draft";
  const setupComplete = !!(creds?.hasGem);
  const currentStep =
    status === "submitted" ? 4 :
    ["approved", "in_session", "awaiting_final_submit"].includes(status) ? 3 :
    status === "awaiting_consent" ? 2 :
    setupComplete || session ? 1 : 0;

  const allFieldsReviewed = fields.length > 0 && fields.every((f) => f.status !== "suggested");
  const allDocsReviewed = docs.every((d) => d.status !== "proposed");

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href={`/bids/${bid.id}`} className="p-2 rounded-xl hover:bg-muted transition-colors mt-1">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-mono text-primary font-bold">{bid.gem_bid_id}</span>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {status.replace(/_/g, " ")}
            </span>
          </div>
          <h1 className="text-xl font-bold text-foreground mt-1">Participate in this Bid</h1>
          <p className="text-xs text-muted-foreground mt-1">
            AI prepares everything; nothing reaches GeM without your explicit approval. Every step is permanently logged.
          </p>
        </div>
        {session && !["submitted", "failed", "cancelled"].includes(status) && (
          <Button onClick={handleCancel} variant="outline" size="sm" className="rounded-md text-red-600">
            Cancel Session
          </Button>
        )}
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1">
        {STEPS.map((step, i) => (
          <div key={step.key} className="flex items-center gap-1 flex-1">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium w-full justify-center ${
              i < currentStep ? "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700" :
              i === currentStep ? "bg-primary text-primary-foreground" :
              "bg-muted text-muted-foreground"
            }`}>
              {i < currentStep ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="font-bold">{i + 1}</span>}
              {step.label}
            </div>
          </div>
        ))}
      </div>

      {!isElectron() && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          Credential storage and the GeM portal session require the Invio desktop app. You can review AI suggestions here, but login and submission only work on desktop.
        </div>
      )}

      {/* STEP 1: Setup */}
      {currentStep <= 1 && status !== "awaiting_consent" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" /> GeM Portal Credentials
              {creds?.hasGem && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            </h3>
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Encrypted with your operating system's keychain and stored only on this device ({creds?.deviceLabel || "this machine"}). They are never uploaded to Invio's servers.
            </p>
            {creds && !creds.encryptionAvailable && (
              <p className="text-xs text-red-600">OS encryption is unavailable on this device — credentials cannot be stored safely.</p>
            )}
            {creds?.hasGem ? (
              <p className="text-xs text-foreground">Saved for seller ID <span className="font-mono font-medium">{creds.gemUserId}</span>. Re-enter below to replace.</p>
            ) : null}
            <input
              type="text" placeholder="GeM Seller ID / Login" value={gemUser}
              onChange={(e) => setGemUser(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background"
            />
            <input
              type="password" placeholder="GeM Password" value={gemPass}
              onChange={(e) => setGemPass(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background"
            />
            <Button onClick={handleSaveGemCreds} disabled={busy === "gem-creds" || !isElectron()} size="sm" className="rounded-md">
              {busy === "gem-creds" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1.5" />}
              Encrypt & Save on Device
            </Button>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" /> Gmail for OTP <span className="text-muted-foreground font-normal">(optional)</span>
              {creds?.hasGmail && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            </h3>
            <p className="text-xs text-muted-foreground">
              GeM emails an OTP at login. Connect the Gmail account registered with GeM using a{" "}
              <span className="font-medium text-foreground">Google App Password</span> (Google Account → Security → 2-Step Verification → App passwords) and Invio will read just that OTP via IMAP, only while logging in. Without this, you type the OTP manually.
            </p>
            <input
              type="email" placeholder="Gmail address" value={gmailEmail}
              onChange={(e) => setGmailEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background"
            />
            <input
              type="password" placeholder="16-character App Password" value={gmailPass}
              onChange={(e) => setGmailPass(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background"
            />
            <Button onClick={handleSaveGmail} disabled={busy === "gmail-creds" || !isElectron()} size="sm" variant="outline" className="rounded-md">
              {busy === "gmail-creds" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Mail className="w-4 h-4 mr-1.5" />}
              Verify & Connect Gmail
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: AI Prepare */}
      {currentStep <= 1 && status !== "awaiting_consent" && (
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 border border-purple-200 dark:border-purple-800/50 rounded-xl p-6 text-center">
          <Bot className="w-8 h-8 text-purple-600 mx-auto mb-3" />
          <h3 className="font-semibold text-foreground mb-1">Let AI Prepare the Participation</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4">
            AI will map this tender's requirements against your Invio business profile and suggest a value for every participation field — with the source and reasoning for each. Nothing is sent to GeM in this step.
          </p>
          <Button onClick={handlePrepare} disabled={busy === "prepare" || status === "preparing"} className="rounded-full px-6">
            {busy === "prepare" || status === "preparing" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
            {session ? "Re-run AI Preparation" : "Start AI Preparation"}
          </Button>
          {session?.error_message && <p className="text-xs text-red-600 mt-3">{session.error_message}</p>}
        </div>
      )}

      {/* STEP 3: Review & Consent */}
      {status === "awaiting_consent" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              Review Every Field ({fields.filter((f) => f.status !== "suggested").length}/{fields.length} reviewed)
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Approve, edit, or reject each AI suggestion. Only approved values can ever be filled into GeM.
            </p>
            <div className="space-y-2">
              {fields.map((field) => (
                <div key={field.id} className={`p-3 rounded-lg border ${
                  field.status === "approved" ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/10" :
                  field.status === "edited" ? "border-sky-300 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/10" :
                  field.status === "rejected" ? "border-border bg-muted/40 opacity-60" :
                  "border-border"
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground">{field.field_label}</p>
                      {editingField === field.id ? (
                        <div className="flex items-center gap-2 mt-1.5">
                          <input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="flex-1 px-2 py-1.5 text-xs rounded-md border border-border bg-background"
                            autoFocus
                          />
                          <button onClick={() => reviewField(field, "edit", editValue)} className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700"><Check className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setEditingField(null)} className="p-1.5 rounded-md bg-muted text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ) : (
                        <p className={`text-sm mt-0.5 ${field.status === "rejected" ? "line-through text-muted-foreground" : "text-foreground font-medium"}`}>
                          {(field.status === "edited" ? field.user_value : field.ai_suggested_value) || <span className="italic text-muted-foreground">— empty —</span>}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        <span className={`font-medium ${field.ai_source?.includes("review") || field.ai_source?.includes("missing") ? "text-amber-600" : ""}`}>
                          {field.ai_source || "AI"}
                        </span>
                        {field.ai_reasoning ? ` — ${field.ai_reasoning}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => reviewField(field, "approve")}
                        title="Approve"
                        className={`p-1.5 rounded-md transition-colors ${field.status === "approved" ? "bg-emerald-500 text-white" : "hover:bg-emerald-100 dark:hover:bg-emerald-950/40 text-emerald-600"}`}
                      ><Check className="w-4 h-4" /></button>
                      <button
                        onClick={() => { setEditingField(field.id); setEditValue(field.user_value || field.ai_suggested_value || ""); }}
                        title="Edit"
                        className={`p-1.5 rounded-md transition-colors ${field.status === "edited" ? "bg-sky-500 text-white" : "hover:bg-sky-100 dark:hover:bg-sky-950/40 text-sky-600"}`}
                      ><Pencil className="w-4 h-4" /></button>
                      <button
                        onClick={() => reviewField(field, "reject")}
                        title="Reject — will not be filled"
                        className={`p-1.5 rounded-md transition-colors ${field.status === "rejected" ? "bg-red-500 text-white" : "hover:bg-red-100 dark:hover:bg-red-950/40 text-red-600"}`}
                      ><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {docs.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> Documents to Upload
              </h3>
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div key={doc.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                    doc.status === "approved" ? "border-emerald-300 dark:border-emerald-800" :
                    doc.status === "rejected" ? "border-border opacity-60" : "border-border"
                  }`}>
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{doc.file_name}</p>
                      {doc.sha256 && <p className="text-[9px] font-mono text-muted-foreground truncate">SHA-256: {doc.sha256}</p>}
                    </div>
                    <button onClick={() => reviewDoc(doc, "approve")} className={`p-1.5 rounded-md ${doc.status === "approved" ? "bg-emerald-500 text-white" : "hover:bg-emerald-100 dark:hover:bg-emerald-950/40 text-emerald-600"}`}><Check className="w-4 h-4" /></button>
                    <button onClick={() => reviewDoc(doc, "reject")} className={`p-1.5 rounded-md ${doc.status === "rejected" ? "bg-red-500 text-white" : "hover:bg-red-100 dark:hover:bg-red-950/40 text-red-600"}`}><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-card border-2 border-primary/30 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" /> Explicit Consent
            </h3>
            <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
              <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} className="mt-0.5 rounded" />
              I have reviewed every field and document above. I authorize Invio to fill ONLY the approved values into the GeM portal on my behalf. I understand nothing will be submitted without my second, final confirmation.
            </label>
            <div className="flex items-center gap-2">
              <input
                value={consentText}
                onChange={(e) => setConsentText(e.target.value)}
                placeholder='Type APPROVE'
                className="px-3 py-2 text-sm rounded-lg border border-border bg-background w-40 font-mono"
              />
              <Button
                onClick={handleConsent}
                disabled={busy === "consent" || !consentChecked || consentText.trim() !== "APPROVE" || !allFieldsReviewed || !allDocsReviewed}
                className="rounded-md"
              >
                {busy === "consent" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1.5" />}
                Grant Consent & Continue
              </Button>
            </div>
            {(!allFieldsReviewed || !allDocsReviewed) && (
              <p className="text-xs text-amber-600">Review every field and document first.</p>
            )}
          </div>
        </div>
      )}

      {/* STEP 4: GeM Portal session */}
      {["approved", "in_session", "awaiting_final_submit"].includes(status) && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <MonitorPlay className="w-4 h-4 text-primary" /> GeM Portal Session
              </h3>
              <p className="text-xs text-muted-foreground">
                The GeM window stays visible the whole time — you can take over manually at any point. Cookies live in an isolated session that is wiped when this closes.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={handleOpenPortal} disabled={!isElectron() || busy === "portal-open"} size="sm" variant="outline" className="rounded-md">
                  <MonitorPlay className="w-4 h-4 mr-1.5" /> 1. Open GeM Window
                </Button>
                <Button onClick={handleLogin} disabled={!isElectron() || busy === "login" || !creds?.hasGem} size="sm" variant="outline" className="rounded-md">
                  {busy === "login" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <LogIn className="w-4 h-4 mr-1.5" />}
                  2. Auto-Login {creds?.hasGmail ? "+ OTP" : ""}
                </Button>
                <Button onClick={handleGotoBid} disabled={!isElectron()} size="sm" variant="outline" className="rounded-md">
                  <ArrowLeft className="w-4 h-4 mr-1.5 rotate-180" /> 3. Go to Bid Page
                </Button>
                <Button onClick={handleFill} disabled={!isElectron() || busy === "fill"} size="sm" variant="outline" className="rounded-md">
                  {busy === "fill" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ClipboardList className="w-4 h-4 mr-1.5" />}
                  4. Fill Approved Fields ({approvedFields.length})
                </Button>
                <Button onClick={handleAttachDocs} disabled={!isElectron() || busy === "attach" || approvedDocs.length === 0} size="sm" variant="outline" className="rounded-md">
                  {busy === "attach" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileText className="w-4 h-4 mr-1.5" />}
                  5. Attach Documents ({approvedDocs.length})
                </Button>
                <Button onClick={handleScreenshot} disabled={!isElectron()} size="sm" variant="outline" className="rounded-md">
                  <Camera className="w-4 h-4 mr-1.5" /> Save Evidence Screenshot
                </Button>
              </div>

              {otpNeeded && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40">
                  <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">Enter the OTP from your email/SMS:</span>
                  <input
                    value={manualOtp}
                    onChange={(e) => setManualOtp(e.target.value.replace(/\D/g, ""))}
                    maxLength={8}
                    className="w-28 px-2 py-1.5 text-sm font-mono rounded-md border border-border bg-background"
                  />
                  <Button onClick={handleManualOtp} size="sm" className="rounded-md">Apply</Button>
                </div>
              )}
            </div>

            {/* Final submit */}
            <div className="bg-card border-2 border-emerald-300 dark:border-emerald-800 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-600" /> Final Submission
              </h3>
              {status !== "awaiting_final_submit" ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    When the participation form in the GeM window looks complete and correct, proceed to the final confirmation. Nothing is submitted until you confirm again.
                  </p>
                  <Button onClick={handleReadyForSubmit} disabled={!isElectron()} size="sm" className="rounded-md">
                    Review & Submit…
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    After submitting, record the GeM reference number below to complete the audit trail.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button onClick={() => setFinalConfirmOpen(true)} disabled={busy === "submit"} size="sm" className="rounded-md bg-emerald-600 hover:bg-emerald-700">
                      {busy === "submit" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
                      Submit on GeM
                    </Button>
                    <input
                      value={submissionRef}
                      onChange={(e) => setSubmissionRef(e.target.value)}
                      placeholder="GeM reference number"
                      className="px-3 py-2 text-sm rounded-lg border border-border bg-background flex-1 min-w-40"
                    />
                    <Button onClick={handleConfirmSubmitted} disabled={busy === "confirm-submitted"} size="sm" variant="outline" className="rounded-md">
                      {busy === "confirm-submitted" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                      Mark Submitted & Close
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Activity feed */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <ScrollText className="w-4 h-4" /> Live Activity
            </h3>
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {eventFeed.length === 0 && <p className="text-xs text-muted-foreground">Actions will appear here and in the permanent audit log.</p>}
              {[...eventFeed].reverse().map((e, i) => (
                <div key={i} className="text-[10px] leading-relaxed">
                  <span className="text-muted-foreground font-mono">{e.ts}</span>{" "}
                  <span className="font-semibold text-foreground">{e.type}</span>{" "}
                  <span className="text-muted-foreground break-all">{e.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STEP 5: Done */}
      {status === "submitted" && (
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
          <h3 className="font-bold text-foreground text-lg mb-1">Participation Submitted</h3>
          {session?.submission_ref && (
            <p className="text-sm text-foreground">GeM Reference: <span className="font-mono font-bold">{session.submission_ref}</span></p>
          )}
          <p className="text-xs text-muted-foreground mt-2 mb-4">
            The complete field-by-field and document-by-document trail is preserved in the tamper-evident audit log.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={exportAudit} variant="outline" size="sm" className="rounded-md">
              <Download className="w-4 h-4 mr-1.5" /> Export Audit Trail (CSV)
            </Button>
            <Link href={`/bids/${bid.id}`}>
              <Button size="sm" className="rounded-md">Back to Bid</Button>
            </Link>
          </div>
        </div>
      )}

      {/* Audit trail (always available once a session exists) */}
      {session && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-primary" /> Audit Trail
              {chainStatus && (
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${chainStatus.valid ? "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700" : "bg-red-100 dark:bg-red-950/30 text-red-700"}`}>
                  {chainStatus.valid ? `Chain verified · ${chainStatus.entries} entries` : "CHAIN BROKEN — possible tampering"}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              <Button onClick={loadAudit} variant="outline" size="sm" className="rounded-md">
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> {auditOpen ? "Refresh" : "View Log"}
              </Button>
              <Button onClick={exportAudit} variant="outline" size="sm" className="rounded-md">
                <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
              </Button>
            </div>
          </div>
          {auditOpen && (
            <div className="mt-3 space-y-1 max-h-80 overflow-y-auto">
              {auditLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 text-[11px] py-1 border-b border-border/30">
                  <span className="font-mono text-muted-foreground shrink-0 w-36">{new Date(log.created_at).toLocaleString("en-IN")}</span>
                  <span className={`shrink-0 w-12 font-bold uppercase text-[9px] mt-0.5 ${log.actor === "user" ? "text-sky-600" : log.actor === "ai" ? "text-purple-600" : "text-muted-foreground"}`}>{log.actor}</span>
                  <span className="font-medium text-foreground shrink-0">{log.action}</span>
                  <span className="text-muted-foreground break-all">{JSON.stringify(log.payload || {}).substring(0, 200)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Final confirmation modal — the second consent */}
      {finalConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            <div className="border-b border-border p-4">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-600" /> Confirm Final Submission
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                This will click <span className="font-medium text-foreground">Submit</span> on the GeM portal for bid{" "}
                <span className="font-mono font-medium text-foreground">{bid.gem_bid_id}</span>. This action cannot be undone by Invio.
              </p>
              <div className="text-xs bg-muted/50 rounded-lg p-3 space-y-1">
                <p><span className="font-semibold text-foreground">{approvedFields.length}</span> approved field(s) filled</p>
                <p><span className="font-semibold text-foreground">{approvedDocs.length}</span> approved document(s) attached</p>
                <p className="text-muted-foreground">Consent granted {session?.consent_given_at ? new Date(session.consent_given_at).toLocaleString("en-IN") : ""}</p>
              </div>
              <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
                <input type="checkbox" checked={finalChecked} onChange={(e) => setFinalChecked(e.target.checked)} className="mt-0.5 rounded" />
                I have verified the form in the GeM window myself and I authorize this submission.
              </label>
            </div>
            <div className="border-t border-border p-4 flex items-center justify-end gap-2">
              <Button onClick={() => { setFinalConfirmOpen(false); setFinalChecked(false); }} variant="outline" size="sm" className="rounded-md">
                Cancel
              </Button>
              <Button onClick={handleFinalSubmit} disabled={!finalChecked} size="sm" className="rounded-md bg-emerald-600 hover:bg-emerald-700">
                <Send className="w-4 h-4 mr-1.5" /> Submit on GeM
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
