// Resend client — used by the magic-link sign-in flow (./auth.ts) and
// the existing-buyer notification script (DashLandingPage/scripts/...).
//
// Reads RESEND_API_KEY + RESEND_FROM (e.g. "auth@dashnote.io") from env.
// Throws on misconfig so callers can surface a clear error to the user.
//
// Privacy stance: Resend processes only the email address + transactional
// body (6-digit code or buyer notification). We never share names, vault
// IDs, or any note content with Resend. See pages/privacy.js.

const RESEND_API = 'https://api.resend.com/emails'

export interface ResendResult {
  ok: boolean
  id?: string
  error?: string
}

async function postResend(payload: Record<string, unknown>): Promise<ResendResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.error('[resend] RESEND_API_KEY not configured')
    return { ok: false, error: 'email service not configured' }
  }
  const from = Deno.env.get('RESEND_FROM') || 'Dash Notes <auth@dashnote.io>'
  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, ...payload }),
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '<unreadable>')
      console.error(`[resend] HTTP ${res.status}: ${errBody}`)
      return { ok: false, error: `resend HTTP ${res.status}` }
    }
    const data = await res.json().catch(() => ({}))
    return { ok: true, id: data?.id }
  } catch (err) {
    console.error('[resend] send failed', err)
    return { ok: false, error: String(err) }
  }
}

/**
 * Send a 6-digit sign-in code. Used by /auth/code/request.
 * Body is intentionally minimal — no marketing, no tracking pixels,
 * matches the privacy-first pitch.
 */
export async function sendCode(to: string, code: string): Promise<ResendResult> {
  const subject = `Your Dash sign-in code: ${code}`
  const text = [
    `Your Dash Notes sign-in code is: ${code}`,
    '',
    `This code expires in 10 minutes. Enter it in the Dash app to finish signing in.`,
    '',
    `If you didn't request this code, ignore this email — your account is safe.`,
    '',
    `— Dash Notes`,
  ].join('\n')
  const html = `<!doctype html><html><body style="font-family:-apple-system,system-ui,sans-serif;line-height:1.5;color:#111;max-width:480px;margin:32px auto;padding:24px">
    <p style="margin:0 0 16px">Your Dash Notes sign-in code is:</p>
    <p style="font-size:28px;font-weight:600;letter-spacing:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin:0 0 24px;color:#000">${code}</p>
    <p style="margin:0 0 16px;color:#555">This code expires in 10 minutes. Enter it in the Dash app to finish signing in.</p>
    <p style="margin:0;color:#888;font-size:13px">If you didn't request this code, ignore this email — your account is safe.</p>
  </body></html>`
  return postResend({ to, subject, text, html })
}

/**
 * Send a transactional notice (used for the "existing buyer, sync is launching"
 * one-time notification script). Exposes a simple API for any future
 * transactional sends — keep marketing emails OUT of this path.
 */
export async function sendTransactional(opts: {
  to: string
  subject: string
  text: string
  html?: string
}): Promise<ResendResult> {
  return postResend(opts)
}
