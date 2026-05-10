// Demo seed for App Store screenshot builds.
// Activated only when NEXT_PUBLIC_DEMO_SEED === '1' at build time.
// Emits a realistic, populated note set so screenshots look used,
// not an empty first-launch state.

const now = Date.now()
const days = (n) => now - n * 24 * 60 * 60 * 1000

const folders = [
  {
    id: 'demo-folder-work',
    type: 'folder',
    title: 'Work',
    isFolder: true,
    pages: ['demo-page-roadmap', 'demo-page-hiring', 'demo-page-api'],
    createdAt: new Date(days(30)).toISOString(),
    lastEdited: days(1),
    expanded: true
  },
  {
    id: 'demo-folder-personal',
    type: 'folder',
    title: 'Personal',
    isFolder: true,
    pages: ['demo-page-reading', 'demo-page-journal'],
    createdAt: new Date(days(20)).toISOString(),
    lastEdited: days(2),
    expanded: false
  }
]

const pages = [
  {
    id: 'demo-page-roadmap',
    title: 'Q2 product roadmap',
    folderId: 'demo-folder-work',
    tags: [],
    tagNames: ['work', 'planning'],
    createdAt: new Date(days(14)).toISOString(),
    lastEdited: days(0.2),
    password: null,
    content: {
      time: days(0.2),
      version: '2.30.6',
      blocks: [
        { id: 'b1', type: 'header', data: { text: 'Q2 product roadmap', level: 1 } },
        { id: 'b2', type: 'paragraph', data: { text: 'Three priorities this quarter. Everything else is tabled until July.' } },
        { id: 'b3', type: 'header', data: { text: 'Priorities', level: 2 } },
        { id: 'b4', type: 'nestedlist', data: { style: 'ordered', items: [
          { content: 'Ship iOS app to App Store', items: [] },
          { content: 'Multi-device sync (alpha → beta)', items: [] },
          { content: 'Onboarding redesign', items: [] }
        ] } },
        { id: 'b5', type: 'header', data: { text: 'Definition of done', level: 2 } },
        { id: 'b6', type: 'checklist', data: { items: [
          { text: 'iOS submitted to App Review', checked: true },
          { text: 'Sync server load-tested at 1000 concurrent vaults', checked: true },
          { text: 'New onboarding A/B-tested vs. control', checked: false },
          { text: 'Landing page refresh shipped', checked: false }
        ] } },
        { id: 'b7', type: 'paragraph', data: { text: 'Status check every Friday. Slip dates land here.' } }
      ]
    }
  },
  {
    id: 'demo-page-hiring',
    title: 'Hiring plan — engineering',
    folderId: 'demo-folder-work',
    tags: [],
    tagNames: ['work'],
    createdAt: new Date(days(10)).toISOString(),
    lastEdited: days(1),
    password: null,
    content: {
      time: days(1),
      version: '2.30.6',
      blocks: [
        { id: 'h1', type: 'header', data: { text: 'Hiring plan', level: 1 } },
        { id: 'h2', type: 'paragraph', data: { text: 'Two senior hires by end of quarter. Both remote-friendly.' } },
        { id: 'h3', type: 'nestedlist', data: { style: 'unordered', items: [
          { content: 'Senior iOS engineer — Swift + Capacitor', items: [] },
          { content: 'Senior backend — Deno / TypeScript', items: [] },
          { content: 'Designer (contract, 3 months)', items: [] }
        ] } },
        { id: 'h4', type: 'paragraph', data: { text: 'Outreach via Twitter + Hacker News thread. No recruiters.' } }
      ]
    }
  },
  {
    id: 'demo-page-api',
    title: 'Sync API — endpoint reference',
    folderId: 'demo-folder-work',
    tags: [],
    tagNames: ['work', 'reference'],
    createdAt: new Date(days(7)).toISOString(),
    lastEdited: days(0.5),
    password: null,
    content: {
      time: days(0.5),
      version: '2.30.6',
      blocks: [
        { id: 'a1', type: 'header', data: { text: 'Sync API', level: 1 } },
        { id: 'a2', type: 'paragraph', data: { text: 'All requests authenticated via device token. Bodies are end-to-end encrypted before send.' } },
        { id: 'a3', type: 'code', data: { code: 'POST /sync/push\nAuthorization: Bearer <device-token>\nContent-Type: application/json\n\n{\n  "envelopes": [...],\n  "vaultIndex": { "lastVersion": 1042 }\n}' } },
        { id: 'a4', type: 'paragraph', data: { text: 'Pull is incremental — pass the last seen version, server returns deltas.' } },
        { id: 'a5', type: 'code', data: { code: 'GET /sync/pull?since=1042\n→ { envelopes: [...], hasMore: false }' } }
      ]
    }
  },
  {
    id: 'demo-page-reading',
    title: 'Reading list 2026',
    folderId: 'demo-folder-personal',
    tags: [],
    tagNames: ['personal', 'books'],
    createdAt: new Date(days(45)).toISOString(),
    lastEdited: days(3),
    password: null,
    content: {
      time: days(3),
      version: '2.30.6',
      blocks: [
        { id: 'r1', type: 'header', data: { text: 'Reading list 2026', level: 1 } },
        { id: 'r2', type: 'checklist', data: { items: [
          { text: 'Annie Dillard — Pilgrim at Tinker Creek', checked: true },
          { text: 'Italo Calvino — Invisible Cities', checked: true },
          { text: 'Olga Tokarczuk — Flights', checked: false },
          { text: 'Donna Tartt — The Goldfinch', checked: false },
          { text: 'Kazuo Ishiguro — Klara and the Sun', checked: false }
        ] } },
        { id: 'r3', type: 'paragraph', data: { text: 'Goal: 18 books. Currently 7. On pace if I keep evenings free.' } }
      ]
    }
  },
  {
    id: 'demo-page-journal',
    title: 'Journal — May',
    folderId: 'demo-folder-personal',
    tags: [],
    tagNames: ['personal'],
    createdAt: new Date(days(15)).toISOString(),
    lastEdited: days(0.1),
    password: null,
    content: {
      time: days(0.1),
      version: '2.30.6',
      blocks: [
        { id: 'j1', type: 'header', data: { text: 'May 8', level: 2 } },
        { id: 'j2', type: 'paragraph', data: { text: 'Long walk this morning. Coffee at the place on the corner. Started thinking about how the app should feel — quiet, fast, no nagging.' } },
        { id: 'j3', type: 'delimiter', data: {} },
        { id: 'j4', type: 'header', data: { text: 'May 7', level: 2 } },
        { id: 'j5', type: 'paragraph', data: { text: 'Spent the afternoon refactoring the sync queue. Found a subtle race when the app suspends mid-push. Fixed.' } },
        { id: 'j6', type: 'quote', data: { text: 'The best way to predict the future is to invent it.', caption: 'Alan Kay' } }
      ]
    }
  },
  {
    id: 'demo-page-ideas',
    title: 'Side project ideas',
    folderId: null,
    tags: [],
    tagNames: ['ideas'],
    createdAt: new Date(days(25)).toISOString(),
    lastEdited: days(4),
    password: null,
    content: {
      time: days(4),
      version: '2.30.6',
      blocks: [
        { id: 'i1', type: 'header', data: { text: 'Ideas worth a weekend', level: 1 } },
        { id: 'i2', type: 'nestedlist', data: { style: 'unordered', items: [
          { content: 'CLI for managing dotfiles across machines', items: [] },
          { content: 'Browser extension that strips trackers from email links', items: [] },
          { content: 'Calendar app for chronic procrastinators', items: [] },
          { content: 'Privacy-first replacement for Google Forms', items: [] }
        ] } },
        { id: 'i3', type: 'paragraph', data: { text: 'None of these are urgent. All of them are interesting. Pick one for July.' } }
      ]
    }
  },
  {
    id: 'demo-page-locked',
    title: 'Bank account notes',
    folderId: null,
    tags: [],
    tagNames: ['secret'],
    createdAt: new Date(days(50)).toISOString(),
    lastEdited: days(10),
    // Indicate locked — content holds an opaque encrypted blob placeholder.
    // Real lock sets `password.hash` + ciphertext; we mimic the visible state.
    password: { hash: '$2a$10$demoseeddemoseeddemoseeddO9nXXXq6Mq2fX.demohash', salt: 'demo-salt' },
    encryptedContent: 'demo-locked-placeholder-ciphertext',
    content: null
  }
]

const tags = [
  { name: 'work', color: '#3b82f6' },
  { name: 'planning', color: '#8b5cf6' },
  { name: 'reference', color: '#06b6d4' },
  { name: 'personal', color: '#10b981' },
  { name: 'books', color: '#f59e0b' },
  { name: 'ideas', color: '#ef4444' },
  { name: 'secret', color: '#6b7280' }
]

export const DEMO_PAGES = [...folders, ...pages]
export const DEMO_TAGS = tags

export function isDemoMode () {
  if (typeof process === 'undefined') return false
  return process.env.NEXT_PUBLIC_DEMO_SEED === '1'
}
