/**
 * Every export format, run under Node against one note with every block type.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'

import {
  buildPdf,
  exportToCSV,
  exportToDocx,
  exportToMarkdown,
  exportToPlainText,
  exportToRTF,
  exportToXML
} from '../utils/exportUtils.js'
import { toMarkdown, toPlainText, toRtf } from '../utils/exportBlocks.js'

// A 1x1 PNG.
const PNG_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const b = (type, data) => ({ type, data })

const everyBlock = {
  blocks: [
    b('header', { text: 'Trip plan', level: 2 }),
    b('paragraph', { text: 'Some <b>bold</b> and <a href="https://example.com">a link</a>' }),
    b('numberedListItem', { text: 'Book flights' }),
    b('numberedListItem', { text: 'Compare fares', indent: 1 }),
    b('numberedListItem', { text: 'Hold seats', indent: 1 }),
    b('numberedListItem', { text: 'Pack' }),
    b('bulletListItem', { text: 'Socks', indent: 1 }),
    b('checklistItem', { text: 'Passport', checked: true, indent: 2 }),
    b('callout', { text: 'Visa needed', variant: 'warning' }),
    b('toggle', { summary: 'Hotel details', content: 'Room 12<br>Late checkout' }),
    b('quote', { text: 'Travel light' }),
    b('code', { code: 'const a = 1\nconst b = 2', language: 'javascript' }),
    b('table', { content: [['City', 'Nights'], ['Rome', '3']], withHeadings: true }),
    b('table', { content: [] }),
    b('image', { file: { url: PNG_URL }, caption: 'Map' }),
    b('image', { file: { url: 'data:image/gif;dash-attachment=0f8fad5b-d9cb-869f-a165-70867728950e;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' }, caption: 'Missing photo' }),
    b('embed', { service: 'youtube', source: 'https://www.youtube.com/watch?v=abc', embed: 'https://www.youtube.com/embed/abc', caption: '' }),
    b('attachment', { attachmentId: '11111111-1111-4111-8111-111111111111', filename: 'tickets.pdf', mimeType: 'application/pdf', size: 1234 }),
    b('delimiter', {}),
    b('seedPhrase', { words: ['alpha', 'beta'], count: 12 })
  ]
}

describe('exportUtils under Node', () => {
  it('writes Markdown, plain text and RTF through the shared reader', () => {
    assert.equal(exportToMarkdown(everyBlock), toMarkdown(everyBlock))
    assert.equal(exportToPlainText(everyBlock), toPlainText(everyBlock))
    assert.equal(exportToRTF(everyBlock), toRtf(everyBlock))
  })

  it('writes CSV with the indent and checklist columns', () => {
    const lines = exportToCSV(everyBlock).trim().split('\n')
    assert.equal(lines[0], 'Type,Level,Content,Checked')
    assert.ok(lines.includes('Numbered Item,1,a. Compare fares,'))
    assert.ok(lines.includes('Checklist Item,2,Passport,Checked'))
    assert.ok(lines.includes('Callout,Warning,Visa needed,'))
  })

  it('writes XML with callouts, toggles, indent and numbers, and without undefined', () => {
    const xml = exportToXML({ blocks: [...everyBlock.blocks, b('paragraph', { text: 'bell' + String.fromCharCode(7) + 'char' })] })
    assert.match(xml, /<numberedItem indent="1" number="b">Hold seats<\/numberedItem>/)
    assert.match(xml, /<checklistItem indent="2" checked="true">Passport<\/checklistItem>/)
    assert.match(xml, /<callout variant="warning">Visa needed<\/callout>/)
    assert.match(xml, /<toggle summary="Hotel details">Room 12\nLate checkout<\/toggle>/)
    assert.match(xml, /<image caption="Missing photo" attachmentId="0f8fad5b-d9cb-869f-a165-70867728950e"\/>/)
    assert.match(xml, /<paragraph>bellchar<\/paragraph>/)
    assert.equal(xml.includes('undefined'), false)
  })

  it('writes a Word document with real nested numbering, bullets, a table and the photo', async () => {
    const buffer = await exportToDocx(everyBlock)
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml').async('string')
    const numberingXml = await zip.file('word/numbering.xml').async('string')
    assert.match(documentXml, /Compare fares/)
    assert.match(documentXml, /Visa needed/)
    assert.equal((documentXml.match(/<w:numPr>/g) || []).length >= 5, true, 'list items are numbered or bulleted')
    assert.match(numberingXml, /lowerLetter/)
    assert.ok(Object.keys(zip.files).some(name => name.startsWith('word/media/')), 'the inline photo is embedded')
    assert.equal(documentXml.includes('undefined'), false)
  })

  it('lays out a PDF across as many pages as the note needs, tables and photos included', () => {
    const long = { blocks: [...everyBlock.blocks, ...Array.from({ length: 120 }, (_, i) => b('paragraph', { text: `Paragraph ${i + 1}` }))] }
    const doc = buildPdf(long)
    assert.ok(doc.getNumberOfPages() >= 3, `expected several pages, got ${doc.getNumberOfPages()}`)
    const output = doc.output()
    assert.match(output, /Paragraph 120/)
    assert.equal(output.includes('undefined'), false)
  })
})
