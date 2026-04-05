"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload, X, Loader2, Image as ImageIcon } from "lucide-react";

interface LogoUploadProps {
  currentLogoUrl?: string | null;
  businessId: string;
  onUpload: (url: string | null) => void;
}

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_DIMENSION = 400; // resize before storing

/** Resize image and return as base64 data URL */
function resizeImage(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height / width) * maxDim);
          width = maxDim;
        } else {
          width = Math.round((width / height) * maxDim);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png", 0.85));
    };
    img.onerror = reject;
    img.src = objectUrl;
  });
}

export function LogoUpload({ currentLogoUrl, businessId, onUpload }: LogoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl || null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError("Image must be less than 2MB");
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const supabase = createClient();

      // Try Supabase Storage first
      let publicUrl: string | null = null;

      const fileExt = file.name.split(".").pop();
      const fileName = `${businessId}/logo-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("business-assets")
        .upload(fileName, file, { cacheControl: "3600", upsert: true });

      if (!uploadError) {
        const { data } = supabase.storage
          .from("business-assets")
          .getPublicUrl(fileName);
        publicUrl = data.publicUrl;
      } else {
        // Storage bucket not available — fall back to base64 data URL
        console.warn("Storage unavailable, using base64 fallback:", uploadError.message);
        publicUrl = await resizeImage(file, MAX_DIMENSION);
      }

      // Save to DB
      await supabase
        .from("businesses")
        .update({ logo_url: publicUrl })
        .eq("id", businessId);

      setPreviewUrl(publicUrl);
      onUpload(publicUrl);
    } catch (err: any) {
      console.error("Upload error:", err);
      setError(err.message || "Failed to upload logo");
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      await supabase.from("businesses").update({ logo_url: null }).eq("id", businessId);
      setPreviewUrl(null);
      onUpload(null);
    } catch {
      setError("Failed to remove logo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-foreground">
        Business Logo <span className="text-muted-foreground font-normal">(optional)</span>
      </label>

      <div className="flex items-start gap-4">
        {/* Preview */}
        <div className={`relative w-24 h-24 rounded-xl border-2 border-dashed overflow-hidden flex items-center justify-center bg-muted/50 ${previewUrl ? "border-primary/30" : "border-muted-foreground/30"}`}>
          {previewUrl ? (
            <>
              <img src={previewUrl} alt="Business logo" className="w-full h-full object-contain p-2" />
              {!uploading && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="absolute -top-1.5 -right-1.5 p-1 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90 transition-colors shadow"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </>
          ) : (
            <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
          )}
          {uploading && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex-1 space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {uploading ? "Uploading…" : previewUrl ? "Change Logo" : "Upload Logo"}
          </button>
          <p className="text-xs text-muted-foreground">PNG, JPG or SVG. Max 2MB. Recommended: 200×200px</p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}
