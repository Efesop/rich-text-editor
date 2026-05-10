// Sync entitlement registry.
//
// Two grant paths:
//   1. Mac one-time purchase ($14.99 via dashnote.io Stripe) → POST /entitlements/grant-mac
//      Forwarded by the DashLandingPage Stripe webhook handler. Stored
//      keyed by lowercased email + Stripe session id, lifetime grant.
//
//   2. iOS auto-renewable subscription ($2.99/mo or $28.99/yr via App Store IAP)
//      → POST /entitlements/grant-ios. Forwarded by RevenueCat webhook
//      whenever an entitlement transition fires (purchase, trial-conversion,
//      renewal, expiry, refund). Stored keyed by RC appUserID, with active
//      + expiresAt so the relay knows when the user lapses without needing
//      to ping RC on every request.
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

const macKey = (email: string) => ['entitlement', 'mac', email.trim().toLowerCase()] as const
const iosKey = (rcAppUserId: string) => ['entitlement', 'ios', rcAppUserId] as const

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
): Promise<{ hasSync: boolean; source?: 'mac' | 'ios' }> {
  const now = Date.now()

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

  if (opts.email) {
    const ent = await kv.get<MacEntitlement>(macKey(opts.email))
    if (ent.value) return { hasSync: true, source: 'mac' }
  }

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
