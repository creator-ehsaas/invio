"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowRight, ChevronLeft, CheckCircle, Sparkles } from "lucide-react";

export function SignupForm() {
  const [step, setStep] = useState<"account" | "business">("account");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [gstin, setGstin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setStep("business");
  };

  const handleBusinessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (!authData.user) {
      setError("Failed to create account");
      setLoading(false);
      return;
    }

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .insert({
        name: businessName,
        gstin: gstin || null,
        email: email,
      })
      .select()
      .single();

    if (businessError) {
      setError("Failed to create business: " + businessError.message);
      setLoading(false);
      return;
    }

    const { error: userError } = await supabase
      .from("users")
      .insert({
        id: authData.user.id,
        business_id: business.id,
        email: email,
        name: name,
        role: "owner",
      });

    if (userError) {
      setError("Failed to create user profile: " + userError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  if (step === "account") {
    return (
      <div className="space-y-6">
        <header className="text-center md:text-left">
          {/* Progress indicator */}
          <div className="flex items-center gap-2 mb-4">
            <div className="h-1 flex-1 bg-primary rounded-full"></div>
            <div className="h-1 flex-1 bg-muted rounded-full"></div>
          </div>
          <h2 className="text-2xl font-semibold text-foreground mb-2">Create your account</h2>
          <p className="text-muted-foreground text-sm">Step 1 of 2: Personal details</p>
        </header>

        <form onSubmit={handleAccountSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="full-name">
              Full Name
            </label>
            <input
              className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
              id="full-name"
              type="text"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="signup-email">
              Email Address
            </label>
            <input
              className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
              id="signup-email"
              type="email"
              placeholder="john@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="signup-password">
              Create Password
            </label>
            <input
              className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
              id="signup-password"
              type="password"
              placeholder="Min. 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            className="w-full bg-gradient-to-br from-primary to-blue-500 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
            type="submit"
          >
            <span>Next Step</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <footer className="text-center pt-4">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            Already have an account? <span className="font-bold">Log In</span>
          </Link>
        </footer>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="text-center md:text-left">
        {/* Progress indicator - both filled */}
        <div className="flex items-center gap-2 mb-4">
          <div className="h-1 flex-1 bg-primary rounded-full"></div>
          <div className="h-1 flex-1 bg-primary rounded-full"></div>
        </div>
        <h2 className="text-2xl font-semibold text-foreground mb-2">Business Information</h2>
        <p className="text-muted-foreground text-sm">Step 2 of 2: Let&apos;s set up your workspace.</p>
      </header>

      <form onSubmit={handleBusinessSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="business-name">
            Legal Business Name
          </label>
          <input
            className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50"
            id="business-name"
            type="text"
            placeholder="Acme Corp LLC"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between">
            <label className="text-sm font-medium text-foreground" htmlFor="gstin">
              GSTIN / Tax ID
            </label>
            <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest pt-1">
              Optional
            </span>
          </div>
          <input
            className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50"
            id="gstin"
            type="text"
            placeholder="22AAAAA0000A1Z5"
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            maxLength={15}
            disabled={loading}
          />
        </div>

        {/* AI Feature hint */}
        <div className="p-4 bg-orange-50 dark:bg-orange-950/20 rounded-xl border border-orange-200/50 dark:border-orange-800/30 flex gap-3">
          <Sparkles className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-orange-800 dark:text-orange-200 leading-relaxed">
            Our AI will automatically categorize your transactions and suggest HSN codes based on
            your business sector.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="pt-2">
          <button
            className="w-full bg-gradient-to-br from-primary to-blue-500 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
            type="submit"
            disabled={loading}
          >
            <span>{loading ? "Creating account..." : "Complete Setup"}</span>
            {!loading && <CheckCircle className="w-4 h-4" />}
          </button>
        </div>
      </form>

      <footer className="flex items-center justify-between pt-4">
        <button
          type="button"
          onClick={() => setStep("account")}
          disabled={loading}
          className="text-sm font-medium text-muted-foreground flex items-center gap-1 hover:text-foreground disabled:opacity-50"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <p className="text-[10px] text-muted-foreground text-right max-w-[180px]">
          By joining, you agree to our Terms of Service and Privacy Policy.
        </p>
      </footer>
    </div>
  );
}
