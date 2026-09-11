/**
 * Dates from imported notes, as milliseconds since 1970.
 *
 * A note's dates come from the source, then from the file it came in, and
 * never from the moment of import. Anything outside 1971 to a couple of days
 * from now is treated as missing.
 */

const MIN_TIME = Date.UTC(1971, 0, 1)
const maxTime = () => Date.now() + 2 * 24 * 60 * 60 * 1000

function sane (ms) {
  return Number.isFinite(ms) && ms >= MIN_TIME && ms <= maxTime() ? Math.round(ms) : null
}

// Date.UTC rolls February 30 into March: only accept fields that round-trip.
function utcParts (year, month, day, hours = 0, minutes = 0, seconds = 0) {
  if (month < 1 || month > 12 || day < 1 || hours > 23 || minutes > 59 || seconds > 60) return null
  const ms = Date.UTC(year, month - 1, day, hours, minutes, seconds)
  const back = new Date(ms)
  return back.getUTCMonth() === month - 1 && back.getUTCDate() === day ? ms : null
}

/** Evernote's 20230115T093000Z, always UTC. */
export function parseEnexDate (text) {
  const match = /^\s*(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\s*$/.exec(String(text ?? ''))
  if (!match) return null
  const [year, month, day, hours, minutes, seconds] = match.slice(1).map(Number)
  return sane(utcParts(year, month, day, hours, minutes, seconds))
}

/** ISO 8601: a date, or a date and time with or without a zone (without one it is local time). */
export function parseIsoDate (text) {
  const value = String(text ?? '').trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(value)
  if (!match) return null
  const [year, month, day] = match.slice(1, 4).map(Number)
  if (utcParts(year, month, day) === null) return null
  const normalized = value.replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
  return sane(Date.parse(match[4] === undefined ? normalized + 'T00:00:00' : normalized))
}

/** Seconds or milliseconds since 1970, as a number or a string of digits. */
export function parseEpoch (value) {
  let n = NaN
  if (typeof value === 'number') n = value
  else if (/^\s*\d{9,13}(\.\d+)?\s*$/.test(String(value ?? ''))) n = Number(value)
  if (!Number.isFinite(n)) return null
  return sane(n < 1e11 ? n * 1000 : n)
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * Notion's written dates: "January 5, 2023", "Jan 5, 2023 3:04 PM", with an
 * optional "(GMT+1)" after it, read as local time.
 */
export function parseNotionDate (text) {
  const match = /^\s*([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*([AaPp][Mm])?)?\s*(?:\([^)]*\))?\s*$/.exec(String(text ?? ''))
  if (!match) return null
  const month = MONTHS.indexOf(match[1].slice(0, 3).toLowerCase()) + 1
  const day = Number(match[2])
  const year = Number(match[3])
  if (month === 0 || utcParts(year, month, day) === null) return null
  let hours = match[4] === undefined ? 0 : Number(match[4])
  const minutes = match[5] === undefined ? 0 : Number(match[5])
  if (match[6]) {
    if (hours < 1 || hours > 12) return null
    const pm = match[6].toLowerCase() === 'pm'
    hours = (hours % 12) + (pm ? 12 : 0)
  }
  if (hours > 23 || minutes > 59) return null
  return sane(new Date(year, month - 1, day, hours, minutes).getTime())
}

/** The first of these readers that understands the text. */
export function parseAnyDate (value) {
  if (typeof value === 'number') return parseEpoch(value)
  return parseEnexDate(value) ?? parseIsoDate(value) ?? parseEpoch(value) ?? parseNotionDate(value)
}

/**
 * createdAt (ISO string) and lastEdited (ms) for an imported note. Each falls
 * back to the other, then to the file's own time; null when there is none.
 */
export function noteDates ({ created = null, updated = null, fileTime = null } = {}) {
  const createdMs = created ?? updated ?? fileTime ?? null
  const updatedMs = updated ?? created ?? fileTime ?? null
  return {
    createdAt: createdMs === null ? null : new Date(createdMs).toISOString(),
    lastEdited: updatedMs
  }
}
