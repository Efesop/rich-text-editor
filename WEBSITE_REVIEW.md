# Dash Website Review — dashnote.io

Comprehensive audit of all pages on dashnote.io with recommendations for copy, features, design, conversion, and accuracy.

---

## 1. Inaccuracies & Outdated Content (Fix ASAP)

### Features that exist but aren't mentioned anywhere
- **Live collaboration / Live sessions** — not mentioned on any page
- **Note sharing (encrypted links)** — not mentioned anywhere, this is a major feature
- **Quick Switcher (Cmd+P)** — mentioned on homepage but not on feature-focused pages
- **Multi-block selection & conversion toolbar** — not mentioned
- **Tag system with stacked tags** — barely mentioned

### Claims that are inaccurate or misleading
- **"Zero Network Requests"** on the offline-notes page — this is no longer true. The app makes network requests for: auto-updates, live sessions (WebSocket relay), and share link uploads. Should say "Your notes never leave your device" instead
- **"No servers to subpoena"** on for-journalists page — if a note is never shared, it truly never leaves the device. If a user shares a note, the content is end-to-end encrypted and stored on a relay server for up to 30 days before being automatically deleted. The relay is zero-knowledge (cannot read the content), but the server does exist. Reframe as: "Your notes never leave your device unless you choose to share them — and shared notes are end-to-end encrypted, stored temporarily, and auto-deleted after 30 days"
- **"Decoy Password: data wiping capabilities"** on guides page — wipe mode is DISABLED, only hide mode exists. The feature is called "Decoy Password" (not duress password) and it hides data, it does not wipe it. This is dangerously inaccurate and must be corrected
- **PWA described as "iOS/Android"** — it's a browser PWA, not native mobile apps. Don't imply native mobile support. Mac is the primary platform
- **"100+ downloads"** — keep this, but the coloured avatar circles (JM, AK, etc.) look like placeholder/fake testimonials rather than real social proof. Replace with actual user quotes or reviews, or redesign to look more authentic

### Outdated platform info
- Multiple pages say **"macOS, Web"** but don't explain what "Web" means (PWA)
- Mac is the main focus — CTAs should reflect this
- Download CTA says "Get Dash for Mac" — this is fine as the primary CTA

---

## 2. Missing Pages / Content Gaps

### Pages that should exist but don't
- **`/changelog`** — users/prospects want to see active development. Can link to GitHub releases: https://github.com/Efesop/rich-text-editor/releases
- **`/share` or `/collaboration`** — the encrypted sharing and live session features deserve their own landing page
- **`/download`** — no dedicated download page; CTA goes straight to payment. Non-Mac users have no clear path to the PWA
- **`/open-source`** — the app is open source on GitHub but this isn't leveraged for trust. A page explaining the open-source model would help conversion

### Missing guide topics
- **Sharing encrypted notes** — how the share feature works, the zero-knowledge model
- **Live collaboration** — how live sessions work
- **Import/Export** — detailed guide on formats, .dashpack files
- **Getting started** — basic onboarding guide

---

## 3. Conversion Rate Issues

### Pricing & Purchase Flow
- **$14.99 one-time** is buried in the page or repeated inconsistently. Some pages show it prominently, others hide it
- **"Buy with Card"** is the only payment option shown — no Apple Pay, no crypto (ironic for the bitcoiners page)
- **"Already purchased? Recover your downloads"** is in the footer — should be more prominent for returning users

### CTAs are repetitive and unfocused
- Homepage has 4+ variations: "Get Dash for Mac", "Get Dash Today", "Get Dash for $14.99", "Go truly private with Dash"
- Pick ONE primary CTA and use it consistently

### Social proof is weak
- "100+ downloads" is fine to keep, but the coloured avatar initials (JM, AK, etc.) don't convert well — they look like placeholders rather than real people
- **No quotes, no reviews, no star ratings, no press mentions**
- Add real user testimonials, App Store reviews, or press quotes
- Show GitHub stars count as a trust signal (it's open source!)

### Trust signals missing
- No security audit mention (even if not formally audited, the open-source nature allows verification)
- No privacy policy page linked prominently
- No "made by" or team page — who is behind Dash?

---

## 4. Copy & Messaging Issues

### "Military-grade encryption" is a red flag
- Security-savvy users (your target audience) consider this marketing BS
- Replace with specific: "AES-256-GCM with PBKDF2-SHA256 (600k iterations)" — you already have this on some pages, just lead with it instead

### Tone inconsistency
- Homepage is punchy and confident
- Use case pages (for-journalists, for-bitcoiners) are more corporate/formal
- Some pages repeat the exact same feature cards verbatim — feels templated
- The FAQ answers are good but could be more conversational

### Repetitive content across pages
- The same 6 feature cards (Offline, Encryption, Zero-Knowledge, etc.) appear on almost every page with identical copy
- Each landing page should have UNIQUE content tailored to that persona, not the same template with a different hero heading

### Missing emotional hooks
- No story about WHY Dash was built
- No urgency (limited offer, rising price, etc.)
- The "problem" sections describe cloud risks well but don't connect emotionally — add a scenario: "Imagine your private journal being read by a cloud provider's content moderation AI"

---

## 5. SEO & Structure Issues

### Meta & technical
- Every page title should be unique and descriptive — check if they are
- Guide pages should have proper schema markup (Article, HowTo)
- Comparison pages should target "Dash vs X" keywords explicitly in H1
- No blog — adding one would significantly help organic traffic

### Internal linking
- Guide pages don't link to each other
- Use case pages don't cross-link to relevant guides
- Comparison pages don't link to relevant feature details
- No breadcrumbs on subpages

### Missing pages for SEO
- `/blog` — regular content for organic traffic
- `/privacy-policy` — essential for trust and compliance
- `/terms` — standard for any paid product
- `/security` — dedicated security page (not just a nav anchor on homepage)

---

## 6. Design & UX Suggestions

### Landing pages
- All use case pages follow the exact same template — makes them feel low-effort
- Add persona-specific screenshots (e.g., seed phrase storage UI for bitcoiners, source protection for journalists)
- Add a "How it works" section with 3 simple steps

### Mobile responsiveness
- Check all pages on mobile — the navigation, pricing cards, and comparison tables may not be optimized

---

## 7. Feature Opportunities for the Website

### Things to add to the website (not the app)
1. **Changelog page** → link to GitHub releases: https://github.com/Efesop/rich-text-editor/releases
2. **Status page** → shows relay server uptime (builds trust for live sessions)
3. **Share page showcase** → show what a received shared note looks like
4. **GitHub activity badge** → shows the project is actively maintained: https://github.com/Efesop/rich-text-editor
5. **Testimonial collection** → add a way for users to submit reviews

---

## 8. Priority Actions (Ranked)

1. **Fix inaccuracies** — decoy password wipe claim, "zero network requests" claim, PWA platform claims
2. **Add sharing/collaboration to feature list** — it's a major differentiator you're not marketing
3. **Add real testimonials/social proof** — even 3-5 real quotes would help. Fix the avatar initials to look less like placeholders
4. **Create `/download` page** with Mac focus + PWA option
5. **Create `/changelog`** → link to https://github.com/Efesop/rich-text-editor/releases
6. **Deduplicate landing page content** — unique copy per persona
7. **Drop "military-grade"** language, lead with actual specs
8. **Add `/privacy-policy` and `/terms`** pages
