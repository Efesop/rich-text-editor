/**
 * What an import's findings mean, in words people read in the preview and
 * the report.
 *
 * DOM-free so it runs under `node --test`.
 */

const plural = (count, one, many) => `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`

const ISSUES = Object.freeze({
  'colours-dropped': n => `${plural(n, 'place uses', 'places use')} text colours or backgrounds, which aren't kept`,
  'remote-photo': n => `${plural(n, 'photo is', 'photos are')} on the web, kept as ${n === 1 ? 'a link' : 'links'} (Dash doesn't load images from the web)`,
  'missing-photo': n => `${plural(n, "photo isn't", "photos aren't")} in the export`,
  'missing-attachment': n => `${plural(n, "attachment isn't", "attachments aren't")} in the export`,
  'unreadable-attachment': n => `${plural(n, "attachment couldn't", "attachments couldn't")} be read`,
  'unreferenced-attachment': n => `${plural(n, 'attachment', 'attachments')} not shown in ${n === 1 ? 'its note is' : 'their notes are'} added at the end`,
  'link-kept-as-text': n => `${plural(n, 'link', 'links')} to other apps or to notes not in the export ${n === 1 ? 'is' : 'are'} kept as text`,
  'wikilink-unresolved': n => `${plural(n, '[[link]]', '[[links]]')} to notes not in the export ${n === 1 ? 'is' : 'are'} kept as text`,
  'embed-missing': n => `${plural(n, "embedded file wasn't", "embedded files weren't")} found`,
  'embedded-media': n => `${plural(n, 'video or embed is', 'videos or embeds are')} kept as ${n === 1 ? 'a link' : 'links'}`,
  'toggle-content-moved': n => `${plural(n, 'toggle held', 'toggles held')} photos, tables or code, now placed just below`,
  'callout-content-moved': n => `${plural(n, 'callout held', 'callouts held')} photos, tables or code, now placed just below`,
  'table-content-moved': n => `${plural(n, 'table cell held', 'table cells held')} photos or blocks, now placed below the table`,
  'deep-list': n => `${plural(n, 'list goes', 'lists go')} deeper than 8 levels and ${n === 1 ? 'stops' : 'stop'} at 8`,
  'encrypted-text': n => `${plural(n, 'encrypted section is', 'encrypted sections are')} kept encrypted, as text`,
  'reminder-dropped': n => `${plural(n, "reminder isn't", "reminders aren't")} kept`,
  'truncated-note': n => `${plural(n, 'note was', 'notes were')} cut short in the export file`,
  'table-of-contents-skipped': n => `${plural(n, 'table of contents is', 'tables of contents are')} left out`,
  'cover-skipped': n => `${plural(n, 'page cover from the web is', 'page covers from the web are')} left out`,
  'frontmatter-unreadable': n => `${plural(n, 'note has', 'notes have')} properties that couldn't be read, kept as text at the top`,
  'file-not-in-backup': n => `${plural(n, "file isn't", "files aren't")} in the backup (Standard Notes backups leave files out)`,
  'spreadsheet-kept-as-code': n => `${plural(n, 'spreadsheet is', 'spreadsheets are')} kept as data`,
  'authenticator-secrets': n => `${plural(n, '2FA note', '2FA notes')} will be imported with ${n === 1 ? 'its' : 'their'} secrets`,
  'unreadable-super-note': n => `${plural(n, "Super note couldn't", "Super notes couldn't")} be read and ${n === 1 ? 'is' : 'are'} kept as data`,
  'unsupported-content': n => `${plural(n, 'part', 'parts')} of notes Dash has no block for ${n === 1 ? 'is' : 'are'} kept as text or left out`,
  'unknown-draft': n => `${plural(n, 'part', 'parts')} of notes couldn't be converted`
})

/** A finding as a sentence. */
export function issueMessage (code, count) {
  const describe = ISSUES[code]
  return describe ? describe(count) : `${plural(count, 'other change', 'other changes')} (${code})`
}

