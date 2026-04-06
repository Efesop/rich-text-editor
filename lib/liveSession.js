/**
 * Live Session — E2E encrypted WebSocket sync for collaborative editing
 *
 * Handles:
 * - Connecting to the relay server via WebSocket
 * - E2E encrypting/decrypting all messages with AES-256-GCM
 * - Block-level sync (entire block content sent on change)
 * - Participant count tracking
 * - Reconnection with backoff
 */

const DEFAULT_RELAY = 'wss://dash-relay.efesop.deno.net'
const envRelay = process.env.NEXT_PUBLIC_RELAY_URL
// Allow wss:// for production, ws://localhost for development only
const isSecure = envRelay && (envRelay.startsWith('wss://') || envRelay.startsWith('ws://localhost') || envRelay.startsWith('ws://127.0.0.1'))
const RELAY_URL = isSecure ? envRelay : DEFAULT_RELAY

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/**
 * Generate a random room ID + encryption key for a new session
 * @returns {{ roomId: string, key: string }}
 */
export function createSessionCredentials () {
  const roomId = crypto.randomUUID()
  // 32 random bytes → base64url = 43 chars, used as raw key material
  const keyBytes = crypto.getRandomValues(new Uint8Array(32))
  const key = btoa(String.fromCharCode(...keyBytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return { roomId, key }
}

/**
 * Build a shareable session link
 * @param {string} roomId
 * @param {string} key - base64url-encoded key
 * @returns {string} URL with key in fragment (never sent to server)
 */
export function buildSessionLink (roomId, key) {
  // Validate parameters before embedding in URL
  if (!roomId || !/^[a-zA-Z0-9_-]+$/.test(roomId)) return null
  if (!key || !/^[a-zA-Z0-9_\-=+/]+$/.test(key)) return null
  // Fragment contains key — browsers never send # to servers
  // Use dashnotes:// protocol for Electron (other Dash users can click to join directly)
  // Fall back to HTTP link for PWA/browser users
  if (typeof window !== 'undefined' && window.electron) {
    return `dashnotes://live#${roomId}.${key}`
  }
  return `${window.location.origin}/live#${roomId}.${key}`
}

/**
 * Parse a session link to extract roomId and key
 * @param {string} link
 * @returns {{ roomId: string, key: string } | null}
 */
export function parseSessionLink (link) {
  try {
    const url = new URL(link)
    const fragment = url.hash.slice(1) // remove #
    const dotIndex = fragment.indexOf('.')
    if (dotIndex === -1) return null
    const roomId = fragment.slice(0, dotIndex)
    const key = fragment.slice(dotIndex + 1)
    if (!roomId || !key) return null
    return { roomId, key }
  } catch {
    return null
  }
}

/**
 * Derive an AES-256-GCM CryptoKey from the base64url key string
 * Uses raw key import (no PBKDF2 needed since key is already random)
 * @param {string} keyStr - base64url-encoded 32 bytes
 * @returns {Promise<CryptoKey>}
 */
async function importKey (keyStr) {
  // Restore base64 padding and standard chars
  const b64 = keyStr.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4)
  const raw = Uint8Array.from(atob(padded), c => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt a message object for sending over the relay
 * @param {object} message - plaintext message
 * @param {CryptoKey} key
 * @returns {Promise<ArrayBuffer>} encrypted bytes (iv + ciphertext)
 */
async function encryptMessage (message, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = textEncoder.encode(JSON.stringify(message))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  )
  // Concatenate: [12 bytes IV] + [ciphertext]
  const result = new Uint8Array(12 + ciphertext.byteLength)
  result.set(iv, 0)
  result.set(new Uint8Array(ciphertext), 12)
  return result.buffer
}

/**
 * Decrypt a message received from the relay
 * @param {ArrayBuffer} data - encrypted bytes (iv + ciphertext)
 * @param {CryptoKey} key
 * @returns {Promise<object>} decrypted message object
 */
async function decryptMessage (data, key) {
  const bytes = new Uint8Array(data)
  const iv = bytes.slice(0, 12)
  const ciphertext = bytes.slice(12)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  return JSON.parse(textDecoder.decode(plaintext))
}

/**
 * Message types sent between peers:
 *
 * { type: 'full-sync', blocks: [...] }
 *   — Full document state, sent when a new peer joins
 *
 * { type: 'block-update', blockId: '...', block: {...} }
 *   — Single block was edited
 *
 * { type: 'block-add', block: {...}, afterId: '...' | null }
 *   — New block added after the specified block (null = beginning)
 *
 * { type: 'block-remove', blockId: '...' }
 *   — Block was deleted
 *
 * { type: 'blocks-reorder', blockIds: [...] }
 *   — Block order changed
 *
 * { type: 'request-sync' }
 *   — New peer asking for full document state
 *
 * { type: 'cursor', blockId: '...', offset: N }
 *   — Cursor position (for presence indicators)
 */

/**
 * Create a live editing session
 *
 * @param {object} options
 * @param {string} options.roomId - Room identifier
 * @param {string} options.keyStr - Base64url encryption key
 * @param {boolean} [options.isHost=false] - Whether this peer is the host
 * @param {(msg: object) => void} options.onMessage - Called when a decrypted message is received
 * @param {(count: number) => void} [options.onParticipantsChange] - Called when participant count changes
 * @param {(status: string) => void} [options.onStatusChange] - 'connecting' | 'connected' | 'disconnected' | 'error'
 * @returns {object} Session controller
 */
export function createLiveSession ({
  roomId,
  keyStr,
  isHost = false,
  onMessage,
  onParticipantsChange,
  onStatusChange
}) {
  let ws = null
  let cryptoKey = null
  let destroyed = false
  let reconnectTimer = null
  let reconnectDelay = 1000
  const MAX_RECONNECT_DELAY = 30000

  const debug = (...args) => { if (typeof window !== 'undefined' && window.__DASH_DEBUG) console.log('[LiveSession]', ...args) }

  async function connect () {
    if (destroyed) return
    debug('connecting to room', roomId, isHost ? '(host)' : '(guest)')
    onStatusChange?.('connecting')

    try {
      cryptoKey = await importKey(keyStr)
      debug('key imported successfully')
    } catch (err) {
      console.error('[LiveSession] Key import failed:', err)
      onStatusChange?.('error')
      return
    }

    const wsUrl = `${RELAY_URL}/ws/${roomId}`
    debug('opening WebSocket:', wsUrl)
    ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'

    ws.addEventListener('open', () => {
      reconnectDelay = 1000
      debug('WebSocket connected')
      onStatusChange?.('connected')

      // If not host, request full sync from existing participants
      if (!isHost) {
        debug('sending request-sync')
        send({ type: 'request-sync' })
      }
    })

    ws.addEventListener('message', async (event) => {
      // Handle relay metadata (participant count — unencrypted)
      if (typeof event.data === 'string') {
        try {
          const meta = JSON.parse(event.data)
          if (meta.type === '_meta' && typeof meta.participants === 'number') {
            debug('participants:', meta.participants)
            onParticipantsChange?.(meta.participants)
          }
        } catch { /* ignore malformed meta */ }
        return
      }

      // Decrypt binary messages from peers
      debug('received binary message:', event.data.byteLength, 'bytes')
      try {
        const msg = await decryptMessage(event.data, cryptoKey)
        debug('decrypted msg type:', msg.type, msg.type === 'full-sync' ? `(${msg.blocks?.length || 0} blocks)` : '')
        onMessage(msg)
      } catch (err) {
        console.warn('[LiveSession] Failed to decrypt message:', err)
      }
    })

    ws.addEventListener('close', (event) => {
      debug('WebSocket closed, code:', event.code, 'reason:', event.reason)
      onStatusChange?.('disconnected')
      scheduleReconnect()
    })

    ws.addEventListener('error', (event) => {
      debug('WebSocket error:', event)
      onStatusChange?.('error')
    })
  }

  function scheduleReconnect () {
    if (destroyed) return
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY)
      connect()
    }, reconnectDelay)
  }

  /**
   * Send an encrypted message to all other peers
   * @param {object} message
   */
  async function send (message) {
    if (!ws || ws.readyState !== WebSocket.OPEN || !cryptoKey) {
      debug('send skipped — ws:', ws ? `readyState=${ws.readyState}` : 'null', 'key:', !!cryptoKey)
      return
    }
    try {
      debug('sending', message.type, message.type === 'full-sync' ? `(${message.blocks?.length || 0} blocks, ${JSON.stringify(message.blocks || []).length} chars)` : '')
      const encrypted = await encryptMessage(message, cryptoKey)
      debug('encrypted to', encrypted.byteLength, 'bytes, sending...')
      ws.send(encrypted)
    } catch (err) {
      console.error('[LiveSession] Send failed:', err)
    }
  }

  /**
   * Destroy the session and clean up
   */
  function destroy () {
    destroyed = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (ws) {
      ws.close()
      ws = null
    }
    cryptoKey = null
  }

  /**
   * Check if currently connected
   * @returns {boolean}
   */
  function isConnected () {
    return ws?.readyState === WebSocket.OPEN
  }

  // Start connection
  connect()

  return {
    send,
    destroy,
    isConnected,
    get roomId () { return roomId },
  }
}
