import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

      <div className="grid gap-6">
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
      </div>
    </div>
  );
}
