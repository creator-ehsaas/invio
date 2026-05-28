"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertCircle className="h-8 w-8" />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-2">Failed to load Customers</h2>
      <p className="text-sm text-muted-foreground max-w-md mb-6">
        We encountered an error loading your customers list. Please try again.
      </p>
      <Button onClick={() => reset()} className="gap-2">
        <RotateCcw className="h-4 w-4" /> Try again
      </Button>
    </div>
  );
}
