# Dash — Style & Theme Guide

## Overview

Dash is a privacy-first, offline-first note-taking app built with Next.js 13, React 18, Editor.js, Electron, and Tailwind CSS. It has four themes, each with a distinct visual identity.

---

## Themes

### Detection

Theme is managed by `next-themes` with `attribute="class"` — the theme name is set as a class on `<html>`. Components detect the theme via:

```js
const { theme } = useTheme()
const isFallout = theme === 'fallout'
const isDark = theme === 'dark'
const isDarkBlue = theme === 'darkblue'
// Light is the default/else case
```

The conditional class pattern used everywhere:

```js
isFallout ? '...fallout...'
  : isDarkBlue ? '...darkblue...'
    : isDark ? '...dark...'
      : '...light...'
```

### Color Palettes

#### Light
| Role | Value |
|------|-------|
| Background | `bg-white` / `#ffffff` |
| Text primary | `text-neutral-900` |
| Text secondary | `text-neutral-500` |
| Text muted | `text-neutral-400` |
| Surface (inputs) | `bg-neutral-50` |
| Sidebar | `linear-gradient(#f0f0f0, #f7f7f7)` |
| Border | `border-neutral-200` |
| Hover | `bg-neutral-100` / `bg-neutral-200` |
| Active item | `bg-neutral-200 text-neutral-900` |
| Accent / CTA | `bg-blue-600 text-white`, hover `bg-blue-700` |
| Focus ring | `rgba(99, 102, 241, 0.3)` |
| Error | `bg-red-50 text-red-600 border-red-200` |
| Scrollbar thumb | `rgba(0, 0, 0, 0.15)` |

#### Dark
| Role | Value |
|------|-------|
| Background | `bg-[#0d0d0d]` |
| Text primary | `text-[#ececec]` |
| Text secondary | `text-[#c0c0c0]` |
| Text muted | `text-[#8e8e8e]` |
| Text faint | `text-[#6b6b6b]` |
| Sidebar | `linear-gradient(#161616, #1f1f1f)`, inset border `#2e2e2e` |
| Surface | `bg-[#2f2f2f]` |
| Hover | `bg-[#3a3a3a]` / `bg-[#232323]` (sidebar) |
| Border | `border-[#2e2e2e]` / `border-[#3a3a3a]` |
| Active item | `bg-[#2f2f2f] text-[#ececec]` |
| Accent / CTA | `bg-blue-600 text-white`, hover `bg-blue-500` |
| Primary button | `bg-white text-[#0d0d0d]` |
| Scrollbar thumb | `#3a3a3a`, hover `#4a4a4a` |

#### Dark Blue
| Role | Value |
|------|-------|
| Background | `bg-[#0c1017]` |
| Text primary | `text-[#e0e6f0]` |
| Text secondary | `text-[#8b99b5]` |
| Text muted | `text-[#5d6b88]` |
| Text faint | `text-[#445068]` |
| Sidebar | `linear-gradient(#111827, #0f1520)`, inset border `#1c2438` |
| Surface | `bg-[#1a2035]` / `bg-[#141825]` (modals) |
| Hover | `bg-[#232b42]` / `bg-[#161c2e]` (sidebar) |
| Border | `border-[#1c2438]` |
| Active item | `bg-[#1a2035] text-[#e0e6f0]` |
| Accent / CTA | `bg-blue-500 text-white`, hover `bg-blue-400` |
| Scrollbar thumb | `#1c2438`, hover `#232b42` |

#### Fallout (Terminal)
| Role | Value |
|------|-------|
| Background | `bg-gray-900` / `bg-gray-950` |
| Text primary | `text-green-400` |
| Text secondary | `text-green-600` / `text-green-500` |
| Text muted | `text-green-700` |
| Sidebar | `linear-gradient(#1f2a1f, #111a11)`, inset border `rgba(34, 197, 94, 0.15)` |
| Surface | `bg-gray-800` |
| Border | `border-green-500/30` / `border-green-600/20` |
| Hover | `bg-gray-800` |
| Active item | `bg-green-700/30 text-green-300` |
| Accent / CTA | `bg-green-500 text-gray-900`, hover `bg-green-400` |
| Modal border | `border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]` |
| Font | `JetBrains Mono`, monospace (forced via `!important` globally) |
| Glow | `box-shadow: 0 0 3px hsla(120, 100%, 50%, 0.2)` on buttons |
| Hover glow | `text-shadow: 0 0 3px currentColor` on interactive elements |
| Scrollbar thumb | green (`hsl(var(--primary))`) |

