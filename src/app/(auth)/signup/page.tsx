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
