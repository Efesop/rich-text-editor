/**
 * Which links in notes may be opened.
 *
 * Notes hold links from pasted web pages and imported files, so a link's
 * target can't be trusted. Only absolute web, email and phone links leave the
 * app; anything else (relative paths, app-internal schemes) is ignored.
 *
 * On iOS a relative link resolves to capacitor://localhost, the app's own
 * origin. Capacitor before 8.4.3 served /_capacitor_http_interceptor_ there,
 * so a tapped link could load a remote page with the app's own access to
 * notes and native plugins (GHSA-rvm3-566m-v7fv).
 *
 * DOM-free so it runs under `node --test`.
 */

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/**
 * The URL to open for a link, or null when it must not be opened.
 *
 * @param {string|null|undefined} href - the link's href attribute as written, not `link.href`
 * @returns {string|null}
 */
export function externalLinkTarget (href) {
  if (typeof href !== 'string' || !href.trim()) return null
  let url
  try {
    // No base URL: relative and protocol-relative links throw here
    url = new URL(href.trim())
  } catch {
    return null
  }
  return EXTERNAL_PROTOCOLS.has(url.protocol) ? url.href : null
}

/**
 * True when `href` resolves to one of Capacitor's internal paths on the
 * page's own origin. A link like that must never navigate the web view.
 *
 * @param {string|null|undefined} href - the link's href attribute
 * @param {string} base - the page's URL (window.location.href)
 * @returns {boolean}
 */
export function isAppInternalPath (href, base) {
  if (typeof href !== 'string') return false
  try {
    const page = new URL(base)
    const url = new URL(href.trim(), page)
    // Compare scheme and host: a custom scheme's URL.origin is "null"
    return url.protocol === page.protocol &&
      url.host === page.host &&
      url.pathname.startsWith('/_capacitor_')
  } catch {
    return false
  }
}
