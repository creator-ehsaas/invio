"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSelector } from "@/components/language-selector";
import { VoiceRecorder } from "@/components/voice-recorder";
import { InvoiceForm } from "@/components/invoice-form";
import { Invoice, Language } from "@/types/invoice";

type AppState = "record" | "processing" | "result";

const EMPTY_INVOICE: Invoice = {
  buyer_name: null,
  items: [],
  subtotal: null,
  gst_amount: null,
  total: null,
  notes: null,
};

export default function Home() {
  const [language, setLanguage] = useState<Language>("hi-IN");
  const [state, setState] = useState<AppState>("record");
  const [transcript, setTranscript] = useState("");
  const [invoice, setInvoice] = useState<Invoice>(EMPTY_INVOICE);
  const [error, setError] = useState<string | null>(null);

  const handleTranscriptComplete = async (finalTranscript: string) => {
    setTranscript(finalTranscript);
    setState("processing");
    setError(null);

    try {
      const response = await fetch("/api/parse-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: finalTranscript }),
      });

      if (!response.ok) {
        throw new Error("Failed to parse invoice");
      }

      const data = await response.json();
      setInvoice(data.invoice);
      setState("result");
    } catch (err) {
      setError("Failed to extract invoice fields. Please try again.");
      setState("record");
      console.error("Parse error:", err);
    }
  };

  const handleReset = () => {
    setTranscript("");
    setInvoice(EMPTY_INVOICE);
    setError(null);
    setState("record");
  };

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Invio</h1>
          <p className="text-muted-foreground">
            Voice to Invoice — Speak in Hindi, Marathi, or English
          </p>
        </div>

        {state !== "result" && (
          <Card>
            <CardHeader>
              <CardTitle>Record Invoice</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <LanguageSelector
                selected={language}
                onSelect={setLanguage}
                disabled={state === "processing"}
              />

              <VoiceRecorder
                language={language}
                onTranscriptComplete={handleTranscriptComplete}
                disabled={state === "processing"}
              />

              {state === "processing" && (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    Extracting invoice fields...
                  </p>
                </div>
              )}

              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}
            </CardContent>
          </Card>
        )}

        {state === "result" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Final Transcript</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{transcript}</p>
              </CardContent>
            </Card>

            <InvoiceForm
              invoice={invoice}
              onChange={setInvoice}
              onReset={handleReset}
            />
          </div>
        )}
      </div>
    </main>
  );
}
