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
    <div className="min-h-screen bg-background">
      <Navbar user={user as User} business={business} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 md:pt-24 pb-24 md:pb-8">
        {children}
      </main>
    </div>
  );
}
