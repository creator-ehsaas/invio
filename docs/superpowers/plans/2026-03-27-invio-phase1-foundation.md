# Invio Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up Supabase authentication, database schema for businesses/users, and business profile management.

**Architecture:** Next.js App Router with Supabase for auth and database. Server-side auth validation via middleware. Client components for forms with server actions for mutations.

**Tech Stack:** Next.js 16, Supabase (Auth + Postgres), shadcn/ui, TypeScript

**Design Reference:** Clean blue/white dashboard style per user's design mockups.

---

## File Structure

```
src/
├── lib/
│   ├── supabase/
│   │   ├── client.ts          # Browser Supabase client
│   │   ├── server.ts          # Server Supabase client
│   │   └── middleware.ts      # Auth middleware helper
│   └── groq.ts                # (existing)
├── types/
│   ├── database.ts            # Supabase generated types
│   └── invoice.ts             # (existing)
├── components/
│   ├── ui/                    # (existing shadcn components)
│   ├── auth/
│   │   ├── login-form.tsx     # Login form component
│   │   └── signup-form.tsx    # Signup + business creation form
│   └── layout/
│       ├── navbar.tsx         # Top navigation bar
│       └── sidebar.tsx        # Side navigation (future)
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx       # Login page
│   │   └── signup/
│   │       └── page.tsx       # Signup page
│   ├── (dashboard)/
│   │   ├── layout.tsx         # Authenticated layout with navbar
│   │   ├── page.tsx           # Dashboard (redirect from /)
│   │   └── settings/
│   │       ├── page.tsx       # Business profile settings
│   │       └── actions.ts     # Server actions for settings
│   ├── layout.tsx             # Root layout
│   └── page.tsx               # Landing/redirect logic
└── middleware.ts              # Auth middleware
supabase/
└── migrations/
    └── 001_initial_schema.sql # Database schema
```

---

## Task 1: Install Supabase Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Supabase packages**

Run:
```bash
npm install @supabase/supabase-js @supabase/ssr
```

Expected: Packages added to package.json dependencies

- [ ] **Step 2: Verify installation**

Run:
```bash
npm ls @supabase/supabase-js @supabase/ssr
```

Expected: Both packages listed without errors

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add supabase dependencies"
```

---

## Task 2: Configure Supabase Environment Variables

**Files:**
- Modify: `.env.local`
- Create: `.env.example`

- [ ] **Step 1: Add Supabase env vars to .env.local**

Add to `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Note: Get these values from Supabase Dashboard > Project Settings > API

- [ ] **Step 2: Create .env.example for reference**

Create `.env.example`:
```
# Groq API
GROQ_API_KEY=your_groq_api_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: add supabase env vars template"
```

---

## Task 3: Create Supabase Client Utilities

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Create browser client**

