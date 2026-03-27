import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BusinessProfileForm } from "./business-profile-form";
import { BankDetailsForm } from "./bank-details-form";
import { UserProfileForm } from "./user-profile-form";
import { SettingsTabs } from "./settings-tabs";
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
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account and preferences
        </p>
      </div>

      <SettingsTabs
        profileContent={<UserProfileForm user={user as User} />}
        businessContent={
          business ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Business Information</h3>
                <BusinessProfileForm business={business} />
              </div>
              <div className="pt-6 border-t border-slate-200/50 dark:border-slate-800/50">
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Bank Details</h3>
                <BankDetailsForm business={business} />
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">No business profile found.</p>
          )
        }
      />
    </div>
  );
}
