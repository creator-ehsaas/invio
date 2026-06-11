"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload, X, Loader2, Image as ImageIcon, Stamp, PenLine } from "lucide-react";

type ImageType = "logo" | "signature" | "stamp";

interface ImageUploadProps {
  type: ImageType;
  currentUrl?: string | null;
  businessId: string;
  onUpload: (url: string | null) => void;
  label?: string;
  description?: string;
}

const TYPE_CONFIG: Record<ImageType, {
  icon: typeof ImageIcon;
  dbField: string;
  folder: string;
  maxDimension: number;
  aspectHint: string;
}> = {
  logo: {
    icon: ImageIcon,
    dbField: "logo_url",
    folder: "logo",
    maxDimension: 400,
    aspectHint: "200×200px (square)",
  },
  signature: {
    icon: PenLine,
    dbField: "signature_url",
    folder: "signature",
    maxDimension: 300,
    aspectHint: "300×100px (wide)",
  },
  stamp: {
    icon: Stamp,
    dbField: "stamp_url",
    folder: "stamp",
    maxDimension: 300,
    aspectHint: "200×200px (square)",
  },
};

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

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

export function ImageUpload({
  type,
  currentUrl,
  businessId,
  onUpload,
  label,
  description,
}: ImageUploadProps) {
  const config = TYPE_CONFIG[type];
  const Icon = config.icon;

  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl || null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayLabel = label || `${type.charAt(0).toUpperCase() + type.slice(1)}`;

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
      let publicUrl: string | null = null;

      const fileExt = file.name.split(".").pop();
      const fileName = `${businessId}/${config.folder}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("business-assets")
        .upload(fileName, file, { cacheControl: "3600", upsert: true });

      if (!uploadError) {
        const { data } = supabase.storage
          .from("business-assets")
          .getPublicUrl(fileName);
        publicUrl = data.publicUrl;
      } else {
        console.warn("Storage unavailable, using base64 fallback:", uploadError.message);
        publicUrl = await resizeImage(file, config.maxDimension);
      }

      const { error: dbError } = await supabase
        .from("businesses")
        .update({ [config.dbField]: publicUrl })
        .eq("id", businessId);
      if (dbError) throw new Error(dbError.message);

      setPreviewUrl(publicUrl);
      onUpload(publicUrl);
    } catch (err: any) {
      console.error("Upload error:", err);
      setError(err.message || `Failed to upload ${type}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: dbError } = await supabase
        .from("businesses")
        .update({ [config.dbField]: null })
        .eq("id", businessId);
      if (dbError) throw new Error(dbError.message);
      setPreviewUrl(null);
      onUpload(null);
    } catch {
      setError(`Failed to remove ${type}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-foreground">
        {displayLabel} <span className="text-muted-foreground font-normal">(optional)</span>
      </label>

      <div className="flex items-start gap-4">
        <div
          className={`relative w-24 h-24 rounded-xl border-2 border-dashed overflow-hidden flex items-center justify-center bg-muted/50 ${
            previewUrl ? "border-primary/30" : "border-muted-foreground/30"
          }`}
        >
          {previewUrl ? (
            <>
              <img
                src={previewUrl}
                alt={displayLabel}
                className="w-full h-full object-contain p-2"
              />
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
            <Icon className="w-8 h-8 text-muted-foreground/40" />
          )}
          {uploading && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
        </div>

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
            {uploading ? "Uploading…" : previewUrl ? `Change ${displayLabel}` : `Upload ${displayLabel}`}
          </button>
          <p className="text-xs text-muted-foreground">
            {description || `PNG, JPG or SVG. Max 2MB. Recommended: ${config.aspectHint}`}
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}
