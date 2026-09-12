/**
 * Text in a PDF beyond what jsPDF's built-in fonts can draw.
 *
 * jsPDF's Helvetica and Courier only encode WinAnsi (Western European
 * letters). A note with any other text is laid out here with the Noto fonts
 * in utils/pdfFonts.js: each piece of text goes to the first loaded font
 * that has all of its characters, and what no font has (emoji, scripts
 * jsPDF can't shape such as Devanagari or Thai, rare characters) is drawn by
 * the browser as a small picture (utils/pdfRaster.js). jsPDF is never handed
 * a character its font lacks: it drops that character or, below U+0100,
 * everything after it on the line.
 *
 * A line with Arabic or Hebrew goes to jsPDF whole, with its bidi options, so
 * jsPDF shapes the Arabic and orders mixed text itself. A paragraph whose
 * first letter is Arabic or Hebrew is right-aligned.
 *
 * DOM-free so it runs under `node --test`.
 */

import { PDF_FONTS } from './pdfFonts.js'

const PT_TO_MM = 0.3528
const PICTURE = 'picture'

// WinAnsi (Windows-1252) beyond Latin-1
const WIN_ANSI_EXTRAS = new Set(Array.from(
  '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ',
  ch => ch.codePointAt(0)
))

const isWinAnsi = (code) => (code >= 0x20 && code <= 0x7E) || (code >= 0xA0 && code <= 0xFF) || WIN_ANSI_EXTRAS.has(code)

const HAN = /[\u2E80-\u2FDF\u3005\u3007\u3021-\u3029\u3038-\u303B\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]|[\u{20000}-\u{3FFFF}]/u
const KANA = /[\u3040-\u30FF\u31F0-\u31FF\uFF66-\uFF9F]/
const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7FF]/
const RTL_LETTER = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/
const LETTER = /\p{L}/u
// Lines can break between any two of these, as CJK text does
const CJK_CHAR = /[\u1100-\u11FF\u2E80-\u9FFF\uA960-\uA97F\uAC00-\uD7FF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]|[\u{20000}-\u{3FFFF}]/u
// Emoji presentation, keycaps and flags are always pictures
const EMOJI_MARK = /[\uFE0F\u20E3]|[\u{1F1E6}-\u{1F1FF}]/u
// Control characters and invisible marks no font draws
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\uFE0E\uFEFF]/g

// Marks that never start a line (they stay with what they close), and marks that never end one
const NO_LINE_START = new Set(Array.from('、。，．：；！？）」』】〕〉》｝〗〙〟ー…‥・ゝゞヽヾぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ'))
const NO_LINE_END = new Set(Array.from('（「『【〔〈《｛〖〘〝'))

const CJK_FONTS = ['sc', 'jp', 'kr']

const segmenter = typeof Intl === 'object' && typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null

function graphemes (text) {
  return segmenter ? Array.from(segmenter.segment(text), part => part.segment) : Array.from(text)
}

/** Whether jsPDF's built-in fonts can draw all of the text. Line breaks and tabs don't count. */
export function isWinAnsiText (text) {
  for (const ch of String(text)) {
    const code = ch.codePointAt(0)
    if (code !== 9 && code !== 10 && code !== 13 && !isWinAnsi(code)) return false
  }
  return true
}

/** Whether a paragraph reads right to left: its first letter is Arabic or Hebrew. */
export function isRtlParagraph (text) {
  for (const ch of String(text)) {
    if (RTL_LETTER.test(ch)) return true
    if (LETTER.test(ch)) return false
  }
  return false
}

/**
 * The PDF_FONTS a note needs: none when jsPDF's own fonts can draw every
 * character, and the large CJK fonts only when the text uses them.
 *
 * @param {{texts?: string[], code?: string[]}} text - the note's text, and its code blocks
 * @returns {string[]} keys of PDF_FONTS
 */
export function pdfFontKeys ({ texts = [], code = [] }) {
  const all = [...texts, ...code].join('\n')
  if (isWinAnsiText(all)) return []
  const keys = ['sans', 'sansBold', 'sansItalic']
  if (code.some(block => block)) keys.push('mono')
  const kana = KANA.test(all)
  if (kana) keys.push('jp')
  if (HANGUL.test(all)) keys.push('kr')
  if (HAN.test(all) && !kana) keys.push('sc')
  return keys
}

function clean (text) {
  return String(text).normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(INVISIBLE, '')
}

