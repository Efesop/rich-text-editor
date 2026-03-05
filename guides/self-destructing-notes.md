# Self-Destructing Notes

> Context document for generating a landing/resource page about self-destructing notes and how Dash implements them.

---

## SEO Target Keywords

- self-destructing notes
- ephemeral notes app
- auto-delete notes
- temporary notes
- disappearing notes
- self-destruct timer notes
- secure note deletion
- timed note destruction

---

## What Are Self-Destructing Notes?

Self-destructing notes are documents that automatically and permanently delete themselves after a set period of time. Once the timer expires, the note is gone — no recovery, no trash folder, no undo.

The concept borrows from physical security practices: classified documents are shredded after use, temporary access badges expire, and sensitive briefings are given verbally rather than in writing. Self-destructing notes bring the same principle to digital note-taking.

### Why Use Self-Destructing Notes?

**Sensitive information with a shelf life:**
- Meeting notes containing confidential discussions
- Temporary passwords or access codes you need to reference briefly
- Draft ideas or brainstorms you want to capture but not keep
- Personal journal entries you want to process and release

**Reducing your data footprint:**
- Fewer stored notes means less exposure if a device is lost or stolen
- Temporary notes don't accumulate and clutter your workspace
- Forces intentional decisions about what's worth keeping

**Compliance and security:**
- Some industries require document retention policies with mandatory deletion
- Reducing stored personal data aligns with privacy regulations (GDPR, etc.)
- Minimizing data at rest reduces attack surface

---

## How Self-Destructing Notes Typically Work

Most implementations follow one of two approaches:

### Server-Side Destruction
The note is stored on a server with an expiration timestamp. A background job checks for expired notes and deletes them. Common in web-based sharing tools (e.g., Privnote, One Time Secret).

**Limitations**: Requires trust in the server operator. The data exists on someone else's infrastructure until deletion. Deletion may not be immediate or verifiable.

### Client-Side Destruction
The note is stored locally on the user's device with an expiration timestamp. The app itself checks the timer and performs deletion. No server involved.

**Advantages**: No third-party trust required. Deletion happens on your hardware. No network dependency — works offline.

Dash uses **client-side destruction**.

---

## How Dash Implements Self-Destructing Notes

### Setting a Timer

Users can set a self-destruct timer on any page through the page's action menu. Dash offers both preset and custom durations:

**Preset options:**
- 1 hour
- 1 day (24 hours)
- 7 days
- 30 days

**Custom options:**
- Minutes: 1 minute to 525,600 minutes (1 year)
- Hours: 1 hour to 8,760 hours (1 year)
- Days: 1 day to 365 days (1 year)

When a timer is set, Dash calculates the exact destruction timestamp (current time + duration) and stores it with the page.

### Countdown and Warnings

Once a timer is active, Dash shows a countdown badge indicating the remaining time. The countdown adapts its precision based on urgency:

- **More than 1 hour remaining**: Updates every 60 seconds, shows hours/minutes
- **10 minutes to 1 hour**: Updates every 30 seconds
- **1 minute to 10 minutes**: Updates every 5 seconds
- **Under 1 minute**: Updates every second, shows exact seconds remaining

**Visual milestones** alert the user as the deadline approaches:

| Time Remaining | Visual Change |
|---------------|---------------|
| Under 2 hours | Badge color shifts to warm/urgent tones |
| 10 minutes | Brief pulse animation on the badge |
| 5 minutes | Double pulse, timer icon begins periodic animation |
| 1 minute | Shake animation, countdown switches to seconds |
| 10 seconds | Continuous urgent pulse with colored glow effect |

The sidebar page icon also reflects urgency — the timer icon changes color and pulses intermittently in the final minutes.

### What Happens When the Timer Expires

**If you're not viewing the page:**
- The page is immediately and permanently deleted from storage
- The sidebar item animates out with a dissolve effect (opacity fade + scale down)

**If you're currently viewing the page:**
- A full-screen overlay appears with a brief message ("This page has self-destructed")
- The app automatically navigates to the next available page
- The page is permanently deleted from storage after the overlay completes
- The sidebar item dissolves simultaneously

### Cancellation

Self-destruct timers can be cancelled at any time before they expire through the same page action menu. Cancelling removes the timer completely — the page returns to being a normal, permanent page.

### Combining with Encryption

Self-destructing notes can be combined with page encryption for maximum security:
- Lock a page with a password (encrypts the content with AES-256-GCM)
- Set a self-destruct timer
- Result: the note is encrypted while it exists and automatically destroyed when the timer expires
- Even if someone bypasses the deletion somehow, the content remains encrypted

---

## Technical Details

### Timer Storage
- The destruction time is stored as a Unix timestamp in milliseconds (`selfDestructAt` field)
- The timer is absolute (a specific point in time), not relative — so it works correctly even if the app is closed and reopened
- The check runs every 5 seconds when the app is open

### Deletion Behavior
- Deletion is permanent — there is no soft delete, trash, or recovery mechanism
- The page is removed from the storage backend (localStorage, IndexedDB, or file system depending on platform)
- If the page was inside a folder, it's cleanly removed from the folder's page list

### Edge Cases
- **App closed when timer expires**: The page is deleted on the next app launch when the timer check detects it's past the deadline
- **Multiple pages expiring**: Each page is handled independently; multiple can expire and delete in the same check cycle
- **Encrypted + self-destructing**: Encryption is irrelevant to the timer — the entire page record (encrypted or not) is deleted

---

## Key Differentiators vs Other Approaches

| Feature | Dash | Web-based burn notes | Cloud note apps |
|---------|------|---------------------|-----------------|
| Where data lives | Your device only | Third-party server | Cloud storage |
| Deletion verified | Yes (local storage) | Trust the server | Usually no auto-delete |
| Works offline | Yes | No | No |
| Custom durations | 1 min to 1 year | Usually fixed options | Rarely available |
| Combine with encryption | Yes (AES-256-GCM) | Sometimes (server-side) | Rarely |
| Visual countdown | Yes, with urgency milestones | Usually just a badge | No |
| Cancel before expiry | Yes | Sometimes | N/A |
