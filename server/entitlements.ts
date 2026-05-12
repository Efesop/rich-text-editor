// Sync entitlement registry.
//
// Three grant paths (Option C cross-platform sync subscription, v1.5):
//   1. Mac one-time purchase ($14.99 via dashnote.io Stripe) → POST /entitlements/grant-mac
//      Forwarded by the DashLandingPage Stripe webhook handler. Stored
//      keyed by lowercased email + Stripe session id, lifetime grant.
//      NOTE: as of v1.5, the Mac one-time grants the DESKTOP LICENSE
//      only. Sync requires a separate sync-sub grant (#3) — Mac and
//      sync are now decoupled. No grandfathering; existing Mac buyers
//      are notified separately and must subscribe to sync like new users.
//
//   2. iOS auto-renewable subscription ($4.99/mo or $47.99/yr via App Store IAP)
//      → POST /entitlements/grant-ios. Forwarded by RevenueCat webhook
//      whenever an entitlement transition fires (purchase, trial-conversion,
//      renewal, expiry, refund). Stored keyed by RC appUserID, with active
//      + expiresAt so the relay knows when the user lapses without needing
//      to ping RC on every request.
//
//   3. Cross-platform sync subscription ($4.99/mo or $47.99/yr via dashnote.io
//      Stripe recurring) → POST /entitlements/grant-sync. Forwarded by the
//      DashLandingPage Stripe webhook handler on customer.subscription.*
//      and invoice.paid events. Stored keyed by lowercased email, with
//      active + expiresAt + Stripe sub id so we can revoke on charge.refunded
//      or customer.subscription.deleted. Distinct from #1 (which is lifetime).
//
// Read path:
//   /entitlements/check?email=X[&rcAppUserId=Y] returns { hasSync: bool, source }.
//   Sync register/push/pull endpoints can call into hasEntitlement() before
//   accepting the request — this is the actual paywall, the in-app paywall
//   is just UX nicety.
//
// Auth:
//   - grant-mac uses HMAC of the request body with ENTITLEMENT_GRANT_SECRET
//     (shared with DashLandingPage). Stripe-side webhook signature is verified
//     in DashLandingPage; the forward-to-relay is a separate trust hop with
//     its own secret so a leaked Stripe webhook secret can't grant entitlements.
//   - grant-ios verifies the RC webhook Authorization header matches
//     RC_WEBHOOK_AUTH (set in RC dashboard).
//   - check is unauthenticated (entitlement state is not sensitive — knowing
//     someone bought sync doesn't reveal anything about their notes).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Entitlement-Signature',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

export type MacEntitlement = {
  source: 'mac'
  email: string
  stripeSessionId?: string
  stripeCustomerId?: string
  grantedAt: number
  amountPaid?: number
  currency?: string
}

export type IosEntitlement = {
  source: 'ios'
  rcAppUserId: string
  productId?: string
  active: boolean
  expiresAt?: number // ms epoch; 0 = lifetime
  inTrial?: boolean
  willRenew?: boolean
  updatedAt: number
}

export type SyncSubEntitlement = {
  source: 'stripe-sub'
  email: string
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  active: boolean
  // ms epoch; the Stripe subscription's current_period_end. We treat
  // the entitlement as active until this passes, even if `active=false`
  // arrives early (cancellation = stays usable until period end, same
  // as RC).
  expiresAt: number
  status?: string // raw Stripe status: active|trialing|past_due|canceled|...
  updatedAt: number
}

const macKey = (email: string) => ['entitlement', 'mac', email.trim().toLowerCase()] as const
const iosKey = (rcAppUserId: string) => ['entitlement', 'ios', rcAppUserId] as const
const syncKey = (email: string) => ['entitlement', 'sync', email.trim().toLowerCase()] as const

