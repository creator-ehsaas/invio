"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload, X, Loader2, Image as ImageIcon } from "lucide-react";

interface LogoUploadProps {
  currentLogoUrl?: string | null;
  businessId: string;
  onUpload: (url: string | null) => void;
}

export function LogoUpload({ currentLogoUrl, businessId, onUpload }: LogoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl || null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be less than 2MB");
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const supabase = createClient();

      // Create a unique filename
      const fileExt = file.name.split(".").pop();
      const fileName = `${businessId}/logo-${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("business-assets")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        // If bucket doesn't exist, try creating it
        if (uploadError.message.includes("not found")) {
          setError("Storage not configured. Please contact support.");
        } else {
          throw uploadError;
        }
        return;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("business-assets")
        .getPublicUrl(fileName);

      // Update preview and notify parent
      setPreviewUrl(publicUrl);
      onUpload(publicUrl);

      // Update business record
      await supabase
        .from("businesses")
        .update({ logo_url: publicUrl })
        .eq("id", businessId);

    } catch (err: any) {
      console.error("Upload error:", err);
      setError(err.message || "Failed to upload logo");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    setError(null);

    try {
      const supabase = createClient();

      // Remove from database
      await supabase
        .from("businesses")
        .update({ logo_url: null })
        .eq("id", businessId);

      setPreviewUrl(null);
      onUpload(null);
    } catch (err: any) {
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
        {/* Preview Area */}
        <div
          className={`
            relative w-24 h-24 rounded-xl border-2 border-dashed overflow-hidden
            flex items-center justify-center bg-muted/50
            ${previewUrl ? "border-primary/30" : "border-muted-foreground/30"}
          `}
        >
          {previewUrl ? (
            <>
              <img
                src={previewUrl}
                alt="Business logo"
                className="w-full h-full object-contain p-2"
              />
              {!uploading && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </>
          ) : (
            <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
          )}

          {uploading && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
        </div>

        {/* Upload Button */}
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
            {previewUrl ? "Change Logo" : "Upload Logo"}
          </button>

          <p className="text-xs text-muted-foreground">
            PNG, JPG or SVG. Max 2MB. Recommended: 200x200px
          </p>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
