/**
 * PDF export beyond Western European text: which fonts a note needs, where
 * lines break, and PDFs built with the fonts the app ships.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { jsPDF } from 'jspdf'

import { buildPdf, pdfFontsFor } from '../utils/exportUtils.js'
import { bytesToBinaryString, loadPdfFonts } from '../utils/pdfFonts.js'
import { createPdfText, isRtlParagraph, isWinAnsiText, pdfFontKeys } from '../utils/pdfText.js'

const readFont = async (file) => bytesToBinaryString(readFileSync(new URL(`../public/fonts/pdf/${file}`, import.meta.url)))
const fonts = await loadPdfFonts(['sans', 'sansBold', 'sansItalic', 'mono', 'sc', 'jp', 'kr'], { readFont })
const b = (type, data) => ({ type, data })
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

// Stands in for utils/pdfRaster.js, which needs a canvas
function fakeRasterizer () {
  const drawn = []
  const width = (text, style) => Array.from(text).length * style.size * 0.6
  return {
    drawn,
    measure: width,
    draw (text, style) {
      drawn.push(text)
      return { dataUrl: PNG, width: width(text, style), imageWidth: width(text, style), offset: 0, height: style.size * 1.25, ascent: style.size, alias: `fake-${drawn.length}` }
    }
  }
}

// Every doc.text call, with the font it was drawn in
function recordText (doc) {
  const calls = []
  const text = doc.text.bind(doc)
  doc.text = (value, x, y, options) => {
    const font = doc.getFont()
    calls.push({ value: String(value), family: font.fontName, style: font.fontStyle, metadata: font.metadata, options: options || {} })
    return text(value, x, y, options)
  }
  return calls
}

function assertCovered (calls) {
  for (const call of calls) {
    for (const ch of call.value) {
      // jsPDF's built-in fonts have metadata but no glyph table
      const covered = typeof call.metadata?.characterToGlyph === 'function' ? call.metadata.characterToGlyph(ch.codePointAt(0)) > 0 : isWinAnsiText(ch)
      assert.ok(covered, `${call.family} was given ${JSON.stringify(ch)} (U+${ch.codePointAt(0).toString(16)}), which it lacks`)
    }
  }
}

describe('fonts for a PDF', () => {
  it('needs no fonts for text jsPDF can already draw', () => {
    assert.equal(isWinAnsiText('Café crème – €5 “quoted” • naïve…\tTab\nLine'), true)
    assert.deepEqual(pdfFontKeys({ texts: ['Café – €5'], code: ['const a = 1'] }), [])
  })

  it('needs Noto Sans for other alphabets, the mono font for code, and each CJK font only when used', () => {
    assert.deepEqual(pdfFontKeys({ texts: ['Привет'] }), ['sans', 'sansBold', 'sansItalic'])
    assert.deepEqual(pdfFontKeys({ texts: ['Plain'], code: ['π = 3.14'] }), ['sans', 'sansBold', 'sansItalic', 'mono'])
    assert.deepEqual(pdfFontKeys({ texts: ['你好，世界'] }), ['sans', 'sansBold', 'sansItalic', 'sc'])
    assert.deepEqual(pdfFontKeys({ texts: ['日本語のテキスト'] }), ['sans', 'sansBold', 'sansItalic', 'jp'])
    assert.deepEqual(pdfFontKeys({ texts: ['안녕하세요'] }), ['sans', 'sansBold', 'sansItalic', 'kr'])
  })

  it('reads every part of a note to decide', () => {
    assert.deepEqual(pdfFontsFor({ blocks: [b('paragraph', { text: 'Only <b>Latin</b>' })] }), [])
    assert.ok(pdfFontsFor({ blocks: [b('table', { content: [['a', 'Ωμέγα']] })] }).includes('sans'))
    assert.ok(pdfFontsFor({ blocks: [b('image', { file: { url: 'https://example.com/a.png' }, caption: '写真' })] }).includes('sc'))
    assert.ok(pdfFontsFor({ blocks: [b('code', { code: 'x → y' })] }).includes('mono'))
  })

  it('skips a font that will not load, so the export can still go ahead', async () => {
    const warn = console.warn
    console.warn = () => {}
    try {
      const loaded = await loadPdfFonts(['sans', 'sc'], {
        readFont: async (file) => {
          if (file.includes('SC')) throw new Error('offline')
          return readFont(file)
        }
      })
      assert.deepEqual([...loaded.keys()], ['sans'])
    } finally {
      console.warn = warn
    }
  })

  it('reads a paragraph as right to left when its first letter is Arabic or Hebrew', () => {
    assert.equal(isRtlParagraph('(1) שלום'), true)
    assert.equal(isRtlParagraph('١٢٣ مرحبا'), true)
    assert.equal(isRtlParagraph('Dash مرحبا'), false)
  })
})

describe('createPdfText', () => {
  it('gives jsPDF only characters its font has, and draws the rest as pictures', () => {
    const doc = new jsPDF()
    const calls = recordText(doc)
    const pictures = fakeRasterizer()
    const text = createPdfText(doc, { fonts, rasterizer: pictures })
    const lines = text.lines('Привет → 你好 😀 नमस्ते naïve\tend', { width: 180 })
    assert.equal(lines.length, 1)
    text.draw(lines[0], { x: 15, right: 195, baseline: 20 })
    assertCovered(calls)
    // The arrow comes from the Chinese font; no font has the emoji or Devanagari
    assert.deepEqual(pictures.drawn, ['😀', 'नमस्ते'])
    assert.ok(calls.some(call => call.family === 'NotoSansSC' && call.value === '你好'))
    assert.ok(calls.some(call => call.family === 'NotoSansPdf' && call.value.includes('Привет')))
  })

  it('draws emoji-style characters, keycaps included, as pictures and leaves out invisible control characters', () => {
    const doc = new jsPDF()
    const calls = recordText(doc)
    const pictures = fakeRasterizer()
    const text = createPdfText(doc, { fonts, rasterizer: pictures })
    text.draw('A\u0007B ©\uFE0F #\uFE0F\u20E3 C\uFEFF', { x: 15, right: 195, baseline: 20 })
    assertCovered(calls)
    assert.deepEqual(pictures.drawn, ['©\uFE0F', '#\uFE0F\u20E3'])
    assert.ok(calls.some(call => call.value.startsWith('AB')))
  })

  it('draws a right-to-left line whole with bidi options, or as one picture when it mixes in an emoji', () => {
    const doc = new jsPDF()
    const calls = recordText(doc)
    const pictures = fakeRasterizer()
    const text = createPdfText(doc, { fonts, rasterizer: pictures })
    text.draw('مرحبا بالعالم (Dash 1.6)', { x: 15, right: 195, baseline: 20, rtl: true })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].options.isInputRtl, true)
    assert.equal(calls[0].options.align, 'right')
    assertCovered(calls)
    text.draw('שלום 👋', { x: 15, right: 195, baseline: 30, rtl: true })
    assert.deepEqual(pictures.drawn, ['שלום 👋'])
  })

  it('draws bold with a real bold face, or fill and outline in a font that has none', () => {
    const doc = new jsPDF()
    const calls = recordText(doc)
    const text = createPdfText(doc, { fonts })
    text.draw('Bold 标题', { x: 15, right: 195, baseline: 20, style: 'bold' })
    const latin = calls.find(call => call.value.includes('Bold'))
    const cjk = calls.find(call => call.value.includes('标题'))
    assert.equal(latin.style, 'bold')
    assert.equal(latin.options.renderingMode, undefined)
    assert.equal(cjk.options.renderingMode, 'fillThenStroke')
  })

  it('breaks CJK text between characters but never before closing punctuation', () => {
    const text = createPdfText(new jsPDF(), { fonts })
    const lines = text.lines('这是一个很长的句子，用来测试换行。'.repeat(6), { width: 50 })
    assert.ok(lines.length > 3)
    for (const line of lines) {
      assert.doesNotMatch(line, /^[，。]/)
      assert.deepEqual(text.lines(line, { width: 50 }), [line], `${line} fits on one line`)
    }
  })

  it('breaks Latin text at spaces, splits a word too long for a line, and keeps indentation', () => {
    const text = createPdfText(new jsPDF(), { fonts })
    const lines = text.lines('    const κύκλος = aVeryLongIdentifierThatCannotFitOnASingleNarrowLine + 1', { width: 40, mono: true, size: 9 })
    assert.ok(lines.length > 2)
    assert.ok(lines[0].startsWith('    const'))
    assert.ok(lines.join(' ').includes('κύκλος'))
    assert.deepEqual(text.lines('first line\n\nthird', { width: 100 }), ['first line', '', 'third'])
  })

  it('still draws everything when the Noto fonts did not load: Latin in Helvetica, the rest as pictures', () => {
    const doc = new jsPDF()
    const calls = recordText(doc)
    const pictures = fakeRasterizer()
    const text = createPdfText(doc, { fonts: new Map(), rasterizer: pictures })
    text.draw('Hello Привет', { x: 15, right: 195, baseline: 20 })
    assertCovered(calls)
    assert.deepEqual(pictures.drawn, ['Привет'])
  })
})

describe('buildPdf with embedded fonts', () => {
  it('lays out every block type in several scripts and embeds only the fonts used', async () => {
    const note = {
      blocks: [
        b('header', { text: 'Заметки', level: 2 }),
        b('paragraph', { text: 'Καλημέρα κόσμε. <b>Tiếng Việt</b> có dấu.' }),
        b('paragraph', { text: 'مرحبا بالعالم (Dash 1.6)' }),
        b('paragraph', { text: 'שלום עולם 123' }),
        b('bulletListItem', { text: '你好，世界' }),
        b('numberedListItem', { text: '繁體中文', indent: 1 }),
        b('checklistItem', { text: 'Готово', checked: true }),
        b('callout', { text: 'Ελληνικά', variant: 'warning' }),
        b('toggle', { summary: 'Детали', content: '内容<br>第二行' }),
        b('quote', { text: 'Цитата', caption: 'Автор' }),
        b('code', { code: 'const π = 3.14 // κύκλος' }),
        b('table', { content: [['名前', 'Ελληνικά'], ['東京', 'Москва']], withHeadings: true }),
        b('embed', { service: 'youtube', source: 'https://www.youtube.com/watch?v=abc', caption: 'Видео' }),
        b('attachment', { attachmentId: '11111111-1111-4111-8111-111111111111', filename: 'отчёт.pdf', mimeType: 'application/pdf', size: 1 }),
        b('delimiter', {}),
        b('seedPhrase', { words: ['альфа', 'бета'] }),
        ...Array.from({ length: 40 }, (_, i) => b('paragraph', { text: `段落 ${i + 1}：这是一段比较长的中文文字，用来确认分页没有问题。` }))
      ]
    }
    const keys = pdfFontsFor(note)
    assert.deepEqual([...keys].sort(), ['mono', 'sans', 'sansBold', 'sansItalic', 'sc'])
    const doc = buildPdf(note, { fonts: await loadPdfFonts(keys, { readFont }), rasterizer: fakeRasterizer() })
    assert.ok(doc.getNumberOfPages() >= 2, `expected several pages, got ${doc.getNumberOfPages()}`)
    const families = Object.keys(doc.getFontList())
    for (const family of ['NotoSansPdf', 'NotoSansMono', 'NotoSansSC']) assert.ok(families.includes(family), `${family} is embedded`)
    const output = doc.output()
    assert.match(output, /\/FontFile2/)
    assert.match(output, /Identity-H/)
    assert.equal(output.includes('undefined'), false)
  })

  it('picks the Japanese and Korean fonts for Japanese and Korean notes', async () => {
    for (const [text, family] of [['こんにちは、世界。', 'NotoSansJP'], ['안녕하세요, 세계', 'NotoSansKR']]) {
      const note = { blocks: [b('paragraph', { text })] }
      const doc = buildPdf(note, { fonts: await loadPdfFonts(pdfFontsFor(note), { readFont }), rasterizer: fakeRasterizer() })
      assert.ok(Object.keys(doc.getFontList()).includes(family), `${text} uses ${family}`)
    }
  })
})
