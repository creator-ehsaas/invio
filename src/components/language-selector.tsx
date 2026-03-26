"use client";

import { Button } from "@/components/ui/button";
import { Language, LANGUAGES } from "@/types/invoice";

interface LanguageSelectorProps {
  selected: Language;
  onSelect: (lang: Language) => void;
  disabled?: boolean;
}

export function LanguageSelector({
  selected,
  onSelect,
  disabled,
}: LanguageSelectorProps) {
  return (
    <div className="flex gap-2 justify-center">
      {LANGUAGES.map((lang) => (
        <Button
          key={lang.code}
          variant={selected === lang.code ? "default" : "outline"}
          onClick={() => onSelect(lang.code)}
          disabled={disabled}
          className="min-w-[100px]"
        >
          {lang.label}
        </Button>
      ))}
    </div>
  );
}
