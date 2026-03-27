"use client";

import Link from "next/link";
import {
  Mic,
  FileText,
  Users,
  Package,
  BarChart3,
  Smartphone,
  Globe,
  Zap,
  Shield,
  ArrowRight,
  Check,
  Star,
  Play,
  IndianRupee,
  MessageCircle,
  Sparkles,
} from "lucide-react";

const features = [
  {
    icon: Mic,
    title: "Voice-First Invoicing",
    description: "Speak in Hindi, Marathi, or English. Our AI understands natural language and creates invoices instantly.",
  },
  {
    icon: Sparkles,
    title: "AI That Learns",
    description: "The more you use it, the smarter it gets. AI learns your preferences and improves accuracy over time.",
  },
  {
    icon: FileText,
    title: "GST Compliant",
    description: "Automatic CGST/SGST/IGST calculation. Generate GST-ready invoices and GSTR-1 reports effortlessly.",
  },
  {
    icon: Users,
    title: "Customer Management",
    description: "Keep track of all your customers, their purchase history, and outstanding payments in one place.",
  },
  {
    icon: Package,
    title: "Inventory Tracking",
    description: "Monitor stock levels, get low-stock alerts, and auto-add items from invoices to your inventory.",
  },
  {
    icon: BarChart3,
    title: "Business Insights",
    description: "AI-powered analytics show you revenue trends, top customers, and actionable business tips.",
  },
];

const templates = [
  { name: "Minimal", desc: "Clean & modern", color: "from-slate-100 to-slate-200", accent: "bg-slate-800" },
  { name: "Professional", desc: "With branding", color: "from-blue-900 to-blue-950", accent: "bg-blue-500" },
  { name: "GST Formal", desc: "Tax invoice", color: "from-slate-200 to-slate-300", accent: "bg-slate-600" },
  { name: "Export", desc: "International", color: "from-red-50 to-red-100", accent: "bg-red-500" },
];

