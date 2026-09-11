import { jsPDF } from 'jspdf'
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx'
import { create } from 'xmlbuilder2'
import { stringify } from 'csv-stringify/sync'
import { encryptJsonWithPassphrase, decryptJsonWithPassphrase } from './cryptoUtils.js'
import {
  CALLOUT_LABELS,
  CSV_COLUMNS,
  exportItems,
  imageForItem,
  inlineRuns,
  inlineText,
  listMarker,
  toCsvRows,
  toMarkdown,
  toPlainText,
  toRtf
} from './exportBlocks.js'

/**
 * Exporting a note: PDF, Markdown, plain text, RTF, DOCX, CSV, JSON and XML.
 *
 * Every format reads the note through utils/exportBlocks.js. Photos stored as
 * attachments arrive in `options.images`, read once by utils/exportImages.js.
 */

// --- PDF -------------------------------------------------------------------

const PDF_PAGE = { width: 210, height: 297, margin: 15 }
const PT_TO_MM = 0.3528
const PX_TO_MM = 0.2646
const HEADING_SIZES = [22, 18, 15, 13, 12, 12]

/** The note laid out as a jsPDF document, starting a new page whenever one fills. */
export function buildPdf (content, { images = new Map() } = {}) {
  const doc = new jsPDF()
  const width = PDF_PAGE.width - PDF_PAGE.margin * 2
  const bottom = PDF_PAGE.height - PDF_PAGE.margin
  let y = PDF_PAGE.margin

  const room = (height) => {
    if (y + height > bottom && y > PDF_PAGE.margin) {
      doc.addPage()
      y = PDF_PAGE.margin
    }
  }

  const write = (text, { size = 11, style = 'normal', font = 'helvetica', indent = 0, after = 3 } = {}) => {
    doc.setFont(font, style)
    doc.setFontSize(size)
    const lineHeight = size * PT_TO_MM * 1.4
    for (const line of doc.splitTextToSize(String(text), width - indent)) {
      room(lineHeight)
      doc.text(line, PDF_PAGE.margin + indent, y + size * PT_TO_MM)
      y += lineHeight
    }
    y += after
  }

  const drawTable = (item) => {
    const cellWidth = width / item.rows[0].length
    const padding = 2
    const size = 10
    const lineHeight = size * PT_TO_MM * 1.3
    doc.setFontSize(size)
    item.rows.forEach((row, r) => {
      doc.setFont('helvetica', r === 0 && item.withHeadings ? 'bold' : 'normal')
      const cells = row.map(cell => doc.splitTextToSize(inlineText(cell), cellWidth - padding * 2))
      const height = Math.max(1, ...cells.map(lines => lines.length)) * lineHeight + padding * 2
      room(height)
      cells.forEach((lines, c) => {
        const x = PDF_PAGE.margin + c * cellWidth
        doc.rect(x, y, cellWidth, height)
        if (lines.length) doc.text(lines, x + padding, y + padding + size * PT_TO_MM)
      })
      y += height
    })
    y += 4
  }

  const drawImage = (item) => {
    const image = imageForItem(item, images)
    const caption = inlineText(item.captionHtml).trim()
    const format = image?.mimeType === 'image/png' ? 'PNG' : image?.mimeType === 'image/jpeg' ? 'JPEG' : null
    if (!format || !image.width || !image.height) {
      write(caption ? `[Image: ${caption}]` : '[Image]')
      return
    }
    let w = Math.min(width, image.width * PX_TO_MM)
    let h = w * image.height / image.width
    const maxHeight = Math.min(140, bottom - PDF_PAGE.margin)
    if (h > maxHeight) {
      h = maxHeight
      w = h * image.width / image.height
    }
    room(h + 2)
    try {
      doc.addImage(image.dataUrl, format, PDF_PAGE.margin, y, w, h)
    } catch (err) {
      console.error('PDF export: could not add a photo', err)
      write(caption ? `[Image: ${caption}]` : '[Image]')
      return
    }
    y += h + 2
    if (caption) write(caption, { size: 9 })
    else y += 2
  }

  for (const item of exportItems(content)) {
    switch (item.kind) {
      case 'heading': {
        const text = inlineText(item.html).trim()
        if (text) write(text, { size: HEADING_SIZES[item.level - 1], style: 'bold', after: 4 })
        break
      }
      case 'paragraph': {
        const text = inlineText(item.html)
        if (text.trim()) write(text)
        break
      }
      case 'list-item':
        write(`${listMarker(item)} ${inlineText(item.html)}`, { indent: 6 * item.indent, after: 1.5 })
        break
      case 'quote': {
        write(inlineText(item.html), { style: 'italic', indent: 6, after: 1.5 })
        const caption = inlineText(item.captionHtml).trim()
        if (caption) write(`— ${caption}`, { size: 9, indent: 6 })
        break
      }
      case 'callout':
        write(`${CALLOUT_LABELS[item.variant]}: ${inlineText(item.html)}`)
        break
      case 'toggle': {
        write(inlineText(item.summaryHtml), { style: 'bold', after: 1.5 })
        const body = inlineText(item.contentHtml)
        if (body.trim()) write(body, { indent: 6 })
        break
      }
      case 'code':
        write(item.code, { font: 'courier', size: 9 })
        break
      case 'table':
        drawTable(item)
        break
      case 'image':
        drawImage(item)
        break
      case 'embed':
        write([inlineText(item.captionHtml).trim(), item.url].filter(Boolean).join(' '))
        break
      case 'attachment':
        write(`[Attachment: ${item.filename || 'File'}]`)
        break
      case 'divider':
        room(6)
        doc.setDrawColor(200)
        doc.line(PDF_PAGE.margin, y + 2, PDF_PAGE.width - PDF_PAGE.margin, y + 2)
        y += 6
        break
      case 'seed-phrase':
        write('Seed Phrase:', { style: 'bold', after: 1.5 })
        item.words.forEach((word, i) => write(`${i + 1}. ${word}`, { size: 10, after: 0.5 }))
        y += 2
        break
    }
  }
  return doc
}

