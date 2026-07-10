# Dash Mobile Setup - Privacy-First Approach

Dash runs on mobile two ways: as an installable **PWA** (GitHub Pages) and as a
**native iOS app** (Capacitor, on the App Store). Both are local-first and
private by default. The one thing to be precise about: the optional **Dash Sync**
feature is a network, account-based service — everything else stays on device.

## How This Maintains Your Privacy

1. **No Backend Server for the app itself** - GitHub Pages serves only static files
2. **No Analytics** - Zero tracking, no telemetry, no cookies
3. **No account required for core note-taking** - notes are created, edited, and
   encrypted entirely on-device. An account (a passwordless magic-link email) is
   needed **only if you turn on Dash Sync**.
4. **Offline-first** - after the one-time install the app works fully offline;
   the only outbound network requests are (a) the optional Dash Sync relay and
   (b) any local-AI endpoint you configure yourself.
5. **End-to-end encrypted sync (opt-in)** - if you enable Dash Sync, notes are
   encrypted on-device before upload; the relay only ever stores ciphertext and
   never sees your notes, your vault key, or your content.

## Setup Instructions

### 1. Enable GitHub Pages

1. Go to your repository settings on GitHub
2. Navigate to "Pages" in the sidebar
3. Under "Build and deployment":
   - Source: "GitHub Actions"
4. Save the settings

### 2. Deploy the PWA

The workflow will automatically deploy when you push to main:

```bash
git add .
git commit -m "Setup PWA for mobile"
git push origin main
```

### 3. Access Your PWA

After deployment (takes ~5 minutes), your PWA will be available at:
```
https://efesop.github.io/rich-text-editor
```

### 4. Install on iOS

Users can install the PWA by:
1. Visiting the URL in Safari
2. Tapping the Share button
3. Selecting "Add to Home Screen"
4. The app works fully offline after installation (until you opt into Dash Sync)

Most iOS users should instead install the **native Dash app from the App Store**
(bundle `io.dashnote.app`), which is the primary, best-supported mobile path.

## Privacy Guarantees

- **GitHub Pages**: No server-side code for the app, no data collection
- **Static Files Only**: Just HTML, CSS, JS - no backend
- **Service Worker**: Caches everything for offline use
- **Local by default**: notes stay on the device unless you enable Dash Sync
- **Sync is zero-knowledge**: the relay stores only ciphertext; billing
  identifiers (email, purchase state) go to Stripe / RevenueCat / Resend, never
  your note content — see the privacy policy at dashnote.io
- **Note**: the terminal (Fallout) theme loads the JetBrains Mono webfont from
  Google Fonts; that is the one external asset request in the PWA build

## Testing Locally

To test the PWA build locally:

```bash
npm run build:pwa
npx serve out -p 3000
```

Then visit http://localhost:3000/rich-text-editor

## Manual Installation Option

For maximum privacy (and no sync), users can also:
1. Download the built files from GitHub
2. Host them on their own device/server
3. Access via local network only — core note-taking works fully offline

## Why This Is Secure

1. **Local-first** - notes live on-device; Dash Sync (opt-in) uploads only
   end-to-end-encrypted ciphertext
2. **Encrypted Exports** - manual transfer via `.dashpack` files
3. **No Tracking** - no cookies, no analytics, no telemetry
4. **Open Source** - users can verify the code themselves (MIT)
5. **Self-Hostable** - the relay is open-source; users can run their own instance

## iOS: native app (Capacitor)

Dash ships a native iOS app built with Capacitor 8 (app ID `io.dashnote.app`,
on the App Store). The build/release pipeline is:

```bash
npm run build:ios      # next build + copy web assets into ios/App/App/public
npm run ios:archive    # xcodebuild archive
npm run ios:export     # xcodebuild export → build/App-export/App.ipa
# then upload the .ipa via Transporter / altool
```

(See [docs/ios-app-store-launch.md](docs/ios-app-store-launch.md) for the full
App Store submission walkthrough.)

## Current Status

✅ PWA manifest + service worker (offline support)
✅ GitHub Actions workflow for PWA deploy
✅ Native iOS app on the App Store (Capacitor 8)
✅ Local-first, no analytics, no tracking
✅ Optional end-to-end-encrypted Dash Sync (subscription)
