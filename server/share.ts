/**
 * Share-link storage: encrypted note payloads behind short ids, kept for
 * 30 days. The relay never sees the key — it lives in the link fragment.
 *
 * Deno KV caps a value at 64 KiB, so a payload larger than SHARE_INLINE_BYTES
 * is split into chunk entries written before the entry that names them.
 * Every entry carries the same expiry, so an upload that dies part-way
 * cleans itself up.
 */

export const MAX_SHARE_BYTES = 5 * 1024 * 1024
export const SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const SHARE_INLINE_BYTES = 60 * 1024
const SHARE_CHUNK_BYTES = 60 * 1024
// 10 × 60 KiB keeps each atomic write under KV's 800 KiB limit.
const CHUNK_WRITE_GROUP = 10
// Deno KV's getMany reads at most 10 keys at a time.
const GET_MANY_LIMIT = 10

type ChunkedShare = { v: 1; size: number; chunks: number }

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/** POST /share and GET /share/:id. Returns null for any other request. */
export async function handleShareRequest(
  kv: Deno.Kv,
  req: Request,
  cors: Record<string, string>,
): Promise<Response | null> {
  const path = new URL(req.url).pathname

  if (path === '/share' && req.method === 'POST') {
    const payload = new Uint8Array(await req.arrayBuffer())
    if (payload.byteLength > MAX_SHARE_BYTES) {
      return json({ error: 'Payload too large' }, 413, cors)
    }
    const id = newShareId()
    await storeShare(kv, id, payload)
    return json({ ok: true, id }, 200, cors)
  }

  const match = path.match(/^\/share\/([a-zA-Z0-9_-]+)$/)
  if (match && req.method === 'GET') {
    const payload = await readShare(kv, match[1])
    if (!payload) return json({ error: 'Not found or expired' }, 404, cors)
    return new Response(payload as Uint8Array<ArrayBuffer>, {
      headers: { ...cors, 'Content-Type': 'application/octet-stream' },
    })
  }

  return null
}

/** 9 random bytes → 12 base64url characters. */
function newShareId(): string {
  const idBytes = crypto.getRandomValues(new Uint8Array(9))
  return btoa(String.fromCharCode(...idBytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function storeShare(kv: Deno.Kv, id: string, payload: Uint8Array): Promise<void> {
  const expireIn = SHARE_TTL_MS
  if (payload.byteLength <= SHARE_INLINE_BYTES) {
    await kv.set(['shares', id], payload, { expireIn })
    return
  }

  const chunks = Math.ceil(payload.byteLength / SHARE_CHUNK_BYTES)
  for (let start = 0; start < chunks; start += CHUNK_WRITE_GROUP) {
    let tx = kv.atomic()
    for (let i = start; i < Math.min(chunks, start + CHUNK_WRITE_GROUP); i++) {
      const part = payload.slice(i * SHARE_CHUNK_BYTES, (i + 1) * SHARE_CHUNK_BYTES)
      tx = tx.set(['share-chunk', id, i], part, { expireIn })
    }
    await tx.commit()
  }
  const entry: ChunkedShare = { v: 1, size: payload.byteLength, chunks }
  await kv.set(['shares', id], entry, { expireIn })
}

/** The stored payload, or null when it is missing, expired or incomplete. */
export async function readShare(kv: Deno.Kv, id: string): Promise<Uint8Array | null> {
  const value = (await kv.get<Uint8Array | ChunkedShare>(['shares', id])).value
  if (!value) return null
  // Shares stored before chunking, and every small share, are a single value.
  if (value instanceof Uint8Array) return value

  const out = new Uint8Array(value.size)
  let offset = 0
  for (let start = 0; start < value.chunks; start += GET_MANY_LIMIT) {
    const keys: Deno.KvKey[] = []
    for (let i = start; i < Math.min(value.chunks, start + GET_MANY_LIMIT); i++) {
      keys.push(['share-chunk', id, i])
    }
    for (const entry of await kv.getMany<Uint8Array[]>(keys)) {
      const part = entry.value
      if (!(part instanceof Uint8Array) || offset + part.byteLength > value.size) return null
      out.set(part, offset)
      offset += part.byteLength
    }
  }
  return offset === value.size ? out : null
}
