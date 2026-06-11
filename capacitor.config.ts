import type { CapacitorConfig } from '@capacitor/cli';

const isDev = process.env.NODE_ENV === 'development';

const config: CapacitorConfig = {
  appId: 'com.invio.app',
  appName: 'Invio',
  webDir: 'out',
  server: isDev ? {
    // Development: Point to local Next.js server
    // Replace with your computer's local IP (run `ipconfig` to find it)
    url: 'http://192.168.1.100:3000',
    cleartext: true,
  } : {
    // Production: Use your deployed Vercel/server URL
    url: 'https://invio.vercel.app',
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#6366f1',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#6366f1',
    },
    CapacitorHttp: {
      enabled: true,
    },
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: isDev, // Disable in production
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
  },
};

export default config;
