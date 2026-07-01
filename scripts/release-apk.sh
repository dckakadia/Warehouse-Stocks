#!/usr/bin/env bash
# Release a new APK version with auto-update support
# Usage: bash scripts/release-apk.sh 1.0.1
set -euo pipefail

VERSION=${1:-}
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>  e.g. $0 1.0.2"
  exit 1
fi

SERVER="dckakadia@116.74.77.22"
APP_DIR="/home/dckakadia/warehouse-stocks"
APK_SRC="android/app/build/outputs/apk/debug/app-debug.apk"
JAVA_HOME_21="/opt/homebrew/opt/openjdk@21"

echo "==> Bumping version to $VERSION"
# Bump versionName in build.gradle (this is what App.getInfo().version returns on device)
sed -i '' "s/versionName \"[^\"]*\"/versionName \"$VERSION\"/" android/app/build.gradle
# Increment versionCode (integer, required by Android)
CURRENT_CODE=$(grep 'versionCode' android/app/build.gradle | grep -o '[0-9]*')
sed -i '' "s/versionCode ${CURRENT_CODE}/versionCode $((CURRENT_CODE + 1))/" android/app/build.gradle
# Update version.json on server (tells old APKs a new version is available)
printf '{\n  "version": "%s",\n  "apk_url": "http://116.74.77.22:8088/updates/app-latest.apk"\n}\n' "$VERSION" > public/version.json

echo "==> Building frontend"
npm run build

echo "==> Syncing web assets to Android"
npx cap sync android

echo "==> Building APK (Java 21)"
JAVA_HOME="$JAVA_HOME_21" ./android/gradlew -p android assembleDebug

echo "==> Copying APK into dist for serving"
mkdir -p dist/updates
cp "$APK_SRC" dist/updates/app-latest.apk

echo "==> Deploying web assets + APK (version.json included)"
rsync -avz --delete dist/ "$SERVER:$APP_DIR/dist/"

echo ""
echo "✓ Released v$VERSION"
echo "  APK : http://116.74.77.22:8088/updates/app-latest.apk"
echo "  Existing APKs will see the update banner on next launch."
