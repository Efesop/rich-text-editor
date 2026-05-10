# Capacitor iOS → App Store Connect / TestFlight: end-to-end recipe

This doc captures everything needed to take a Capacitor 6 Next.js app from
"works on simulator" → "delivered build in App Store Connect / TestFlight"
in one session. Written so it's portable: paste into a new chat for a
different app and just sub in your identifiers.

---

## Prerequisites

- macOS with Xcode 16+
- $99/yr Apple Developer Program membership, paid (you'll have a Team ID)
- Capacitor 6 iOS scaffold (`ios/App/App.xcworkspace` exists)
- Next.js project with `output: 'export'`, `assetPrefix: './'`
- Node + npm at `/usr/local/bin` (or adjust PATH commands below)

## Identifiers you'll need (collect first)

| Field | Where | Example |
|---|---|---|
| Apple Team ID | developer.apple.com → Account → Membership Details | `9888FL2CQ6` |
| Bundle ID | Pick — must be unique reverse-domain | `io.yourapp.app` |
| App name | Pick — must not collide on App Store | `Your App Notes` |
| App SKU | Pick — internal, never shown | `yourapp-ios-1` |

---

## Step 1 — Create the App ID at developer.apple.com

1. https://developer.apple.com/account/resources/identifiers/list
2. Click `+` → App IDs → Continue
3. Type: App → Continue
4. Description: app name. Bundle ID: explicit, paste your reverse-domain string.
5. Capabilities: leave default unless you need Push, iCloud, In-App Purchase, etc. (Face ID local prompt does NOT need an entitlement.)
6. Continue → Register

## Step 2 — Create the App listing at App Store Connect

1. https://appstoreconnect.apple.com/apps
2. Click `+` → New App
3. Platforms: iOS. Name: app name (this shows on the store). Primary Language. Bundle ID: pick the one you just registered. SKU: anything internal-only.
4. User Access: Full Access. Click Create.

You now have an ASC App ID (10-digit number visible in URL: `appstoreconnect.apple.com/apps/<APP_ID>/...`). Save it for tax records / API calls.

## Step 3 — Wire Capacitor config for production

`capacitor.config.ts`:
```ts
const config: CapacitorConfig = {
  appId: 'io.yourapp.app',
  appName: 'Your App',
  webDir: 'out',
  // Default `capacitor://` scheme is secure — wss:// works without
  // mixed-content workaround. Re-add `server: { iosScheme: 'http' }`
  // ONLY when developing against `ws://localhost` relay locally.
  ios: {
    contentInset: 'never',
    backgroundColor: '#ffffff',
    scrollEnabled: true
  },
  // ...plugin configs
}
```

`.env.production` (for prod relay/API URLs):
```
NEXT_PUBLIC_RELAY_URL=wss://your-prod-relay.example.com
```

But — Next.js `.env.local` overrides `.env.production` even during `next build`. The reliable pattern is to inline the env in the build script (`process.env > .env.*`):
```json
"build:ios":   "NEXT_PUBLIC_RELAY_URL=wss://prod next build && cap sync ios",
"ios:archive": "NEXT_PUBLIC_RELAY_URL=wss://prod next build && cap sync ios && xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release -destination 'generic/platform=iOS' -archivePath build/App.xcarchive -allowProvisioningUpdates archive",
"ios:export":  "xcodebuild -exportArchive -archivePath build/App.xcarchive -exportPath build/App-export -exportOptionsPlist ios/App/ExportOptions.plist -allowProvisioningUpdates"
```

`-allowProvisioningUpdates` is mandatory. Without it: `error: No profiles for '<bundle-id>' were found`.

## Step 4 — Apple privacy manifest (iOS 17+ requirement)

Create `ios/App/App/PrivacyInfo.xcprivacy`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array/>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>C617.1</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
```

Add data types to `NSPrivacyCollectedDataTypes` if you collect any (analytics, crash reporting, ads). Reason codes: see Apple's [required reasons API list](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_use_of_required_reason_api).

The file alone isn't enough — Xcode must include it in the bundle. **Edit `ios/App/App.xcodeproj/project.pbxproj` directly** (Capacitor's stock template doesn't reference it):

Pick a unique 24-char hex prefix per new file, e.g. `D45H100000000000000000XX`. Add four entries:

1. **PBXBuildFile** section (top of file):
   ```
   D45H10000000000000000001 /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = D45H10000000000000000002 /* PrivacyInfo.xcprivacy */; };
   ```
2. **PBXFileReference** section:
   ```
   D45H10000000000000000002 /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };
   ```
3. **PBXGroup** for the App group (the one listing Info.plist) — add to children:
   ```
   D45H10000000000000000002 /* PrivacyInfo.xcprivacy */,
   ```
4. **PBXResourcesBuildPhase** files list:
   ```
   D45H10000000000000000001 /* PrivacyInfo.xcprivacy in Resources */,
   ```

Validate with `plutil -lint ios/App/App.xcodeproj/project.pbxproj`.

## Step 5 — Set version + signing in pbxproj

Capacitor's default `MARKETING_VERSION = 1.0` and no `DEVELOPMENT_TEAM`. Both block archive. Edit pbxproj:

