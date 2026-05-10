// Reactive 'sync' entitlement hook.
//
// Returns { hasSync, loading, refresh }.
//
// On non-iOS platforms returns hasSync=false until server-side entitlement
// check is wired (server endpoint will validate Mac purchase token + iOS
// receipt via RC webhook → DB).
//
// Use to gate paywall: components that need sync entitlement should call
// useEntitlement and show <PaywallModal /> if !hasSync.

import { useEffect, useState, useCallback } from 'react'
import { getEntitlement, onCustomerInfoUpdated } from '@/lib/rc'

export function useEntitlement () {
  const [hasSync, setHasSync] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const v = await getEntitlement()
      setHasSync(v)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let unsub = () => {}
    ;(async () => {
      try {
        const v = await getEntitlement()
        if (!cancelled) setHasSync(v)
      } finally {
        if (!cancelled) setLoading(false)
      }
      unsub = await onCustomerInfoUpdated((active) => {
        if (!cancelled) setHasSync(active)
      })
    })()
    return () => { cancelled = true; try { unsub() } catch {} }
  }, [])

  return { hasSync, loading, refresh }
}
