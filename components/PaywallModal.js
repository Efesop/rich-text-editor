// Sync subscription paywall.
//
// Triggered when user attempts a sync action (Pair device / Restore from
// backup-to-cloud) without the 'sync' entitlement.
//
// Shows two tiers + 3-day free trial messaging. On purchase success closes
// modal and the parent re-checks entitlement (the SDK update listener wired
// via useEntitlement will also flip hasSync automatically).
//
// On Restore: calls Purchases.restorePurchases() — used by users who
// reinstalled the app, share via Family, or already bought sync on another
// of their devices.

import { useEffect, useState } from 'react'
import { X, Check, Loader2, Cloud, Shield, Lock } from 'lucide-react'
import { getOfferings, purchase, restore } from '@/lib/rc'

export default function PaywallModal ({ isOpen, onClose, onPurchased, isDarkMode, onSignInExisting }) {
  const [offering, setOffering] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null) // 'monthly'|'yearly'|'restore'|null
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true); setError(null)
    ;(async () => {
      try {
        const o = await getOfferings()
        if (!cancelled) setOffering(o)
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load subscription options.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isOpen])

  if (!isOpen) return null

  const monthlyPkg = offering?.availablePackages?.find(p => p.identifier === '$rc_monthly')
  const yearlyPkg = offering?.availablePackages?.find(p => p.identifier === '$rc_annual')

  async function handlePurchase (pkg, kind) {
    if (!pkg) return
    setBusy(kind); setError(null)
    try {
      const ok = await purchase(pkg)
      if (ok) {
        onPurchased?.()
        onClose?.()
      }
    } catch (err) {
      setError(err?.message || 'Purchase failed. Try again.')
    } finally {
      setBusy(null)
    }
  }

  async function handleRestore () {
    setBusy('restore'); setError(null)
    try {
      const ok = await restore()
      if (ok) {
        onPurchased?.()
        onClose?.()
      } else {
        setError('No prior purchase found on this Apple ID.')
      }
    } catch (err) {
      setError(err?.message || 'Restore failed.')
    } finally {
      setBusy(null)
    }
  }

  const yearlyPriceMonthly = yearlyPkg?.product?.price && yearlyPkg.product.price > 0
    ? (yearlyPkg.product.price / 12).toFixed(2)
    : null
  const yearlyCurrency = yearlyPkg?.product?.currencyCode || 'USD'
  const monthlyDisplay = monthlyPkg?.product?.priceString || '$2.99'
  const yearlyDisplay = yearlyPkg?.product?.priceString || '$28.99'

  const overlayBg = 'rgba(0,0,0,0.55)'
  const cardBg = isDarkMode ? '#1a1a1a' : '#fff'
  const fg = isDarkMode ? '#e5e5e5' : '#111'
  const sub = isDarkMode ? '#9ca3af' : '#6b7280'
  const borderColor = isDarkMode ? '#2a2a2a' : '#e5e5e5'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: overlayBg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: cardBg, color: fg, borderRadius: 16, maxWidth: 440, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.4)' }}>
        <div style={{ position: 'relative', padding: '32px 24px 16px 24px', textAlign: 'center' }}>
          <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 12, right: 12, background: 'transparent', border: 'none', cursor: 'pointer', color: sub, padding: 6 }}>
            <X size={20} />
          </button>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Cloud size={28} color="#fff" />
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Sync your notes</h2>
          <p style={{ margin: '8px 0 0', color: sub, fontSize: 14, lineHeight: 1.5 }}>
            End-to-end encrypted sync between your iPhone, iPad, and Mac. The relay server only ever sees ciphertext.
          </p>
        </div>

        <ul style={{ listStyle: 'none', padding: '0 28px 16px', margin: 0, fontSize: 14, color: sub }}>
          <li style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <Check size={16} color="#10b981" /> Notes stay private — only you have the key
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <Check size={16} color="#10b981" /> Pair multiple devices with a QR code
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <Check size={16} color="#10b981" /> Auto-syncs in the background
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <Check size={16} color="#10b981" /> 3-day free trial. Cancel anytime.
          </li>
        </ul>

        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: sub }}>
            <Loader2 size={20} className="animate-spin" /> Loading plans…
          </div>
        )}

        {!loading && offering && (
          <div style={{ padding: '0 24px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Yearly first — best value */}
            {yearlyPkg && (
              <button
                onClick={() => handlePurchase(yearlyPkg, 'yearly')}
                disabled={!!busy}
                style={{ position: 'relative', padding: '14px 16px', borderRadius: 12, border: `2px solid ${'#6366f1'}`, background: isDarkMode ? '#222' : '#f5f3ff', color: fg, cursor: busy ? 'wait' : 'pointer', textAlign: 'left', opacity: busy && busy !== 'yearly' ? 0.5 : 1 }}
              >
                <span style={{ position: 'absolute', top: -10, right: 12, background: '#6366f1', color: '#fff', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8, letterSpacing: 0.3 }}>BEST VALUE · 20% OFF</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>Yearly</div>
                    <div style={{ fontSize: 12, color: sub, marginTop: 2 }}>3-day free trial, then {yearlyDisplay}/yr {yearlyPriceMonthly && `(≈${yearlyCurrency} ${yearlyPriceMonthly}/mo)`}</div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{yearlyDisplay}</div>
                </div>
                {busy === 'yearly' && <Loader2 size={16} className="animate-spin" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }} />}
              </button>
            )}
            {monthlyPkg && (
              <button
                onClick={() => handlePurchase(monthlyPkg, 'monthly')}
                disabled={!!busy}
                style={{ padding: '14px 16px', borderRadius: 12, border: `1px solid ${borderColor}`, background: 'transparent', color: fg, cursor: busy ? 'wait' : 'pointer', textAlign: 'left', opacity: busy && busy !== 'monthly' ? 0.5 : 1 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>Monthly</div>
                    <div style={{ fontSize: 12, color: sub, marginTop: 2 }}>3-day free trial, then {monthlyDisplay}/mo</div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{monthlyDisplay}</div>
                </div>
                {busy === 'monthly' && <Loader2 size={16} className="animate-spin" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }} />}
              </button>
            )}
          </div>
        )}

        {error && (
          <div style={{ padding: '0 24px 12px', color: '#ef4444', fontSize: 13 }}>{error}</div>
        )}

        <div style={{ padding: '0 24px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: sub, gap: 12 }}>
          <button onClick={handleRestore} disabled={!!busy} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: busy ? 'wait' : 'pointer', padding: 0, fontSize: 12, textDecoration: 'underline' }}>
            {busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
          </button>
          {/* Cross-platform sign-in — for users who already have a Dash account
              (subscribed via Mac/web). NO pricing or "cheaper on web" mention
              anywhere on this screen per Apple anti-steering guidelines. */}
          {onSignInExisting && (
            <button onClick={onSignInExisting} disabled={!!busy} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: busy ? 'wait' : 'pointer', padding: 0, fontSize: 12, textDecoration: 'underline' }}>
              I already have an account
            </button>
          )}
        </div>
        <div style={{ padding: '0 24px 20px', fontSize: 11, color: sub }}>
          <Lock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
          Auto-renews. Cancel via Settings → Apple ID → Subscriptions.
        </div>
      </div>
    </div>
  )
}
