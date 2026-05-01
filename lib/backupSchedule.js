/**
 * Auto-backup schedule logic — pure functions, no IO.
 *
 * Phase 2.9 of the sync feature: an independent safety net so users with
 * sync OFF still have a recoverable copy of their notes if all their
 * paired devices are lost. Encrypted .dashpack files written to a user-
 * chosen folder on a schedule.
 *
 * The schedule + last-backup timestamp are stored as settings; the actual
 * file write is performed by Electron IPC (or a manual download prompt
 * on PWA). This module only decides:
 *   - Is a backup due?
 *   - How many backups to retain?
 *   - What's the next-backup-due timestamp (for UI display)?
 */

export const SCHEDULE_OFF = 'off'
export const SCHEDULE_DAILY = 'daily'
export const SCHEDULE_WEEKLY = 'weekly'
export const SCHEDULE_MONTHLY = 'monthly'

const INTERVAL_MS = {
  [SCHEDULE_DAILY]: 24 * 60 * 60 * 1000,
  [SCHEDULE_WEEKLY]: 7 * 24 * 60 * 60 * 1000,
  [SCHEDULE_MONTHLY]: 30 * 24 * 60 * 60 * 1000
}

/**
 * Default backup settings for a new vault.
 */
export function defaultBackupSettings () {
  return {
    schedule: SCHEDULE_WEEKLY, // sensible default — frequent enough to catch loss, infrequent enough not to spam disk
    lastBackupAt: null,
    folderPath: null, // null = use system default (Electron resolves to ~/Documents/Dash Backups/)
    retentionCount: 12, // keep last N backups
    autoExportEnabled: true
  }
}

/**
 * Validate settings shape. Throws on bad input.
 */
export function validateBackupSettings (s) {
  if (!s || typeof s !== 'object') throw new Error('backup settings must be object')
  const valid = [SCHEDULE_OFF, SCHEDULE_DAILY, SCHEDULE_WEEKLY, SCHEDULE_MONTHLY]
  if (!valid.includes(s.schedule)) throw new Error(`invalid schedule ${s.schedule}`)
  if (s.lastBackupAt !== null && (typeof s.lastBackupAt !== 'number' || s.lastBackupAt < 0)) {
    throw new Error('lastBackupAt must be null or non-negative number')
  }
  if (s.retentionCount !== undefined && (!Number.isInteger(s.retentionCount) || s.retentionCount < 1 || s.retentionCount > 100)) {
    throw new Error('retentionCount must be 1..100')
  }
  if (s.folderPath !== null && typeof s.folderPath !== 'string') {
    throw new Error('folderPath must be null or string')
  }
  return s
}

/**
 * Is a backup currently due?
 *
 * @param {object} settings - backup settings
 * @param {number} [now=Date.now()] - current time (override for tests)
 * @returns {boolean}
 */
export function isBackupDue (settings, now = Date.now()) {
  if (!settings || settings.schedule === SCHEDULE_OFF) return false
  if (settings.autoExportEnabled === false) return false
  const interval = INTERVAL_MS[settings.schedule]
  if (!interval) return false
  if (!settings.lastBackupAt) return true // never backed up → due immediately
  return (now - settings.lastBackupAt) >= interval
}

/**
 * When is the next scheduled backup? Returns a unix-ms timestamp, or null
 * if schedule is off / never started.
 */
export function nextBackupAt (settings) {
  if (!settings || settings.schedule === SCHEDULE_OFF) return null
  const interval = INTERVAL_MS[settings.schedule]
  if (!interval) return null
  if (!settings.lastBackupAt) return Date.now() // immediate
  return settings.lastBackupAt + interval
}

/**
 * Generate the filename for a backup written at the given timestamp.
 * Stable, sortable, includes ISO date (no time-of-day to keep filenames clean).
 */
export function backupFilename (timestamp = Date.now()) {
  const d = new Date(timestamp)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `dash-backup-${yyyy}-${mm}-${dd}.dashpack`
}

/**
 * Pick which backups to retain and which to delete, given a list of
 * filenames sorted oldest-first and the retention count. Returns the
 * filenames that should be kept (newest N).
 *
 * @param {string[]} filenames - existing backup filenames
 * @param {number} retentionCount - how many to keep (default 12)
 * @returns {{keep: string[], purge: string[]}}
 */
export function applyRetention (filenames, retentionCount = 12) {
  if (!Array.isArray(filenames)) return { keep: [], purge: [] }
  // Sort lexically — works because filename starts with ISO date (newest = last).
  const sorted = [...filenames].sort()
  if (sorted.length <= retentionCount) {
    return { keep: sorted, purge: [] }
  }
  const purge = sorted.slice(0, sorted.length - retentionCount)
  const keep = sorted.slice(sorted.length - retentionCount)
  return { keep, purge }
}

/**
 * Format a relative-time label for "Last backup: X ago" UI.
 * Pure helper.
 */
export function formatBackupAge (lastBackupAt, now = Date.now()) {
  if (!lastBackupAt) return 'Never'
  const ms = now - lastBackupAt
  if (ms < 0) return 'Scheduled'
  if (ms < 60 * 1000) return 'Just now'
  if (ms < 60 * 60 * 1000) return `${Math.floor(ms / (60 * 1000))} minute${Math.floor(ms / (60 * 1000)) === 1 ? '' : 's'} ago`
  if (ms < 24 * 60 * 60 * 1000) return `${Math.floor(ms / (60 * 60 * 1000))} hour${Math.floor(ms / (60 * 60 * 1000)) === 1 ? '' : 's'} ago`
  const days = Math.floor(ms / (24 * 60 * 60 * 1000))
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  const months = Math.floor(days / 30)
  return `${months} month${months === 1 ? '' : 's'} ago`
}
