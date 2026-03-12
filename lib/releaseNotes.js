export const releaseNotes = [
  {
    group: 'March 2026',
    features: [
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
    description: 'Export to PDF, Markdown, DOCX, RTF, CSV, XML, or plain text. Import and export .dashpack bundles.',
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
    description: 'Automatically strips GPS, camera, and timestamp metadata from pasted images.',
    category: 'security',
    shortcut: null,
    animation: 'exif'
  }
]