Create `src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 2: Create server client**

Create `src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component - ignore
          }
        },
      },
    }
  );
}
```

- [ ] **Step 3: Create middleware helper**

Create `src/lib/supabase/middleware.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users to login (except public routes)
  const publicRoutes = ["/login", "/signup", "/"];
  const isPublicRoute = publicRoutes.some(
    (route) => request.nextUrl.pathname === route
  );

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (user && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/
git commit -m "feat: add supabase client utilities"
```

---

## Task 4: Create Auth Middleware

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Create middleware file**

Create `src/middleware.ts`:
```typescript
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc)
     * - api routes (handled separately)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/).*)",
  ],
};
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add auth middleware"
```

---

## Task 5: Create Database Schema

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Create migrations directory**

Run:
```bash
mkdir -p supabase/migrations
```

- [ ] **Step 2: Create initial schema migration**

Create `supabase/migrations/001_initial_schema.sql`:
```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Businesses table
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  gstin TEXT,
  pan TEXT,
  state_code TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  signature_url TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_name TEXT,
  bank_branch TEXT,
  upi_id TEXT,
  invoice_prefix TEXT DEFAULT 'INV',
  next_invoice_number INTEGER DEFAULT 1,
  financial_year TEXT DEFAULT '24-25',
  default_template TEXT DEFAULT 'professional',
  accent_color TEXT DEFAULT '#3b82f6',
  terms_conditions TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table (links to Supabase auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'owner' CHECK (role IN ('owner', 'staff')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can only see their own business
CREATE POLICY "Users can view own business" ON businesses
  FOR SELECT USING (
    id IN (SELECT business_id FROM users WHERE id = auth.uid())
  );

-- Users can only update their own business (owners only)
CREATE POLICY "Owners can update own business" ON businesses
  FOR UPDATE USING (
    id IN (SELECT business_id FROM users WHERE id = auth.uid() AND role = 'owner')
  );

-- Users can insert a business (during signup)
CREATE POLICY "Users can create business" ON businesses
  FOR INSERT WITH CHECK (true);

-- Users can only see themselves
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (id = auth.uid());

-- Users can update themselves
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (id = auth.uid());

-- Users can insert their own profile
CREATE POLICY "Users can create own profile" ON users
  FOR INSERT WITH CHECK (id = auth.uid());

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Index for faster lookups
CREATE INDEX idx_users_business_id ON users(business_id);
CREATE INDEX idx_businesses_gstin ON businesses(gstin) WHERE gstin IS NOT NULL;
```

- [ ] **Step 3: Apply migration via Supabase Dashboard**

1. Go to Supabase Dashboard > SQL Editor
2. Paste the contents of `001_initial_schema.sql`
3. Run the query

Expected: Tables `businesses` and `users` created with RLS policies

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add initial database schema"
```

---

## Task 6: Create Database Types

**Files:**
- Create: `src/types/database.ts`

- [ ] **Step 1: Create database types**

Create `src/types/database.ts`:
```typescript
export interface Business {
  id: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  state_code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  signature_url: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  upi_id: string | null;
  invoice_prefix: string;
  next_invoice_number: number;
  financial_year: string;
  default_template: "minimal" | "professional" | "gst_formal" | "export";
  accent_color: string;
  terms_conditions: string | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  business_id: string | null;
  email: string;
  name: string | null;
  role: "owner" | "staff";
  created_at: string;
  updated_at: string;
}

export interface BusinessInsert {
  name: string;
  gstin?: string | null;
  pan?: string | null;
  state_code?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface BusinessUpdate {
  name?: string;
  gstin?: string | null;
  pan?: string | null;
  state_code?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  signature_url?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  upi_id?: string | null;
  invoice_prefix?: string;
  financial_year?: string;
  default_template?: "minimal" | "professional" | "gst_formal" | "export";
  accent_color?: string;
  terms_conditions?: string | null;
}

export interface UserInsert {
  id: string;
  business_id: string;
  email: string;
  name?: string | null;
  role?: "owner" | "staff";
}

// Indian states with codes for GST
export const INDIAN_STATES = [
  { code: "01", name: "Jammu & Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra & Nagar Haveli and Daman & Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman & Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
] as const;

export type StateCode = typeof INDIAN_STATES[number]["code"];
```

- [ ] **Step 2: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add database types"
```

---

## Task 7: Add More shadcn UI Components

**Files:**
- Create: Multiple UI component files

- [ ] **Step 1: Add required shadcn components**

Run:
```bash
npx shadcn@latest add select separator avatar dropdown-menu toast tabs
```

Expected: Components added to `src/components/ui/`

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/
git commit -m "chore: add shadcn select, separator, avatar, dropdown-menu, toast, tabs"
```

---

## Task 8: Create Login Form Component

**Files:**
- Create: `src/components/auth/login-form.tsx`

- [ ] **Step 1: Create login form component**

Create `src/components/auth/login-form.tsx`:
```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your Invio account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/auth/login-form.tsx
git commit -m "feat: add login form component"
```

---

## Task 9: Create Signup Form Component

**Files:**
- Create: `src/components/auth/signup-form.tsx`

- [ ] **Step 1: Create signup form component**

Create `src/components/auth/signup-form.tsx`:
```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

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

    // 1. Create auth user
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

    // 2. Create business
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

    // 3. Create user profile linked to business
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
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Step 1 of 2: Account details</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAccountSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full">
              Continue
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Set up your business</CardTitle>
        <CardDescription>Step 2 of 2: Business details</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleBusinessSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="businessName">Business name</Label>
            <Input
              id="businessName"
              type="text"
              placeholder="ABC Traders"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gstin">GSTIN (optional)</Label>
            <Input
              id="gstin"
              type="text"
              placeholder="22AAAAA0000A1Z5"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              maxLength={15}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              You can add this later in settings
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("account")}
              disabled={loading}
            >
              Back
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/auth/signup-form.tsx
git commit -m "feat: add signup form with business creation"
```

---

## Task 10: Create Login Page

**Files:**
- Create: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Create auth layout directory**

Run:
```bash
mkdir -p "src/app/(auth)/login"
```

- [ ] **Step 2: Create login page**

Create `src/app/(auth)/login/page.tsx`:
```typescript
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary">Invio</h1>
          <p className="text-muted-foreground mt-1">
            AI-powered invoicing for Indian businesses
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(auth)/"
git commit -m "feat: add login page"
```

---

## Task 11: Create Signup Page

**Files:**
- Create: `src/app/(auth)/signup/page.tsx`

- [ ] **Step 1: Create signup directory**

Run:
```bash
mkdir -p "src/app/(auth)/signup"
```

- [ ] **Step 2: Create signup page**

Create `src/app/(auth)/signup/page.tsx`:
```typescript
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary">Invio</h1>
          <p className="text-muted-foreground mt-1">
            AI-powered invoicing for Indian businesses
          </p>
        </div>
        <SignupForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(auth)/signup/"
git commit -m "feat: add signup page"
```

---

## Task 12: Create Navbar Component

**Files:**
- Create: `src/components/layout/navbar.tsx`

- [ ] **Step 1: Create layout directory**

Run:
```bash
mkdir -p src/components/layout
```

- [ ] **Step 2: Create navbar component**

Create `src/components/layout/navbar.tsx`:
```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, Settings, LogOut, Menu, X } from "lucide-react";
import type { User as UserType, Business } from "@/types/database";

interface NavbarProps {
  user: UserType;
  business: Business | null;
}

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/invoices", label: "Invoices" },
  { href: "/customers", label: "Customers" },
  { href: "/reports", label: "Reports" },
];

export function Navbar({ user, business }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="text-xl font-bold text-primary">
              Invio
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-4">
            {/* Business name */}
            {business && (
              <span className="hidden sm:block text-sm text-muted-foreground">
                {business.name}
              </span>
            )}

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user.name || "User"}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileMenuOpen && (
          <div className="md:hidden pb-4 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block px-3 py-2 rounded-md text-base font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/
git commit -m "feat: add navbar component"
```

---

## Task 13: Create Dashboard Layout

**Files:**
- Create: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Create dashboard directory**

Run:
```bash
mkdir -p "src/app/(dashboard)"
```

- [ ] **Step 2: Create dashboard layout**

Create `src/app/(dashboard)/layout.tsx`:
```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/layout/navbar";
import type { User, Business } from "@/types/database";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/login");
  }

  // Get user profile
  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  if (!user) {
    redirect("/login");
  }

  // Get business
  let business: Business | null = null;
  if (user.business_id) {
    const { data } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", user.business_id)
      .single();
    business = data;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar user={user as User} business={business} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/"
git commit -m "feat: add dashboard layout with auth check"
```

---

## Task 14: Create Dashboard Page

**Files:**
- Create: `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Create dashboard page**

Create `src/app/(dashboard)/page.tsx`:
```typescript
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Users, IndianRupee, Clock } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome to Invio. Your AI-powered invoicing assistant.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Invoices</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              Create your first invoice
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              Add your first customer
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹0</div>
            <p className="text-xs text-muted-foreground">
              This month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹0</div>
            <p className="text-xs text-muted-foreground">
              Outstanding payments
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Start</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Complete these steps to get started with Invio:
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">1</span>
              Complete your business profile in Settings
            </li>
            <li className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium">2</span>
              Add your first customer
            </li>
            <li className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium">3</span>
              Create your first invoice using voice
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(dashboard)/page.tsx"
git commit -m "feat: add dashboard page with stats cards"
```

---

## Task 15: Create Settings Server Actions

**Files:**
- Create: `src/app/(dashboard)/settings/actions.ts`

- [ ] **Step 1: Create settings directory**

Run:
```bash
mkdir -p "src/app/(dashboard)/settings"
```

- [ ] **Step 2: Create server actions**

Create `src/app/(dashboard)/settings/actions.ts`:
```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BusinessUpdate } from "@/types/database";

