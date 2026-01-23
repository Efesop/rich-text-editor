/**
 * Centralized device detection utilities for consistent mobile/PWA handling.
 * Usage: import { isMobile, isStandalone, shouldShowMobileInstall } from '@/utils/deviceUtils'
 */

/**
 * Check if user is on a mobile device based on user agent
 */
export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

/**
 * Check if screen is small (mobile breakpoint)
 * @param {number} breakpoint - Width threshold in pixels (default 768)
 */
export function isSmallScreen(breakpoint = 768) {
  if (typeof window === 'undefined') return false
  return window.innerWidth <= breakpoint
}

/**
 * Check if app is running as installed PWA (standalone mode)
 */
export function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches
}

/**
 * Check if running in Electron
 */
export function isElectron() {
  if (typeof window === 'undefined') return false
  return !!(window.electron?.invoke)
}

/**
 * Determine if we should show the "Use on your phone" / mobile install option
 * Returns false if:
 * - Already on mobile device
 * - Already installed as PWA
 * - Running in Electron
 */
export function shouldShowMobileInstall() {
  // Don't show on server
  if (typeof window === 'undefined') return false

  // Don't show if already running as standalone PWA
  if (isStandalone()) return false

  // Don't show if on Electron
  if (isElectron()) return false

  // Don't show if on a mobile device (user is already on phone)
  if (isMobileDevice()) return false

  // Don't show if on small screen (likely mobile browser)
  if (isSmallScreen()) return false

  return true
}

/**
 * Get device type string for analytics/debugging
 */
export function getDeviceType() {
  if (isElectron()) return 'electron'
  if (isStandalone()) return 'pwa'
  if (isMobileDevice()) return 'mobile-browser'
  if (isSmallScreen()) return 'small-screen'
  return 'desktop-browser'
}
