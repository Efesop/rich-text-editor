/**
 * The fonts a PDF export embeds when a note has text jsPDF's built-in fonts
 * can't encode (utils/pdfText.js). They ship in public/fonts/pdf and load only
 * when a note needs them, so nothing is added to the app's JavaScript.
 * scripts/build-pdf-fonts.py builds them from Noto fonts (SIL Open Font
 * License 1.1, see THIRD_PARTY_NOTICES.md).
 */

export const PDF_FONTS = Object.freeze({
  sans: { file: 'NotoSansPdf-Regular.ttf', family: 'NotoSansPdf', style: 'normal' },
  sansBold: { file: 'NotoSansPdf-Bold.ttf', family: 'NotoSansPdf', style: 'bold' },
  sansItalic: { file: 'NotoSansPdf-Italic.ttf', family: 'NotoSansPdf', style: 'italic' },
  mono: { file: 'NotoSansMono-Regular.ttf', family: 'NotoSansMono', style: 'normal' },
  sc: { file: 'NotoSansSC-Regular.ttf', family: 'NotoSansSC', style: 'normal' },
  jp: { file: 'NotoSansJP-Regular.ttf', family: 'NotoSansJP', style: 'normal' },
  kr: { file: 'NotoSansKR-Regular.ttf', family: 'NotoSansKR', style: 'normal' }
})

/** Bytes as the binary string jsPDF's addFileToVFS takes. */
export function bytesToBinaryString (bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  }
  return binary
}

/** Read one of the fonts the app ships. Relative to the page, so it works from file:, capacitor: and a web base path. */
export async function fetchPdfFont (file) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH
  const url = base ? `${base}/fonts/pdf/${file}` : new URL(`fonts/pdf/${file}`, document.baseURI).href
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return bytesToBinaryString(new Uint8Array(await response.arrayBuffer()))
}

/**
 * Load fonts by key. A font that won't load is left out, and the text it
 * would have drawn becomes pictures instead, so the export still works.
 *
 * @param {string[]} keys - keys of PDF_FONTS
 * @param {{readFont?: (file: string) => Promise<string>}} [options]
 * @returns {Promise<Map<string, string>>} font data by key
 */
export async function loadPdfFonts (keys, { readFont = fetchPdfFont } = {}) {
  const loaded = new Map()
  await Promise.all([...new Set(keys)].map(async (key) => {
    const font = PDF_FONTS[key]
    if (!font) return
    try {
      loaded.set(key, await readFont(font.file))
    } catch (err) {
      console.warn('PDF export: could not load a font', font.file, err)
    }
  }))
  return loaded
}