const SKIPPED = Object.freeze({
  'in-trash': n => `${plural(n, 'note was', 'notes were')} in the other app's trash`,
  canvas: n => `${plural(n, 'Obsidian canvas', 'Obsidian canvases')}`,
  base: n => `${plural(n, 'Obsidian base', 'Obsidian bases')}`,
  excalidraw: n => `${plural(n, 'Excalidraw drawing', 'Excalidraw drawings')}`,
  authenticator: n => `${plural(n, '2FA note holds', '2FA notes hold')} secrets`,
  'in-dash': n => `${plural(n, 'note is', 'notes are')} already in Dash`,
  'in-import': n => `${plural(n, 'note appears', 'notes appear')} twice in the export`,
  'imported-before': n => `${plural(n, 'note was', 'notes were')} imported before`,
  'not-used': n => `${plural(n, "file isn't", "files aren't")} used by any note`,
  'duplicate-path': n => `${plural(n, 'file is', 'files are')} in the export twice`,
  encrypted: n => `${plural(n, 'file is', 'files are')} password-protected`,
  'too-large': n => `${plural(n, 'file is', 'files are')} too large to read`
})

/** Why something was left out, as a sentence. */
export function skipMessage (reason, count) {
  const describe = SKIPPED[reason]
  return describe ? describe(count) : `${plural(count, 'item', 'items')} left out (${reason})`
}

const FAILED = Object.freeze({
  'unexpected-content': "couldn't be converted exactly, so it was left out rather than changed"
})

/** Why a note failed, as a phrase. */
export function failureMessage (reason) {
  return FAILED[reason] || String(reason || 'an unknown problem')
}

const NOTICES = Object.freeze({
  'location-not-removed': n => `${plural(n, 'photo', 'photos')} in a format Dash can't clean may still hold ${n === 1 ? 'its' : 'their'} location`,
  'heic-converted': n => `${plural(n, 'HEIC photo', 'HEIC photos')} converted to JPEG`,
  'heic-kept-as-file': n => `${plural(n, "HEIC photo couldn't", "HEIC photos couldn't")} be shown on this device and ${n === 1 ? 'is' : 'are'} kept as ${n === 1 ? 'a file' : 'files'}`,
  'photo-resized': n => `${plural(n, 'photo was', 'photos were')} made smaller to fit the 10 MB limit`,
  'kept-as-file': n => `${plural(n, 'image is', 'images are')} kept as ${n === 1 ? 'a file' : 'files'}`
})

/** A note about how photos were stored, as a sentence. */
export function noticeMessage (code, count) {
  const describe = NOTICES[code]
  return describe ? describe(count) : `${plural(count, 'photo', 'photos')}: ${code}`
}

const RESOURCE_PROBLEMS = Object.freeze({
  'too-large': 'too large to sync',
  unreadable: "couldn't be read",
  'not-saved': "couldn't be saved on this device"
})

export function resourceProblemMessage (reason) {
  return RESOURCE_PROBLEMS[reason] || "couldn't be stored"
}

/** Bytes as a short size, like 1.2 MB. */
export function formatBytes (bytes) {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes || 0))} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/** Minutes as a short duration, like "about 2 hours". */
export function formatMinutes (minutes) {
  if (!minutes || minutes < 1) return 'under a minute'
  if (minutes < 90) return `about ${plural(Math.round(minutes), 'minute', 'minutes')}`
  const hours = Math.round(minutes / 60)
  return hours < 36 ? `about ${plural(hours, 'hour', 'hours')}` : `about ${plural(Math.round(hours / 24), 'day', 'days')}`
}

/** A finished import's report as plain text, for copying. */
export function reportText (report) {
  const lines = [`Imported ${plural(report.notes.imported, 'note', 'notes')} into "${report.folderTitle}".`]
  const skipped = {}
  for (const item of [...report.notes.skipped, ...report.notes.duplicates.map(d => ({ ...d, reason: d.kind }))]) {
    skipped[item.reason] = (skipped[item.reason] || 0) + 1
  }
  for (const [reason, count] of Object.entries(skipped)) lines.push(`Left out: ${skipMessage(reason, count)}.`)
  if ((report.unusedFiles || []).length > 0) lines.push(`Left out: ${skipMessage('not-used', report.unusedFiles.length)}.`)
  for (const failure of report.notes.failed) lines.push(`Not imported: "${failure.title}" ${failureMessage(failure.reason)}.`)
  lines.push(`Photos and files stored: ${report.resources.stored.toLocaleString('en-US')}.`)
  for (const failure of report.resources.failed) lines.push(`Not imported: ${failure.name} in "${failure.note}", ${resourceProblemMessage(failure.reason)}.`)
  for (const [code, names] of Object.entries(report.resources.notices)) lines.push(`${noticeMessage(code, names.length)}: ${names.join(', ')}.`)
  return lines.join('\n')
}
