#!/bin/bash

# Build script for Invio Mobile App
# Usage: ./scripts/build-mobile.sh [android|ios|all]

set -e

PLATFORM=${1:-android}

echo "🚀 Building Invio Mobile App..."

# Step 1: Build Next.js for production
echo "📦 Building Next.js..."
npm run build

# Step 2: Export static files (for Capacitor)
echo "📄 Exporting static files..."
# Note: For API routes, we use live server URL in capacitor.config.ts

# Step 3: Sync Capacitor
echo "🔄 Syncing Capacitor..."
npx cap sync

# Step 4: Build native app
if [ "$PLATFORM" = "android" ] || [ "$PLATFORM" = "all" ]; then
    echo "🤖 Building Android..."
    cd android
    ./gradlew assembleDebug
    echo "✅ Android APK: android/app/build/outputs/apk/debug/app-debug.apk"
    cd ..
fi

if [ "$PLATFORM" = "ios" ] || [ "$PLATFORM" = "all" ]; then
    echo "🍎 Building iOS..."
    cd ios/App
    xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug -sdk iphonesimulator build
    cd ../..
fi

echo ""
echo "✨ Build complete!"
echo ""
echo "To open in IDE:"
echo "  Android: npx cap open android"
echo "  iOS:     npx cap open ios"