export const exportToPDF = (content, title, options) => {
  buildPdf(content, options).save(`${title}.pdf`)
}

// --- Text formats ------------------------------------------------------------

export const exportToMarkdown = (content, options) => toMarkdown(content, options)

export const exportToPlainText = (content) => toPlainText(content)

export const exportToRTF = (content, options) => toRtf(content, options)

// --- DOCX ------------------------------------------------------------------

const BOX_CHECKED = String.fromCharCode(0x2611)
const BOX_EMPTY = String.fromCharCode(0x2610)
const WORD_NUMBER_FORMATS = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN]
const WORD_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/bmp']

// A numbering of its own for each indent level, so a nested list can start
// again at 1 without restarting the list around it.
function wordNumbering () {
  return {
    config: Array.from({ length: 9 }, (_, level) => ({
      reference: `dash-numbered-${level}`,
      levels: [{
        level: 0,
        format: WORD_NUMBER_FORMATS[level % 3],
        text: '%1.',
        alignment: AlignmentType.START,
        style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } }
      }]
    }))
  }
}

function wordRuns (html, style = {}) {
  const children = []
  for (const run of inlineRuns(html)) {
    const pieces = run.text.split('\n').map((text, i) => new TextRun({
      text,
      break: i > 0 ? 1 : undefined,
      bold: run.bold || style.bold,
      italics: run.italic || style.italics,
      underline: run.underline ? {} : undefined,
      strike: run.strike,
      highlight: run.mark ? 'yellow' : undefined,
      font: run.code ? 'Courier New' : undefined,
      style: run.href ? 'Hyperlink' : undefined
    }))
    if (run.href) children.push(new ExternalHyperlink({ link: run.href, children: pieces }))
    else children.push(...pieces)
  }
  return children
}