---

## CSS Variables

Defined in `styles/globals.css` under `@layer base` using HSL. Four rulesets: `:root` (light), `.dark`, `.darkblue`, `.fallout`.

Key variables: `--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius` (0.5rem).

Usage: `hsl(var(--background))`. Mostly consumed by the fallout theme's global CSS overrides.

---

## Fonts

| Context | Font |
|---------|------|
| Default (all themes except fallout) | System font stack (Tailwind default) |
| Fallout theme | `JetBrains Mono`, `Courier New`, monospace — applied globally with `!important` |
| Seed phrase blocks | `SF Mono`, `Fira Code`, `Roboto Mono`, monospace |

---

## Text Sizing

| Element | Size |
|---------|------|
| App name ("Dash") | `text-base font-semibold` |
| Page title (sidebar) | `text-sm` |
| Page title (header) | `text-lg font-semibold` |
| Modal title | `text-lg font-semibold` |
| Modal subtitle | `text-sm` |
| Footer | `text-xs` |
| Tags | `text-xs` (`px-1.5 py-0.5`) |
| Buttons | `font-medium` |
| Folder count badge | `text-xs px-1.5 rounded-full` |
| Encryption indicator | `text-xs font-medium` |

### Editor Headings (globals.css)

- h1: `2.5em`, h2: `2em`, h3: `1.75em`, h4: `1.5em`, h5: `1.25em`, h6: `1em`
- All: `font-weight: bold`, `line-height: 1.3`, `margin-bottom: 0.5em`
- Uses `padding-top` (NOT `margin-top`) for toolbar alignment

---

## Spacing

| Context | Value |
|---------|-------|
| Modal header | `px-6 pt-6 pb-4` |
| Modal content | `p-6` |
| Modal footer | `px-6 py-4` |
| Sidebar items | `px-3 py-2` |
| Header | `px-6 py-3` |
| Footer | `px-6 py-2` |
| Button gap | `gap-3` |
| Item gap | `gap-2` |

---

## Border Radius

| Context | Value |
|---------|-------|
| Modals, large buttons | `rounded-2xl` |
| Inputs, icon containers | `rounded-xl` |
| List items, dropdowns | `rounded-lg` |
| Small elements | `rounded-md` |

---

## UI Patterns

### Modal

- **Overlay:** `fixed inset-0 z-50 flex items-center justify-center p-4`
- **Backdrop:** `fixed inset-0 bg-black/60 backdrop-blur-sm` — **must** have `onClick={onClose}` directly on backdrop div
- **Container:** `relative w-full max-w-md rounded-2xl overflow-hidden`
  - Light: `bg-white`
  - Dark: `bg-[#2f2f2f]`
  - DarkBlue: `bg-[#141825]`
  - Fallout: `bg-gray-900 border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]`
- **Header:** Icon in themed rounded-xl container + title + subtitle + bottom border
- **Footer:** Cancel (secondary) + Action (primary) buttons + top border

### Primary Button

```
px-4 py-3 rounded-xl font-medium transition-all duration-200 disabled:opacity-40
```

- Light: `bg-blue-600 text-white hover:bg-blue-700`
- Dark: `bg-white text-[#0d0d0d] hover:bg-[#e0e0e0]` or `bg-blue-600 text-white hover:bg-blue-500`
- DarkBlue: `bg-blue-500 text-white hover:bg-blue-400`
- Fallout: `bg-green-500 text-gray-900 hover:bg-green-400 font-mono shadow-[0_0_20px_rgba(34,197,94,0.3)]`

### Secondary / Cancel Button

```
flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200
```

- Light: `bg-gray-100 text-gray-700 hover:bg-gray-200`
- Dark: `bg-[#2f2f2f] border border-[#3a3a3a] text-[#c0c0c0] hover:bg-[#3a3a3a]`
- DarkBlue: `bg-[#1a2035] border border-[#1c2438] text-[#8b99b5] hover:bg-[#232b42]`
- Fallout: `bg-gray-800 border border-green-500/40 text-green-400 hover:bg-gray-700 font-mono`

### Input

