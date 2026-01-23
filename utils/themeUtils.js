/**
 * Centralized theme utilities for consistent styling across the app.
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
        ? 'dark flex h-screen bg-gray-900 text-white'
        : 'flex h-screen bg-white text-black',

    // Sidebar classes
    sidebar: isFallout
      ? 'bg-gray-900 border-r border-green-600'
      : isDark
        ? 'bg-gray-900'
        : 'bg-gray-100',

    // Button hover classes
    buttonHover: isFallout
      ? 'hover:bg-gray-800 hover:text-green-400'
      : isDark
        ? 'hover:bg-gray-700 hover:text-white'
        : 'hover:bg-gray-200 hover:text-primary-foreground',

    // Header classes
    header: isFallout
      ? 'bg-gray-900 border-green-600 text-green-400'
      : isDark
        ? 'bg-gray-800 border-gray-700 text-white'
        : 'bg-white border-gray-200 text-black',

    // Main content area classes
    mainContent: isFallout
      ? 'bg-gray-900 text-green-400'
      : isDark
        ? 'bg-gray-800 text-white'
        : 'bg-white text-black',

    // Footer classes
    footer: isFallout
      ? 'bg-gray-900 text-green-300 border-t border-green-600'
      : isDark
        ? 'bg-gray-800 text-gray-300'
        : 'bg-white text-gray-600',

    // Border classes
    border: isFallout
      ? 'border-green-600'
      : isDark
        ? 'border-gray-700'
        : 'border-gray-300',

    // Text classes (secondary/muted text)
    text: isFallout
      ? 'text-green-400'
      : isDark
        ? 'text-gray-400'
        : 'text-gray-600',

    // Icon classes
    icon: isFallout
      ? 'text-green-400'
      : isDark
        ? 'text-gray-200'
        : 'text-gray-700',

    // Folder badge classes
    folderBadge: isFallout
      ? 'bg-gray-800 text-green-300 border border-green-600'
      : isDark
        ? 'bg-gray-700 text-gray-300 border border-gray-600'
        : 'bg-gray-100 text-gray-600 border border-gray-300',

    // Dropdown menu classes
    dropdown: isFallout
      ? 'bg-gray-900 border border-green-600 text-green-400'
      : isDark
        ? 'bg-gray-800 text-white'
        : 'bg-white text-gray-900',

    // Dropdown item classes
    dropdownItem: isFallout
      ? 'text-green-400 hover:bg-gray-800'
      : isDark
        ? 'text-gray-300 hover:bg-gray-700'
        : 'text-gray-700 hover:bg-gray-100',

    // Input/form field classes
    input: isFallout
      ? 'bg-gray-800 border border-green-500/40 text-green-400 placeholder-green-600 font-mono focus:ring-green-500/50 focus:border-green-400'
      : isDark
        ? 'bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:ring-blue-500/50 focus:border-blue-500'
        : 'bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-blue-500/30 focus:border-blue-500',

    // Modal overlay classes
    modalOverlay: 'fixed inset-0 bg-black/60 backdrop-blur-sm',

    // Modal container classes
    modal: isFallout
      ? 'bg-gray-900 border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]'
      : isDark
        ? 'bg-gray-900 border border-gray-700/50 shadow-2xl'
        : 'bg-white border border-gray-200 shadow-2xl',

    // Modal header border
    modalHeaderBorder: isFallout
      ? 'border-b border-green-500/30'
      : isDark
        ? 'border-b border-gray-800'
        : 'border-b border-gray-100',

    // Primary button (confirm/action)
    buttonPrimary: isFallout
      ? 'bg-green-500 text-gray-900 hover:bg-green-400 font-mono shadow-[0_0_20px_rgba(34,197,94,0.3)]'
      : isDark
        ? 'bg-blue-600 text-white hover:bg-blue-500'
        : 'bg-blue-600 text-white hover:bg-blue-700',

    // Secondary/cancel button
    buttonSecondary: isFallout
      ? 'bg-gray-800 border border-green-500/40 text-green-400 hover:bg-gray-700 font-mono'
      : isDark
        ? 'bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200',

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
        ? 'bg-blue-500/10 border border-blue-500/30'
        : 'bg-blue-50 border border-blue-200',

    // Error box/panel classes
    errorBox: isFallout
      ? 'bg-red-500/10 border border-red-500/30'
      : isDark
        ? 'bg-red-500/10 border border-red-500/30'
        : 'bg-red-50 border border-red-200',

    // Active/selected item classes
    itemActive: isFallout
      ? 'bg-green-700 text-gray-900'
      : isDark
        ? 'bg-blue-700 text-white'
        : 'bg-blue-600 text-white',

    // Item hover classes
    itemHover: isFallout
      ? 'hover:bg-gray-800 text-green-400'
      : isDark
        ? 'hover:bg-gray-800 text-white'
        : 'hover:bg-gray-200 text-black',

    // Close button classes
    closeButton: isFallout
      ? 'text-green-500 hover:bg-green-500/20'
      : isDark
        ? 'text-gray-400 hover:bg-gray-800'
        : 'text-gray-400 hover:bg-gray-100',
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
