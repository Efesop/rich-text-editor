/**
 * The files an import reads: picked files, a picked folder, or zip archives,
 * as one flat list of files with normalized paths.
 *
 * Zips are read in place (only the central directory up front, each entry when
 * asked for), so a multi-gigabyte export never has to fit in memory at once.
 * A zip holding nothing but zips (Notion's multi-part exports) is opened too.
 * Limits guard against zip bombs: every read stops at the entry's declared
 * size.
 *
 * @typedef {object} SourceFile
 * @property {string} path - NFC, forward slashes, no leading slash
 * @property {string} name - the last path segment
 * @property {number} size - uncompressed bytes
 * @property {number|null} lastModified - milliseconds since 1970
 * @property {string|null} container - the zip it came from, for messages
 * @property {() => Promise<Uint8Array>} bytes
 * @property {() => Promise<string>} text - decoded, byte order mark removed
 * @property {() => AsyncIterable<string>} textChunks - decoded pieces, for streaming parsers
 * @property {(maxBytes: number) => Promise<Uint8Array>} head - the first bytes, without reading the rest
 * @property {() => Promise<Blob>} blob
 */

import { BlobReader, BlobWriter, ZipReader, configure } from '@zip.js/zip.js/index-native.js'
import { normalizePath } from './paths.js'

export { normalizePath }

configure({ useWebWorkers: false })

export const DEFAULT_SOURCE_LIMITS = Object.freeze({
  maxEntries: 200000,
  maxTotalBytes: 8 * 1024 * 1024 * 1024,
  maxEntryBytes: 2 * 1024 * 1024 * 1024,
  // An entry that inflates more than this many times over is refused, once it is this big
  maxRatio: 1000,
  ratioFloorBytes: 64 * 1024 * 1024,
  maxZipDepth: 2
})

export class ImportSourceError extends Error {
  constructor (code, message) {
    super(message)
    this.name = 'ImportSourceError'
    this.code = code
  }
}

const IGNORED = /(^|\/)(__MACOSX(\/|$)|\.DS_Store$|Thumbs\.db$|desktop\.ini$|\._[^/]*$)/i

/** Text from bytes: UTF-8, or UTF-16 when a byte order mark says so. */
export function decodeText (bytes) {
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes)
  return new TextDecoder('utf-8').decode(bytes)
}

async function * decodeChunks (byteChunks) {
  let decoder = null
  for await (const chunk of byteChunks) {
    if (!decoder) {
      const encoding = chunk[0] === 0xFF && chunk[1] === 0xFE ? 'utf-16le' : chunk[0] === 0xFE && chunk[1] === 0xFF ? 'utf-16be' : 'utf-8'
      decoder = new TextDecoder(encoding)
    }
    const text = decoder.decode(chunk, { stream: true })
    if (text) yield text
  }
  if (decoder) {
    const rest = decoder.decode()
    if (rest) yield rest
  }
}

async function * blobChunks (blob, chunkBytes = 1024 * 1024) {
  for (let offset = 0; offset < blob.size; offset += chunkBytes) {
    yield new Uint8Array(await blob.slice(offset, offset + chunkBytes).arrayBuffer())
  }
}

function joinChunks (chunks, total) {
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function fileFromBlob (blob, path) {
  return {
    path,
    name: path.split('/').pop(),
    size: blob.size,
    lastModified: Number.isFinite(blob.lastModified) ? blob.lastModified : null,
    container: null,
    bytes: async () => new Uint8Array(await blob.arrayBuffer()),
    text: async () => decodeText(new Uint8Array(await blob.arrayBuffer())),
    textChunks: () => decodeChunks(blobChunks(blob)),
    head: async (maxBytes) => new Uint8Array(await blob.slice(0, maxBytes).arrayBuffer()),
    blob: async () => blob
  }
}

// Reads a zip entry, refusing to go past its declared size. Inflating stops
// as soon as a reader has what it needs.
function entryReader (entry, limit) {
  const pipe = (onChunk) => {
    let total = 0
    const writable = new WritableStream({
      write (chunk) {
        if (onChunk(null) === false) throw new ImportSourceError('stopped', 'Reading stopped')
        total += chunk.length
        if (total > limit) throw new ImportSourceError('entry-too-large', `${entry.filename} is bigger than its zip says`)
        return onChunk(chunk)
      }
    })
    return entry.getData(writable, { checkSignature: true }).then(() => total)
  }
  return {
    async bytes () {
      const chunks = []
      const total = await pipe(chunk => {
        if (chunk) chunks.push(chunk)
      })
      return joinChunks(chunks, total)
    },
    async head (maxBytes) {
      const chunks = []
      let total = 0
      await pipe(chunk => {
        if (!chunk) return total < maxBytes
        const part = chunk.subarray(0, maxBytes - total)
        chunks.push(part)
        total += part.length
      }).catch(error => {
        if (total < maxBytes) throw error
      })
      return joinChunks(chunks, total)
    },
    chunks () {
      const queue = []
      let wake = null
      let finished = false
      let failure = null
      let stopped = false
      pipe(chunk => {
        if (!chunk) return !stopped
        queue.push(chunk)
        wake?.()
      }).then(() => { finished = true }, error => { failure = error }).finally(() => wake?.())
      return (async function * () {
        try {
          while (true) {
            if (queue.length > 0) {
              yield queue.shift()
              continue
            }
            if (failure) throw failure
            if (finished) return
            await new Promise(resolve => { wake = resolve })
            wake = null
          }
        } finally {
          stopped = true
          queue.length = 0
        }
      })()
    }
  }
}

const utf8 = new TextDecoder('utf-8', { fatal: true })

async function isZip (blob) {
  if (blob.size < 4) return false
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer())
  return head[0] === 0x50 && head[1] === 0x4B && (head[2] === 3 || head[2] === 5) && (head[3] === 4 || head[3] === 6)
}

