export const releaseNotes = [
  {
    group: 'September 2026',
    features: [
      {
        icon: 'Pin',
        title: 'Pinned notes',
        description: 'Pin the notes you use most to a Pinned section at the top of the sidebar on Mac and the notes list on iPhone. Pin from a note\'s menu, the ⋯ menu or ⌘⇧P, and pins sync to your other devices.'
      },
      {
        icon: 'FileStack',
        title: 'Templates',
        description: 'Start a new note from Meeting notes, Daily journal, To-do list, Project plan or Weekly review when you name it, or save any note as a template from the ⋯ menu. {{date}}, {{time}}, {{weekday}} and {{title}} fill in on each new note.'
      },
      {
        icon: 'FileInput',
        title: 'Import your notes',
        description: 'Bring notes over from Evernote, Notion, Obsidian, Notesnook, Standard Notes or a folder of Markdown files with Import notes in the ⋯ menu. You see what will come across before anything is saved, photos keep their full quality with location removed, and each import can be undone.'
      },
      {
        icon: 'ListTree',
        title: 'Nested lists',
        description: 'Press Tab and Shift+Tab to nest bullet, numbered and checklist items, or use Indent and Outdent in the block menu. Lists you paste keep their levels, and numbering runs 1, a, i by level.'
      },
      {
        icon: 'Image',
        title: 'Photos that sync',
        description: 'Photos are stored once on your device instead of inside the note, so notes with photos stay small enough to sync. Photos already in your notes move over in the background, and a device still downloading a photo shows a placeholder until it arrives.'
      },
      {
        icon: 'FileDown',
        title: 'Exports that keep everything',
        description: 'Exports keep nested lists, callouts, toggles and formatting, PDFs no longer stop after the first page, and PDF, Word and RTF files include your photos.'
      },
      {
        icon: 'LayoutTemplate',
        title: 'Cleaner layout',
        description: 'On Mac the page title sits in the document with tags, date and word count beneath it, and the toolbar moved into the title bar. On iPhone the notes list is a full-width screen with folders and notes in sections and a New note button within thumb reach.'
      },
      {
        icon: 'SlidersHorizontal',
        title: 'Settings in one place',
        description: 'Themes, app lock, Dash Sync, backups and trash now live behind one settings icon: in the toolbar on Mac, in the footer on iPhone. Swipe a note left to trash it or right to lock it.'
      },
      {
        icon: 'Monitor',
        title: 'Match system appearance',
        description: 'Pick a theme from visible swatches, or let Dash follow the macOS or iOS light/dark setting using your preferred dark theme.'
      },
      {
        icon: 'Table',
        title: 'Lighter tables and headings',
        description: 'Tables use horizontal rules with a tinted heading row, and heading sizes are tighter so structure reads at a glance.'
      },
      {
        icon: 'Code',
        title: 'Code you can read',
        description: 'Code blocks and inline code are styled in every theme. The Terminal theme was rebuilt on a phosphor-green palette and now uses your system monospace font.'
      }
    ]
  },
  {
    group: 'March 2026',
    features: [
      {
        icon: 'Bot',
        title: 'Local AI',
        description: 'Connect to a local LLM (Ollama, LM Studio, etc.) to summarize, rewrite, expand, and brainstorm — all on-device, fully private.'
      },
      {
        icon: 'Undo2',
        title: 'Reliable Undo & Redo',
        description: 'Rebuilt undo/redo from scratch. Cmd+Z steps back through your edits, Cmd+Shift+Z steps forward. No more lost or duplicated content.'
      },
      {
        icon: 'Sparkles',
        title: 'Micro-Animations',
        description: 'Polished transitions across the app — folder expand, dropdown menus, tooltips, modals, theme switching, and more.'
      },
      {
        icon: 'Link',
        title: 'Page Linking',
        description: 'Type [[ anywhere to link to another page. Links are clickable and navigate instantly.'
      },
      {
        icon: 'KeyRound',
        title: 'Seed Phrase Storage',
        description: 'Store crypto wallet recovery phrases in a secure numbered grid with BIP-39 validation.'
      },
      {
        icon: 'ShieldAlert',
        title: 'Decoy App',
        description: 'Set a secondary password that shows fake decoy notes. Your real data stays encrypted and hidden on disk.'
      },
      {
        icon: 'Share2',
        title: 'Encrypted Sharing',
        description: 'Share notes via encrypted links. Data stays in the URL fragment — nothing stored on any server. Optional password protection for extra security.'
      },
      {
        icon: 'ImageOff',
        title: 'Image Privacy',
        description: 'Photos pasted into notes are automatically stripped of EXIF metadata — GPS location, camera info, and timestamps are removed.'
      }
    ]
  },
  {
    group: 'February 2026',
    features: [
      {
        icon: 'Search',
        title: 'Quick Switcher',
        description: 'Press Cmd+P to instantly jump to any page with fuzzy search.'
      },
      {
        icon: 'Timer',
        title: 'Self-Destructing Notes',
        description: 'Set pages to auto-delete after a time period. A live countdown badge tracks the remaining time.'
      },
      {
        icon: 'ShieldCheck',
        title: 'Auto-Lock & Touch ID',
        description: 'Lock the app after inactivity. Unlock with your password or Touch ID.'
      },
      {
        icon: 'Focus',
        title: 'Focus Mode',
        description: 'Distraction-free writing with typewriter scrolling, paragraph dimming, and session stats.'
      }
    ]
  },
  {
    group: 'January 2026',
    features: [
      {
        icon: 'Keyboard',
        title: 'Keyboard Shortcuts',
        description: 'Press ? or click the keyboard icon in the footer to see all shortcuts at a glance.'
      },
      {
        icon: 'Code',
        title: 'Syntax-Highlighted Code',
        description: '22 languages with auto-detection and theme-aware highlighting.'
      },
      {
        icon: 'Palette',
        title: 'Four Themes',
        description: 'Light, Dark, Dark Blue, and Fallout \u2014 every screen fully themed.'
      },
      {
        icon: 'Lock',
        title: 'Page Encryption',
        description: 'Lock individual pages with AES-256 encryption. Locked notes are fully encrypted on disk.'
      },
      {
        icon: 'GripVertical',
        title: 'Drag & Drop',
        description: 'Reorder pages, folders, and editor blocks by dragging. Move pages between folders.'
      },
      {
        icon: 'Undo2',
        title: 'Undo, Redo & Underline',
        description: 'Full undo/redo history (Cmd+Z / Cmd+Shift+Z) and underline support (Cmd+U).'
      }
    ]
  }
]

