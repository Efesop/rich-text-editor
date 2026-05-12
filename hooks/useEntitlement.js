// Reactive 'sync' entitlement hook.
//
// Returns { hasSync, loading, refresh, signedInEmail, source }.
//
// Resolution order:
//   1. iOS Capacitor: RC SDK is the source of truth (live customer info
//      subscription). Updates push via onCustomerInfoUpdated.
//   2. Non-iOS (Mac/Electron, PWA, Linux/Windows Electron):
//      Server-side check via /auth/me. Requires the user to have signed
//      in via SignInModal — until they do, hasSync stays false.
//
// Use this hook to gate sync UI: components that need sync entitlement
// should call useEntitlement and show <PaywallModal /> or <SignInModal />
// if !hasSync.

import { useEffect, useState, useCallback } from 'react'
import { getEntitlement, onCustomerInfoUpdated } from '@/lib/rc'
import { getMe, getEmail } from '@/lib/identity'

function isNativeIOS () {
  if (typeof window === 'undefined') return false
  return window.Capacitor?.isNativePlatform?.() && window.Capacitor?.getPlatform?.() === 'ios'
}

export function useEntitlement () {
  const [hasSync, setHasSync] = useState(false)
  const [loading, setLoading] = useState(true)
  const [signedInEmail, setSignedInEmail] = useState(null)
  const [source, setSource] = useState(null) // 'ios' | 'stripe-sub' | 'mac' | null

  const checkOnce = useCallback(async () => {
    // iOS path: RC SDK.
    if (isNativeIOS()) {
      const v = await getEntitlement()
      return { hasSync: v, source: v ? 'ios' : null, email: getEmail() }
    }
    // Non-iOS: server check via signed-in token.
    const me = await getMe()
    if (!me) {
      return { hasSync: false, source: null, email: getEmail() }
    }
    return {
      hasSync: !!me.hasSync,
      source: me.source || null,
      email: me.email || getEmail(),
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await checkOnce()
      setHasSync(r.hasSync)
      setSource(r.source)
      setSignedInEmail(r.email)
    } finally {
      setLoading(false)
    }
  }, [checkOnce])

  useEffect(() => {
    let cancelled = false
    let unsub = () => {}
    ;(async () => {
      try {
        const r = await checkOnce()
        if (!cancelled) {
          setHasSync(r.hasSync)
          setSource(r.source)
          setSignedInEmail(r.email)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
      // iOS: subscribe to RC SDK updates so trial-conversion, cancel,
      // renewal flip hasSync without a page refresh.
      if (isNativeIOS()) {
        unsub = await onCustomerInfoUpdated((active) => {
          if (!cancelled) {
            setHasSync(active)
            setSource(active ? 'ios' : null)
          }
        })
      }
    })()
    return () => { cancelled = true; try { unsub() } catch {} }
  }, [checkOnce])

  return { hasSync, loading, refresh, signedInEmail, source }
}
