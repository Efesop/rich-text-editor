# Local AI for Note-Taking

> Context document for generating a landing/resource page about local AI integration in note-taking apps and how Dash implements it.

---

## SEO Target Keywords

- local AI notes app
- offline AI writing assistant
- private AI note taking
- AI notes without cloud
- local LLM note app
- AI writing assistant offline
- private AI summarizer
- on-device AI notes
- AI note taking no data sharing
- Ollama notes app
- LM Studio writing assistant
- local AI text editor

---

## What Is Local AI?

Local AI means running artificial intelligence models directly on your own computer, rather than sending your data to a cloud service. The AI model runs as software on your machine — your text never leaves your device, and no company ever sees what you write.

This is fundamentally different from cloud AI services like ChatGPT, Claude, or Gemini, where your text is sent to remote servers for processing. With local AI, the entire conversation happens between your note-taking app and a model running on localhost.

### Why Local AI Matters for Note-Taking

Notes are inherently personal. They contain unfinished thoughts, private reflections, sensitive information, passwords, financial details, and ideas you haven't shared with anyone. Sending this content to a cloud AI service means:

- A third party receives and processes your private text
- Your data may be stored, logged, or used for model training
- You need an internet connection to use AI features
- You're subject to the AI provider's terms of service and data policies
- Your content passes through servers you don't control

Local AI eliminates all of these concerns. Your notes stay on your device, the AI runs on your hardware, and no network request is ever made.

### Local AI vs Cloud AI

**Cloud AI (ChatGPT, Claude, Gemini, etc.):**
- Requires internet connection
- Text sent to remote servers for processing
- Provider may store, log, or train on your data
- Usually requires an account and API key or subscription
- More powerful models available (GPT-4, Claude Opus, etc.)
- Fast response times on any hardware

**Local AI (Ollama, LM Studio, LocalAI, Jan):**
- Works completely offline
- All processing happens on your device
- No data ever leaves your machine
- No account, no API key, no subscription required
- Smaller models that run on consumer hardware
- Speed depends on your CPU/GPU

---

## How Dash Implements Local AI

Dash integrates with local AI through a slide-over panel that connects to any OpenAI-compatible local server running on your machine. The integration is designed around a core principle: **your data never leaves your device**.

### Supported Local AI Providers

Dash works with any local AI server that exposes an OpenAI-compatible API. Built-in presets with setup instructions are provided for:

- **Ollama** — the most popular open-source local AI runner. Download models with one command (`ollama pull llama3.2`) and they run automatically. Free, open source, supports hundreds of models.
- **LM Studio** — a desktop app with a visual interface for downloading, managing, and running models. Has a built-in local server with one-click CORS setup.
- **LocalAI** — a lightweight, self-hosted AI server. Install via Homebrew, run models with a single command. CORS enabled by default.
- **Jan** — an open-source desktop app similar to LM Studio with a clean interface and built-in model hub.
- **Custom** — connect to any OpenAI-compatible endpoint running on localhost.

All providers connect via `localhost` — Dash enforces that the endpoint must be a local address (`localhost`, `127.0.0.1`, or `::1`). This is a hard technical restriction, not just a suggestion. The code will refuse to connect to any remote server.

### AI Features

The AI panel provides both guided actions and free-form prompting:

**With selected text or note content:**
- **Summarize** — condense content into key points
- **Rewrite** — improve clarity and flow while preserving meaning
- **Continue** — keep writing from where the text ends, matching style and tone
- **Fix grammar** — correct spelling, grammar, and punctuation
- **Expand** — add more detail, examples, or explanation
- **Bullet points** — convert prose into structured lists

**Without note content (generative mode):**
- **Brainstorm** — generate ideas on a topic
- **Outline** — structure thoughts into sections
- **To-do list** — plan tasks and action items
- **Meeting notes** — create a meeting template
- **Pros and cons** — weigh up a decision
- **Research notes** — organize findings on a topic
- **Journal entry** — reflective writing prompt
- **Weekly plan** — plan out the week ahead

**Free-form prompting:**
- Type any custom instruction in the prompt field
- The AI receives your note content (or selected text) as context
- Responses stream in real-time with markdown formatting

### Chat Mode

After receiving a response, you can ask follow-up questions without resending your full note. The conversation history is maintained in-memory for the duration of the panel session. Previous responses are collapsible, and you can select which response to use when inserting into your note.

