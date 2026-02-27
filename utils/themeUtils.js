/**
 * Centralized theme utilities for consistent styling across the app.
 *
 * Design: ChatGPT-inspired clean layout.
 * - Dark: lighter sidebar panel over near-black content (like ChatGPT)
 * - Light uses clean whites with subtle neutral borders
 * - Fallout keeps terminal aesthetic with same layout principles
 *
 * Dark palette:
 *   Sidebar:    #212327  (lighter gray panel — clearly distinct from content)
 *   Content:    #0d0d0d  (near-black — writing surface)
 *   Surface:    #2f2f2f  (dropdowns, inputs, modals)
 *   Hover:      #3a3a3a  (interactive hover states)
 *   Border:     #2e2e2e  (subtle separators)
 *   Text:       #ececec  (primary), #c0c0c0 (secondary), #8e8e8e (muted), #6b6b6b (faint)
 *
 * Usage: import { getThemeClasses } from '@/utils/themeUtils'
 *        const classes = getThemeClasses(theme)
 */

// Theme type definitions (for documentation)
// theme: 'light' | 'dark' | 'fallout'

/**
 * Get all theme-based class sets for a given theme
 * @param {string} theme - The current theme ('light', 'dark', or 'fallout')
 * @returns {Object} Object containing all theme-specific class strings
 */