export const featuresList = [
  // Core features
  {
    icon: 'FolderOpen',
    title: 'Folders & Tags',
    description: 'Organize pages into folders and add tags for quick filtering.',
    category: 'navigation',
    shortcut: null,
    animation: 'folders'
  },
  {
    icon: 'Lock',
    title: 'Page Encryption',
    description: 'Lock individual pages with AES-256 encryption. Locked notes are fully encrypted on disk.',
    category: 'security',
    shortcut: null,
    animation: 'lock'
  },
  {
    icon: 'ShieldCheck',
    title: 'Auto-Lock & Touch ID',
    description: 'Lock the app and encrypt all pages after inactivity. Unlock with your password or Touch ID.',
    category: 'security',
    shortcut: null,
    animation: 'shield'
  },
  {
    icon: 'Timer',
    title: 'Self-Destructing Notes',
    description: 'Set pages to auto-delete after a time period. A live countdown badge tracks the remaining time.',
    category: 'security',
    shortcut: null,
    animation: 'timer'
  },
  {
    icon: 'GripVertical',
    title: 'Drag & Drop',
    description: 'Reorder pages, folders, and editor blocks by dragging.',
    category: 'editor',
    shortcut: null,
    animation: 'drag'
  },
  {
    icon: 'Link',
    title: 'Page Linking',
    description: 'Link to other pages inline. Links are clickable and navigate instantly.',
    category: 'editor',
    shortcut: '[[',
    animation: 'link'
  },
  {
    icon: 'Focus',
    title: 'Focus Mode',
    description: 'Distraction-free writing with typewriter scrolling and paragraph dimming.',
    category: 'navigation',
    shortcut: '\u2318\u21e7F',
    animation: 'focus'
  },
  {
    icon: 'ShieldAlert',
    title: 'Decoy App',
    description: 'A secondary password that shows fake decoy notes. Your real data stays encrypted and hidden.',
    category: 'security',
    shortcut: null,
    animation: 'duress'
  },
  {
    icon: 'KeyRound',
    title: 'Seed Phrase Storage',
    description: 'Store crypto wallet recovery phrases in a secure numbered grid with BIP-39 validation.',
    category: 'security',
    shortcut: null,
    animation: 'key'
  },
  {
    icon: 'Keyboard',
    title: 'Keyboard Shortcuts',
    description: 'Full keyboard shortcut support for power users.',
    category: 'navigation',
    shortcut: '?',
    animation: 'keyboard'
  },
  {
    icon: 'Search',
    title: 'Quick Switcher',
    description: 'Instantly jump to any page with fuzzy search.',
    category: 'navigation',
    shortcut: '\u2318P',
    animation: 'search'
  },
  {
    icon: 'Plus',
    title: 'Block Menu',
    description: 'Press + or type / to add headings, lists, code blocks, seed phrases, and more.',
    category: 'editor',
    shortcut: '/',
    animation: 'blockmenu'
  },
  {
    icon: 'Undo2',
    title: 'Undo & Redo',
    description: 'Full undo/redo history for every change.',
    category: 'editor',
    shortcut: '\u2318Z / \u2318\u21e7Z',
    animation: 'undo'
  },
  {
    icon: 'Code',
    title: 'Syntax-Highlighted Code',
    description: '22 languages with auto-detection and theme-aware highlighting.',
    category: 'editor',
    shortcut: null,
    animation: 'code'
  },
  {
    icon: 'Download',
    title: 'Export & Import',
    description: 'Export to PDF, Markdown, DOCX, RTF, CSV, XML, or plain text. Import notes from Evernote, Notion, Obsidian, Notesnook and Standard Notes, and import or export .dashpack bundles.',
    category: 'editor',
    shortcut: null,
    animation: 'export'
  },
  {
    icon: 'Palette',
    title: 'Four Themes',
    description: 'Light, Dark, Dark Blue, and Fallout \u2014 every screen fully themed.',
    category: 'navigation',
    shortcut: null,
    animation: 'palette'
  },
  {
    icon: 'Share2',
    title: 'Encrypted Sharing',
    description: 'Share notes via zero-knowledge encrypted links. Nothing stored on any server.',
    category: 'security',
    shortcut: null,
    animation: 'share'
  },
  {
    icon: 'ImageOff',
    title: 'Image Privacy',
    description: 'Automatically strips GPS, camera, and timestamp metadata from pasted and imported images.',
    category: 'security',
    shortcut: null,
    animation: 'exif'
  },
  {
    icon: 'Bot',
    title: 'Local AI',
    description: 'Connect to Ollama, LM Studio, or any local LLM to summarize, rewrite, expand, and brainstorm — fully on-device.',
    category: 'editor',
    shortcut: '/ai',
    animation: 'bot'
  }
]