- Follow-up questions automatically include conversation history
- Previous exchanges shown as collapsed cards (expandable)
- Click any response to select it for insertion
- Blue dot indicator shows which response is currently selected
- Chat history is in-memory only — cleared when the panel closes (privacy)

### Response Actions

After the AI generates a response:

- **Replace selection** — swap the highlighted text with the AI output
- **Insert below** — add the AI output after the current content
- **Copy** — copy the response to clipboard
- **Save as note** — create a brand new page with the AI response content

### Markdown Rendering

AI responses render as formatted markdown in real-time as they stream. Headings, bold, italic, lists, code blocks, tables, blockquotes, and links all display correctly within the panel. Styles adapt to all four Dash themes (Light, Dark, Dark Blue, Fallout).

### Keyboard Shortcuts

- **Cmd+Shift+A** (Mac) / **Ctrl+Shift+A** (Windows) — toggle the AI panel open/closed
- **Enter** — send prompt
- **Shift+Enter** — new line in prompt
- **Cmd+Enter** — send prompt (alternative)

### Multi-Block AI

Select multiple blocks in the editor and use AI on the combined content. The floating multi-block toolbar includes an AI option that opens the panel with all selected blocks as context. The selected blocks are visually highlighted in the editor while the AI panel is open so you can see exactly what content the AI is working with.

### Technical Details

- Connection check with 5-second timeout
- Automatic model discovery from the local server's `/v1/models` endpoint
- Streaming responses via Server-Sent Events (SSE) or Ollama's native streaming format
- `<think>` block filtering for reasoning models (e.g., DeepSeek R1) — thinking tokens are stripped from the displayed response
- Response sanitized with DOMPurify before rendering (XSS protection)
- Temperature and max token settings configurable per model
- Locked/encrypted pages are blocked from AI access — the panel shows "Unlock this note to use AI"

---

## Privacy Architecture

The local AI integration follows the same privacy principles as the rest of Dash:

1. **Localhost enforcement** — the code includes a hard check (`assertLocalEndpoint`) that rejects any endpoint that isn't `localhost`, `127.0.0.1`, or `::1`. You cannot accidentally connect to a remote server.

2. **No API keys stored** — local AI servers don't require authentication. There are no API keys, tokens, or credentials stored anywhere in Dash.

3. **No telemetry** — Dash doesn't track which AI features you use, what prompts you send, or what responses you receive. There are no analytics events for AI usage.

4. **In-memory chat history** — conversation history exists only in React state. It's never written to disk, never saved to storage, and is cleared the moment you close the AI panel.

5. **Encrypted page protection** — if a page is locked with encryption, the AI panel cannot access its content. You must unlock the page first. This prevents AI from processing content that should be encrypted at rest.

6. **No network requests** — the only network traffic is between Dash (running on localhost:3000) and your local AI server (also running on localhost). No data goes to the internet.

---

## Recommended Models

For users getting started with local AI, these models work well for note-taking tasks:

**Small & fast (good for most hardware):**
- Llama 3.2 1B/3B — Meta's compact models, good at following instructions
- Phi-3 Mini — Microsoft's small model, strong at summarization
- Gemma 2 2B — Google's efficient small model

**Medium (needs 8GB+ RAM):**
- Llama 3.2 8B — excellent general-purpose writing
- Mistral 7B — strong at creative and structured writing
- Qwen 2.5 7B — good multilingual support

**Large (needs 16GB+ RAM or GPU):**
- Llama 3.1 70B — near cloud-quality writing
- Mixtral 8x7B — fast for its quality level
- DeepSeek R1 — reasoning model, good for analysis tasks (thinking tokens are automatically filtered)

All models can be downloaded and run through Ollama, LM Studio, or any supported provider.

---

## AI Orb — Animated Visual Indicator

The AI panel features an animated glass orb that serves as a visual status indicator. It has two states: **idle** (gentle movement) and **generating** (energetic, fast movement). The orb is rendered on a `<canvas>` element at 2x resolution (retina) and uses `requestAnimationFrame` for smooth 60fps animation.

### How It Works

The orb is a glass sphere containing several colored blobs that move, deform, and blend together. The effect is achieved through layered rendering passes:

#### 1. Blob Definition

Two sets of blob configurations — idle and generating:

**Idle blobs** (5 blobs, slow gentle movement):
```
[
  { color: [70, 120, 255],  alpha: 0.9,  radius: 0.55, speedX: 0.3,  speedY: 0.25, amplitudeX: 0.28, amplitudeY: 0.24, phase: 0 },
  { color: [140, 80, 250],  alpha: 0.8,  radius: 0.45, speedX: -0.25, speedY: 0.4,  amplitudeX: 0.24, amplitudeY: 0.3,  phase: 1.8 },
  { color: [230, 90, 180],  alpha: 0.65, radius: 0.38, speedX: 0.2,  speedY: -0.3, amplitudeX: 0.22, amplitudeY: 0.2,  phase: 3.6 },
  { color: [40, 180, 255],  alpha: 0.6,  radius: 0.37, speedX: -0.15, speedY: 0.2,  amplitudeX: 0.18, amplitudeY: 0.26, phase: 5.2 },
  { color: [170, 110, 255], alpha: 0.5,  radius: 0.3,  speedX: 0.22, speedY: 0.18, amplitudeX: 0.16, amplitudeY: 0.18, phase: 7.0 }
]
```

**Generating blobs** (6 blobs, fast energetic movement):
```
[
  { color: [20, 80, 255],   alpha: 0.95, radius: 0.5,  speedX: 1.6,  speedY: 1.1,  amplitudeX: 0.36, amplitudeY: 0.32, phase: 0 },
  { color: [0, 190, 250],   alpha: 0.85, radius: 0.44, speedX: -1.3, speedY: 1.8,  amplitudeX: 0.32, amplitudeY: 0.38, phase: 0.8 },
  { color: [200, 50, 210],  alpha: 0.7,  radius: 0.38, speedX: 1.9,  speedY: -1.4, amplitudeX: 0.34, amplitudeY: 0.28, phase: 1.6 },
  { color: [80, 100, 255],  alpha: 0.75, radius: 0.4,  speedX: -1.1, speedY: 1.5,  amplitudeX: 0.28, amplitudeY: 0.34, phase: 2.8 },
  { color: [160, 70, 240],  alpha: 0.6,  radius: 0.32, speedX: 1.4,  speedY: -1.8, amplitudeX: 0.3,  amplitudeY: 0.26, phase: 4.0 },
  { color: [40, 220, 240],  alpha: 0.5,  radius: 0.28, speedX: -1.7, speedY: 1.2,  amplitudeX: 0.26, amplitudeY: 0.32, phase: 5.5 }
]
```

#### 2. Animation Parameters

Parameters smoothly interpolate between idle and generating states using linear interpolation (lerp) at a rate of 0.035 per frame:

| Parameter | Idle | Generating |
|-----------|------|------------|
| Speed (time increment per frame) | 0.004 | 0.025 |
| Wobble (noise amplitude) | 0.25 | 0.5 |
| Blur (pixel blur radius) | 28 | 18 |
| Deform (shape distortion) | 0.2 | 0.4 |

#### 3. Fractional Brownian Motion (FBM) Noise

Each blob's shape and position are influenced by a custom FBM noise function — 4 octaves of layered sine/cosine waves that produce organic, natural-looking movement:

```js
function fbm(x, y, z) {
  let v = 0, amp = 1, freq = 1
  for (let i = 0; i < 4; i++) {
    v += amp * (Math.sin(x * freq * 1.1 + z) * Math.cos(y * freq * 0.9 + z * 0.7) +
      Math.sin(x * freq * 0.6 - z * 1.3) * Math.sin(y * freq * 1.4 + z * 0.5)) / 2
    amp *= 0.5
    freq *= 2.1
  }
  return v
}
```

#### 4. Blob Shape — Deformed Circles

Each blob is drawn as a circle with 80 segments, but each vertex is displaced using the FBM noise + sine wave deformation. This creates organic, amoeba-like shapes that constantly shift:

```
For each of 80 segments around the circle:
  angle = (segment / 80) * 2π
  noise1 = fbm(cos(angle) * 2, sin(angle) * 2, time * 1.2 + phase)
  noise2 = fbm(cos(angle) * 3.5 + 10, sin(angle) * 3.5 + 10, time * 0.7 + phase + 5)
  wave = sin(angle * 3 + time * 2 + phase) * 0.08 + sin(angle * 5 - time * 3 + phase * 2) * 0.04
  radius = baseRadius * (1 + deform * (noise1 * 0.5 + noise2 * 0.3) + wave)
```

Each blob is filled with a radial gradient from its center color at full opacity to transparent at the edges.

#### 5. Blob Position — Sloshing Motion

Each blob moves around inside the sphere using sinusoidal "sloshing" combined with FBM noise for organic drift:

```
sloshX = sin(time * speedX + phase) * sphereRadius * amplitudeX
       + fbm(phase, time * 0.6, phase + 3) * sphereRadius * wobble * 0.25
sloshY = cos(time * speedY * 1.15 + phase + 1) * sphereRadius * amplitudeY
       + fbm(phase + 7, time * 0.5, phase + 9) * sphereRadius * wobble * 0.25
```

#### 6. Rendering Pipeline (5 passes)

**Pass 1 — Blob rendering (offscreen canvas):**
- Create offscreen canvas at 2x size
- Clip to circle (sphere radius - 8px inset)
- Draw each blob as a deformed radial-gradient filled shape

**Pass 2 — Blur + overlay compositing (second offscreen canvas):**
- Clip to same circle
- Apply CSS filter blur (28px idle, 18px generating) to the blob canvas
- Draw 3 overlay-composited color spots using the first 3 blob colors for extra color blending

**Pass 3 — Final composite on main canvas:**
- Clear canvas
- Draw drop shadow (theme-colored, 30px blur, 10px Y offset)
- Clip to sphere and draw the blurred liquid layer

**Pass 4 — Glass frost overlay:**
- Radial gradient from center to edge with 4 stops
- Semi-transparent white (light theme) or subtle colored tints (dark themes)
- Creates the frosted glass look over the liquid

**Pass 5 — Glass highlights:**
- Rim stroke: 1.5px circle stroke with theme-colored semi-transparent border
- Specular highlight: offset ellipse in upper-left with radial gradient (bright center to transparent)
  - Position: -28% X, -30% Y from center
  - Size: 35% wide, 25% tall ellipse, rotated -0.5 radians

#### 7. Theme-Aware Glass Colors

Four complete glass color sets that match Dash's themes:

**Light:**
- Frost: white tints (0.1 → 0.35 opacity)
- Rim: rgba(180, 190, 220, 0.4)
- Specular: white (0.55 → 0)
- Shadow: rgba(100, 120, 180, 0.2)

**Dark:**
- Frost: cool blue-gray (0.04 → 0.18 opacity)
- Rim: rgba(140, 160, 220, 0.3)
- Specular: light blue (0.35 → 0)
- Shadow: rgba(0, 0, 0, 0.3)

**Dark Blue:**
- Frost: medium blue (0.05 → 0.22 opacity)
- Rim: rgba(80, 130, 240, 0.35)
- Specular: light blue (0.4 → 0)
- Shadow: rgba(0, 10, 40, 0.35)

**Fallout:**
- Frost: green tints (0.04 → 0.2 opacity)
- Rim: rgba(74, 222, 128, 0.35)
- Specular: bright green (0.38 → 0)
- Shadow: rgba(0, 20, 0, 0.3)

### State Transitions

The orb smoothly transitions between idle and generating states using lerp interpolation. When the state changes, all parameters (speed, wobble, blur, deform) gradually animate to their target values over ~30 frames, creating a smooth ramp-up effect when generation starts and a gentle wind-down when it finishes.

### Usage in the Panel

- **Header**: 44px orb, scales down to 55% during streaming with a smooth CSS transition
- **Thinking indicator**: 56px orb shown while waiting for the first token from the model, centered with "Thinking..." text below

---

## Competitor Landscape

### How Other Note Apps Handle AI

**Notion AI** — cloud-only, powered by OpenAI/Anthropic. Requires Notion account, data processed on remote servers. $10/month add-on.

**Obsidian (with plugins)** — community plugins can connect to local AI, but it's not built-in. Requires manual plugin installation and configuration. No official AI feature.

**Apple Notes** — Apple Intelligence integration on supported devices. Uses on-device processing for some tasks, cloud processing for others. Limited to Apple ecosystem.

**Reflect Notes** — cloud AI integration. Notes sent to AI provider for processing.

**Mem** — cloud-only AI, data stored and processed on their servers.

### Dash's Differentiator

Dash is one of the few note-taking apps with **built-in local AI** that:
- Works with multiple local AI providers (not locked to one)
- Has a hard technical restriction preventing cloud AI connections
- Includes guided actions AND free-form prompting
- Supports conversation-style follow-ups
- Renders AI responses as formatted markdown
- Is integrated into the editor workflow (select text → AI → replace/insert)
- Costs nothing extra — no AI subscription, no per-token charges

The combination of privacy-first architecture, offline-first storage, end-to-end encryption, and local-only AI makes Dash unique in the note-taking space.