export const exportToDocx = async (content, { images = new Map() } = {}) => {
  const children = []
  // Which run of numbered items each indent level is on.
  const numberRuns = new Array(9).fill(0)

  for (const item of exportItems(content)) {
    switch (item.kind) {
      case 'heading':
        children.push(new Paragraph({ heading: HeadingLevel[`HEADING_${item.level}`], children: wordRuns(item.html) }))
        break
      case 'paragraph':
        children.push(new Paragraph({ children: wordRuns(item.html) }))
        break
      case 'list-item':
        if (item.listType === 'numbered') {
          if (item.number === 1) numberRuns[item.indent]++
          children.push(new Paragraph({
            children: wordRuns(item.html),
            numbering: { reference: `dash-numbered-${item.indent}`, level: 0, instance: numberRuns[item.indent] }
          }))
        } else if (item.listType === 'bullet') {
          children.push(new Paragraph({ children: wordRuns(item.html), bullet: { level: item.indent } }))
        } else {
          children.push(new Paragraph({
            children: [new TextRun(`${item.checked ? BOX_CHECKED : BOX_EMPTY} `), ...wordRuns(item.html)],
            indent: { left: 720 * item.indent }
          }))
        }
        break
      case 'quote': {
        children.push(new Paragraph({ children: wordRuns(item.html, { italics: true }), indent: { left: 720 } }))
        const caption = inlineText(item.captionHtml).trim()
        if (caption) children.push(new Paragraph({ children: [new TextRun({ text: `— ${caption}`, italics: true })], indent: { left: 720 } }))
        break
      }
      case 'callout':
        children.push(new Paragraph({
          children: [new TextRun({ text: `${CALLOUT_LABELS[item.variant]}: `, bold: true }), ...wordRuns(item.html)],
          shading: { type: ShadingType.CLEAR, fill: 'F1F3F5', color: 'auto' }
        }))
        break
      case 'toggle':
        children.push(new Paragraph({ children: wordRuns(item.summaryHtml, { bold: true }) }))
        if (inlineText(item.contentHtml).trim()) children.push(new Paragraph({ children: wordRuns(item.contentHtml), indent: { left: 360 } }))
        break
      case 'code':
        children.push(new Paragraph({
          children: item.code.split('\n').map((line, i) => new TextRun({ text: line, font: 'Courier New', break: i > 0 ? 1 : undefined })),
          shading: { type: ShadingType.CLEAR, fill: 'F4F4F4', color: 'auto' }
        }))
        break
      case 'table':
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: item.rows.map((row, r) => new TableRow({
            children: row.map(cell => new TableCell({
              children: [new Paragraph({ children: wordRuns(cell, r === 0 && item.withHeadings ? { bold: true } : {}) })]
            }))
          }))
        }))
        children.push(new Paragraph(''))
        break
      case 'image': {
        const image = imageForItem(item, images)
        const caption = inlineText(item.captionHtml).trim()
        if (image && WORD_IMAGE_TYPES.includes(image.mimeType) && image.width && image.height) {
          const width = Math.min(image.width, 600)
          children.push(new Paragraph({
            children: [new ImageRun({ data: image.bytes, transformation: { width, height: Math.round(width * image.height / image.width) } })]
          }))
          if (caption) children.push(new Paragraph({ children: [new TextRun({ text: caption, italics: true })] }))
        } else {
          children.push(new Paragraph(caption ? `[Image: ${caption}]` : '[Image]'))
        }
        break
      }
      case 'embed':
        children.push(new Paragraph({
          children: [new ExternalHyperlink({ link: item.url, children: [new TextRun({ text: inlineText(item.captionHtml).trim() || item.url, style: 'Hyperlink' })] })]
        }))
        break
      case 'attachment':
        children.push(new Paragraph(`[Attachment: ${item.filename || 'File'}]`))
        break
      case 'divider':
        children.push(new Paragraph({ border: { bottom: { color: 'auto', space: 1, style: BorderStyle.SINGLE, size: 6 } } }))
        break
      case 'seed-phrase':
        children.push(new Paragraph({ children: [new TextRun({ text: 'Seed Phrase:', bold: true })] }))
        item.words.forEach((word, i) => children.push(new Paragraph(`${i + 1}. ${word}`)))
        break
    }
  }

  const doc = new Document({
    creator: 'Dash',
    description: 'Exported from Dash',
    numbering: wordNumbering(),
    sections: [{ properties: {}, children }]
  })
  return Packer.toBuffer(doc)
}

// --- CSV, JSON, XML ----------------------------------------------------------

export const exportToCSV = (content) => {
  return stringify(toCsvRows(content), { header: true, columns: CSV_COLUMNS })
}

export const exportToJSON = (content) => {
  return JSON.stringify(content, null, 2)
}

