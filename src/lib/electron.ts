/**
 * Electron bridge utilities.
 * Safe to call in both browser and Electron contexts.
 */

export const isElectron = (): boolean => {
  if (typeof window === "undefined") return false;
  return !!(window as any).electron?.isElectron;
};

export const openExternal = (url: string): void => {
  if (isElectron()) {
    (window as any).electron.openExternal(url);
  } else {
    window.open(url, "_blank");
  }
};

export const getAppVersion = async (): Promise<string> => {
  if (isElectron()) {
    return (window as any).electron.getVersion();
  }
  return "web";
};

export const gemScan = async (opts: {
  keywords?: string[];
  maxPages?: number;
}): Promise<{ docs?: any[]; error?: string } | null> => {
  if (!isElectron()) return null;
  return (window as any).electron.gemScan(opts);
};

// ── GeM Bid Participation bridge ─────────────────────────────────────────────
// Credentials flow renderer → main on save only; secrets never come back.

type IpcResult<T = Record<string, unknown>> = (T & { ok?: boolean; error?: string }) | null;

const invoke = async <T = Record<string, unknown>>(channel: string, opts: Record<string, unknown>): Promise<IpcResult<T>> => {
  if (!isElectron()) return null;
  const fn = (window as any).electron[channel];
  if (typeof fn !== "function") return { error: "Update the Invio desktop app to use this feature" } as IpcResult<T>;
  return fn(opts);
};

export const gemCredsStatus = (businessId: string) =>
  invoke<{
    encryptionAvailable: boolean;
    hasGem: boolean;
    gemUserId?: string | null;
    hasGmail: boolean;
    gmailEmail?: string | null;
    deviceLabel?: string;
  }>("gemCredsStatus", { businessId });
export const gemCredsSave = (opts: { businessId: string; gemUserId: string; gemPassword: string }) =>
  invoke("gemCredsSave", opts);
export const gemCredsClear = (opts: { businessId: string; which?: "gem" | "gmail" }) =>
  invoke("gemCredsClear", opts);
export const gemGmailSave = (opts: { businessId: string; email: string; appPassword: string; host?: string }) =>
  invoke("gemGmailSave", opts);
export const gemParticipateOpen = (opts: { sessionId: string; startUrl?: string }) =>
  invoke("gemParticipateOpen", opts);
export const gemParticipateLogin = (opts: { sessionId: string; businessId: string }) =>
  invoke<{ otpApplied?: boolean; manualOtpRequired?: boolean; otpSource?: string }>("gemParticipateLogin", opts);
export const gemParticipateOtp = (opts: { sessionId: string; otp: string }) =>
  invoke<{ applied?: boolean }>("gemParticipateOtp", opts);
export const gemParticipateGoto = (opts: { sessionId: string; url: string }) =>
  invoke("gemParticipateGoto", opts);
export const gemParticipateFill = (opts: {
  sessionId: string;
  fields: { field_key: string; field_label: string; value: string }[];
}) => invoke<{ report?: { filled: unknown[]; unmatched: { field_key: string; field_label: string }[] } }>("gemParticipateFill", opts);
export const gemParticipateAttach = (opts: { sessionId: string; url: string; fileName: string; sha256?: string | null; inputIndex?: number }) =>
  invoke<{ sha256?: string }>("gemParticipateAttach", opts);
export const gemParticipateScreenshot = (opts: { sessionId: string }) =>
  invoke<{ base64?: string; sha256?: string; url?: string }>("gemParticipateScreenshot", opts);
export const gemParticipateSubmit = (opts: { sessionId: string }) =>
  invoke<{ clicked?: boolean; label?: string }>("gemParticipateSubmit", opts);
export const gemParticipateConfirmation = (opts: { sessionId: string }) =>
  invoke<{ reference?: string | null; url?: string; snippet?: string }>("gemParticipateConfirmation", opts);
export const gemParticipateClose = (opts: { sessionId: string }) =>
  invoke("gemParticipateClose", opts);

export const onGemParticipationEvent = (
  callback: (event: { sessionId: string; type: string; payload: Record<string, unknown>; ts: string }) => void
): (() => void) => {
  if (!isElectron()) return () => {};
  const sub = (window as any).electron.onGemParticipationEvent;
  if (typeof sub !== "function") return () => {};
  return sub(callback);
};

export const gemFetchDoc = async (opts: {
  bidUrl: string;
}): Promise<{
  text?: string;
  docLinks?: { url: string; name: string; category?: string }[];
  pdfText?: string;
  financials?: { estimated_value?: number; emd_amount?: number };
  specDocs?: { name: string; category: string; url: string; depth?: number; textLength: number }[];
  crawl?: { fetched: number; discovered: number; max_depth: number };
  error?: string;
} | null> => {
  if (!isElectron()) return null;
  return (window as any).electron.gemFetchDoc(opts);
};
