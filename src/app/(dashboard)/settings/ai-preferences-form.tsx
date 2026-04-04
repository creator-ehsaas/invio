"use client";

import { useState, useEffect } from "react";
import { Mic, Bot, Volume2, Sparkles, Check, Info } from "lucide-react";

const DEFAULT_WAKE_WORD = "hey invio";
const STORAGE_KEY = "invio_wake_word";
const TTS_KEY = "invio_tts_enabled";
const LANG_KEY = "invio_ai_language";

const PRESET_WAKE_WORDS = [
  "hey invio",
  "ok invio",
  "hello invio",
  "invio listen",
];

const LANGUAGE_OPTIONS = [
  { value: "auto", label: "Auto-detect (Hinglish)" },
  { value: "hi", label: "Hindi (हिंदी)" },
  { value: "en", label: "English" },
  { value: "mr", label: "Marathi (मराठी)" },
  { value: "gu", label: "Gujarati (ગુજરાતી)" },
  { value: "ta", label: "Tamil (தமிழ்)" },
  { value: "te", label: "Telugu (తెలుగు)" },
  { value: "bn", label: "Bengali (বাংলা)" },
  { value: "pa", label: "Punjabi (ਪੰਜਾਬੀ)" },
];

export function AIPreferencesForm() {
  const [wakeWord, setWakeWord] = useState(DEFAULT_WAKE_WORD);
  const [customInput, setCustomInput] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [aiLanguage, setAiLanguage] = useState("auto");
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setWakeWord(localStorage.getItem(STORAGE_KEY) || DEFAULT_WAKE_WORD);
    setTtsEnabled(localStorage.getItem(TTS_KEY) !== "false");
    setAiLanguage(localStorage.getItem(LANG_KEY) || "auto");
  }, []);

  const saveSettings = () => {
    localStorage.setItem(STORAGE_KEY, wakeWord);
    localStorage.setItem(TTS_KEY, String(ttsEnabled));
    localStorage.setItem(LANG_KEY, aiLanguage);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // Dispatch event so AI assistant picks up new wake word immediately
    window.dispatchEvent(new CustomEvent("invio-settings-changed", {
      detail: { wakeWord, ttsEnabled, aiLanguage }
    }));
  };

  const setPreset = (word: string) => {
    setWakeWord(word);
    setCustomInput("");
  };

  const setCustom = (val: string) => {
    setCustomInput(val);
    if (val.trim().length >= 2) setWakeWord(val.trim().toLowerCase());
  };

  const testWakeWord = () => {
    if (!("speechSynthesis" in window)) return;
    setTesting(true);
    const u = new SpeechSynthesisUtterance(
      `Wake word set to: ${wakeWord}. Say this to activate your AI assistant.`
    );
    u.onend = () => setTesting(false);
    u.onerror = () => setTesting(false);
    window.speechSynthesis.speak(u);
  };

  return (
    <div className="space-y-6">
      {/* Wake Word */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Wake Word</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Say this phrase to activate the AI assistant hands-free from any page.
        </p>

        {/* Presets */}
        <div className="flex flex-wrap gap-2">
          {PRESET_WAKE_WORDS.map((w) => (
            <button
              key={w}
              onClick={() => setPreset(w)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                wakeWord === w && !customInput
                  ? "bg-primary text-white border-primary"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
              }`}
            >
              "{w}"
            </button>
          ))}
        </div>

        {/* Custom wake word */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Or set your own wake word:</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustom(e.target.value)}
              placeholder='e.g. "computer" or "jarvis"'
              maxLength={30}
              className="flex-1 px-4 py-2.5 bg-secondary border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none"
            />
            <button
              onClick={testWakeWord}
              disabled={testing}
              className="px-4 py-2.5 bg-primary/10 text-primary rounded-xl text-sm font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              {testing ? "Playing..." : "Test"}
            </button>
          </div>
        </div>

        {/* Current setting display */}
        <div className="flex items-center gap-2 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
          <Mic className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm text-primary">
            Active wake word: <strong>"{wakeWord}"</strong>
          </p>
        </div>

        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Wake word detection uses your browser's microphone. Enable it from the AI assistant floating button.</span>
        </div>
      </div>

      {/* Voice Responses */}
      <div className="space-y-3 pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Voice Responses</h3>
        </div>
        <div className="flex items-center justify-between p-4 bg-secondary rounded-xl">
          <div>
            <p className="text-sm font-medium text-foreground">AI speaks responses aloud</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI assistant will read its answers using your device's speaker
            </p>
          </div>
          <button
            onClick={() => setTtsEnabled(!ttsEnabled)}
            className={`w-12 h-6 rounded-full relative transition-colors ${ttsEnabled ? "bg-primary" : "bg-muted"}`}
            role="switch"
            aria-checked={ttsEnabled}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${ttsEnabled ? "right-1" : "left-1"}`} />
          </button>
        </div>
      </div>

      {/* AI Language */}
      <div className="space-y-3 pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">AI Response Language</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          AI accountant will respond in this language. Auto-detect matches the language you write in.
        </p>
        <select
          value={aiLanguage}
          onChange={(e) => setAiLanguage(e.target.value)}
          className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
        >
          {LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* AI Model */}
      <div className="space-y-3 pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">AI Intelligence</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 border-2 border-primary rounded-xl bg-primary/5">
            <p className="text-sm font-semibold text-primary">Standard</p>
            <p className="text-xs text-muted-foreground mt-1">Fast, great for invoices and forms</p>
            <p className="text-xs text-primary font-medium mt-2">Current plan</p>
          </div>
          <div className="p-4 border border-border rounded-xl opacity-60 cursor-not-allowed">
            <p className="text-sm font-semibold text-foreground">Enhanced</p>
            <p className="text-xs text-muted-foreground mt-1">Deeper tax analysis, complex queries</p>
            <p className="text-xs text-muted-foreground font-medium mt-2">Pro plan required</p>
          </div>
        </div>
      </div>

      {/* Save */}
      <button
        onClick={saveSettings}
        className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors"
      >
        {saved ? <Check className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
        {saved ? "Saved!" : "Save AI Settings"}
      </button>
    </div>
  );
}
