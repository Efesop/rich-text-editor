/**
 * Thin wrapper around Capacitor native plugins. Safe to call on web/Electron —
 * no-ops when Capacitor isn't present.
 *
 * Used for status bar tinting, keyboard control, haptics, and splash screen
 * — features that only meaningfully exist on iOS / Android native shells.
 */

let _capacitor = null
let _statusBar = null
let _keyboard = null
let _haptics = null
let _splash = null

function isNative () {
  if (typeof window === 'undefined') return false
  return !!window.Capacitor?.isNativePlatform?.()
}

async function ensureLoaded () {
  if (!isNative()) return false
  if (_capacitor) return true
  try {
    _capacitor = window.Capacitor
    const [statusMod, keyboardMod, hapticsMod, splashMod] = await Promise.all([
      import('@capacitor/status-bar'),
      import('@capacitor/keyboard'),
      import('@capacitor/haptics'),
      import('@capacitor/splash-screen')
    ])
    _statusBar = statusMod
    _keyboard = keyboardMod
    _haptics = hapticsMod
    _splash = splashMod
    return true
  } catch (err) {
    console.warn('[nativeBridge] plugin load failed', err)
    return false
  }
}

/**
 * Set status bar style based on current theme. Light themes need dark text
 * on the status bar; dark themes need light text.
 */
export async function applyStatusBarTheme (theme) {
  if (!(await ensureLoaded())) return
  try {
    const isDark = theme === 'dark' || theme === 'darkblue' || theme === 'fallout'
    await _statusBar.StatusBar.setStyle({
      style: isDark ? _statusBar.Style.Dark : _statusBar.Style.Light
    })
    // Make status bar overlay the WebView (so content extends behind it
    // and the safe-area inset is respected).
    await _statusBar.StatusBar.setOverlaysWebView({ overlay: true })
  } catch (err) {
    console.warn('[nativeBridge] applyStatusBarTheme failed', err)
  }
}

/**
 * Hide the iOS keyboard accessory bar (the gray strip with arrows + Done).
 * We render our own keyboard toolbar in the WebView instead.
 */
export async function configureKeyboard () {
  if (!(await ensureLoaded())) return
  try {
    await _keyboard.Keyboard.setAccessoryBarVisible({ isVisible: false })
    await _keyboard.Keyboard.setScroll({ isDisabled: false })
  } catch (err) {
    // Plugin can throw on Android — non-fatal.
  }
}

export async function dismissKeyboard () {
  if (!(await ensureLoaded())) return
  try {
    await _keyboard.Keyboard.hide()
  } catch (err) {
    /* ignore */
  }
}

export function onKeyboardWillShow (handler) {
  if (typeof window === 'undefined' || !window.Capacitor?.isNativePlatform?.()) return () => {}
  let unsub = () => {}
  ensureLoaded().then((ok) => {
    if (!ok) return
    const h = _keyboard.Keyboard.addListener('keyboardWillShow', handler)
    unsub = () => h.then((sub) => sub.remove())
  })
  return () => unsub()
}

export function onKeyboardWillHide (handler) {
  if (typeof window === 'undefined' || !window.Capacitor?.isNativePlatform?.()) return () => {}
  let unsub = () => {}
  ensureLoaded().then((ok) => {
    if (!ok) return
    const h = _keyboard.Keyboard.addListener('keyboardWillHide', handler)
    unsub = () => h.then((sub) => sub.remove())
  })
  return () => unsub()
}

/**
 * Haptic feedback. Each call corresponds to a discrete user action.
 * Use sparingly — over-haptic feels cheap.
 */
export async function hapticLight () {
  if (!(await ensureLoaded())) return
  try { await _haptics.Haptics.impact({ style: _haptics.ImpactStyle.Light }) } catch { /* ignore */ }
}

export async function hapticMedium () {
  if (!(await ensureLoaded())) return
  try { await _haptics.Haptics.impact({ style: _haptics.ImpactStyle.Medium }) } catch { /* ignore */ }
}

export async function hapticSuccess () {
  if (!(await ensureLoaded())) return
  try { await _haptics.Haptics.notification({ type: _haptics.NotificationType.Success }) } catch { /* ignore */ }
}

export async function hapticWarning () {
  if (!(await ensureLoaded())) return
  try { await _haptics.Haptics.notification({ type: _haptics.NotificationType.Warning }) } catch { /* ignore */ }
}

export async function hideSplash () {
  if (!(await ensureLoaded())) return
  try { await _splash.SplashScreen.hide({ fadeOutDuration: 300 }) } catch { /* ignore */ }
}

/**
 * Single bootstrap entry — call from app root once on mount.
 */
export async function initNative (theme) {
  if (!isNative()) return
  await applyStatusBarTheme(theme)
  await configureKeyboard()
  // Splash hide is delayed by Capacitor's launchAutoHide config; explicit
  // call here is a fallback in case a slow first paint lets it linger.
  setTimeout(() => { hideSplash() }, 600)
}

export const isNativePlatform = isNative
