import Head from 'next/head'

export default function PrivacyPolicy () {
  return (
    <>
      <Head>
        <title>Privacy Policy — Dash Notes</title>
        <meta name="description" content="Dash Notes privacy policy. Offline-first, end-to-end encrypted, no tracking, no accounts." />
      </Head>
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1.6, color: '#222' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Dash Notes — Privacy Policy</h1>
        <p style={{ color: '#666', marginBottom: 32 }}>Last updated: 12 May 2026</p>

        <p>Dash Notes (&ldquo;Dash&rdquo;, &ldquo;the app&rdquo;, &ldquo;we&rdquo;) is a privacy-first, offline-first note-taking application. This policy explains what data the app handles, where it lives, and what we do — and don&rsquo;t do — with it.</p>

        <h2 style={{ fontSize: 22, fontWeight: 600, marginTop: 32, marginBottom: 12 }}>The short version</h2>
        <ul style={{ paddingLeft: 24 }}>
          <li>No passwords. No traditional accounts. Sign-in (only required for paid Dash Sync) is a 6-digit code emailed to you.</li>
          <li>No analytics, no tracking, no third-party SDKs.</li>
          <li>Notes live on your device. Optional sync is end-to-end encrypted; we cannot read your notes.</li>
          <li>We never sell, share, or monetize your data.</li>
        </ul>

        <h2 style={{ fontSize: 22, fontWeight: 600, marginTop: 32, marginBottom: 12 }}>What stays on your device</h2>
        <p>All notes, folders, tags, attachments, version history, and settings are stored locally on the device you create them on:</p>
        <ul style={{ paddingLeft: 24 }}>
          <li><strong>iOS / iPadOS</strong>: in the app sandbox via WKWebView IndexedDB.</li>
          <li><strong>macOS / Windows / Linux</strong>: in the user data directory (atomic-write JSON files protected by macOS Data Protection / OS-level file permissions).</li>
          <li><strong>Browser / PWA</strong>: in the browser&rsquo;s IndexedDB for the dashnote.io domain.</li>
        </ul>
        <p>Per-page encryption (passphrase-based) and app-level lock (passphrase + biometric) are performed entirely on-device using WebCrypto (PBKDF2 + AES-GCM). Decryption keys never leave the device.</p>

        <h2 style={{ fontSize: 22, fontWeight: 600, marginTop: 32, marginBottom: 12 }}>Optional sync — and what the server sees</h2>
        <p>You can optionally pair two or more of your own devices to sync notes between them. Sync is opt-in, off by default, and end-to-end encrypted:</p>
        <ul style={{ paddingLeft: 24 }}>
          <li>A vault key is generated on your first device and shared to additional devices via a one-time pairing code (decrypted only on the receiving device).</li>
          <li>All page content, attachments, version history, and metadata are encrypted on-device with the vault key (AES-GCM-256) <em>before</em> upload.</li>
          <li>The relay server stores only opaque ciphertext envelopes addressed by random vault and version IDs. The server cannot read your notes — it has no key.</li>
          <li>The server retains only the data needed to relay between your devices (encrypted blob, timestamps, size). It does not log content, IP-derived location, request bodies, or device fingerprints beyond what&rsquo;s required for rate-limiting.</li>
          <li>You can stop sync at any time. Stopping on the last paired device automatically purges the encrypted vault from the server.</li>
        </ul>
        <p>Sync infrastructure is hosted on Deno Deploy. The relay does not transmit data to any third party.</p>

        <h2 style={{ fontSize: 22, fontWeight: 600, marginTop: 32, marginBottom: 12 }}>Permissions Dash may request</h2>
        <ul style={{ paddingLeft: 24 }}>
          <li><strong>Camera</strong> — only used to scan a QR pairing code when adding a new sync device. Not used for anything else, never recorded.</li>
          <li><strong>Photo Library</strong> — only when you explicitly attach an image to a note. Selected images are stored locally inside the app.</li>
          <li><strong>Face ID / Touch ID</strong> — only to unlock the app or unlock encrypted pages, when you enable that feature. Authentication happens on-device via the OS Local Authentication framework.</li>
        </ul>
        <p>None of these permissions transmit data anywhere.</p>

        <h2 style={{ fontSize: 22, fontWeight: 600, marginTop: 32, marginBottom: 12 }}>Dash Sync (paid subscription)</h2>
        <p>Dash Sync is an optional subscription that keeps your notes in sync across devices. You can use the app indefinitely without it. When you subscribe, the following third parties handle billing or sign-in on our behalf:</p>
        <ul style={{ paddingLeft: 24 }}>
          <li><strong>Stripe</strong> — processes payments on Mac, Windows, Linux, and web. Stripe receives your email, billing address, and card details. We never see your card. For active subscribers, our relay stores your email, your Stripe customer/subscription IDs, and your subscription status (active/past-due/canceled) — solely to verify your sync entitlement.</li>
          <li><strong>RevenueCat + Apple In-App Purchase</strong> — used only on iOS. RevenueCat receives an anonymous device-generated ID and your subscription receipt from Apple. They do not receive your email.</li>
          <li><strong>Resend</strong> — sends the 6-digit sign-in code (and, one time only when sync launched, a transactional notice to existing Mac buyers). Resend sees only the destination email and the short code body. We do not use Resend for marketing.</li>
        </ul>
        <p>The sync vault itself is end-to-end encrypted as described above — none of these third parties (or we) can read your notes.</p>

        <h2 style={{ fontSize: 22, fontWeight: 600, marginTop: 32, marginBottom: 12 }}>Analytics, tracking, advertising</h2>
        <p>We do not use any analytics, telemetry, crash reporting, advertising SDK, or third-party tracker. Dash makes no network calls except: to the optional sync relay (only when sync is enabled, and only with end-to-end encrypted blobs); to Stripe/RevenueCat/Resend solely for the paid Dash Sync subscription described above; and, on macOS/Windows/Linux, to GitHub Releases for app update checks.</p>

        <h2 style={{ fontSize: 22, fontWeight: 600, marginTop: 32, marginBottom: 12 }}>Data we collect</h2>
        <p>None, in the analytics sense. We do not collect personally identifiable information, advertising identifiers, contacts, location, or device identifiers. The only server-side data is the encrypted sync envelope described above (visible to us only as ciphertext) for users who opt in to sync.</p>

        <h2 style={{ fontSize: 22, fontWeight: 600, marginTop: 32, marginBottom: 12 }}>Data deletion</h2>
        <p>Because there are no accounts, you delete your data simply by deleting notes within the app, or by uninstalling the app. If you have used sync, disabling sync on the last paired device automatically purges your encrypted vault from the server. To request manual purge of any residual server data, email the address below.</p>

        <h2 style={{ fontSize: 22, fontWeight: 600, marginTop: 32, marginBottom: 12 }}>Children</h2>
        <p>Dash is not directed at children under 13. We do not knowingly collect data from children. The app contains no advertising and no third-party content.</p>

        <h2 style={{ fontSize: 22, fontWeight: 600, marginTop: 32, marginBottom: 12 }}>Changes to this policy</h2>
        <p>If this policy changes materially, we will update the &ldquo;Last updated&rdquo; date at the top of this page and note the change in the app&rsquo;s What&rsquo;s New screen.</p>

        <h2 style={{ fontSize: 22, fontWeight: 600, marginTop: 32, marginBottom: 12 }}>Contact</h2>
        <p>Questions about this policy: <a href="mailto:efesop@gmail.com">efesop@gmail.com</a><br />
        Source code: <a href="https://github.com/Efesop/rich-text-editor">github.com/Efesop/rich-text-editor</a></p>

        <p style={{ marginTop: 48, color: '#888', fontSize: 14 }}>Filmshape Ltd. © 2026.</p>
      </main>
    </>
  )
}