// HMAC-SHA-256 of body with shared secret. Used to verify the
// DashLandingPage → relay grant call. Avoids Stripe-secret reuse.
async function verifyHmacSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader) return false
  try {
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody))
    const expectedHex = [...new Uint8Array(sig)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    // Constant-time compare
    if (signatureHeader.length !== expectedHex.length) return false
    let mismatch = 0
    for (let i = 0; i < expectedHex.length; i++) {
      mismatch |= signatureHeader.charCodeAt(i) ^ expectedHex.charCodeAt(i)
    }
    return mismatch === 0
  } catch (err) {
    console.warn('[entitlements] HMAC verify error', err)
    return false
  }
}

export async function hasEntitlement(
  kv: Deno.Kv,
  opts: { email?: string; rcAppUserId?: string },
): Promise<{ hasSync: boolean; source?: 'mac' | 'ios' | 'stripe-sub' }> {
  const now = Date.now()

  // 1. iOS subscription (RevenueCat) — keyed by appUserId
  if (opts.rcAppUserId) {
    const ent = await kv.get<IosEntitlement>(iosKey(opts.rcAppUserId))
    const v = ent.value
    if (v?.active) {
      // Honor expiresAt only when set; lifetime grants have expiresAt=0
      if (!v.expiresAt || v.expiresAt > now) {
        return { hasSync: true, source: 'ios' }
      }
    }
  }

  // 2. Cross-platform sync subscription (Stripe) — keyed by email.
  //    Checked BEFORE mac-lifetime so an active sync sub takes
  //    precedence in the returned `source`.
  if (opts.email) {
    const ent = await kv.get<SyncSubEntitlement>(syncKey(opts.email))
    const v = ent.value
    if (v?.active && v.expiresAt > now) {
      return { hasSync: true, source: 'stripe-sub' }
    }
  }

  // 3. Mac one-time (Stripe $14.99). NOTE: as of v1.5 this is the
  //    desktop LICENSE only — it does NOT grant sync. Kept here for
  //    legacy/internal use (e.g. future loyalty rewards) but
  //    hasEntitlement returns false on a mac-only lookup.
  //
  //    If we ever want to grandfather a specific cohort, change this
  //    block; see the v1.5 plan for the deliberate no-grandfather call.
  //
  //    Intentionally left commented out to make the policy explicit:
  //    Mac alone is NOT sync entitled.
  // if (opts.email) {
  //   const ent = await kv.get<MacEntitlement>(macKey(opts.email))
  //   if (ent.value) return { hasSync: true, source: 'mac' }
  // }

  return { hasSync: false }
}

