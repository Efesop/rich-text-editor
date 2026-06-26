// RevenueCat thin wrapper.
//
// Boundary:
//   - This module ONLY handles entitlement state (paid? trial? expired?).
//   - It NEVER touches note content, vault keys, or sync payloads.
//   - On non-iOS platforms (web/Electron/Mac DMG) the SDK isn't initialised;
//     the helpers degrade to "entitlement check via server" later.
//
// Wire-up:
//   - `init()` runs once per app boot (called from _app.js).
//   - `getEntitlement()` returns true if user has 'sync' active.
//   - `getOfferings()` returns the live "default" offering with monthly + yearly packages.
//   - `purchase(pkg)` triggers Apple's purchase sheet, returns updated CustomerInfo.
//   - `restore()` restores prior purchases (e.g. after reinstall, family sharing).
//
// Entitlement key matches the RC dashboard:
//   lookup_key: 'sync'
//
// Public SDK key (Apple) — safe to ship in client bundle.
export const RC_API_KEY_APPLE = 'appl_bdNWbPsnSWRqeuSxXddEXCFmDCb'

const ENTITLEMENT_ID = 'sync'

// Network/StoreKit calls can hang indefinitely when the storefront is
// misconfigured (e.g. Paid Apps Agreement not in effect, products not yet
// "Ready to Submit"). Without a ceiling the paywall spins forever — which is
// exactly the "loaded indefinitely" state App Review rejects under 2.1(b).
// These caps turn a hang into a surfaced error the UI can recover from.
const OFFERINGS_TIMEOUT_MS = 15000
const RESTORE_TIMEOUT_MS = 30000
// Purchase is user-driven (Apple's sheet may sit open while they authenticate),
// so this is deliberately generous — it only trips on a true hang, never a slow
// human. A late success after a trip is still caught by onCustomerInfoUpdated.
const PURCHASE_TIMEOUT_MS = 90000

class TimeoutError extends Error {
  constructor (op) {
    super(`${op} timed out`)
    this.name = 'TimeoutError'
    this.isTimeout = true
  }
}

// Rejects with a TimeoutError if `promise` doesn't settle within `ms`.
function withTimeout (promise, ms, op) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(op)), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) }
    )
  })
}

let initialised = false
let purchasesPromise = null

// Lazy-load the SDK only on Capacitor iOS to keep web/Electron bundles small
// and to avoid the SDK touching `window` before the app is mounted.
async function getPurchases () {
  if (purchasesPromise) return purchasesPromise
  purchasesPromise = (async () => {
    if (typeof window === 'undefined') return null
    if (!window.Capacitor?.isNativePlatform?.()) return null
    if (window.Capacitor.getPlatform?.() !== 'ios') return null
    try {
      const mod = await import('@revenuecat/purchases-capacitor')
      return mod.Purchases
    } catch (err) {
      console.warn('[rc] failed to load Purchases SDK', err)
      return null
    }
  })()
  return purchasesPromise
}

// Stable anonymous app user id stored in localStorage on first call.
// On Capacitor this persists per-install (app sandbox); reinstalling generates
// a new id (purchases can be recovered via Apple's Restore flow).
function getOrCreateAppUserId () {
  const KEY = 'dash:rc:appUserId'
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = 'dash-' + crypto.randomUUID()
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return 'dash-anon-' + Math.random().toString(36).slice(2)
  }
}

export async function init () {
  if (initialised) return
  const Purchases = await getPurchases()
  if (!Purchases) return // not on iOS, skip
  try {
    const appUserID = getOrCreateAppUserId()
    await Purchases.configure({ apiKey: RC_API_KEY_APPLE, appUserID })
    initialised = true
  } catch (err) {
    console.warn('[rc] configure failed', err)
  }
}

// True if user has the 'sync' entitlement active (paid, trial, grace period).
export async function getEntitlement () {
  const Purchases = await getPurchases()
  if (!Purchases) return false
  try {
    const { customerInfo } = await Purchases.getCustomerInfo()
    return Boolean(customerInfo?.entitlements?.active?.[ENTITLEMENT_ID])
  } catch (err) {
    console.warn('[rc] getEntitlement failed', err)
    return false
  }
}

// Returns the current offering's monthly + annual packages, or null when no
// offering is configured. THROWS on failure/timeout (caller shows an error +
// retry) — we deliberately don't swallow to null here, because "request failed"
// and "no products" need different UI: one is retryable, the other isn't.
export async function getOfferings () {
  const Purchases = await getPurchases()
  if (!Purchases) return null // not on iOS — paywall isn't reachable here
  const res = await withTimeout(Purchases.getOfferings(), OFFERINGS_TIMEOUT_MS, 'getOfferings')
  return res?.current || null
}

// Triggers Apple purchase sheet for the given Package. Returns true if user
// now has the 'sync' entitlement (covers the new sub or restore-from-existing).
export async function purchase (pkg) {
  const Purchases = await getPurchases()
  if (!Purchases) throw new Error('Purchases SDK unavailable')
  try {
    const { customerInfo } = await withTimeout(
      Purchases.purchasePackage({ aPackage: pkg }),
      PURCHASE_TIMEOUT_MS,
      'purchase'
    )
    return Boolean(customerInfo?.entitlements?.active?.[ENTITLEMENT_ID])
  } catch (err) {
    if (err?.userCancelled) return false
    throw err
  }
}

// Restore purchases (after reinstall, family sharing, switched device).
// Returns true/false for the entitlement; THROWS on failure/timeout so the UI
// can distinguish "restore errored" from "restored, but nothing to restore".
export async function restore () {
  const Purchases = await getPurchases()
  if (!Purchases) return false
  const { customerInfo } = await withTimeout(
    Purchases.restorePurchases(),
    RESTORE_TIMEOUT_MS,
    'restore'
  )
  return Boolean(customerInfo?.entitlements?.active?.[ENTITLEMENT_ID])
}

// Live customerInfo listener — fires on any entitlement change (purchase,
// trial conversion, expiry, restore). Returns an unsubscribe function.
export async function onCustomerInfoUpdated (callback) {
  const Purchases = await getPurchases()
  if (!Purchases) return () => {}
  try {
    const handle = await Purchases.addCustomerInfoUpdateListener(({ customerInfo }) => {
      callback(Boolean(customerInfo?.entitlements?.active?.[ENTITLEMENT_ID]), customerInfo)
    })
    return () => { try { Purchases.removeCustomerInfoUpdateListener(handle) } catch {} }
  } catch (err) {
    console.warn('[rc] addCustomerInfoUpdateListener failed', err)
    return () => {}
  }
}
