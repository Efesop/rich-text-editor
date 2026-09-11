/**
 * Paths inside an import: picked folders and zip archives.
 *
 * DOM-free so it runs under `node --test`.
 */

/** A path as imports compare them: NFC, forward slashes, no empty, "." or ".." segments. */
export function normalizePath (raw) {
  const out = []
  for (const part of String(raw ?? '').normalize('NFC').replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

export function dirname (path) {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

export function basename (path) {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** The lower-cased extension without its dot, or ''. */
export function extension (path) {
  const name = basename(path)
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index + 1).toLowerCase() : ''
}

/**
 * Where a relative link in one file points: percent-decoded, query and
 * fragment removed, resolved against the file's folder.
 */
export function resolveRelative (fromPath, href) {
  const bare = String(href ?? '').split('#')[0].split('?')[0]
  let decoded = bare
  try {
    decoded = decodeURIComponent(bare)
  } catch {
    // a stray % stays as it is
  }
  const folder = dirname(fromPath)
  return normalizePath(decoded.startsWith('/') || !folder ? decoded : `${folder}/${decoded}`)
}
