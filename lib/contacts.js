/**
 * Local Contacts — Random aliases for zero-knowledge collaboration
 *
 * Contacts are stored locally only. Each contact has:
 * - A randomly generated alias (e.g., "Blue Penguin")
 * - A list of shared document IDs with encryption keys
 * - No real identity — just local bookmarks
 */

const STORAGE_KEY = 'dash-live-contacts'

// Word lists for generating random aliases
const COLORS = [
  'Red', 'Blue', 'Green', 'Purple', 'Golden', 'Silver', 'Coral',
  'Amber', 'Jade', 'Crimson', 'Azure', 'Ivory', 'Scarlet', 'Teal',
  'Indigo', 'Violet', 'Copper', 'Bronze', 'Sage', 'Rose'
]

const ANIMALS = [
  'Penguin', 'Fox', 'Owl', 'Bear', 'Wolf', 'Hawk', 'Dolphin',
  'Tiger', 'Panda', 'Eagle', 'Falcon', 'Otter', 'Lynx', 'Raven',
  'Crane', 'Heron', 'Jaguar', 'Cobra', 'Phoenix', 'Griffin'
]

/**
 * Generate a random alias like "Blue Penguin"
 * @returns {string}
 */
export function generateAlias () {
  const color = COLORS[Math.floor(Math.random() * COLORS.length)]
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  return `${color} ${animal}`
}

/**
 * Get own alias (persistent across sessions)
 * @returns {string}
 */
export function getOwnAlias () {
  try {
    const stored = localStorage.getItem('dash-live-alias')
    if (stored) return stored
    const alias = generateAlias()
    localStorage.setItem('dash-live-alias', alias)
    return alias
  } catch {
    return generateAlias()
  }
}

/**
 * Set own alias
 * @param {string} alias
 */
export function setOwnAlias (alias) {
  try {
    localStorage.setItem('dash-live-alias', alias.slice(0, 30))
  } catch { /* ignore storage errors */ }
}

/**
 * Load contacts from storage
 * @returns {Array<{ id: string, alias: string, sharedDocs: Array<{ docId: string, keyStr: string, pageId: string, title: string }> }>}
 */
export function loadContacts () {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    const contacts = JSON.parse(data)
    return Array.isArray(contacts) ? contacts : []
  } catch {
    return []
  }
}

/**
 * Save contacts to storage
 * @param {Array} contacts
 */
export function saveContacts (contacts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts))
  } catch { /* ignore storage errors */ }
}

/**
 * Add or update a contact with a shared document
 * @param {string} contactAlias - alias of the remote peer
 * @param {string} docId - shared document ID
 * @param {string} keyStr - encryption key for this document
 * @param {string} pageId - local page ID
 * @param {string} title - document title at time of sharing
 * @returns {Array} updated contacts list
 */
export function addSharedDoc (contactAlias, docId, keyStr, pageId, title) {
  const contacts = loadContacts()
  let contact = contacts.find(c => c.alias === contactAlias)

  if (!contact) {
    contact = {
      id: crypto.randomUUID(),
      alias: contactAlias,
      sharedDocs: [],
    }
    contacts.push(contact)
  }

  // Don't duplicate
  if (!contact.sharedDocs.some(d => d.docId === docId)) {
    contact.sharedDocs.push({ docId, keyStr, pageId, title })
  }

  saveContacts(contacts)
  return contacts
}

/**
 * Remove a shared document from a contact
 * @param {string} contactId
 * @param {string} docId
 * @returns {Array} updated contacts
 */
export function removeSharedDoc (contactId, docId) {
  const contacts = loadContacts()
  const contact = contacts.find(c => c.id === contactId)
  if (contact) {
    contact.sharedDocs = contact.sharedDocs.filter(d => d.docId !== docId)
    if (contact.sharedDocs.length === 0) {
      const idx = contacts.indexOf(contact)
      contacts.splice(idx, 1)
    }
  }
  saveContacts(contacts)
  return contacts
}

/**
 * Rename a contact's alias
 * @param {string} contactId
 * @param {string} newAlias
 * @returns {Array} updated contacts
 */
export function renameContact (contactId, newAlias) {
  const contacts = loadContacts()
  const contact = contacts.find(c => c.id === contactId)
  if (contact) {
    contact.alias = newAlias.slice(0, 30)
  }
  saveContacts(contacts)
  return contacts
}

/**
 * Delete a contact entirely
 * @param {string} contactId
 * @returns {Array} updated contacts
 */
export function deleteContact (contactId) {
  const contacts = loadContacts().filter(c => c.id !== contactId)
  saveContacts(contacts)
  return contacts
}
