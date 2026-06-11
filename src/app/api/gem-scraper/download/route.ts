import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * Resolves a downloadable URL for a GeM bid document.
 * The gem-documents bucket is private, so storage-hosted files need a
 * short-lived signed URL; external tender links pass through unchanged.
 *
 * GET /api/gem-scraper/download?doc_id=<uuid>
 * Returns: { url: string, file_name: string }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();
    if (!userData?.business_id) {
      return NextResponse.json({ error: "No business profile found" }, { status: 400 });
    }

    const docId = request.nextUrl.searchParams.get("doc_id");
    if (!docId) {
      return NextResponse.json({ error: "doc_id is required" }, { status: 400 });
    }

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: doc } = await serviceSupabase
      .from("gem_bid_documents")
      .select("id, file_name, file_url, gem_bids!inner(business_id)")
      .eq("id", docId)
      .single();

    const ownerBusinessId = (doc as any)?.gem_bids?.business_id;
    if (!doc || ownerBusinessId !== userData.business_id) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (doc.file_url.startsWith("http")) {
      return NextResponse.json({ url: doc.file_url, file_name: doc.file_name });
    }

    const { data: signed, error: signError } = await serviceSupabase.storage
      .from("gem-documents")
      .createSignedUrl(doc.file_url, 300, { download: doc.file_name });

    if (signError || !signed?.signedUrl) {
      return NextResponse.json({ error: "File is no longer available" }, { status: 410 });
    }

    return NextResponse.json({ url: signed.signedUrl, file_name: doc.file_name });
  } catch (error: any) {
    console.error("GeM download error:", error);
    return NextResponse.json({ error: error.message || "Download failed" }, { status: 500 });
  }
}
