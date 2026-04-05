"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, X, Send, Loader2, ArrowRight, Mic, MicOff,
  Volume2, VolumeX, Bot, User, Trash2,
} from "lucide-react";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { createClient } from "@/lib/supabase/client";

interface Message {
  role: "user" | "assistant";
  content: string;
  action?: { route: string; params?: Record<string, string> };
}

const DEFAULT_WAKE_WORDS = ["hey invio", "okay invio", "ok invio", "invio"];

function getWakeWords(): string[] {
  if (typeof window === "undefined") return DEFAULT_WAKE_WORDS;
  const custom = localStorage.getItem("invio_wake_word");
  if (custom && custom.trim()) {
    return [custom.trim().toLowerCase(), ...DEFAULT_WAKE_WORDS];
  }
  return DEFAULT_WAKE_WORDS;
}

const SUGGESTIONS = [
  "GSTR-3B kab file karna hai?",
  "Who owes me money?",
  "Create invoice for Ram",
  "Mera GST kitna banta hai?",
  "Show P&L this month",
  "TDS ka rate kya hai?",
];

export function AIAssistant() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakEnabled, setSpeakEnabled] = useState(true);
  const [wakeWordActive, setWakeWordActive] = useState(false);
  const [wakeWordListening, setWakeWordListening] = useState(false);
  const [currentWakeWord, setCurrentWakeWord] = useState(DEFAULT_WAKE_WORDS[0]);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wakeWordRef = useRef<any>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Voice input for chat
  const { isRecording, isTranscribing, toggleRecording } = useVoiceInput({
    onTranscript: (text) => {
      if (text.trim()) {
        if (!open) setOpen(true);
        send(text);
      }
    },
  });

  // Load history when panel opens
  useEffect(() => {
    if (open && messages.length === 0) loadHistory();
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/ai-conversation?limit=30");
      if (res.ok) {
        const { messages: history } = await res.json();
        if (history?.length > 0) {
          setMessages(history.map((h: { role: string; content: string }) => ({
            role: h.role as "user" | "assistant",
            content: h.content,
          })));
        }
      }
    } catch { /* silently fail */ }
    setLoadingHistory(false);
  };

  const [confirmClear, setConfirmClear] = useState(false);

  const clearHistory = async () => {
    await fetch("/api/ai-conversation", { method: "DELETE" });
    setMessages([]);
    setConfirmClear(false);
  };

  // Read settings from localStorage on mount and on settings change
  useEffect(() => {
    const load = () => {
      const stored = localStorage.getItem("invio_wake_word");
      setCurrentWakeWord(stored || DEFAULT_WAKE_WORDS[0]);
      const tts = localStorage.getItem("invio_tts_enabled");
      if (tts !== null) setSpeakEnabled(tts !== "false");
    };
    load();
    window.addEventListener("invio-settings-changed", load);
    return () => window.removeEventListener("invio-settings-changed", load);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Wake word detection using Web Speech API continuous recognition
  const startWakeWord = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "hi-IN"; // Supports both Hindi and English
    wakeWordRef.current = recognition;

    recognition.onresult = (event: any) => {
      const last = event.results[event.results.length - 1];
      const transcript = last[0].transcript.toLowerCase().trim();
      const triggered = getWakeWords().some(w => transcript.includes(w));
      if (triggered && !open) {
        setOpen(true);
        setWakeWordActive(true);
        // Start listening immediately after wake word
        setTimeout(() => toggleRecording(), 300);
      }
    };

    recognition.onerror = () => setWakeWordListening(false);
    recognition.onend = () => {
      // Restart to keep listening
      if (wakeWordListening) {
        try { recognition.start(); } catch { /* already started */ }
      }
    };

    try {
      recognition.start();
      setWakeWordListening(true);
    } catch { /* browser not supported */ }
  }, [open, toggleRecording, wakeWordListening]);

  const stopWakeWord = () => {
    wakeWordRef.current?.stop();
    setWakeWordListening(false);
    setWakeWordActive(false);
  };

  // Text-to-speech using browser's Web Speech API
  const speak = (text: string) => {
    if (!speakEnabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;

    // Pick the best available voice — prefer Hindi
    const voices = window.speechSynthesis.getVoices();
    const hindiVoice = voices.find(v => v.lang.startsWith("hi"));
    const englishIndian = voices.find(v => v.lang === "en-IN");
    utterance.voice = hindiVoice || englishIndian || null;
    utterance.lang = hindiVoice ? "hi-IN" : "en-IN";
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const fetchBusinessContext = async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: userData } = await supabase.from("users").select("business_id").eq("id", user.id).single();
      if (!userData?.business_id) return null;
      const bId = userData.business_id;

      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

      const [invRes, custRes, invtRes, bizRes, expRes] = await Promise.all([
        supabase.from("invoices")
          .select("id, invoice_number, status, total, invoice_date, customers(name)")
          .eq("business_id", bId)
          .order("invoice_date", { ascending: false })
          .limit(100),
        supabase.from("customers").select("id, name").eq("business_id", bId),
        supabase.from("inventory_items").select("name, current_stock, reorder_level").eq("business_id", bId),
        supabase.from("businesses").select("name, gstin, state_code").eq("id", bId).single(),
        supabase.from("expenses").select("amount, category, expense_date").eq("business_id", bId),
      ]);

      const invoices = invRes.data || [];
      const expenses = expRes.data || [];

      const allRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);
      const pending = invoices.filter(i => i.status !== "paid" && i.status !== "cancelled").reduce((s, i) => s + (i.total || 0), 0);
      const overdue = invoices.filter(i => i.status === "overdue").length;

      const thisMonthInv = invoices.filter(i => i.invoice_date >= thisMonthStart);
      const lastMonthInv = invoices.filter(i => i.invoice_date >= lastMonthStart && i.invoice_date <= lastMonthEnd);
      const thisMonthSales = thisMonthInv.filter(i => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);
      const lastMonthSales = lastMonthInv.filter(i => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);
      const thisMonthExpenses = expenses.filter(e => e.expense_date >= thisMonthStart).reduce((s, e) => s + (e.amount || 0), 0);

      const lowStock = (invtRes.data || []).filter(i => i.current_stock <= i.reorder_level).map(i => i.name);

      const recentInvoices = invoices.slice(0, 5).map(i => ({
        number: i.invoice_number,
        customer: (i.customers as any)?.name,
        amount: `₹${(i.total || 0).toLocaleString("en-IN")}`,
        status: i.status,
        date: i.invoice_date,
      }));

      return {
        businessName: bizRes.data?.name,
        gstin: bizRes.data?.gstin,
        state: bizRes.data?.state_code,
        totalInvoices: invoices.length,
        totalRevenue: `₹${allRevenue.toLocaleString("en-IN")}`,
        pendingAmount: `₹${pending.toLocaleString("en-IN")}`,
        overdueInvoices: overdue,
        totalCustomers: (custRes.data || []).length,
        lowStockItems: lowStock,
        thisMonthSales: `₹${thisMonthSales.toLocaleString("en-IN")}`,
        lastMonthSales: `₹${lastMonthSales.toLocaleString("en-IN")}`,
        thisMonthExpenses: `₹${thisMonthExpenses.toLocaleString("en-IN")}`,
        recentInvoices,
      };
    } catch { return null; }
  };

  const send = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    setInput("");
    const newMessages = [...messages, { role: "user" as const, content: msg }];
    setMessages(newMessages);
    setLoading(true);
    setWakeWordActive(false);

    // Fetch live business context to pass to AI
    const context = await fetchBusinessContext();

    try {
      // First: check if it's a navigation command
      const navRes = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, businessContext: context }),
      });

      if (navRes.ok) {
        const navData = await navRes.json();

        if (navData.type === "action" && navData.action === "navigate" && navData.route) {
          const assistantMsg: Message = {
            role: "assistant",
            content: navData.message || "Opening...",
            action: { route: navData.route, params: navData.params },
          };
          setMessages([...newMessages, assistantMsg]);
          if (speakEnabled) speak(navData.message || "Opening that for you.");
          setLoading(false);
          return;
        }
      }

      // Otherwise: use the persistent AI accountant (saves to DB)
      const res = await fetch("/api/ai-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, businessContext: context }),
      });

      if (res.ok) {
        const { response } = await res.json();
        const assistantMsg: Message = { role: "assistant", content: response };
        setMessages([...newMessages, assistantMsg]);
        if (speakEnabled) speak(response);
      }
    } catch {
      const errMsg = "Kuch technical issue aa gaya. Dobara try karein.";
      setMessages([...newMessages, { role: "assistant", content: errMsg }]);
    }

    setLoading(false);
  };

  const handleAction = (route: string, params?: Record<string, string>) => {
    const q = params ? new URLSearchParams(params).toString() : "";
    router.push(`${route}${q ? `?${q}` : ""}`);
    setOpen(false);
  };

  const busy = isRecording || isTranscribing || loading;

  return (
    <>
      {/* Wake word toggle button */}
      <button
        onClick={() => wakeWordListening ? stopWakeWord() : startWakeWord()}
        className={`fixed bottom-20 right-20 md:bottom-6 md:right-20 z-40 p-3 rounded-2xl shadow-md transition-all ${
          wakeWordListening
            ? "bg-green-500 text-white"
            : "bg-white dark:bg-slate-900 text-muted-foreground border border-border hover:bg-muted"
        } ${open ? "hidden" : ""}`}
        title={wakeWordListening ? `Listening for "${currentWakeWord}"` : `Enable "${currentWakeWord}" wake word`}
      >
        {wakeWordListening
          ? <span className="text-xs font-bold px-1">HEY</span>
          : <Bot className="w-4 h-4" />
        }
      </button>

      {/* Main floating button */}
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 flex items-center gap-2 px-4 py-3 bg-primary text-white rounded-2xl shadow-lg hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 ${open ? "hidden" : ""}`}
      >
        <Sparkles className="w-5 h-5" />
        <span className="text-sm font-medium hidden sm:block">Ask AI</span>
        {wakeWordListening && (
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        )}
      </button>

      {/* Assistant Panel */}
      {open && (
        <div className="fixed bottom-0 right-0 md:bottom-6 md:right-6 z-50 w-full md:w-[420px] h-[80vh] md:h-[580px] bg-white dark:bg-slate-900 md:rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-purple-500/5">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                {isSpeaking && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                )}
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">Invio AI — CA & CS</p>
                <p className="text-xs text-muted-foreground">GST · Tax · Accounts · Business</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* TTS toggle */}
              <button
                onClick={() => { setSpeakEnabled(!speakEnabled); if (isSpeaking) stopSpeaking(); }}
                className={`p-2 rounded-lg transition-colors ${speakEnabled ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted"}`}
                title={speakEnabled ? "Voice responses on" : "Voice responses off"}
              >
                {speakEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              {isSpeaking && (
                <button
                  onClick={stopSpeaking}
                  className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                  title="Stop speaking"
                >
                  <VolumeX className="w-4 h-4" />
                </button>
              )}
              {confirmClear ? (
                <div className="flex items-center gap-1 bg-red-50 dark:bg-red-950/30 rounded-lg px-2 py-1">
                  <span className="text-xs text-red-600 dark:text-red-400">Clear history?</span>
                  <button onClick={clearHistory} className="text-xs font-semibold text-red-600 hover:text-red-700 px-1">Yes</button>
                  <button onClick={() => setConfirmClear(false)} className="text-xs text-muted-foreground hover:text-foreground px-1">No</button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="p-2 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-500 rounded-lg transition-colors text-muted-foreground"
                  title="Clear conversation history"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => { setOpen(false); stopSpeaking(); }} className="p-2 hover:bg-muted rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loadingHistory && (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">Loading conversation history...</span>
              </div>
            )}
            {!loadingHistory && messages.length === 0 && (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-foreground">
                    <p>Namaste! Main aapka CA & CS hun. GST returns, tax planning, invoicing — kuch bhi poochhein. Aap Hindi ya English mein baat kar sakte hain.</p>
                    <p className="mt-2 text-muted-foreground text-xs">Say <strong>"Hey Invio"</strong> to activate hands-free mode.</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">Try asking:</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs px-3 py-1.5 bg-muted hover:bg-primary/10 hover:text-primary rounded-full transition-colors border border-border"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex items-start gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${msg.role === "user" ? "bg-primary text-white" : "bg-primary/10"}`}>
                  {msg.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5 text-primary" />}
                </div>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-white rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  {msg.action && (
                    <button
                      onClick={() => handleAction(msg.action!.route, msg.action!.params)}
                      className="mt-2 flex items-center gap-1.5 text-xs font-medium bg-primary/20 hover:bg-primary/30 text-primary rounded-lg px-3 py-1.5 transition-colors"
                    >
                      <ArrowRight className="w-3 h-3" />
                      Open {msg.action.route.split("/").filter(Boolean).join(" › ")}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border bg-background/50">
            {wakeWordActive && (
              <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-green-50 dark:bg-green-950/20 rounded-xl border border-green-200 dark:border-green-800/50">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs text-green-600 font-medium">Wake word detected — listening...</span>
              </div>
            )}
            {isRecording && (
              <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-800/50">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-xs text-red-600 font-medium">Listening... tap mic to send</span>
              </div>
            )}
            {isTranscribing && (
              <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-primary/5 rounded-xl">
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                <span className="text-xs text-primary">Processing voice...</span>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={toggleRecording}
                disabled={isTranscribing || loading}
                className={`p-2.5 rounded-xl transition-all disabled:opacity-50 ${
                  isRecording
                    ? "bg-red-500 text-white scale-110"
                    : "bg-muted hover:bg-primary/10 hover:text-primary text-muted-foreground"
                }`}
                title={isRecording ? "Stop & send" : "Voice input"}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                placeholder={isRecording ? "Listening..." : "GST, tax, invoice — kuch bhi poochhein..."}
                disabled={isRecording || isTranscribing}
                className="flex-1 px-4 py-2.5 text-sm bg-muted rounded-xl border-0 focus:ring-2 focus:ring-primary/20 focus:bg-background transition-all outline-none disabled:opacity-60"
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || busy}
                className="p-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