// Route any /entitlements/* request. Returns null if path doesn't match so
// the caller can fall through.
export async function routeEntitlements(
  kv: Deno.Kv,
  req: Request,
): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname

  if (req.method === 'OPTIONS' && path.startsWith('/entitlements')) {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // ── GET /entitlements/check?email=&rcAppUserId= ─────────────────────────
  if (path === '/entitlements/check' && req.method === 'GET') {
    const email = url.searchParams.get('email') || undefined
    const rcAppUserId = url.searchParams.get('rcAppUserId') || undefined
    if (!email && !rcAppUserId) {
      return json({ error: 'email or rcAppUserId required' }, 400)
    }
    const result = await hasEntitlement(kv, { email, rcAppUserId })
    return json(result)
  }

  // ── POST /entitlements/grant-mac (HMAC-protected) ────────────────────────
  // Body: { email, stripeSessionId, stripeCustomerId, amountPaid, currency }
  // Header: X-Entitlement-Signature: <hex HMAC-SHA256 of body>
  if (path === '/entitlements/grant-mac' && req.method === 'POST') {
    const secret = Deno.env.get('ENTITLEMENT_GRANT_SECRET')
    if (!secret) {
      console.error('[entitlements] ENTITLEMENT_GRANT_SECRET not configured')
      return json({ error: 'server misconfigured' }, 500)
    }
    const rawBody = await req.text()
    const sig = req.headers.get('X-Entitlement-Signature')
    if (!(await verifyHmacSignature(rawBody, sig, secret))) {
      return json({ error: 'invalid signature' }, 401)
    }
    let body: Partial<MacEntitlement>
    try { body = JSON.parse(rawBody) } catch { return json({ error: 'invalid json' }, 400) }
    if (!body.email || typeof body.email !== 'string') {
      return json({ error: 'email required' }, 400)
    }
    const ent: MacEntitlement = {
      source: 'mac',
      email: body.email.trim().toLowerCase(),
      stripeSessionId: body.stripeSessionId,
      stripeCustomerId: body.stripeCustomerId,
      amountPaid: body.amountPaid,
      currency: body.currency,
      grantedAt: Date.now(),
    }
    await kv.set(macKey(ent.email), ent)
    console.log(`[entitlements] granted MAC sync to ${ent.email} (stripeId=${ent.stripeSessionId || 'n/a'})`)
    return json({ ok: true, email: ent.email })
  }

  // ── POST /entitlements/grant-sync (HMAC-protected) ───────────────────────
  // Body: { email, stripeCustomerId, stripeSubscriptionId, currentPeriodEnd, status }
  // Header: X-Entitlement-Signature: <hex HMAC-SHA256 of body>
  //
  // Called by the DashLandingPage Stripe webhook on:
  //   - checkout.session.completed (mode=subscription)
  //   - customer.subscription.created/updated
  //   - invoice.paid (period renewal)
  //
  // Status whitelist:
  //   active|trialing|past_due  -> active=true
  //   canceled|unpaid|incomplete_expired -> active=false (use revoke-sync
  //     for the canonical cancel path; this is the fallback when Stripe
  //     sends terminal status via customer.subscription.updated).
  if (path === '/entitlements/grant-sync' && req.method === 'POST') {
    const secret = Deno.env.get('ENTITLEMENT_GRANT_SECRET')
    if (!secret) {
      console.error('[entitlements] ENTITLEMENT_GRANT_SECRET not configured')
      return json({ error: 'server misconfigured' }, 500)
    }
    const rawBody = await req.text()
    const sig = req.headers.get('X-Entitlement-Signature')
    if (!(await verifyHmacSignature(rawBody, sig, secret))) {
      return json({ error: 'invalid signature' }, 401)
    }
    let body: any
    try { body = JSON.parse(rawBody) } catch { return json({ error: 'invalid json' }, 400) }
    if (!body.email || typeof body.email !== 'string') {
      return json({ error: 'email required' }, 400)
    }
    const periodEndMs = typeof body.currentPeriodEnd === 'number'
      ? (body.currentPeriodEnd > 1e12 ? body.currentPeriodEnd : body.currentPeriodEnd * 1000)
      : 0
    const status = typeof body.status === 'string' ? body.status : 'active'
    const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due'])
    const active = ACTIVE_STATUSES.has(status) && periodEndMs > Date.now()

    const ent: SyncSubEntitlement = {
      source: 'stripe-sub',
      email: body.email.trim().toLowerCase(),
      stripeCustomerId: body.stripeCustomerId,
      stripeSubscriptionId: body.stripeSubscriptionId,
      active,
      expiresAt: periodEndMs,
      status,
      updatedAt: Date.now(),
    }
    await kv.set(syncKey(ent.email), ent)
    console.log(`[entitlements] sync-sub ${status} for ${ent.email} active=${active} expiresAt=${ent.expiresAt}`)
    return json({ ok: true, email: ent.email, active })
  }

  // ── POST /entitlements/revoke-sync (HMAC-protected) ──────────────────────
  // Body: { email, stripeSubscriptionId? }
  // Header: X-Entitlement-Signature
  //
  // Called on customer.subscription.deleted or charge.refunded. Marks
  // active=false but keeps the row for audit (helpful for support).
  if (path === '/entitlements/revoke-sync' && req.method === 'POST') {
    const secret = Deno.env.get('ENTITLEMENT_GRANT_SECRET')
    if (!secret) {
      console.error('[entitlements] ENTITLEMENT_GRANT_SECRET not configured')
      return json({ error: 'server misconfigured' }, 500)
    }
    const rawBody = await req.text()
    const sig = req.headers.get('X-Entitlement-Signature')
    if (!(await verifyHmacSignature(rawBody, sig, secret))) {
      return json({ error: 'invalid signature' }, 401)
    }
    let body: any
    try { body = JSON.parse(rawBody) } catch { return json({ error: 'invalid json' }, 400) }
    if (!body.email || typeof body.email !== 'string') {
      return json({ error: 'email required' }, 400)
    }
    const email = body.email.trim().toLowerCase()
    const existing = await kv.get<SyncSubEntitlement>(syncKey(email))
    if (existing.value) {
      await kv.set(syncKey(email), {
        ...existing.value,
        active: false,
        status: 'canceled',
        updatedAt: Date.now(),
      })
    }
    console.log(`[entitlements] sync-sub REVOKED for ${email}`)
    return json({ ok: true, email })
  }

  // ── POST /entitlements/grant-ios (RC webhook auth) ───────────────────────
  // RC sends the full event payload; we extract entitlement state.
  // Header: Authorization: Bearer <RC_WEBHOOK_AUTH>
  // Body: RC v1 webhook event format — see https://www.revenuecat.com/docs/integrations/webhooks
  if (path === '/entitlements/grant-ios' && req.method === 'POST') {
    const expected = Deno.env.get('RC_WEBHOOK_AUTH')
    if (!expected) {
      console.error('[entitlements] RC_WEBHOOK_AUTH not configured')
      return json({ error: 'server misconfigured' }, 500)
    }
    const auth = req.headers.get('Authorization') || ''
    if (auth !== `Bearer ${expected}` && auth !== expected) {
      return json({ error: 'unauthorized' }, 401)
    }
    let body: any
    try { body = await req.json() } catch { return json({ error: 'invalid json' }, 400) }
    const e = body?.event
    if (!e) return json({ error: 'missing event' }, 400)

    const rcAppUserId = e.app_user_id || e.original_app_user_id
    if (!rcAppUserId) return json({ error: 'missing app_user_id' }, 400)

    // RC event types: INITIAL_PURCHASE, RENEWAL, NON_RENEWING_PURCHASE,
    // CANCELLATION, EXPIRATION, BILLING_ISSUE, PRODUCT_CHANGE, UNCANCELLATION,
    // SUBSCRIBER_ALIAS, REFUND, TRANSFER, TEMPORARY_ENTITLEMENT_GRANT
    const ACTIVE_TYPES = new Set([
      'INITIAL_PURCHASE',
      'RENEWAL',
      'NON_RENEWING_PURCHASE',
      'PRODUCT_CHANGE',
      'UNCANCELLATION',
      'TEMPORARY_ENTITLEMENT_GRANT',
    ])
    const INACTIVE_TYPES = new Set([
      'EXPIRATION',
      'CANCELLATION', // cancellation = will not renew, but stays active until expires_date
      'BILLING_ISSUE',
      'REFUND',
    ])

    const expiresAt = e.expiration_at_ms ? Number(e.expiration_at_ms) : 0
    const isActive = ACTIVE_TYPES.has(e.type) ||
      (e.type === 'CANCELLATION' && expiresAt > Date.now())
    const isInactive = INACTIVE_TYPES.has(e.type) && !(e.type === 'CANCELLATION' && expiresAt > Date.now())

    const ent: IosEntitlement = {
      source: 'ios',
      rcAppUserId,
      productId: e.product_id,
      active: isActive && !isInactive,
      expiresAt,
      inTrial: e.period_type === 'TRIAL',
      willRenew: e.type !== 'CANCELLATION',
      updatedAt: Date.now(),
    }
    await kv.set(iosKey(rcAppUserId), ent)
    console.log(`[entitlements] iOS ${e.type} for ${rcAppUserId} active=${ent.active} expiresAt=${ent.expiresAt}`)
    return json({ ok: true, active: ent.active })
  }

  return null
}
