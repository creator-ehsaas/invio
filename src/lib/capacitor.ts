import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard } from '@capacitor/keyboard';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// Check if running in native app
export const isNative = Capacitor.isNativePlatform();
export const isAndroid = Capacitor.getPlatform() === 'android';
export const isIOS = Capacitor.getPlatform() === 'ios';
export const isWeb = Capacitor.getPlatform() === 'web';

// Initialize native app features
export async function initializeApp() {
  if (!isNative) return;

  try {
    // Hide splash screen after app loads
    await SplashScreen.hide();

    // Configure status bar
    if (isAndroid) {
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#6366f1' });
    }

    // Listen for app state changes
    App.addListener('appStateChange', ({ isActive }) => {
      console.log('App state changed. Is active?', isActive);
    });

    // Handle back button on Android
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });

    // Keyboard listeners for better UX
    Keyboard.addListener('keyboardWillShow', (info) => {
      document.body.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
    });

    Keyboard.addListener('keyboardWillHide', () => {
      document.body.style.setProperty('--keyboard-height', '0px');
    });
  } catch (error) {
    console.error('Error initializing native app:', error);
  }
}

// Haptic feedback functions
export const haptics = {
  light: async () => {
    if (!isNative) return;
    await Haptics.impact({ style: ImpactStyle.Light });
  },
  medium: async () => {
    if (!isNative) return;
    await Haptics.impact({ style: ImpactStyle.Medium });
  },
  heavy: async () => {
    if (!isNative) return;
    await Haptics.impact({ style: ImpactStyle.Heavy });
  },
  success: async () => {
    if (!isNative) return;
    await Haptics.notification({ type: NotificationType.Success });
  },
  warning: async () => {
    if (!isNative) return;
    await Haptics.notification({ type: NotificationType.Warning });
  },
  error: async () => {
    if (!isNative) return;
    await Haptics.notification({ type: NotificationType.Error });
  },
  selection: async () => {
    if (!isNative) return;
    await Haptics.selectionStart();
    await Haptics.selectionEnd();
  },
};

// Share functionality
export async function shareContent(options: {
  title?: string;
  text?: string;
  url?: string;
  files?: string[];
}) {
  const { Share } = await import('@capacitor/share');

  if (isNative) {
    await Share.share({
      title: options.title,
      text: options.text,
      url: options.url,
      dialogTitle: options.title,
    });
  } else if (navigator.share) {
    await navigator.share({
      title: options.title,
      text: options.text,
      url: options.url,
    });
  } else {
    // Fallback: copy to clipboard
    const shareText = options.url || options.text || '';
    await navigator.clipboard.writeText(shareText);
    return 'copied';
  }
  return 'shared';
}

// Set status bar style based on theme
export async function setStatusBarStyle(isDark: boolean) {
  if (!isNative) return;

  try {
    await StatusBar.setStyle({
      style: isDark ? Style.Dark : Style.Light
    });

    if (isAndroid) {
      await StatusBar.setBackgroundColor({
        color: isDark ? '#0f172a' : '#ffffff'
      });
    }
  } catch (error) {
    console.error('Error setting status bar style:', error);
  }
}