export function getThemeClasses(theme) {
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'

  return {
    // Main container classes
    mainContainer: isFallout
      ? 'fallout flex h-screen bg-gray-900 text-green-400 font-mono'
      : isDark
        ? 'dark flex h-screen bg-[#0d0d0d] text-[#ececec]'
        : 'flex h-screen bg-white text-neutral-900',

    // Sidebar classes — glass panel with depth (like ChatGPT/modern design)
    sidebar: isFallout
      ? 'sidebar-panel-fallout'
      : isDark
        ? 'sidebar-panel'
        : 'sidebar-panel-light',

    // Button hover classes
    buttonHover: isFallout
      ? 'hover:bg-gray-800 hover:text-green-400'
      : isDark
        ? 'hover:bg-[#232323] hover:text-[#ececec]'
        : 'hover:bg-neutral-200 hover:text-neutral-900',

    // Header classes
    header: isFallout
      ? 'bg-gray-900 border-green-600/30 text-green-400'
      : isDark
        ? 'bg-[#0d0d0d] border-[#2e2e2e] text-[#ececec]'
        : 'bg-white border-neutral-200 text-neutral-900',

    // Main content area classes
    mainContent: isFallout
      ? 'bg-gray-900 text-green-400'
      : isDark
        ? 'bg-[#0d0d0d] text-[#ececec]'
        : 'bg-white text-neutral-900',

    // Footer classes
    footer: isFallout
      ? 'bg-gray-900 text-green-300 border-t border-green-600/30'
      : isDark
        ? 'bg-[#0d0d0d] text-[#6b6b6b] border-t border-[#2e2e2e]'
        : 'bg-white text-neutral-400 border-t border-neutral-100',

    // Border classes
    border: isFallout
      ? 'border-green-600/30'
      : isDark
        ? 'border-[#2e2e2e]'
        : 'border-neutral-200',

    // Text classes (secondary/muted text)
    text: isFallout
      ? 'text-green-400'
      : isDark
        ? 'text-[#8e8e8e]'
        : 'text-neutral-500',

    // Icon classes
    icon: isFallout
      ? 'text-green-400'
      : isDark
        ? 'text-[#8e8e8e]'
        : 'text-neutral-400',

    // Folder badge classes
    folderBadge: isFallout
      ? 'bg-gray-800 text-green-300 border border-green-600/30'
      : isDark
        ? 'bg-[#2f2f2f] text-[#c0c0c0] border border-[#3a3a3a]'
        : 'bg-neutral-100 text-neutral-600 border border-neutral-200',

    // Dropdown menu classes
    dropdown: isFallout
      ? 'bg-gray-900 border border-green-600/40 text-green-400'
      : isDark
        ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-[#ececec] shadow-xl shadow-black/50'
        : 'bg-white border border-neutral-200 text-neutral-900 shadow-lg shadow-neutral-200/50',

    // Dropdown item classes
    dropdownItem: isFallout
      ? 'text-green-400 hover:bg-gray-800'
      : isDark
        ? 'text-[#c0c0c0] hover:bg-[#3a3a3a]'
        : 'text-neutral-600 hover:bg-neutral-100',

    // Input/form field classes
    input: isFallout
      ? 'bg-gray-800 border border-green-500/40 text-green-400 placeholder-green-600 font-mono focus:ring-green-500/50 focus:border-green-400'
      : isDark
        ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-[#ececec] placeholder-[#6b6b6b] focus:ring-[#4a4a4a] focus:border-[#4a4a4a]'
        : 'bg-neutral-50 border border-neutral-200 text-neutral-900 placeholder-neutral-400 focus:ring-neutral-400/30 focus:border-neutral-400',

    // Modal overlay classes
    modalOverlay: 'fixed inset-0 bg-black/60 backdrop-blur-sm',

    // Modal container classes
    modal: isFallout
      ? 'bg-gray-900 border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]'
      : isDark
        ? 'bg-[#2f2f2f] border border-[#3a3a3a] shadow-2xl'
        : 'bg-white border border-neutral-200 shadow-2xl',

    // Modal header border
    modalHeaderBorder: isFallout
      ? 'border-b border-green-500/30'
      : isDark
        ? 'border-b border-[#3a3a3a]'
        : 'border-b border-neutral-100',

    // Primary button (confirm/action)
    buttonPrimary: isFallout
      ? 'bg-green-500 text-gray-900 hover:bg-green-400 font-mono shadow-[0_0_20px_rgba(34,197,94,0.3)]'
      : isDark
        ? 'bg-white text-[#0d0d0d] hover:bg-[#e0e0e0]'
        : 'bg-neutral-900 text-white hover:bg-neutral-800',

    // Secondary/cancel button
    buttonSecondary: isFallout
      ? 'bg-gray-800 border border-green-500/40 text-green-400 hover:bg-gray-700 font-mono'
      : isDark
        ? 'bg-[#3a3a3a] border border-[#4a4a4a] text-[#c0c0c0] hover:bg-[#4a4a4a]'
        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200',

    // Danger button (delete, etc.)
    buttonDanger: isFallout
      ? 'bg-red-600 text-white hover:bg-red-500 font-mono'
      : isDark
        ? 'bg-red-600 text-white hover:bg-red-500'
        : 'bg-red-600 text-white hover:bg-red-700',

    // Warning button
    buttonWarning: isFallout
      ? 'bg-amber-600 text-white hover:bg-amber-500 font-mono'
      : isDark
        ? 'bg-amber-600 text-white hover:bg-amber-500'
        : 'bg-amber-600 text-white hover:bg-amber-700',

    // Info box/panel classes
    infoBox: isFallout
      ? 'bg-green-500/10 border border-green-500/30'
      : isDark
        ? 'bg-blue-500/10 border border-blue-500/20'
        : 'bg-blue-50 border border-blue-200',

    // Error box/panel classes
    errorBox: isFallout
      ? 'bg-red-500/10 border border-red-500/30'
      : isDark
        ? 'bg-red-500/10 border border-red-500/20'
        : 'bg-red-50 border border-red-200',

    // Active/selected item classes (sidebar items)
    itemActive: isFallout
      ? 'bg-green-700/30 text-green-300'
      : isDark
        ? 'bg-[#2f2f2f] text-[#ececec]'
        : 'bg-neutral-200 text-neutral-900',

    // Item hover classes (sidebar items)
    itemHover: isFallout
      ? 'hover:bg-gray-800 text-green-400'
      : isDark
        ? 'hover:bg-[#232323] text-[#c0c0c0]'
        : 'hover:bg-neutral-100 text-neutral-700',

    // Close button classes
    closeButton: isFallout
      ? 'text-green-500 hover:bg-green-500/20'
      : isDark
        ? 'text-[#8e8e8e] hover:bg-[#3a3a3a]'
        : 'text-neutral-400 hover:bg-neutral-100',
  }
}

/**
 * Helper to check if theme is fallout
 */
export function isFalloutTheme(theme) {
  return theme === 'fallout'
}

/**
 * Helper to check if theme is dark
 */
export function isDarkTheme(theme) {
  return theme === 'dark'
}

/**
 * Helper to check if theme is light
 */
export function isLightTheme(theme) {
  return theme !== 'dark' && theme !== 'fallout'
}