```
w-full px-4 py-3 text-base rounded-xl transition-all duration-200 focus:outline-none focus:ring-2
```

- Light: `bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-blue-500/30`
- Dark: `bg-[#1a1a1a] border border-[#3a3a3a] text-white placeholder-[#6b6b6b] focus:ring-blue-500/50`
- DarkBlue: `bg-[#141825] border border-[#1c2438] text-[#e0e6f0] placeholder-[#5d6b88] focus:ring-blue-500/50`
- Fallout: `bg-gray-900 border border-green-500/40 text-green-400 placeholder-green-700 font-mono focus:ring-green-500/50`

### Dropdown Menu

- `position: fixed` (required in sidebar — overflow clips absolute elements)
- `w-48 rounded-lg py-1`, items: `block px-4 py-2 text-sm w-full text-left`
- `z-index: 9999`

### Page List Item (Sidebar)

```
flex items-center justify-between px-3 py-2 cursor-pointer text-sm rounded-lg
transition-colors duration-150 overflow-hidden mx-1
```

- Inside folder: `ml-5 mr-1 rounded-l-none border-l-2`
- Title: `flex-1 truncate min-w-0`
- Three-dot menu: opacity 0, opacity 1 on hover (always visible on mobile)
- Lock icon: `h-3 w-3 flex-shrink-0 mr-1.5`

---

## Sidebar Layout

- Open: `w-64`, Collapsed: `w-16`, Transition: `transition-all duration-300`
- Mobile: `fixed z-50 inset-y-0 left-0 w-3/4 max-w-xs` with slide transform
- Background: gradient classes — `sidebar-panel` (dark), `sidebar-panel-light`, `sidebar-panel-fallout`, `sidebar-panel-darkblue`
- Wrapper divs must have `w-full min-w-0`
- Outer div must have `overflow-hidden`
- Tags use `flex-shrink-0` — title truncates, tags don't

### Critical Sidebar Rules

- Popups/tooltips must use `position: fixed` (sidebar has `overflow-hidden` ancestors)
- Any `z-index` element inside sidebar must be wrapped in `isolate` container
- Keep z-index values low (1-3) to prevent leaking above modals

---

## Icons

All icons from `lucide-react`.

| Size | Usage |
|------|-------|
| `w-5 h-5` | Modal/header icons |
| `w-4 h-4` | Sidebar icons, dropdown items, folder icons |
| `w-3.5 h-3.5` | Checkbox marks |
| `w-3 h-3` | Small inline icons (lock, chevrons) |
| `w-8 h-8` | Empty state illustrations |

**Critical:** SVG icons in header buttons must have `pointer-events-none` to not block parent button's `title` tooltip.

Folder chevrons: `strokeWidth={2}`. Folder icons: `strokeWidth={1.5}`.

---

## Animations & Transitions

### Standard Transitions

- Hover states: `transition-colors duration-150`
- Buttons, inputs, modals: `transition-all duration-200`
- Sidebar open/close: `transition-all duration-300`
- Theme body transition: `background-color 0.3s ease, color 0.3s ease`

### Focus Mode

- Paragraph dimming: `.ce-block { opacity: 0.25; transition: opacity 0.2s ease; }`, focused block at `opacity: 1`
- Hidden scrollbar: `::-webkit-scrollbar { display: none; }`

### Self-Destruct Animations (globals.css)

- `dash-sd-pulse-anim` (600ms) — scale pulse
- `dash-sd-shake-anim` (500ms) — horizontal shake
- `dash-sd-urgent-pulse-anim` (800ms infinite) — pulsing with red/green glow
- `dash-sd-dissolve-anim` (800ms) — scale/fade deletion
- Fallout variant: green glow flash instead of red

### Reduced Motion

All animations respect `@media (prefers-reduced-motion: reduce)`.

---

## Features Panel (FeaturesPanel.js)

A slide-over drawer from the right edge, opened via the Sparkles button in the bottom bar.

### Panel Layout
- **Width:** `w-[440px] max-w-[90vw]`
- **Position:** `fixed top-0 right-0 bottom-0 z-50`
- **Backdrop:** `fixed inset-0 z-40 bg-black/40` with click-to-close
- **Entry animation:** `transition-transform duration-300 ease-out` — slides in from `translate-x-full` to `translate-x-0`
- **Close:** Escape key or click backdrop or X button

