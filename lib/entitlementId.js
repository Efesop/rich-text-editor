// Resolve the identity the sync server uses to look up entitlements.
//
// Mac (Electron):   email tied to the user's $14.99 dashnote.io purchase,
//                   asked once + persisted in localStorage as `dash:entitlement-email`.
// iOS (Capacitor):  RevenueCat appUserId (anonymous random or alias the
//                   user logged in with). Read from the RC SDK.
//
// Both are passed in the body of POST /sync/vault/register so the relay
// can look up the entitlement record (when ENTITLEMENT_REQUIRED is on).
// During alpha the relay treats both as optional.

const STORAGE_KEY = 'dash:entitlement-email'

export function getMacEntitlementEmail () {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v && v.trim() ? v.trim().toLowerCase() : null
  } catch { return null }
}

export function setMacEntitlementEmail (email) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, String(email).trim().toLowerCase())
  } catch { /* */ }
}

export function clearMacEntitlementEmail () {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* */ }
}

// Returns { entitlementEmail?, rcAppUserId? } to attach to register payloads.
// Best-effort: if neither is available the request still goes through
// (relay tolerates missing IDs during alpha, rejects only when
// ENTITLEMENT_REQUIRED is enabled and the IP isn't recognised).
export async function getEntitlementIds () {
  const out = {}

  // Native iOS: ask the RC SDK for the current app user id.
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    try {
      const { Purchases } = await import('@revenuecat/purchases-capacitor')
      const info = await Purchases.getCustomerInfo()
      const id = info?.customerInfo?.originalAppUserId
      if (id && !id.startsWith('$RCAnonymousID:')) {
        out.rcAppUserId = id
      } else if (id) {
        // Anonymous IDs still work — RC tracks the entitlement against them.
        out.rcAppUserId = id
      }
    } catch { /* RC not initialised yet — skip */ }
  }

  // Electron / Mac: use the saved purchase email.
  if (typeof window !== 'undefined' && (window.electron?.invoke || !window.Capacitor?.isNativePlatform?.())) {
    const email = getMacEntitlementEmail()
    if (email) out.entitlementEmail = email
  }

  return out
}
