# Page Linking in Dash

## What is Page Linking?

Page linking lets you connect your notes together using wiki-style `[[` links. When you type `[[` in any text block, an autocomplete dropdown appears showing all your pages. Select one to insert a clickable link that navigates to that page instantly.

This is the foundation of a personal knowledge base — link related ideas, reference notes from other notes, and build a web of connected thoughts.

## How It Works

### Method 1: Type `[[`

1. Place your cursor anywhere in a text block (paragraph, heading, list item, etc.)
2. Type `[[`
3. An autocomplete dropdown appears with all your pages
4. Type to filter by page title
5. Use arrow keys to navigate, Enter or click to select
6. The `[[` text is replaced with a styled page link
7. Press Escape to cancel

### Method 2: Inline Toolbar

1. Select text you want to turn into a page link
2. Click the chain-link icon in the inline formatting toolbar
3. A searchable dropdown appears
4. Search for and select the target page
5. The selected text becomes a clickable page link

### Clicking Links

Click any page link to navigate to that page immediately. Page links are styled distinctly from external URLs — they use a dotted underline and theme-aware colors so you can tell them apart at a glance.

## How It's Stored

Page links are stored as standard HTML anchor elements in Editor.js block data:

```html
<a data-page-id="uuid-of-target-page" class="page-link" href="#">Page Title</a>
```

The `data-page-id` attribute stores the unique ID of the linked page. This means links survive page renames — the link always points to the correct page regardless of title changes.

## Privacy & Security

- Page links are purely local references — no network requests involved
- Link data is sanitized through DOMPurify with `data-page-id` explicitly whitelisted
- Links work offline, just like everything else in Dash
- Linked page content is never exposed in the link itself — only the page ID is stored

## Edge Cases

- **Deleted pages**: If a linked page is deleted, the link remains but won't navigate anywhere. You can remove it by selecting and deleting the link text.
- **Encrypted pages**: You can link to encrypted pages. Clicking the link will prompt for the page password if it's locked.
- **Folders**: Only pages appear in the autocomplete — folders are filtered out.

## Comparison with Other Apps

| Feature | Dash | Obsidian | Notion |
|---------|------|----------|--------|
| `[[` wiki links | Yes | Yes | Yes |
| Toolbar linking | Yes | No | Yes |
| Works offline | Yes | Yes | No |
| Data stays local | Yes | Yes | No |
| Backlinks panel | Planned | Yes | Yes |
| Graph view | Planned | Yes | No |