### Card Entrance Animation
Each feature card stagger-animates in when the panel opens:
```css
.dash-feat-card-enter {
  animation: dash-feat-slide-in 0.35s ease-out both;
}
@keyframes dash-feat-slide-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```
Cards get incrementing `animation-delay: index * 60ms` for a cascading effect.

### Category Filter Chips
Horizontal row of filter buttons: All, Security, Editor, Navigation. Active chip gets accent background, inactive gets subtle border.

### Feature Card Structure
Each card: `p-4 rounded-xl border` containing:
- **Left:** Icon in a `w-9 h-9 rounded-lg` container
- **Center:** Title (text-sm font-medium) + optional keyboard shortcut badge + description (text-xs)
- **Right:** Animated illustration in a `w-16 h-16` container

### Feature Illustrations — CSS Animations

Each feature card has a small looping CSS animation on the right side. All animations use `transform` and `opacity` only (no layout thrashing). Colors are theme-aware via JS-computed `accent`, `muted`, and `textMuted` variables.

#### `lock` — Page Encryption
**Visual:** A mini document with blue text lines that fade out, then matrix-style cascading numbers rain down.
- Text lines fade via `dash-feat-lock-lines` (5s cycle): opacity 1→0 at 30-40%
- Matrix columns appear via `dash-feat-lock-matrix-show` (5s): opacity 0→1 at 35-45%
- Each number column cascades down via `dash-feat-lock-cascade`: translateY -100%→0
- Individual digits pulse via `dash-feat-lock-digit` (1.2s): opacity cycles 0→1→0.7
- Columns have staggered delays (0s, 0.2s, 0.1s, 0.3s, 0.15s)

#### `shield` — Auto-Lock & Touch ID
**Visual:** A mini app screen with content lines, then a dark overlay slides down from the top, and a fingerprint icon pulses.
- Overlay slides via `dash-feat-shield-slide` (5s): translateY -100%→0 at 30-50%, holds, slides back up at 80-100%
- Fingerprint pulses via `dash-feat-fp-pulse` (5s): opacity 0→1 at 50-60%, scales 1→1.2→1 at 60-70%

#### `duress` — Duress Password
**Visual:** A screen with a password field — dots appear one by one, then all content lines vanish.
- Dots appear via `dash-feat-duress-type` (4.5s): scale 0→1 from 10-40%, each dot has 0.3s stagger
- Content lines vanish via `dash-feat-duress-vanish` (4.5s): opacity 1→0 and translateY 0→-5px at 50-65%

#### `timer` — Self-Destructing Notes
**Visual:** A document with text lines that fade, then flames rise from the bottom burning the page upward.
- Text lines fade via `dash-feat-timer-lines-fade` (4s): opacity 1→0 from 30-50%
- 5 flames with gradient backgrounds (yellow→orange→transparent) animate via `dash-feat-flame-a` and `dash-feat-flame-b` (4s): scale from 0→1 with translateY shifting upward, staggered delays
- A burn overlay (`dash-feat-timer-burn`) rises from the bottom via `dash-feat-timer-burn-up`: height 0→100% with orange/red gradient

#### `key` — Seed Phrase Storage
**Visual:** A 3×2 grid of cells, each appearing one by one with a number label and a colored bar.
- Each cell appears via `dash-feat-key-appear` (3s): opacity 0→1 + translateY 4px→0, staggered by 0.3s per cell

#### `folders` — Folders & Tags
**Visual:** A sidebar-like list with a folder item. The chevron rotates, the nested section expands, and pages slide in one by one — each with a blue tag chip.
- Chevron rotates via `dash-feat-chevron-rotate` (5s): rotate 0→90deg at 10-15%, back at 80-85%
- Nested section expands via `dash-feat-nested-expand` (5s): max-height 0→60px + opacity 0→1 at 15-30%
- Pages slide in via `dash-feat-page-slide-in` (5s): opacity 0→1 + translateX -8px→0, staggered (0.3s, 0.45s, 0.6s)
- Tag chips are static blue shades: `#3b82f6`, `#60a5fa`, `#93c5fd`

#### `drag` — Drag & Drop
**Visual:** Three list items with grip handles. The middle item (accent-colored) moves up and down.
- Middle item animates via `dash-feat-drag-move` (3s): translateY 0→-18px→0

