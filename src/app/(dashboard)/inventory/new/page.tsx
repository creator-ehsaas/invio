"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Check, Loader2, Sparkles, Mic, MicOff } from "lucide-react";
import { useVoiceInput } from "@/hooks/use-voice-input";

const UNITS = ["pcs", "kg", "g", "ltr", "ml", "m", "cm", "ft", "box", "pack", "dozen", "pair"];
const GST_RATES = [0, 5, 12, 18, 28];

export default function NewInventoryPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isParsingVoice, setIsParsingVoice] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [currentStock, setCurrentStock] = useState<number>(0);
  const [reorderLevel, setReorderLevel] = useState<number>(10);
  const [gstRate, setGstRate] = useState<number>(18);

  const { isRecording, isTranscribing, toggleRecording } = useVoiceInput({
    onTranscript: async (text) => {
      if (!text.trim()) return;
      setVoiceHint(`Heard: "${text}"`);
      setIsParsingVoice(true);
      try {
        const res = await fetch("/api/parse-inventory-voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: text }),
        });
        if (res.ok) {
          const { data } = await res.json();
          if (data?.name) setName(data.name);
          if (data?.description) setDescription(data.description);
          if (data?.hsn_code) setHsnCode(data.hsn_code);
          if (data?.unit) setUnit(data.unit);
          if (data?.unit_price) setUnitPrice(data.unit_price);
          if (data?.current_stock !== undefined) setCurrentStock(data.current_stock);
          if (data?.reorder_level !== undefined) setReorderLevel(data.reorder_level);
          if (data?.gst_rate !== undefined) setGstRate(data.gst_rate);
          setVoiceHint(null);
        }
      } catch { setVoiceHint(null); }
      finally { setIsParsingVoice(false); }
    },
    onError: (err) => setError(err),
  });

  const generateSku = () => {
    const prefix = name.slice(0, 3).toUpperCase() || "ITM";
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    setSku(`${prefix}-${random}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: userData } = await supabase
        .from("users")
        .select("business_id")
        .eq("id", user.id)
        .single();

      if (!userData?.business_id) throw new Error("No business found");

      const { error: insertError } = await supabase.from("inventory_items").insert({
        business_id: userData.business_id,
        name,
        sku: sku || undefined,
        description: description || null,
        hsn_code: hsnCode || null,
        unit,
        unit_price: unitPrice,
        current_stock: currentStock,
        reorder_level: reorderLevel,
        gst_rate: gstRate,
      });

      if (insertError) throw insertError;

      router.push("/inventory");
    } catch (err: any) {
      setError(err.message || "Failed to create item");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/inventory"
          className="p-2 rounded-xl hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Add Item</h1>
          <p className="text-muted-foreground mt-1">Add a new inventory item</p>
        </div>
        <button
          onClick={toggleRecording}
          disabled={isTranscribing || isParsingVoice}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
            isRecording ? "bg-red-500 text-white animate-pulse" : "bg-primary/10 text-primary hover:bg-primary/20"
          }`}
        >
          {isRecording ? <MicOff className="w-4 h-4" /> : isTranscribing || isParsingVoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
          {isRecording ? "Stop" : isTranscribing ? "Transcribing..." : isParsingVoice ? "Filling..." : "Voice"}
        </button>
      </div>

      {(isRecording || voiceHint) && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${isRecording ? "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50 text-red-600" : "bg-primary/5 border border-primary/20 text-primary"}`}>
          {isRecording ? <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /> : <Sparkles className="w-4 h-4 shrink-0" />}
          {isRecording ? "Listening... Say item name, price, stock and GST rate" : voiceHint}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Item Details</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Item Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Product name"
                className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">SKU</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase())}
                  placeholder="Auto-generate"
                  className="flex-1 bg-secondary border-none rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
                />
                <button
                  type="button"
                  onClick={generateSku}
                  className="px-4 py-2 bg-muted rounded-xl text-sm font-medium hover:bg-muted/80 transition-colors"
                >
                  Generate
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                HSN Code
                <Sparkles className="w-3 h-3 text-primary" />
              </label>
              <input
                type="text"
                value={hsnCode}
                onChange={(e) => setHsnCode(e.target.value)}
                placeholder="AI will suggest"
                className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-sm font-medium text-foreground">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Item description (optional)"
                rows={2}
                className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none resize-none"
              />
            </div>
          </div>
        </div>

        {/* Pricing & Stock */}
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Pricing & Stock</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Unit Price (₹) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={unitPrice}
                onChange={(e) => setUnitPrice(Number(e.target.value))}
                required
                min={0}
                step="0.01"
                placeholder="0.00"
                className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Current Stock</label>
              <input
                type="number"
                value={currentStock}
                onChange={(e) => setCurrentStock(Number(e.target.value))}
                min={0}
                placeholder="0"
                className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Reorder Level</label>
              <input
                type="number"
                value={reorderLevel}
                onChange={(e) => setReorderLevel(Number(e.target.value))}
                min={0}
                placeholder="10"
                className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">GST Rate</label>
              <select
                value={gstRate}
                onChange={(e) => setGstRate(Number(e.target.value))}
                className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
              >
                {GST_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}%
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-4">
          <Link
            href="/inventory"
            className="px-6 py-3 border border-slate-200 dark:border-slate-800 rounded-xl text-foreground font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || !name || unitPrice <= 0}
            className="flex-1 py-3 bg-gradient-to-br from-primary to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Add Item
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
