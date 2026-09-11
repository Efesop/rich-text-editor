/**
 * Plain text notes: paragraphs where the text has blank lines, line breaks
 * and indentation kept as typed.
 *
 * DOM-free so it runs under `node --test`.
 */

/** Drafts for plain text. */
export function plainTextDrafts (text) {
  const drafts = []
  for (const paragraph of String(text ?? '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/)) {
    if (!paragraph.trim()) continue
    drafts.push({ kind: 'paragraph', runs: [{ text: paragraph.replace(/^\n+|\n+$/g, '') }], preserveSpaces: true })
  }
  return drafts
}