// Characters XML 1.0 can't hold at all.
const XML_INVALID = new RegExp('[' + [[0x00, 0x08], [0x0B, 0x0C], [0x0E, 0x1F]]
  .map(([from, to]) => String.fromCharCode(from) + '-' + String.fromCharCode(to))
  .join('') + ']', 'g')
const xmlText = (text) => String(text).replace(XML_INVALID, '')

function element (parent, name, attributes = {}, text = '') {
  const node = parent.ele(name, attributes)
  if (text) node.txt(xmlText(text))
  return node
}

export const exportToXML = (content) => {
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('content')
  const text = (html) => inlineText(html)

  for (const item of exportItems(content)) {
    switch (item.kind) {
      case 'heading':
        element(root, 'header', { level: item.level }, text(item.html))
        break
      case 'paragraph':
        element(root, 'paragraph', {}, text(item.html))
        break
      case 'list-item': {
        const name = { bullet: 'bulletItem', numbered: 'numberedItem', checklist: 'checklistItem' }[item.listType]
        const attributes = { indent: item.indent }
        if (item.listType === 'numbered') attributes.number = item.label
        if (item.listType === 'checklist') attributes.checked = item.checked
        element(root, name, attributes, text(item.html))
        break
      }
      case 'quote': {
        const caption = xmlText(text(item.captionHtml).trim())
        element(root, 'quote', caption ? { caption } : {}, text(item.html))
        break
      }
      case 'callout':
        element(root, 'callout', { variant: item.variant }, text(item.html))
        break
      case 'toggle':
        element(root, 'toggle', { summary: xmlText(text(item.summaryHtml)) }, text(item.contentHtml))
        break
      case 'code':
        element(root, 'code', item.language ? { language: item.language } : {}, item.code)
        break
      case 'table': {
        const table = element(root, 'table', { withHeadings: item.withHeadings })
        for (const row of item.rows) {
          const rowElement = element(table, 'row')
          for (const cell of row) element(rowElement, 'cell', {}, text(cell))
        }
        break
      }
      case 'image': {
        const attributes = {}
        const caption = xmlText(text(item.captionHtml).trim())
        if (caption) attributes.caption = caption
        if (item.attachmentId) attributes.attachmentId = item.attachmentId
        if (item.filename) attributes.filename = xmlText(item.filename)
        element(root, 'image', attributes, item.url)
        break
      }
      case 'embed':
        element(root, 'embed', item.service ? { service: item.service } : {}, item.url)
        break
      case 'attachment':
        element(root, 'attachment', { filename: xmlText(item.filename), mimeType: item.mimeType, size: item.size })
        break
      case 'divider':
        element(root, 'delimiter', {}, '---')
        break
      case 'seed-phrase': {
        const phrase = element(root, 'seedPhrase', { count: item.words.length })
        item.words.forEach((word, i) => element(phrase, 'word', { index: i + 1 }, word))
        break
      }
    }
  }

  return root.end({ prettyPrint: true })
}

// --- Files and bundles -------------------------------------------------------

export const downloadFile = (content, fileName, contentType) => {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const exportEncryptedBundle = async (pages, tags, passphrase) => {
  // Note: 'pages' parameter now includes both pages AND folders for complete export
  // Bundle attachment file data so dashpacks are fully portable
  const { collectAttachmentsForExport } = await import('@/lib/attachmentStorage')
  const attachments = await collectAttachmentsForExport(pages)
  const payload = { pages, tags, createdAt: new Date().toISOString(), attachments }
  const encrypted = await encryptJsonWithPassphrase(payload, passphrase)
  const json = JSON.stringify(encrypted)
  // Add timestamp to filename to avoid overwriting previous exports
  const timestamp = new Date().toISOString().slice(0, 10) // YYYY-MM-DD format
  downloadFile(json, `dash-notes-${timestamp}.dashpack`, 'application/json')
}

export const importEncryptedBundle = async (file, passphrase) => {
  const text = await file.text()
  const parsed = JSON.parse(text)
  const { pages, tags, attachments } = await decryptJsonWithPassphrase(parsed, passphrase)
  // Restore bundled attachment files to local storage
  if (attachments && typeof attachments === 'object' && Object.keys(attachments).length > 0) {
    const { restoreAttachmentsFromImport } = await import('@/lib/attachmentStorage')
    await restoreAttachmentsFromImport(attachments)
  }
  return { pages, tags }
}
