import { Wallet } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left Side: Visual/Branding (Hidden on mobile) */}
      <div className="hidden md:flex md:w-1/2 lg:w-3/5 bg-secondary p-12 flex-col justify-between items-start relative overflow-hidden">
        <div className="z-10">
          <div className="flex items-center gap-2 mb-12">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-blue-500 rounded-xl flex items-center justify-center shadow-lg">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-foreground">Invio</span>
          </div>
          <div className="max-w-md">
            <h1 className="text-5xl font-bold tracking-tight text-foreground mb-6 leading-tight">
              Voice-powered invoicing for{" "}
              <span className="text-primary">Indian businesses.</span>
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              Speak in Hindi, Marathi, or English. Let AI handle the paperwork.
            </p>
          </div>
        </div>

        <div className="w-full relative z-10">
          <div className="bg-card rounded-xl p-6 shadow-xl border border-border/10">
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
                Live Revenue Flow
              </span>
              <span className="text-primary font-semibold text-sm">+12.4% vs last month</span>
            </div>
            <div className="h-32 flex items-end gap-2">
              <div className="flex-1 bg-muted h-[40%] rounded-t-lg"></div>
              <div className="flex-1 bg-muted h-[60%] rounded-t-lg"></div>
              <div className="flex-1 bg-gradient-to-t from-primary to-blue-500 h-[90%] rounded-t-lg shadow-sm"></div>
              <div className="flex-1 bg-muted h-[55%] rounded-t-lg"></div>
              <div className="flex-1 bg-muted h-[75%] rounded-t-lg"></div>
              <div className="flex-1 bg-gradient-to-t from-primary to-blue-500 h-[100%] rounded-t-lg shadow-sm"></div>
              <div className="flex-1 bg-muted h-[65%] rounded-t-lg"></div>
            </div>
          </div>
        </div>

        {/* Background Decorative Elements */}
        <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute top-20 right-10 w-64 h-64 bg-blue-200/20 rounded-full blur-3xl"></div>
      </div>

      {/* Right Side: Auth Forms */}
      <main className="flex-1 flex flex-col justify-center items-center p-6 md:p-16 bg-background">
        {/* Mobile Logo */}
        <div className="md:hidden flex items-center gap-2 mb-12">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-blue-500 rounded-lg flex items-center justify-center">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">Invio</span>
        </div>

        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
