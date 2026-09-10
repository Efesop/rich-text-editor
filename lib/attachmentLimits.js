// Attachment size limits shared by local storage and sync.
//
// The relay (server/sync.ts MAX_ATTACHMENT_BYTES) caps an attachment once it
// is encrypted, and encryptBytes (lib/syncCrypto.js) adds a 12-byte IV and a
// 16-byte AES-GCM tag. A file is only accepted locally if it still fits after
// encryption, so nothing can be saved that could never sync.

export const RELAY_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const ATTACHMENT_ENCRYPTION_OVERHEAD_BYTES = 12 + 16
export const MAX_ATTACHMENT_BYTES = RELAY_MAX_ATTACHMENT_BYTES - ATTACHMENT_ENCRYPTION_OVERHEAD_BYTES
