/**
 * Dash Live Notes Relay Server
 *
 * Zero-knowledge WebSocket relay + encrypted blob storage.
 * Deployed to Deno Deploy. Never sees plaintext — only forwards/stores encrypted data.
 *
 * Endpoints:
 *   WebSocket /ws/:roomId  — Join a live editing room
 *   PUT /blob/:docId       — Store encrypted note snapshot
 *   GET /blob/:docId       — Retrieve latest encrypted snapshot
 *   POST /request/:docId   — Submit an edit request
 *   GET /request/:docId    — Poll for pending edit requests
 *   DELETE /request/:docId/:requestId — Dismiss an edit request
 */

const kv = await Deno.openKv()

// In-memory room state (ephemeral — lost on restart, which is fine)
const rooms = new Map<string, Set<WebSocket>>()

// Max blob size: 5MB (encrypted note content)
const MAX_BLOB_SIZE = 5 * 1024 * 1024
// Edit requests expire after 7 days
const REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000
// Share payloads expire after 30 days
const SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000

// CORS headers for cross-origin requests from Dash
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

Deno.serve({ port: 8000 }, async (req: Request) => {
  const url = new URL(req.url)
  const path = url.pathname

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // Health check
  if (path === '/' || path === '/health') {
    return new Response(JSON.stringify({
      status: 'ok',
      rooms: rooms.size,
      connections: [...rooms.values()].reduce((sum, set) => sum + set.size, 0),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── WebSocket: Live Room ──────────────────────────────────────────
  const wsMatch = path.match(/^\/ws\/([a-zA-Z0-9_-]+)$/)
  if (wsMatch && req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
    const roomId = wsMatch[1]
    const { socket, response } = Deno.upgradeWebSocket(req)

    socket.addEventListener('open', () => {
      if (!rooms.has(roomId)) rooms.set(roomId, new Set())
      const room = rooms.get(roomId)!
      room.add(socket)

      // Broadcast updated participant count
      broadcastMeta(roomId)
    })

    socket.addEventListener('message', (event) => {
      const room = rooms.get(roomId)
      if (!room) return

      // Forward encrypted message to all other participants in the room
      for (const peer of room) {
        if (peer !== socket && peer.readyState === WebSocket.OPEN) {
          peer.send(event.data)
        }
      }
    })

    socket.addEventListener('close', () => {
      const room = rooms.get(roomId)
      if (room) {
        room.delete(socket)
        if (room.size === 0) {
          rooms.delete(roomId)
        } else {
          broadcastMeta(roomId)
        }
      }
    })

    socket.addEventListener('error', () => {
      const room = rooms.get(roomId)
      if (room) {
        room.delete(socket)
        if (room.size === 0) rooms.delete(roomId)
      }
    })

    return response
  }

  // ── Blob Storage: Encrypted Note Snapshots ────────────────────────
  const blobMatch = path.match(/^\/blob\/([a-zA-Z0-9_-]+)$/)
  if (blobMatch) {
    const docId = blobMatch[1]

    if (req.method === 'PUT') {
      const body = await req.arrayBuffer()
      if (body.byteLength > MAX_BLOB_SIZE) {
        return new Response(JSON.stringify({ error: 'Blob too large' }), {
          status: 413,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      await kv.set(['blobs', docId], new Uint8Array(body), {
        expireIn: 30 * 24 * 60 * 60 * 1000, // 30 days TTL
      })

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'GET') {
      const result = await kv.get<Uint8Array>(['blobs', docId])
      if (!result.value) {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(result.value, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/octet-stream',
        },
      })
    }
  }

  // ── Edit Requests ─────────────────────────────────────────────────
  const requestMatch = path.match(/^\/request\/([a-zA-Z0-9_-]+)$/)
  if (requestMatch) {
    const docId = requestMatch[1]

    // Submit an edit request (guest → host)
    if (req.method === 'POST') {
      const body = await req.json()
      const requestId = crypto.randomUUID()

      await kv.set(['requests', docId, requestId], {
        id: requestId,
        encryptedPayload: body.encryptedPayload, // Opaque to server
        createdAt: Date.now(),
      }, {
        expireIn: REQUEST_TTL_MS,
      })

      return new Response(JSON.stringify({ ok: true, requestId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Poll for pending edit requests (host polls)
    if (req.method === 'GET') {
      const requests: unknown[] = []
      const iter = kv.list({ prefix: ['requests', docId] })
      for await (const entry of iter) {
        requests.push(entry.value)
      }

      return new Response(JSON.stringify({ requests }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Dismiss an edit request
  const dismissMatch = path.match(/^\/request\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)$/)
  if (dismissMatch && req.method === 'DELETE') {
    const [, docId, requestId] = dismissMatch
    await kv.delete(['requests', docId, requestId])

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── Share Storage: Short Links for Encrypted Notes ───────────────
  if (path === '/share' && req.method === 'POST') {
    const body = await req.arrayBuffer()
    if (body.byteLength > MAX_BLOB_SIZE) {
      return new Response(JSON.stringify({ error: 'Payload too large' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generate a short ID (9 random bytes → 12 base64url chars)
    const idBytes = crypto.getRandomValues(new Uint8Array(9))
    const id = btoa(String.fromCharCode(...idBytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    await kv.set(['shares', id], new Uint8Array(body), {
      expireIn: SHARE_TTL_MS,
    })

    return new Response(JSON.stringify({ ok: true, id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const shareMatch = path.match(/^\/share\/([a-zA-Z0-9_-]+)$/)
  if (shareMatch && req.method === 'GET') {
    const id = shareMatch[1]
    const result = await kv.get<Uint8Array>(['shares', id])
    if (!result.value) {
      return new Response(JSON.stringify({ error: 'Not found or expired' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(result.value, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/octet-stream',
      },
    })
  }

  // 404 fallback
  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

/** Broadcast metadata (participant count) to all clients in a room */
function broadcastMeta(roomId: string) {
  const room = rooms.get(roomId)
  if (!room) return

  const meta = JSON.stringify({
    type: '_meta',
    participants: room.size,
  })

  for (const socket of room) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(meta)
    }
  }
}
