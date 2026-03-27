"use client";

import { useEffect, createContext, useContext, useState } from 'react';
import { initializeApp, isNative, isAndroid, isIOS, setStatusBarStyle } from '@/lib/capacitor';

interface CapacitorContextType {
  isNative: boolean;
  isAndroid: boolean;
  isIOS: boolean;
  isReady: boolean;
}

const CapacitorContext = createContext<CapacitorContextType>({
  isNative: false,
  isAndroid: false,
  isIOS: false,
  isReady: false,
});

export const useCapacitor = () => useContext(CapacitorContext);

export function CapacitorProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      await initializeApp();
      setIsReady(true);

      // Set initial status bar style based on system preference
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      await setStatusBarStyle(isDark);

      // Listen for theme changes
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        setStatusBarStyle(e.matches);
      };
      mediaQuery.addEventListener('change', handleChange);

      return () => mediaQuery.removeEventListener('change', handleChange);
    };

    init();
  }, []);

  // Add safe area CSS variables
  useEffect(() => {
    if (isNative) {
      document.documentElement.classList.add('native-app');

      // Set safe area insets as CSS variables
      const style = document.documentElement.style;
      style.setProperty('--safe-area-inset-top', 'env(safe-area-inset-top, 0px)');
      style.setProperty('--safe-area-inset-bottom', 'env(safe-area-inset-bottom, 0px)');
      style.setProperty('--safe-area-inset-left', 'env(safe-area-inset-left, 0px)');
      style.setProperty('--safe-area-inset-right', 'env(safe-area-inset-right, 0px)');
    }
  }, []);

  return (
    <CapacitorContext.Provider value={{ isNative, isAndroid, isIOS, isReady }}>
      {children}
    </CapacitorContext.Provider>
  );
}