export async function updateBusiness(businessId: string, data: BusinessUpdate) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }

  // Verify user owns this business
  const { data: userProfile } = await supabase
    .from("users")
    .select("business_id, role")
    .eq("id", user.id)
    .single();

  if (!userProfile || userProfile.business_id !== businessId) {
    return { error: "Unauthorized" };
  }

  if (userProfile.role !== "owner") {
    return { error: "Only owners can update business settings" };
  }

  const { error } = await supabase
    .from("businesses")
    .update(data)
    .eq("id", businessId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");

  return { success: true };
}

export async function updateUserProfile(data: { name?: string }) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }

  const { error } = await supabase
    .from("users")
    .update(data)
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings");

  return { success: true };
}
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/settings/"
git commit -m "feat: add settings server actions"
```

---

## Task 16: Create Settings Page

**Files:**
- Create: `src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Create settings page**

Create `src/app/(dashboard)/settings/page.tsx`:
```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BusinessProfileForm } from "./business-profile-form";
import { BankDetailsForm } from "./bank-details-form";
import { UserProfileForm } from "./user-profile-form";
import type { Business, User } from "@/types/database";

export default async function SettingsPage() {
  const supabase = await createClient();

  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) {
    redirect("/login");
  }

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  if (!user) {
    redirect("/login");
  }

  let business: Business | null = null;
  if (user.business_id) {
    const { data } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", user.business_id)
      .single();
    business = data;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your business and account settings
        </p>
      </div>

      <Tabs defaultValue="business" className="space-y-6">
        <TabsList>
          <TabsTrigger value="business">Business Profile</TabsTrigger>
          <TabsTrigger value="bank">Bank Details</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="business">
          <Card>
            <CardHeader>
              <CardTitle>Business Information</CardTitle>
              <CardDescription>
                This information appears on your invoices
              </CardDescription>
            </CardHeader>
            <CardContent>
              {business && (
                <BusinessProfileForm business={business} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bank">
          <Card>
            <CardHeader>
              <CardTitle>Bank Details</CardTitle>
              <CardDescription>
                Payment details shown on invoices for customers
              </CardDescription>
            </CardHeader>
            <CardContent>
              {business && (
                <BankDetailsForm business={business} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle>Account Settings</CardTitle>
              <CardDescription>
                Manage your personal account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UserProfileForm user={user as User} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(dashboard)/settings/page.tsx"
git commit -m "feat: add settings page with tabs"
```

