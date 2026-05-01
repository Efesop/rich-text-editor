/**
 * Backup-schedule pure-logic tests.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const {
  SCHEDULE_OFF, SCHEDULE_DAILY, SCHEDULE_WEEKLY, SCHEDULE_MONTHLY,
  defaultBackupSettings,
  validateBackupSettings,
  isBackupDue,
  nextBackupAt,
  backupFilename,
  applyRetention,
  formatBackupAge
} = await import('../lib/backupSchedule.js')

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

describe('backupSchedule — defaults', () => {
  it('default settings have weekly schedule', () => {
    const s = defaultBackupSettings()
    assert.equal(s.schedule, SCHEDULE_WEEKLY)
    assert.equal(s.lastBackupAt, null)
    assert.equal(s.retentionCount, 12)
    assert.equal(s.autoExportEnabled, true)
  })
})

describe('backupSchedule — validate', () => {
  it('accepts a valid settings object', () => {
    const s = defaultBackupSettings()
    assert.doesNotThrow(() => validateBackupSettings(s))
  })
  it('rejects unknown schedule', () => {
    assert.throws(() => validateBackupSettings({ schedule: 'hourly', lastBackupAt: null }), /invalid schedule/)
  })
  it('rejects bad lastBackupAt', () => {
    assert.throws(() => validateBackupSettings({ schedule: SCHEDULE_DAILY, lastBackupAt: 'yesterday' }))
    assert.throws(() => validateBackupSettings({ schedule: SCHEDULE_DAILY, lastBackupAt: -1 }))
  })
  it('rejects out-of-range retentionCount', () => {
    assert.throws(() => validateBackupSettings({ schedule: SCHEDULE_DAILY, lastBackupAt: null, retentionCount: 0 }))
    assert.throws(() => validateBackupSettings({ schedule: SCHEDULE_DAILY, lastBackupAt: null, retentionCount: 200 }))
  })
})

describe('backupSchedule — isBackupDue', () => {
  it('off → never due', () => {
    assert.equal(isBackupDue({ schedule: SCHEDULE_OFF }), false)
  })
  it('autoExportEnabled=false → never due', () => {
    assert.equal(isBackupDue({ schedule: SCHEDULE_DAILY, lastBackupAt: null, autoExportEnabled: false }), false)
  })
  it('never backed up → due immediately', () => {
    assert.equal(isBackupDue({ schedule: SCHEDULE_DAILY, lastBackupAt: null, autoExportEnabled: true }), true)
  })
  it('daily — due 24h+1ms after last', () => {
    const now = 100_000_000_000
    const justAfter = isBackupDue({ schedule: SCHEDULE_DAILY, lastBackupAt: now - DAY - 1, autoExportEnabled: true }, now)
    const justBefore = isBackupDue({ schedule: SCHEDULE_DAILY, lastBackupAt: now - DAY + 1, autoExportEnabled: true }, now)
    assert.equal(justAfter, true)
    assert.equal(justBefore, false)
  })
  it('weekly — due 7d+ after last', () => {
    const now = 100_000_000_000
    assert.equal(isBackupDue({ schedule: SCHEDULE_WEEKLY, lastBackupAt: now - 6 * DAY, autoExportEnabled: true }, now), false)
    assert.equal(isBackupDue({ schedule: SCHEDULE_WEEKLY, lastBackupAt: now - 8 * DAY, autoExportEnabled: true }, now), true)
  })
  it('monthly — due 30d+ after last', () => {
    const now = 100_000_000_000
    assert.equal(isBackupDue({ schedule: SCHEDULE_MONTHLY, lastBackupAt: now - 29 * DAY, autoExportEnabled: true }, now), false)
    assert.equal(isBackupDue({ schedule: SCHEDULE_MONTHLY, lastBackupAt: now - 31 * DAY, autoExportEnabled: true }, now), true)
  })
})

describe('backupSchedule — nextBackupAt', () => {
  it('off → null', () => {
    assert.equal(nextBackupAt({ schedule: SCHEDULE_OFF }), null)
  })
  it('weekly with last at T → returns T + 7d', () => {
    const t = 100_000_000_000
    assert.equal(nextBackupAt({ schedule: SCHEDULE_WEEKLY, lastBackupAt: t }), t + 7 * DAY)
  })
})

describe('backupSchedule — backupFilename', () => {
  it('uses ISO date format and dashpack ext', () => {
    const fn = backupFilename(new Date('2026-04-15T12:34:56Z').getTime())
    assert.match(fn, /^dash-backup-2026-04-\d{2}\.dashpack$/)
  })
  it('zero-pads month and day', () => {
    const fn = backupFilename(new Date('2026-01-02T00:00:00Z').getTime())
    // depending on timezone this might be 01-01 or 01-02 — just check format
    assert.match(fn, /^dash-backup-2026-01-(01|02)\.dashpack$/)
  })
})

describe('backupSchedule — applyRetention', () => {
  it('keeps all when count under limit', () => {
    const r = applyRetention(['dash-backup-2026-01-01.dashpack', 'dash-backup-2026-01-02.dashpack'], 12)
    assert.equal(r.keep.length, 2)
    assert.equal(r.purge.length, 0)
  })
  it('purges oldest when over limit', () => {
    const filenames = []
    for (let i = 1; i <= 15; i++) filenames.push(`dash-backup-2026-01-${String(i).padStart(2, '0')}.dashpack`)
    const r = applyRetention(filenames, 12)
    assert.equal(r.keep.length, 12)
    assert.equal(r.purge.length, 3)
    // Purged are the oldest 3
    assert.deepEqual(r.purge, [
      'dash-backup-2026-01-01.dashpack',
      'dash-backup-2026-01-02.dashpack',
      'dash-backup-2026-01-03.dashpack'
    ])
    // Newest in keep
    assert.equal(r.keep[r.keep.length - 1], 'dash-backup-2026-01-15.dashpack')
  })
  it('non-array input → empty result', () => {
    const r = applyRetention(null, 12)
    assert.deepEqual(r, { keep: [], purge: [] })
  })
})

describe('backupSchedule — formatBackupAge', () => {
  const now = 100_000_000_000
  it('null → Never', () => {
    assert.equal(formatBackupAge(null, now), 'Never')
  })
  it('< 1 minute → Just now', () => {
    assert.equal(formatBackupAge(now - 30_000, now), 'Just now')
  })
  it('< 1 hour → minutes', () => {
    assert.equal(formatBackupAge(now - 5 * 60 * 1000, now), '5 minutes ago')
    assert.equal(formatBackupAge(now - 1 * 60 * 1000, now), '1 minute ago')
  })
  it('< 1 day → hours', () => {
    assert.equal(formatBackupAge(now - 3 * HOUR, now), '3 hours ago')
    assert.equal(formatBackupAge(now - 1 * HOUR, now), '1 hour ago')
  })
  it('< 30 days → days', () => {
    assert.equal(formatBackupAge(now - 5 * DAY, now), '5 days ago')
    assert.equal(formatBackupAge(now - 1 * DAY, now), '1 day ago')
  })
  it('>= 30 days → months', () => {
    assert.equal(formatBackupAge(now - 60 * DAY, now), '2 months ago')
    assert.equal(formatBackupAge(now - 35 * DAY, now), '1 month ago')
  })
  it('future → Scheduled', () => {
    assert.equal(formatBackupAge(now + 60_000, now), 'Scheduled')
  })
})