const testimonials = [
  {
    name: "Rajesh Kumar",
    business: "Kumar Kirana Store",
    location: "Pune",
    text: "Ab invoice banana bahut easy ho gaya. Bas bol deta hu aur invoice ready!",
    rating: 5,
  },
  {
    name: "Priya Sharma",
    business: "Sharma Textiles",
    location: "Mumbai",
    text: "GST calculation automatic hota hai. Time bachta hai aur mistakes bhi nahi hoti.",
    rating: 5,
  },
  {
    name: "Amit Patel",
    business: "Patel Electronics",
    location: "Ahmedabad",
    text: "WhatsApp pe invoice share karna itna simple hai. Customers ko bhi pasand aata hai.",
    rating: 5,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-blue-500 rounded-xl flex items-center justify-center">
                <Mic className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-bold text-foreground">Invio</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#templates" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Templates</a>
              <a href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Testimonials</a>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="px-4 py-2 bg-gradient-to-br from-primary to-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 transition-all"
              >
                Get Started Free
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" />
              AI-Powered Invoicing for Indian Businesses
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
              Create Invoices by
              <span className="bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent"> Speaking</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              Speak in Hindi, Marathi, or English. Invio's AI creates GST-compliant invoices instantly.
              Built for Indian small businesses.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-br from-primary to-blue-500 text-white font-semibold rounded-2xl shadow-lg shadow-primary/20 hover:opacity-90 transition-all flex items-center justify-center gap-2"
              >
                Start Free Trial
                <ArrowRight className="w-5 h-5" />
              </Link>
              <button className="w-full sm:w-auto px-8 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-foreground font-semibold rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                <Play className="w-5 h-5" />
                Watch Demo
              </button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              No credit card required. Free for first 50 invoices.
            </p>
          </div>

          {/* Hero Visual */}
          <div className="mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-slate-900 to-transparent z-10 pointer-events-none h-32 bottom-0 top-auto" />
            <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-800/50 shadow-2xl shadow-slate-200/50 dark:shadow-slate-950/50 p-4 sm:p-8 max-w-5xl mx-auto">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Voice Input Demo */}
                <div className="bg-gradient-to-br from-primary/5 to-blue-500/5 rounded-2xl p-6 border border-primary/10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                      <Mic className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Voice Input</p>
                      <p className="text-sm text-muted-foreground">Speak naturally</p>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                    <p className="text-sm text-muted-foreground italic">
                      "Rahul Sharma ke naam pe bill banao. 4 kilo wheat flour 200 rupees, 1 kilo toor dal 180 rupees. 5% GST lagao."
                    </p>
                  </div>
                </div>

                {/* Invoice Output Demo */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <p className="font-semibold text-foreground">Generated Invoice</p>
                    <span className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-1 rounded-full">GST Ready</span>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Customer</span>
                      <span className="font-medium">Rahul Sharma</span>
                    </div>
                    <div className="border-t border-dashed pt-3 space-y-2">
                      <div className="flex justify-between">
                        <span>Wheat Flour (4 kg)</span>
                        <span>₹200</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Toor Dal (1 kg)</span>
                        <span>₹180</span>
                      </div>
                    </div>
                    <div className="border-t pt-3 space-y-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal</span>
                        <span>₹380</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>GST (5%)</span>
                        <span>₹19</span>
                      </div>
                      <div className="flex justify-between font-bold text-lg pt-2">
                        <span>Total</span>
                        <span className="text-primary">₹399</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Everything You Need to Run Your Business
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Powerful features designed specifically for Indian small businesses
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Templates Section */}
      <section id="templates" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Professional Invoice Templates
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Choose from 4 beautiful templates. Download as PDF or share via WhatsApp.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {templates.map((template) => (
              <div
                key={template.name}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-center hover:border-primary/50 hover:shadow-lg transition-all group"
              >
                {/* Mini Invoice Preview */}
                <div className={`w-full aspect-[3/4] bg-gradient-to-b ${template.color} rounded-xl mb-4 p-3 overflow-hidden shadow-inner`}>
                  <div className="bg-white rounded-lg h-full p-2 text-left shadow-sm">
                    {/* Header */}
                    <div className={`h-2 w-16 ${template.accent} rounded mb-2`} />
                    <div className="h-1.5 w-10 bg-slate-200 rounded mb-3" />

                    {/* Info row */}
                    <div className="flex justify-between mb-3">
                      <div>
                        <div className="h-1 w-8 bg-slate-300 rounded mb-1" />
                        <div className="h-1.5 w-12 bg-slate-200 rounded" />
                      </div>
                      <div className="text-right">
                        <div className="h-1 w-6 bg-slate-300 rounded mb-1 ml-auto" />
                        <div className="h-1.5 w-10 bg-slate-200 rounded" />
                      </div>
                    </div>

                    {/* Table header */}
                    <div className={`h-1.5 w-full ${template.accent} opacity-20 rounded mb-1`} />

                    {/* Table rows */}
                    <div className="space-y-1 mb-3">
                      <div className="flex justify-between">
                        <div className="h-1 w-14 bg-slate-200 rounded" />
                        <div className="h-1 w-6 bg-slate-200 rounded" />
                      </div>
                      <div className="flex justify-between">
                        <div className="h-1 w-12 bg-slate-200 rounded" />
                        <div className="h-1 w-5 bg-slate-200 rounded" />
                      </div>
                      <div className="flex justify-between">
                        <div className="h-1 w-10 bg-slate-200 rounded" />
                        <div className="h-1 w-6 bg-slate-200 rounded" />
                      </div>
                    </div>

                    {/* Totals */}
                    <div className="border-t border-slate-100 pt-1">
                      <div className="flex justify-between mb-0.5">
                        <div className="h-1 w-6 bg-slate-300 rounded" />
                        <div className="h-1 w-8 bg-slate-300 rounded" />
                      </div>
                      <div className="flex justify-between">
                        <div className={`h-1.5 w-8 ${template.accent} rounded`} />
                        <div className={`h-1.5 w-10 ${template.accent} rounded`} />
                      </div>
                    </div>
                  </div>
                </div>
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{template.name}</h3>
                <p className="text-sm text-muted-foreground">{template.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-8">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MessageCircle className="w-5 h-5 text-green-500" />
              <span>WhatsApp Sharing</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <FileText className="w-5 h-5 text-red-500" />
              <span>PDF Download</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Globe className="w-5 h-5 text-blue-500" />
              <span>Multi-language</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Shield className="w-5 h-5 text-emerald-500" />
              <span>GST Compliant</span>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Loved by Indian Businesses
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Join thousands of shopkeepers who've simplified their billing
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(t.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-foreground mb-4">"{t.text}"</p>
                <div>
                  <p className="font-semibold text-foreground">{t.name}</p>
                  <p className="text-sm text-muted-foreground">{t.business}, {t.location}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-gradient-to-br from-primary to-blue-500 rounded-3xl p-8 sm:p-12 text-white">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Ready to Simplify Your Billing?
            </h2>
            <p className="text-lg text-white/80 mb-8 max-w-2xl mx-auto">
              Join 10,000+ Indian businesses who've made invoicing effortless with voice
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-primary font-semibold rounded-2xl hover:bg-white/90 transition-all"
            >
              Start Free Today
              <ArrowRight className="w-5 h-5" />
            </Link>
            <p className="mt-4 text-sm text-white/60">
              No credit card required. 50 free invoices.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-blue-500 rounded-xl flex items-center justify-center">
                <Mic className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-bold text-foreground">Invio</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-foreground transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-foreground transition-colors">Contact</a>
            </div>
            <p className="text-sm text-muted-foreground">
              Made with love in India
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