---

## Task 17: Create Business Profile Form

**Files:**
- Create: `src/app/(dashboard)/settings/business-profile-form.tsx`

- [ ] **Step 1: Create business profile form**

Create `src/app/(dashboard)/settings/business-profile-form.tsx`:
```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateBusiness } from "./actions";
import type { Business } from "@/types/database";
import { INDIAN_STATES } from "@/types/database";

interface BusinessProfileFormProps {
  business: Business;
}

export function BusinessProfileForm({ business }: BusinessProfileFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);

    const result = await updateBusiness(business.id, {
      name: formData.get("name") as string,
      gstin: (formData.get("gstin") as string) || null,
      pan: (formData.get("pan") as string) || null,
      state_code: (formData.get("state_code") as string) || null,
      address: (formData.get("address") as string) || null,
      phone: (formData.get("phone") as string) || null,
      email: (formData.get("email") as string) || null,
      invoice_prefix: (formData.get("invoice_prefix") as string) || "INV",
      terms_conditions: (formData.get("terms_conditions") as string) || null,
    });

    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Business Name *</Label>
          <Input
            id="name"
            name="name"
            defaultValue={business.name}
            required
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="gstin">GSTIN</Label>
          <Input
            id="gstin"
            name="gstin"
            defaultValue={business.gstin || ""}
            placeholder="22AAAAA0000A1Z5"
            maxLength={15}
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pan">PAN</Label>
          <Input
            id="pan"
            name="pan"
            defaultValue={business.pan || ""}
            placeholder="AAAAA0000A"
            maxLength={10}
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="state_code">State</Label>
          <Select name="state_code" defaultValue={business.state_code || ""}>
            <SelectTrigger>
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent>
              {INDIAN_STATES.map((state) => (
                <SelectItem key={state.code} value={state.code}>
                  {state.code} - {state.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={business.phone || ""}
            placeholder="+91 98765 43210"
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={business.email || ""}
            placeholder="business@example.com"
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="invoice_prefix">Invoice Prefix</Label>
          <Input
            id="invoice_prefix"
            name="invoice_prefix"
            defaultValue={business.invoice_prefix}
            placeholder="INV"
            maxLength={10}
            disabled={loading}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Business Address</Label>
        <Textarea
          id="address"
          name="address"
          defaultValue={business.address || ""}
          placeholder="123 Main Street, City, State - 400001"
          rows={3}
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="terms_conditions">Default Terms & Conditions</Label>
        <Textarea
          id="terms_conditions"
          name="terms_conditions"
          defaultValue={business.terms_conditions || ""}
          placeholder="Payment due within 30 days..."
          rows={4}
          disabled={loading}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">Settings saved successfully!</p>}

      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(dashboard)/settings/business-profile-form.tsx"
git commit -m "feat: add business profile form"
```

---

## Task 18: Create Bank Details Form

