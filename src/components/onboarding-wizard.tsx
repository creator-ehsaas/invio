"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Building2, FileText, Users, Package, CheckCircle2,
  ArrowRight, ArrowLeft, Sparkles, Keyboard,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  action?: { label: string; href: string };
  tip?: string;
}

const STEPS: Step[] = [
  {
    id: "business",
    title: "Set up your business",
    description: "Add your GST number, business name, address, and logo. This appears on all your invoices and documents.",
    icon: <Building2 className="h-8 w-8" />,
    color: "text-violet-600 bg-violet-50 dark:bg-violet-950",
    action: { label: "Go to Settings", href: "/settings" },
    tip: "Your GSTIN is required for generating compliant GST invoices.",
  },
  {
    id: "customer",
    title: "Add your first customer",
    description: "Add customer details including GSTIN, address, and contact info. Invio auto-calculates CGST/SGST vs IGST based on state.",
    icon: <Users className="h-8 w-8" />,
    color: "text-blue-600 bg-blue-50 dark:bg-blue-950",
    action: { label: "Add Customer", href: "/customers/new" },
    tip: "Add customer GSTIN to enable B2B invoice compliance.",
  },
  {
    id: "invoice",
    title: "Create your first invoice",
    description: "Generate a GST-compliant invoice in seconds. You can dictate it by voice, or use AI to fill details automatically.",
    icon: <FileText className="h-8 w-8" />,
    color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950",
    action: { label: "New Invoice", href: "/invoices/new" },
    tip: "Try saying \"Hey Invio, create invoice for 50,000 rupees\" to use voice.",
  },
  {
    id: "inventory",
    title: "Add inventory items",
    description: "Manage your product catalog with HSN codes, GST rates, and stock levels. Items auto-populate when creating invoices.",
    icon: <Package className="h-8 w-8" />,
    color: "text-amber-600 bg-amber-50 dark:bg-amber-950",
    action: { label: "Add Item", href: "/inventory/new" },
    tip: "Set HSN codes for each item to ensure correct GST classification.",
  },
  {
    id: "shortcuts",
    title: "Learn the shortcuts",
    description: "Invio is built for speed. Use Cmd+K to open the command palette, navigate with G+I for Invoices, G+C for Customers, and more.",
    icon: <Keyboard className="h-8 w-8" />,
    color: "text-slate-600 bg-slate-100 dark:bg-slate-800",
    tip: "Press ? anywhere to see all keyboard shortcuts.",
  },
];

const STORAGE_KEY = "invio_onboarding_completed";
const STEP_KEY = "invio_onboarding_step";

export function OnboardingWizard() {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [completed, setCompleted] = React.useState<Set<string>>(new Set());
  const router = useRouter();

  React.useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    const savedStep = localStorage.getItem(STEP_KEY);
    if (!done) {
      setOpen(true);
      if (savedStep) setStep(parseInt(savedStep, 10));
    }
  }, []);

  const currentStep = STEPS[step];
  const progress = ((step) / STEPS.length) * 100;

  const handleNext = () => {
    const newCompleted = new Set(completed).add(currentStep.id);
    setCompleted(newCompleted);
    if (step < STEPS.length - 1) {
      const nextStep = step + 1;
      setStep(nextStep);
      localStorage.setItem(STEP_KEY, String(nextStep));
    } else {
      finish();
    }
  };

  const handleAction = () => {
    if (currentStep.action) {
      router.push(currentStep.action.href);
      handleNext();
    }
  };

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    localStorage.removeItem(STEP_KEY);
    setOpen(false);
  };

  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) finish(); }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden gap-0" showCloseButton={false}>
        <DialogTitle className="sr-only">Getting started with Invio</DialogTitle>
        <DialogDescription className="sr-only">A guided tour to set up your business profile, customers, invoices, and inventory</DialogDescription>
        {/* Header */}
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">Getting started</span>
            </div>
            <Badge variant="secondary" className="text-xs">
              {step + 1} / {STEPS.length}
            </Badge>
          </div>
          <Progress value={progress} className="h-1.5 mb-1" />
          <div className="flex justify-between mt-2">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => { setStep(i); localStorage.setItem(STEP_KEY, String(i)); }}
                className={cn(
                  "h-1.5 flex-1 mx-0.5 rounded-full transition-all",
                  i <= step ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="px-6 py-5">
          <div className={cn("inline-flex items-center justify-center h-16 w-16 rounded-2xl mb-4", currentStep.color)}>
            {currentStep.icon}
          </div>
          <h2 className="text-xl font-semibold mb-2">{currentStep.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">{currentStep.description}</p>
          {currentStep.tip && (
            <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
              <span>{currentStep.tip}</span>
            </div>
          )}
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 px-6 pb-3">
          {STEPS.map((s) => (
            <div
              key={s.id}
              className={cn(
                "h-1.5 rounded-full transition-all",
                completed.has(s.id) ? "bg-primary flex-1" : "bg-muted w-6"
              )}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={finish}>
              Skip tour
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {currentStep.action && (
              <Button variant="outline" size="sm" onClick={handleAction}>
                {currentStep.action.label}
              </Button>
            )}
            <Button size="sm" className="gap-1.5" onClick={isLast ? finish : handleNext}>
              {isLast ? (
                <><CheckCircle2 className="h-4 w-4" /> Let&apos;s go!</>
              ) : (
                <>Next <ArrowRight className="h-4 w-4" /></>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Trigger to re-open the wizard from Settings
export function useOnboarding() {
  const reopen = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STEP_KEY);
    window.location.reload();
  };
  return { reopen };
}
