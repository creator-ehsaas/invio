"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Check, Loader2, Mic, MicOff, Sparkles } from "lucide-react";
import { INDIAN_STATES } from "@/types/database";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function NewCustomerPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isParsingVoice, setIsParsingVoice] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);

  const { isRecording, isTranscribing, toggleRecording } = useVoiceInput({
    onTranscript: async (text) => {
      if (!text.trim()) return;
      setVoiceHint(`Heard: "${text}"`);
      setIsParsingVoice(true);
      try {
        const res = await fetch("/api/parse-customer-voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: text }),
        });
        if (res.ok) {
          const { data } = await res.json();
          if (data?.name) setName(data.name);
          if (data?.business_name) setBusinessName(data.business_name);
          if (data?.phone) setPhone(data.phone);
          if (data?.email) setEmail(data.email);
          if (data?.gstin) setGstin(data.gstin);
          if (data?.street || data?.city || data?.state || data?.pincode) {
            setBillingAddress(prev => ({
              street: data.street || prev.street,
              city: data.city || prev.city,
              state: data.state || prev.state,
              pincode: data.pincode || prev.pincode,
            }));
          }
          setVoiceHint(null);
        }
      } catch { setVoiceHint(null); }
      finally { setIsParsingVoice(false); }
    },
    onError: (err) => setError(err),
  });

  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");
  const [billingAddress, setBillingAddress] = useState({
    street: "",
    city: "",
    state: "",
    pincode: "",
  });
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [shippingAddress, setShippingAddress] = useState({
    street: "",
    city: "",
    state: "",
    pincode: "",
  });

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

      const { error: insertError } = await supabase.from("customers").insert({
        business_id: userData.business_id,
        name,
        business_name: businessName || null,
        email: email || null,
        phone: phone || null,
        gstin: gstin || null,
        billing_address: billingAddress,
        shipping_address: sameAsBilling ? billingAddress : shippingAddress,
      });

      if (insertError) throw insertError;

      router.push("/customers");
    } catch (err: any) {
      setError(err.message || "Failed to create customer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild className="rounded-md">
          <Link href="/customers">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Add Customer</h1>
          <p className="text-muted-foreground mt-1">Create a new customer record</p>
        </div>
        <Button
          type="button"
          onClick={toggleRecording}
          disabled={isTranscribing || isParsingVoice}
          variant={isRecording ? "destructive" : "secondary"}
          size="sm"
          className={`gap-2 rounded-md ${isRecording ? "animate-pulse" : ""}`}
        >
          {isRecording ? <MicOff className="w-4 h-4" /> : isTranscribing || isParsingVoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
          {isRecording ? "Stop" : isTranscribing ? "Transcribing..." : isParsingVoice ? "Filling..." : "Voice"}
        </Button>
      </div>

      {(isRecording || voiceHint) && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-md text-sm ${isRecording ? "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50 text-red-600" : "bg-primary/5 border border-primary/20 text-primary"}`}>
          {isRecording ? <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /> : <Sparkles className="w-4 h-4 shrink-0" />}
          {isRecording ? "Listening... Say customer name, phone, GSTIN and address" : voiceHint}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-base font-bold text-foreground mb-4">Basic Information</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Contact Name <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="John Doe"
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Business Name</label>
              <Input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Acme Corp"
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phone</label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="h-8"
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">GSTIN</label>
              <Input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
                className="h-8 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Billing Address */}
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-base font-bold text-foreground mb-4">Billing Address</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Street Address</label>
              <Input
                type="text"
                value={billingAddress.street}
                onChange={(e) => setBillingAddress({ ...billingAddress, street: e.target.value })}
                placeholder="123 Main Street"
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">City</label>
              <Input
                type="text"
                value={billingAddress.city}
                onChange={(e) => setBillingAddress({ ...billingAddress, city: e.target.value })}
                placeholder="Mumbai"
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">State</label>
              <select
                value={billingAddress.state}
                onChange={(e) => setBillingAddress({ ...billingAddress, state: e.target.value })}
                className="h-8 w-full rounded-xs border border-input bg-transparent px-2.5 py-1 text-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none text-foreground dark:bg-input/35"
              >
                <option value="">Select state</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pincode</label>
              <Input
                type="text"
                value={billingAddress.pincode}
                onChange={(e) => setBillingAddress({ ...billingAddress, pincode: e.target.value })}
                placeholder="400001"
                maxLength={6}
                className="h-8"
              />
            </div>
          </div>
        </div>

        {/* Shipping Address */}
        <div className="bg-card rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-foreground">Shipping Address</h2>
            <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sameAsBilling}
                onChange={(e) => setSameAsBilling(e.target.checked)}
                className="rounded text-primary focus:ring-primary/20"
              />
              Same as billing
            </label>
          </div>
          {!sameAsBilling && (
            <div className="grid sm:grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-150">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Street Address</label>
                <Input
                  type="text"
                  value={shippingAddress.street}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, street: e.target.value })}
                  placeholder="123 Main Street"
                  className="h-8"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">City</label>
                <Input
                  type="text"
                  value={shippingAddress.city}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                  placeholder="Mumbai"
                  className="h-8"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">State</label>
                <select
                  value={shippingAddress.state}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                  className="h-8 w-full rounded-xs border border-input bg-transparent px-2.5 py-1 text-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none text-foreground dark:bg-input/35"
                >
                  <option value="">Select state</option>
                  {INDIAN_STATES.map((state) => (
                    <option key={state.code} value={state.name}>
                      {state.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pincode</label>
                <Input
                  type="text"
                  value={shippingAddress.pincode}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, pincode: e.target.value })}
                  placeholder="400001"
                  maxLength={6}
                  className="h-8"
                />
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex gap-3">
          <Button variant="outline" size="sm" asChild className="px-6 rounded-md h-9">
            <Link href="/customers">Cancel</Link>
          </Button>
          <Button
            type="submit"
            disabled={saving || !name}
            className="flex-1 rounded-md h-9"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-1" />
                Add Customer
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