**Files:**
- Create: `src/app/(dashboard)/settings/bank-details-form.tsx`

- [ ] **Step 1: Create bank details form**

Create `src/app/(dashboard)/settings/bank-details-form.tsx`:
```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBusiness } from "./actions";
import type { Business } from "@/types/database";

interface BankDetailsFormProps {
  business: Business;
}

export function BankDetailsForm({ business }: BankDetailsFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);

    const result = await updateBusiness(business.id, {
      bank_name: (formData.get("bank_name") as string) || null,
      bank_branch: (formData.get("bank_branch") as string) || null,
      bank_account_number: (formData.get("bank_account_number") as string) || null,
      bank_ifsc: (formData.get("bank_ifsc") as string) || null,
      upi_id: (formData.get("upi_id") as string) || null,
    });

    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bank_name">Bank Name</Label>
          <Input
            id="bank_name"
            name="bank_name"
            defaultValue={business.bank_name || ""}
            placeholder="State Bank of India"
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bank_branch">Branch</Label>
          <Input
            id="bank_branch"
            name="bank_branch"
            defaultValue={business.bank_branch || ""}
            placeholder="Main Branch, Mumbai"
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bank_account_number">Account Number</Label>
          <Input
            id="bank_account_number"
            name="bank_account_number"
            defaultValue={business.bank_account_number || ""}
            placeholder="1234567890123"
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bank_ifsc">IFSC Code</Label>
          <Input
            id="bank_ifsc"
            name="bank_ifsc"
            defaultValue={business.bank_ifsc || ""}
            placeholder="SBIN0001234"
            maxLength={11}
            disabled={loading}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="upi_id">UPI ID</Label>
          <Input
            id="upi_id"
            name="upi_id"
            defaultValue={business.upi_id || ""}
            placeholder="business@upi"
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">
            Customers can pay directly via UPI using this ID
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">Bank details saved successfully!</p>}

      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Save Bank Details"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(dashboard)/settings/bank-details-form.tsx"
git commit -m "feat: add bank details form"
```

---

## Task 19: Create User Profile Form

**Files:**
- Create: `src/app/(dashboard)/settings/user-profile-form.tsx`

- [ ] **Step 1: Create user profile form**

Create `src/app/(dashboard)/settings/user-profile-form.tsx`:
```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateUserProfile } from "./actions";
import type { User } from "@/types/database";

interface UserProfileFormProps {
  user: User;
}

export function UserProfileForm({ user }: UserProfileFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);

    const result = await updateUserProfile({
      name: (formData.get("name") as string) || null,
    });

    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Your Name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={user.name || ""}
            placeholder="John Doe"
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={user.email}
            disabled
            className="bg-muted"
          />
          <p className="text-xs text-muted-foreground">
            Email cannot be changed
          </p>
        </div>

        <div className="space-y-2">
          <Label>Role</Label>
          <Input
            value={user.role === "owner" ? "Owner" : "Staff"}
            disabled
            className="bg-muted"
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">Profile updated successfully!</p>}

      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Save Profile"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(dashboard)/settings/user-profile-form.tsx"
git commit -m "feat: add user profile form"
```

---

## Task 20: Update Root Page with Redirect Logic

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update root page to check auth and redirect**

Replace `src/app/page.tsx`:
```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  redirect("/login");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add root page redirect logic"
```

---

## Task 21: Final Integration Test

- [ ] **Step 1: Start development server**

Run:
```bash
npm run dev
```

Expected: Server starts on http://localhost:3000

- [ ] **Step 2: Test signup flow**

1. Navigate to http://localhost:3000/signup
2. Fill in account details (name, email, password)
3. Click Continue
4. Fill in business name
5. Click Create account

Expected: Redirected to /dashboard with navbar showing business name

- [ ] **Step 3: Test login flow**

1. Sign out using dropdown menu
2. Navigate to /login
3. Enter credentials
4. Click Sign in

Expected: Redirected to /dashboard

- [ ] **Step 4: Test settings page**

1. Click Settings in user dropdown
2. Update business name
3. Click Save Changes

Expected: Success message shown, changes persisted

- [ ] **Step 5: Commit any fixes**

```bash
git add .
git commit -m "fix: integration test fixes"
```

---

## Summary

Phase 1 establishes:
- Supabase authentication (email/password)
- Database schema for businesses and users
- Login and signup flows with business creation
- Authenticated dashboard layout with navbar
- Business profile settings page
- Server actions for data mutations
- Row-level security for multi-tenant data isolation

**Next Phase:** Phase 2 - Customers CRUD
