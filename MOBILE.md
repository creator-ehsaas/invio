# Invio Mobile App

Build native Android and iOS apps using Capacitor JS.

## Prerequisites

### Android
- [Android Studio](https://developer.android.com/studio) (latest version)
- Android SDK (API 24+)
- Java JDK 17+

### iOS (Mac only)
- Xcode 15+
- CocoaPods

## Development Setup

### 1. Configure Server URL

Edit `capacitor.config.ts` and set your development server IP:

```typescript
server: {
  url: 'http://YOUR_LOCAL_IP:3000',  // Replace with your IP
  cleartext: true,
}
```

Find your IP:
- Windows: `ipconfig` (look for IPv4 Address)
- Mac/Linux: `ifconfig` or `ip addr`

### 2. Start Development Server

```bash
# Terminal 1: Start Next.js on all interfaces
npm run dev -- -H 0.0.0.0

# Terminal 2: Sync and run on device/emulator
npm run cap:sync
npm run cap:android  # Opens Android Studio
```

### 3. Run on Device

**Android:**
1. Enable USB Debugging on your phone
2. Connect via USB
3. In Android Studio: Run > Run 'app'

**iOS:**
```bash
npm run cap:ios  # Opens Xcode
# Then click Play button in Xcode
```

## Building for Production

### 1. Deploy Your Web App

Deploy to Vercel or your preferred hosting:
```bash
vercel deploy --prod
```

### 2. Update Capacitor Config

In `capacitor.config.ts`, set the production URL:
```typescript
server: {
  url: 'https://your-app.vercel.app',
  androidScheme: 'https',
}
```

### 3. Build Release APK

```bash
# Sync changes
npm run cap:sync

# Open Android Studio
npm run cap:android

# In Android Studio:
# Build > Generate Signed Bundle/APK
```

### 4. Build iOS (Mac only)

```bash
npm run cap:ios

# In Xcode:
# Product > Archive
```

## Native Features

The app uses these Capacitor plugins:

| Feature | Plugin | Usage |
|---------|--------|-------|
| Haptics | @capacitor/haptics | Tactile feedback on actions |
| Status Bar | @capacitor/status-bar | Theme-aware status bar |
| Keyboard | @capacitor/keyboard | Handle keyboard visibility |
| Share | @capacitor/share | Share invoices via WhatsApp etc |
| Splash Screen | @capacitor/splash-screen | App launch screen |

### Using Haptics

```typescript
import { haptics } from '@/lib/capacitor';

// Trigger haptic feedback
await haptics.light();    // Light tap
await haptics.medium();   // Medium impact
await haptics.success();  // Success notification
await haptics.error();    // Error notification
```

### Sharing Content

```typescript
import { shareContent } from '@/lib/capacitor';

await shareContent({
  title: 'Invoice #123',
  text: 'Check out this invoice',
  url: 'https://invio.app/invoice/123',
});
```

## App Icons & Splash Screen

### Android
- Icons: `android/app/src/main/res/mipmap-*`
- Splash: `android/app/src/main/res/drawable/splash.xml`

### iOS
- Icons: `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- Splash: Configure in Xcode

**Recommended tool:** [capacitor-assets](https://github.com/ionic-team/capacitor-assets)
```bash
npx @capacitor/assets generate --iconBackgroundColor '#6366F1' --splashBackgroundColor '#6366F1'
```

## Troubleshooting

### "net::ERR_CLEARTEXT_NOT_PERMITTED"
Add to `capacitor.config.ts`:
```typescript
android: {
  allowMixedContent: true,
}
```

### App not connecting to dev server
1. Ensure phone and computer are on same WiFi
2. Check firewall allows port 3000
3. Verify IP address is correct

### Build fails with "SDK not found"
Open Android Studio > SDK Manager > Install required SDK versions

## Publishing

### Google Play Store
1. Create keystore: `keytool -genkey -v -keystore invio.keystore -alias invio -keyalg RSA -keysize 2048 -validity 10000`
2. Build signed APK in Android Studio
3. Upload to Google Play Console

### Apple App Store
1. Create App ID in Apple Developer Portal
2. Archive in Xcode
3. Upload via App Store Connect