#### `link` — Page Linking
**Visual:** Two mini page cards with a connecting line that grows between them.
- Line grows via `dash-feat-link-connect` (2.5s): scaleX 0→1 from center

#### `code` — Syntax-Highlighted Code
**Visual:** Indented code lines with blue syntax-colored bars that type in from left.
- Each line appears via `dash-feat-code-type` (3s): width 0→100%, staggered by 0.4s

#### `focus` — Focus Mode
**Visual:** Five paragraph lines — the middle one is bright (accent color), the others dim and pulse.
- Dim lines pulse via `dash-feat-focus-fade` (3s): opacity cycles 0.25→0.15→0.25
- Active line glows via `dash-feat-focus-glow` (3s): opacity cycles 0.8→1→0.8

#### `search` — Quick Switcher
**Visual:** A search bar with text typing in, then two result items appear below.
- Search text bar grows via `dash-feat-search-type` (2.5s): width 0→100%
- Results appear via `dash-feat-search-reveal` (2.5s): opacity 0→1 + translateY 4px→0

#### `keyboard` — Keyboard Shortcuts
**Visual:** Two keyboard key caps (⌘ and P), the P key presses down.
- P key presses via `dash-feat-kb-press` (2s): translateY 0→2px→0 with scale 0.95→1

#### `palette` — Four Themes
**Visual:** Four colored circles in a row — white (light), gray (dark), blue (darkblue), green (fallout). Each pops in with scale.
- Circles pop via `dash-feat-palette-pop` (4s): scale 1→1.25→1, staggered by 0.5s
- Fallout circle has green glow: `box-shadow: 0 0 6px rgba(34, 197, 94, 0.3)`

#### `export` — Export & Import
**Visual:** A mini document with an arrow bouncing downward, then format labels (PDF, MD, DOCX) appear.
- Arrow bounces via `dash-feat-export-bounce` (3s): translateY 0→3px→0
- Format labels appear via `dash-feat-export-fmt-show` (3s): opacity 0→1 + scale 0.8→1, staggered by 0.3s

#### `blockmenu` — Block Menu
**Visual:** A plus button that pulses, then three menu items slide in from the left.
- Plus button pulses via `dash-feat-bm-pulse` (3.5s): scale 1→1.1→1
- Menu items slide via `dash-feat-bm-item-show` (3.5s): opacity 0→1 + translateX -6px→0, staggered (0.3s, 0.5s, 0.7s)

#### `undo` — Undo & Redo
**Visual:** A text line that grows with a blinking cursor, then an undo arrow spins.
- Text line grows via `dash-feat-undo-type` (3s): width 0→100%→60% (types then rewinds)
- Cursor blinks via `dash-feat-cursor-blink` (0.8s step-end): opacity 1→0→1
- Undo arrow spins via `dash-feat-undo-spin` (3s): rotates 0→-360deg at 60-80%

### Animation Design Rules
- All animations use `transform` and `opacity` only — no layout properties (width/height changes use `max-height` or `scaleX`)
- All animations loop infinitely with natural rest periods (elements return to starting state)
- Cycle lengths range from 2.5s to 5s — slow enough to not be distracting
- Stagger delays create sequential reveal effects within each illustration
- Theme-aware: colors computed in JS from `accent`/`muted`/`textMuted` variables, not hardcoded in CSS
- All prefixed with `dash-feat-` to avoid conflicts with other CSS

---

## Z-Index Layering

| Element | Z-Index |
|---------|---------|
| Sidebar (mobile) | `z-50` |
| Standard modals | `z-50` |
| Lock screen | `z-[100]` |
| Dropdown menus | `z-[9999]` |
| ActionSheet | `z-[10000]` |

---

## Lock Screen

- Full-screen fixed overlay at `z-[100]`
- Centered: `max-w-sm px-6`
- Logo + lock icon in themed `rounded-2xl` container
- Light: `bg-gray-50`, Dark: `bg-[#0d0d0d]`, DarkBlue: `bg-[#0a0e18]`, Fallout: `bg-gray-950`
- Brute-force protection: escalating cooldowns (3 attempts = 1s, 5 = 5s, 7 = 15s, 9+ = 30s)

---

## Electron-Specific

- macOS: extra `pt-8 pb-3` on header for traffic light buttons
- Draggable region: 38px fixed overlay at top with `-webkit-app-region: drag`
- Header hidden in focus mode
