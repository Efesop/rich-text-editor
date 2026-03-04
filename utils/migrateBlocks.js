/**
 * Migrate old nestedlist/checklist blocks to individual item blocks.
 * Runs on page data before passing to Editor.js.
 * Returns a new data object (never mutates input).
 */
export function migrateEditorData(data) {
  if (!data || !Array.isArray(data.blocks)) return data

  let needsMigration = false
  const newBlocks = []

  for (const block of data.blocks) {
    if (block.type === 'nestedlist') {
      needsMigration = true
      const style = block.data?.style || 'unordered'
      const toolType = style === 'ordered' ? 'numberedListItem' : 'bulletListItem'
      flattenNestedItems(block.data?.items || [], newBlocks, toolType)
    } else if (block.type === 'checklist') {
      needsMigration = true
      const items = block.data?.items || []
      for (const item of items) {
        newBlocks.push({
          type: 'checklistItem',
          data: {
            text: item.text || item.content || '',
            checked: Boolean(item.checked)
          }
        })
      }
    } else {
      newBlocks.push(block)
    }
  }

  if (!needsMigration) return data

  return {
    ...data,
    blocks: newBlocks
  }
}

function flattenNestedItems(items, result, toolType) {
  for (const item of items) {
    const text = item.content || item.text || ''
    if (text || (item.items && item.items.length > 0)) {
      result.push({
        type: toolType,
        data: { text }
      })
    }
    if (item.items && item.items.length > 0) {
      flattenNestedItems(item.items, result, toolType)
    }
  }
}