/**
 * The files in some picked inputs.
 *
 * @param {Array<Blob & {name?: string, webkitRelativePath?: string}>} inputs
 * @param {{limits?: object, signal?: AbortSignal}} [options]
 * @returns {Promise<{files: SourceFile[], skipped: Array<{path: string, container: string|null, reason: string}>, close: () => Promise<void>}>}
 */
export async function openSources (inputs, { limits = DEFAULT_SOURCE_LIMITS, signal } = {}) {
  const files = []
  const skipped = []
  const readers = []
  const seen = new Set()
  let totalBytes = 0

  const add = (file) => {
    if (seen.has(file.path)) {
      skipped.push({ path: file.path, container: file.container, reason: 'duplicate-path' })
      return
    }
    seen.add(file.path)
    files.push(file)
  }

  const openZip = async (blob, containerName, depth) => {
    const reader = new ZipReader(new BlobReader(blob), {
      // Names without the UTF-8 flag are still usually UTF-8 (macOS zips them that way)
      decodeText (value) {
        try {
          return utf8.decode(value)
        } catch {
          return undefined
        }
      }
    })
    readers.push(reader)
    let entries
    try {
      entries = await reader.getEntries()
    } catch (error) {
      throw new ImportSourceError('unreadable-zip', `${containerName} isn't a zip file that can be read (${error.message})`)
    }
    const wanted = entries.filter(entry => !entry.directory && !IGNORED.test(entry.filename))
    if (files.length + wanted.length > limits.maxEntries) {
      throw new ImportSourceError('too-many-files', `${containerName} holds more than ${limits.maxEntries} files`)
    }

    const nested = wanted.length > 0 && depth < limits.maxZipDepth && wanted.every(entry => /\.zip$/i.test(entry.filename))
    for (const entry of wanted) {
      if (signal?.aborted) throw signal.reason || new ImportSourceError('cancelled', 'Import cancelled')
      const path = normalizePath(entry.filename)
      if (entry.encrypted) {
        skipped.push({ path, container: containerName, reason: 'encrypted' })
        continue
      }
      const size = entry.uncompressedSize
      if (size > limits.maxEntryBytes ||
          (size >= limits.ratioFloorBytes && size / Math.max(1, entry.compressedSize) > limits.maxRatio)) {
        skipped.push({ path, container: containerName, reason: 'too-large' })
        continue
      }
      totalBytes += size
      if (totalBytes > limits.maxTotalBytes) {
        throw new ImportSourceError('too-large', 'This export is too large to import on this device')
      }
      const read = entryReader(entry, size)
      if (nested) {
        const inner = await entry.getData(new BlobWriter('application/zip'))
        await openZip(inner, `${containerName} › ${path}`, depth + 1)
        continue
      }
      const lastModified = entry.lastModDate instanceof Date && !Number.isNaN(entry.lastModDate.getTime()) ? entry.lastModDate.getTime() : null
      add({
        path,
        name: path.split('/').pop(),
        size,
        lastModified,
        container: containerName,
        bytes: () => read.bytes(),
        text: async () => decodeText(await read.bytes()),
        textChunks: () => decodeChunks(read.chunks()),
        head: (maxBytes) => read.head(maxBytes),
        blob: async () => new Blob([await read.bytes()])
      })
    }
  }

  for (const input of inputs) {
    const name = normalizePath(input.webkitRelativePath || input.name || 'file')
    if (await isZip(input)) {
      await openZip(input, name, 0)
    } else if (!IGNORED.test(name)) {
      totalBytes += input.size
      if (totalBytes > limits.maxTotalBytes) throw new ImportSourceError('too-large', 'These files are too large to import on this device')
      add(fileFromBlob(input, name))
    }
  }

  return {
    files,
    skipped,
    close: async () => {
      await Promise.allSettled(readers.map(reader => reader.close()))
    }
  }
}
