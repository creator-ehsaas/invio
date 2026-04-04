"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X, Send, Loader2, ArrowRight } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  action?: { route: string; params?: Record<string, string> };
}

const SUGGESTIONS = [
  "Create invoice for Ram",
  "Who owes me money?",
  "Add expense ₹500 for fuel",
  "Show my P&L this month",
  "Draft a payment reminder",
];

export function AIAssistant() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    setInput("");
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });

      if (res.ok) {
        const data = await res.json();
        const assistantMsg: Message = {
          role: "assistant",
          content: data.message || "Done!",
        };

        if (data.type === "action" && data.action === "navigate" && data.route) {
          assistantMsg.action = { route: data.route, params: data.params };
        }

        setMessages(prev => [...prev, assistantMsg]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Try again." }]);
    }

    setLoading(false);
  };

  const handleAction = (route: string, params?: Record<string, string>) => {
    // Build URL with params as query string for pre-filling forms
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v) searchParams.set(k, v);
      });
    }
    const query = searchParams.toString();
    router.push(`${route}${query ? `?${query}` : ""}`);
    setOpen(false);
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 flex items-center gap-2 px-4 py-3 bg-primary text-white rounded-2xl shadow-lg hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 ${
          open ? "hidden" : ""
        }`}
      >
        <Sparkles className="w-5 h-5" />
        <span className="text-sm font-medium hidden sm:block">Ask AI</span>
      </button>

      {/* Assistant Panel */}
      {open && (
        <div className="fixed bottom-0 right-0 md:bottom-6 md:right-6 z-50 w-full md:w-96 h-[70vh] md:h-[520px] bg-white dark:bg-slate-900 md:rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-purple-500/5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">AI Assistant</p>
                <p className="text-xs text-muted-foreground">Ask anything about your business</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground text-center py-2">
                  Try one of these, or type your own:
                </p>
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
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-white rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  <p className="leading-relaxed">{msg.content}</p>
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
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Ask or create anything..."
                className="flex-1 px-4 py-2.5 text-sm bg-muted rounded-xl border-0 focus:ring-2 focus:ring-primary/20 focus:bg-background transition-all outline-none"
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
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