```bash
sed -i '' 's/MARKETING_VERSION = 1.0;/MARKETING_VERSION = 1.4.0;/g' ios/App/App.xcodeproj/project.pbxproj
sed -i '' 's/CODE_SIGN_STYLE = Automatic;/CODE_SIGN_STYLE = Automatic;\n        DEVELOPMENT_TEAM = YOUR_TEAM_ID;/g' ios/App/App.xcodeproj/project.pbxproj
```

(Replace `YOUR_TEAM_ID` with your 10-char Team ID.) `CURRENT_PROJECT_VERSION = 1` is fine for first build — bump on every upload, App Store Connect rejects duplicate build numbers.

## Step 6 — Export options plist

Create `ios/App/ExportOptions.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>uploadSymbols</key>
  <true/>
  <key>compileBitcode</key>
  <false/>
  <key>teamID</key>
  <string>YOUR_TEAM_ID</string>
</dict>
</plist>
```

(`app-store` is deprecated for `app-store-connect` — both work.)

## Step 7 — Sign in Xcode

Open Xcode → Settings → Accounts → `+` → Apple ID. Filmshape Ltd / your team should appear. Sessions expire periodically — you'll see `error: Unable to log in with account ... rejected` when this happens; just re-sign in.

## Step 8 — Archive

```bash
PATH="/usr/local/bin:$PATH" LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm run ios:archive
```

`LANG=en_US.UTF-8` is required for CocoaPods on Ruby 2.6 (system Ruby on macOS) — without it `pod install` errors with `Encoding::CompatibilityError`.

First-time archive triggers Xcode to auto-create:
- Apple Distribution cert in your login keychain
- App Store provisioning profile at developer.apple.com/account/resources/profiles
Both live ~1 year, reused by future archives.

`build/App.xcarchive` lands on success. ~5 min for cold cache.

## Step 9 — Export to .ipa

```bash
PATH="/usr/local/bin:$PATH" npm run ios:export
```

`build/App-export/App.ipa` lands on success.

## Step 10 — Upload via Transporter

```bash
open "macappstore://apps.apple.com/app/transporter/id1450874784"
```

Install (one-click). Open Transporter → it auto-signs in with your Apple ID. Drag `build/App-export/App.ipa` in. Wait for validation (10s). Click DELIVER. Upload completes in 1-3 min, then ASC starts processing for ~10-15 min.

(Alternatives: `xcrun altool --upload-app -f App.ipa -t ios --apiKey ... --apiIssuer ...` for CI; Xcode Organizer GUI if archive lives in `~/Library/Developer/Xcode/Archives/`. Transporter is fastest for one-off humans.)

## Step 11 — Wait for ASC processing

Email lands at your developer email when the build finishes processing: "Build 1.4.0 (1) is now available for testing." TestFlight tab activates in ASC.

## Step 12 — TestFlight

ASC → your app → TestFlight tab:
- **Internal Testing** group: add your Apple ID emails (up to 100 testers, no Beta App Review). Install TestFlight on the device, log in with that Apple ID, build appears.
- **External Testing** group: up to 10000 testers, gets a 24-72h Beta App Review the first time you submit a new external build. Faster after that.

## Step 13 — Public App Store submission (when ready)

ASC → your app → Distribution tab. Required:
- Description (≤4000 chars)
- Keywords (≤100 chars total, comma-separated)
- Support URL, Privacy Policy URL
- Screenshots (1242×2688 iPhone 6.5", 2048×2732 iPad if iPad-eligible)
- "What's New" — copy from your changelog
- Promotional text (≤170 chars)

Click Submit for Review. 1-3 day Apple turnaround.

---

## Failure-mode catalog

| Error | Cause | Fix |
|---|---|---|
| `error: No profiles for 'X' were found` | xcodebuild can't auto-create profile | Add `-allowProvisioningUpdates` |
| `error: Unable to log in with account 'X' ... rejected` | Xcode session expired | Xcode → Settings → Accounts → Re-Sign In |
| `error: Signing for 'App' requires a development team` | `DEVELOPMENT_TEAM` missing in pbxproj | sed-edit per Step 5 |
| `Encoding::CompatibilityError` from CocoaPods | Ruby 2.6 + non-UTF-8 locale | `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx cap sync ios` |
| Build: "PrivacyInfo.xcprivacy not found" / build succeeds but TestFlight rejects "missing privacy manifest" | File on disk but not in pbxproj | Add the four pbxproj entries per Step 4 |
| ASC: "Invalid build number — same as a previous upload" | `CURRENT_PROJECT_VERSION` not bumped | Increment in pbxproj before re-archive |
| Capacitor sim shows old assets after edit | WKWebView cache | Long-press app → Remove App; Xcode Product → Clean Build Folder; re-Run |
| Build: "ITMS-90171 Invalid Bundle Structure" | Missing required Info.plist key (often `NSFaceIDUsageDescription` if you call BiometricAuth) | Add the matching `NS<thing>UsageDescription` key |

## What's autonomous-able vs human-required

If automating with an agent, these need a human touch (auth):
- Apple ID password / 2FA (Xcode Settings → Accounts → Sign In)
- Mac App Store install (Transporter) — needs Apple ID auth in App Store
- API key generation (or app-specific password) if going the altool route
- App listing prose (description, keywords) on first launch

Everything else is scriptable: pbxproj edits, env files, xcodebuild, Transporter drag (via macOS automation if granted full-tier access), API key upload via altool.