/**
 * Text drawing for one jsPDF document.
 *
 * @param {object} doc - a jsPDF document
 * @param {object} [options]
 * @param {Map<string, string>} [options.fonts] - PDF_FONTS data by key, from loadPdfFonts
 * @param {object|null} [options.rasterizer] - draws what no font has (utils/pdfRaster.js); without one that text is left out
 */
export function createPdfText (doc, { fonts = new Map(), rasterizer = null } = {}) {
  // Each font, and which characters it has
  const slots = new Map([
    ['helvetica', { family: 'helvetica', builtin: true, has: isWinAnsi }],
    ['courier', { family: 'courier', builtin: true, has: isWinAnsi }]
  ])
  for (const [key, data] of fonts) {
    const font = PDF_FONTS[key]
    if (!font || !data) continue
    doc.addFileToVFS(font.file, data)
    doc.addFont(font.file, font.family, font.style, 'Identity-H')
    const metadata = doc.getFont(font.family, font.style)?.metadata
    if (typeof metadata?.characterToGlyph !== 'function') continue
    slots.set(key, { family: font.family, style: font.style, has: (code) => code <= 0xFFFF && metadata.characterToGlyph(code) > 0 })
  }

  // The fonts to try, in order, for text in a style
  const chainFor = ({ style, mono }) => {
    const styled = style === 'bold' ? 'sansBold' : style === 'italic' ? 'sansItalic' : 'sans'
    const keys = mono ? ['mono', 'courier', styled, 'sans'] : [styled, 'sans']
    keys.push(...CJK_FONTS)
    if (!mono) keys.push('helvetica')
    return [...new Set(keys)].filter(key => slots.has(key))
  }

  const keyCache = new Map()
  const keyFor = (grapheme, chain, chainId) => {
    const cacheKey = chainId + ' ' + grapheme
    let key = keyCache.get(cacheKey)
    if (key === undefined) {
      const codes = Array.from(grapheme, ch => ch.codePointAt(0))
      key = EMOJI_MARK.test(grapheme) ? PICTURE : chain.find(k => codes.every(code => slots.get(k).has(code))) || PICTURE
      keyCache.set(cacheKey, key)
    }
    return key
  }

  // The text as runs that each draw in one font, or as one picture
  const runsOf = (text, chain) => {
    const chainId = chain.join()
    const runs = []
    for (const grapheme of graphemes(text)) {
      const key = keyFor(grapheme, chain, chainId)
      const last = runs[runs.length - 1]
      if (last && last.key === key) last.text += grapheme
      else runs.push({ key, text: grapheme })
    }
    return runs
  }

  const pictureStyle = ({ size, style, mono }, rtl = false) => ({ size, bold: style === 'bold', italic: style === 'italic', mono, rtl })

  const setRunFont = (key, { size, style }) => {
    const slot = slots.get(key)
    doc.setFont(slot.family, slot.builtin ? style : slot.style)
    doc.setFontSize(size)
    return slot
  }

  const runWidth = (run, options) => {
    if (run.key === PICTURE) return rasterizer ? rasterizer.measure(run.text, pictureStyle(options)) * PT_TO_MM : 0
    setRunFont(run.key, options)
    return doc.getTextWidth(run.text)
  }

  const widthOf = (text, options, chain) => runsOf(text, chain).reduce((sum, run) => sum + runWidth(run, options), 0)

  // An embedded font without a bold face draws bold as fill plus outline
  const drawText = (slot, options, text, x, baseline, extra = {}) => {
    if (options.style !== 'bold' || slot.builtin || slot.style === 'bold') {
      doc.text(text, x, baseline, extra)
      return
    }
    const lineWidth = doc.getLineWidth()
    const drawColor = doc.getDrawColor()
    doc.setLineWidth(options.size * PT_TO_MM * 0.03)
    doc.setDrawColor(0)
    doc.text(text, x, baseline, { ...extra, renderingMode: 'fillThenStroke' })
    doc.setLineWidth(lineWidth)
    doc.setDrawColor(drawColor)
  }

  // Draws a picture of the text starting at x, or ending at x when rtl. Returns its width in mm.
  const drawPicture = (text, x, baseline, options, rtl = false) => {
    const picture = rasterizer?.draw(text, pictureStyle(options, rtl))
    if (!picture) return 0
    const width = picture.width * PT_TO_MM
    const left = (rtl ? x - width : x) - picture.offset * PT_TO_MM
    doc.addImage(picture.dataUrl, 'PNG', left, baseline - picture.ascent * PT_TO_MM, picture.imageWidth * PT_TO_MM, picture.height * PT_TO_MM, picture.alias)
    return width
  }

  // Where a line may break: at spaces, and between CJK characters, with
  // closing marks kept on the line they close and opening marks on the next
  const atomsOf = (line) => {
    const atoms = []
    for (const grapheme of graphemes(line)) {
      const space = /^\s+$/u.test(grapheme)
      const cjk = !space && CJK_CHAR.test(grapheme)
      const last = atoms[atoms.length - 1]
      const join = last && (space
        ? last.space
        : !last.space && ((!cjk && !last.cjk) || NO_LINE_START.has(grapheme) || NO_LINE_END.has(Array.from(last.text).pop())))
      if (join) {
        last.text += grapheme
        last.cjk = last.cjk || cjk
      } else {
        atoms.push({ text: grapheme, space, cjk })
      }
    }
    return atoms
  }

  const wrap = (line, maxWidth, options, chain) => {
    const lines = []
    const widths = new Map()
    const measure = (text) => {
      if (!widths.has(text)) widths.set(text, widthOf(text, options, chain))
      return widths.get(text)
    }
    let current = ''
    let currentWidth = 0
    let space = ''
    // A word wider than a whole line breaks between any two characters
    const append = (text) => {
      for (const grapheme of graphemes(text)) {
        const width = measure(grapheme)
        if (current && currentWidth + width > maxWidth) {
          lines.push(current)
          current = ''
          currentWidth = 0
        }
        current += grapheme
        currentWidth += width
      }
    }
    atomsOf(line).forEach((atom, index) => {
      if (atom.space) {
        // Indentation at the start of a line stays; the space where a line wraps goes
        if (index === 0) {
          current = atom.text
          currentWidth = measure(atom.text)
        } else {
          space = atom.text
        }
        return
      }
      const gap = current && space ? space : ''
      const gapWidth = gap ? measure(gap) : 0
      const width = measure(atom.text)
      space = ''
      if (currentWidth + gapWidth + width <= maxWidth) {
        current += gap + atom.text
        currentWidth += gapWidth + width
        return
      }
      if (current.trim()) {
        lines.push(current)
        current = ''
        currentWidth = 0
      }
      if (currentWidth + width <= maxWidth) {
        current += atom.text
        currentWidth += width
      } else {
        append(atom.text)
      }
    })
    lines.push(current)
    return lines
  }

  return {
    isRtl: isRtlParagraph,

    /**
     * The text broken into lines that fit `width` mm, keeping its own line breaks.
     *
     * @param {string} text
     * @param {{width: number, size?: number, style?: 'normal'|'bold'|'italic', mono?: boolean}} options
     * @returns {string[]}
     */
    lines (text, { width, size = 11, style = 'normal', mono = false }) {
      const options = { size, style, mono }
      const chain = chainFor(options)
      return clean(text).split('\n').flatMap(line => wrap(line, width, options, chain))
    },

    /**
     * Draw a line from lines(): left to right from `x`, or in a right-to-left
     * paragraph, ending at `right`.
     *
     * @param {string} line
     * @param {{x: number, right: number, baseline: number, size?: number, style?: string, mono?: boolean, rtl?: boolean}} options
     */
    draw (line, { x, right, baseline, size = 11, style = 'normal', mono = false, rtl = false }) {
      const text = clean(line)
      if (!text.trim()) return
      const options = { size, style, mono }
      const runs = runsOf(text, chainFor(options))

      if (RTL_LETTER.test(text)) {
        if (runs.length === 1 && runs[0].key !== PICTURE) {
          const slot = setRunFont(runs[0].key, options)
          drawText(slot, options, text, rtl ? right : x, baseline, {
            isInputVisual: false, isOutputVisual: true, isInputRtl: rtl, isOutputRtl: false, isSymmetricSwapping: true, align: rtl ? 'right' : 'left'
          })
          return
        }
        // Mixed with text no one font has: the browser lays out the whole line
        if (rasterizer) {
          drawPicture(text, rtl ? right : x, baseline, options, rtl)
          return
        }
      }

      let cursor = rtl ? right - runs.reduce((sum, run) => sum + runWidth(run, options), 0) : x
      for (const run of runs) {
        if (run.key === PICTURE) {
          cursor += drawPicture(run.text, cursor, baseline, options)
          continue
        }
        const slot = setRunFont(run.key, options)
        const bidi = RTL_LETTER.test(run.text) ? { isInputVisual: false, isOutputVisual: true, isInputRtl: true, isOutputRtl: false, isSymmetricSwapping: true } : {}
        drawText(slot, options, run.text, cursor, baseline, bidi)
        cursor += doc.getTextWidth(run.text)
      }
    }
  }
}
