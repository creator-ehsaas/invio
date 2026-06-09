# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # Start Next.js dev server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint check

npm run electron:dev # Run as Electron desktop app (Next.js + Electron concurrently)
npm run cap:android  # Open Android project in Android Studio
npm run remotion:studio  # Preview Remotion video components
```

There is no test suite configured.

## Architecture

**Invio** is a GST-aware invoicing SaaS for Indian small businesses. It runs as a web app (Next.js), Electron desktop app, and Capacitor mobile app from the same codebase.

### Stack
- **Next.js 16** (App Router, Turbopack by default) with React 19 and TypeScript
- **Supabase** — auth and PostgreSQL database
- **Tailwind CSS v4** with shadcn/ui components
- **Groq SDK** — all AI inference (text + vision via Llama models)
- **DodoPayments** — subscription billing (Free / Pro Monthly / Pro Yearly)

### Route Groups
```
src/app/
  page.tsx                  # Root redirect
  (auth)/login, signup      # Public auth pages
  (dashboard)/              # Protected; layout.tsx does server-side auth + business load
    dashboard, invoices, purchases, estimates, bids
    customers, suppliers, inventory
    expenses, credit-notes, debit-notes
    reports/gstr1, gstr3b, pnl, receivables
    settings, subscription
  api/                      # Route handlers for AI and data operations
```

The `(dashboard)/layout.tsx` is a Server Component that fetches the authenticated `user` and `business` rows from Supabase and passes them to `<Navbar>`. All dashboard pages inherit this context.

### Key Library Modules

| File | Purpose |
|------|---------|
| `src/lib/ai-client.ts` | **All AI calls go here** — `aiChat()` and `aiVision()`. Never call Groq directly in routes. |
| `src/lib/supabase/server.ts` | Server-side Supabase client (uses `cookies()`) |
| `src/lib/supabase/client.ts` | Browser-side Supabase client |
| `src/lib/subscription.ts` | `getSubscriptionStatus()` and `incrementInvoiceCount()` |
| `src/lib/plans.ts` | Plan definitions and feature gates (`PLANS.FREE`, `PLANS.PRO_MONTHLY`, etc.) |
| `src/lib/dodo.ts` | DodoPayments integration |
| `src/types/database.ts` | All database types: `Business`, `User`, `Customer`, `Supplier`, `Invoice`, `PurchaseInvoice`, etc. |

### AI Patterns
- `aiChat(messages, { tier })` — text generation; pass `tier: "enhanced"` for Pro users
- `aiVision(base64, mimeType, prompt)` — invoice/receipt OCR using Llama 4 Scout vision model
- `resolveAITier(planId)` — maps subscription plan to `"standard" | "enhanced"`
- AI feature routes live under `src/app/api/ai-*/` and `src/app/api/parse-*/`
- Do not expose model or provider names in UI; use tier labels only

### GST Tax Calculation
- `isIntraState(businessGstin, customerGstin)` in `src/types/database.ts` determines CGST+SGST vs IGST
- Tax split logic: same state → CGST (half) + SGST (half); cross-state → IGST (full)
- State code is the first 2 digits of GSTIN

### UI Component Conventions
- All shared UI primitives are in `src/components/ui/`
- Key composite components: `DataView` (list/kanban/grid views with `ViewSwitcher`), `SidePanel` (slide-in detail panel), `AdvancedFilter`, `ActivityTimeline`, `RelationPicker`, `ConfirmDialog`
- Toast notifications via `sonner`
- Voice input via the `useVoiceInput` hook (`src/hooks/use-voice-input.ts`)
- Global `AIAssistant` (chat panel) and `CommandPalette` (Cmd+K) are mounted in the dashboard layout

### Subscription Gating
Check `isProUser` from `getSubscriptionStatus()` before allowing Pro features. Free tier: 50 invoices/month, standard AI. Pro: unlimited invoices, enhanced AI, all PDF templates, inventory management.

### Multi-Platform Notes
- `src/lib/electron.ts` — Electron-specific utilities; check `isElectron()` before using
- `src/lib/capacitor.ts` — Capacitor mobile utilities; `src/components/providers/CapacitorProvider.tsx` wraps mobile-specific setup
- `serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"]` in `next.config.ts` keeps native modules out of the browser bundle
