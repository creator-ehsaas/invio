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

export const gemFetchDoc = async (opts: {
  bidUrl: string;
}): Promise<{
  text?: string;
  docLinks?: { url: string; name: string }[];
  pdfText?: string;
  financials?: { estimated_value?: number; emd_amount?: number };
  error?: string;
} | null> => {
  if (!isElectron()) return null;
  return (window as any).electron.gemFetchDoc(opts);
};
