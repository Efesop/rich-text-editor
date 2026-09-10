/**
 * Markdown input shortcuts — the pure matching half.
 *
 * DOM-free so it runs under `node --test`. The Editor.js wiring lives in
 * components/Editor.js; everything here is string in, descriptor out.
 *
 * Heading levels follow Dash's own vocabulary rather than raw HTML: the
 * Header tool offers levels 2, 3 and 4 and the UI calls them "Heading 1",
 * "Heading 2" and "Heading 3" (see CONVERT_OPTIONS in MultiBlockToolbar.js),
 * because the page title is the document's H1.
 *
 * The mapping is deliberately the SAME clamp parseMarkdownToBlocks already
 * uses when you paste markdown (components/Editor.js) — typing markdown and
 * pasting it must land on the same block. That means both `#` and `##` give
 * the biggest heading: no dead keystroke for people who type a lone `#`, and
 * no divergence between the two paths.
 */

// Matches Math.min(Math.max(hashes, 2), 4) in parseMarkdownToBlocks.
const headingLevel = (hashes) => Math.min(Math.max(hashes, 2), 4)

const CALLOUT_VARIANTS = {
  info: 'info',
  note: 'info',
  tip: 'tip',
  hint: 'tip',
  done: 'done',
  success: 'done',
  check: 'done',
  warning: 'warning',
  warn: 'warning',
  caution: 'warning',
  danger: 'danger',
  error: 'danger',
  bug: 'danger'
}

/**
 * Match a block-level trigger against the plain text at the start of a block.
 *
 * @param {string} text - the block's plain text (not HTML)
 * @returns {{ tool: string, data: object, consume: number } | null}
 *   `consume` is how many leading characters the trigger ate, so the caller
 *   knows what to strip from the block before converting.
 */
export function matchBlockShortcut (text) {
  if (typeof text !== 'string' || text === '') return null

  // Callout: [!info] / [!warning] / … — works from a paragraph, and from a
  // quote, which is what you get after typing "> " first.
  const callout = /^\[!([a-z]+)\][  ]/i.exec(text)
  if (callout) {
    const variant = CALLOUT_VARIANTS[callout[1].toLowerCase()]
    if (variant) return { tool: 'callout', data: { variant }, consume: callout[0].length }
  }

  // Toggle: [!toggle]
  const toggle = /^\[!(toggle|fold|details)\][  ]/i.exec(text)
  if (toggle) return { tool: 'toggle', data: {}, consume: toggle[0].length }

  // Headings
  const heading = /^(#{1,6})[  ]/.exec(text)
  if (heading) {
    return {
      tool: 'header',
      data: { level: headingLevel(heading[1].length) },
      consume: heading[0].length
    }
  }

  // Checklist before bullets: "- [ ] " must not be eaten by "- ".
  const checklist = /^[-*+]?[  ]*\[([ xX]?)\][  ]/.exec(text)
  if (checklist) {
    return {
      tool: 'checklistItem',
      data: { checked: checklist[1].toLowerCase() === 'x' },
      consume: checklist[0].length
    }
  }

  const bullet = /^[-*+][  ]/.exec(text)
  if (bullet) return { tool: 'bulletListItem', data: {}, consume: bullet[0].length }

  const numbered = /^(\d{1,9})[.)][  ]/.exec(text)
  if (numbered) return { tool: 'numberedListItem', data: {}, consume: numbered[0].length }

  const quote = /^>[  ]/.exec(text)
  if (quote) return { tool: 'quote', data: {}, consume: quote[0].length }

  // These need no trailing space — the trigger completes itself.
  if (/^```/.test(text)) return { tool: 'code', data: {}, consume: 3 }
  if (/^(---|\*\*\*|___)$/.test(text)) return { tool: 'delimiter', data: {}, consume: text.length }

  return null
}

/**
 * Inline wrappers, longest delimiter first so `**` wins over `*`.
 * `tag` is the HTML element Editor.js's inline tools produce.
 */
export const INLINE_RULES = [
  { delimiter: '**', tag: 'b' },
  { delimiter: '__', tag: 'b' },
  { delimiter: '~~', tag: 's' },
  { delimiter: '==', tag: 'mark', className: 'cdx-marker' },
  { delimiter: '`', tag: 'code', className: 'inline-code' },
  { delimiter: '*', tag: 'i' },
  { delimiter: '_', tag: 'i' }
]

/**
 * Given the text before the caret, find a completed inline wrapper ending at
 * the caret — i.e. the user just typed the closing delimiter.
 *
 * Returns the slice to replace and what to replace it with. Returns null for
 * an empty body (`****`) so a run of delimiters is never swallowed.
 *
 * @param {string} before - text from the start of the block to the caret
 * @returns {{ start: number, end: number, content: string, tag: string, className?: string } | null}
 */
export function matchInlineShortcut (before) {
  if (typeof before !== 'string' || before.length < 2) return null

  for (const rule of INLINE_RULES) {
    const { delimiter } = rule
    if (!before.endsWith(delimiter)) continue

    const bodyEnd = before.length - delimiter.length
    // Where the opening delimiter would start.
    const openIndex = before.lastIndexOf(delimiter, bodyEnd - 1)
    if (openIndex === -1) continue

    const content = before.slice(openIndex + delimiter.length, bodyEnd)
    if (content === '' || content.trim() === '') continue

    // A single-char delimiter must never fire on half of a double one. Typing
    // "**bold**" passes through "**bold*", where a naive "*" rule would wrap
    // "bold" in italics before the second asterisk ever lands. Reject when
    // either delimiter is really part of a pair.
    if (delimiter.length === 1) {
      if (content.startsWith(delimiter) || content.endsWith(delimiter)) continue
      if (before[openIndex - 1] === delimiter) continue
      if (before[bodyEnd - 1] === delimiter) continue
    }
    // Don't span the whole block when the opener is really a block trigger.
    if (content.includes('\n')) continue

    return {
      start: openIndex,
      end: before.length,
      content,
      tag: rule.tag,
      className: rule.className
    }
  }

  return null
}

export const CALLOUT_ORDER = ['info', 'tip', 'done', 'warning', 'danger']

export const CALLOUT_LABELS = {
  info: 'Info',
  tip: 'Tip',
  done: 'Done',
  warning: 'Warning',
  danger: 'Danger'
}
