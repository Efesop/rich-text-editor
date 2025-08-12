export async function readPages () {
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    return await window.electron.invoke('read-pages')
  }
  try {
    const raw = localStorage.getItem('pages')
    return raw ? JSON.parse(raw) : []
  } catch (err) {
    console.error('readPages fallback failed', err)
    return []
  }
}

export async function savePages (pages) {
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    return await window.electron.invoke('save-pages', pages)
  }
  try {
    localStorage.setItem('pages', JSON.stringify(pages))
    return { success: true }
  } catch (err) {
    console.error('savePages fallback failed', err)
    throw err
  }
}

export async function readTags () {
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    return await window.electron.invoke('read-tags')
  }
  try {
    const raw = localStorage.getItem('tags')
    return raw ? JSON.parse(raw) : []
  } catch (err) {
    console.error('readTags fallback failed', err)
    return []
  }
}

export async function saveTags (tags) {
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    return await window.electron.invoke('save-tags', tags)
  }
  try {
    localStorage.setItem('tags', JSON.stringify(tags))
    return { success: true }
  } catch (err) {
    console.error('saveTags fallback failed', err)
    throw err
  }
}


