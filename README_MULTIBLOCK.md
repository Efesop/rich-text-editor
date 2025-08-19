# Multi-Block Tune Feature

## Overview

The Multi-Block Tune feature allows you to select multiple rows/blocks in Editor.js and apply tune operations (like conversion to different block types) to all of them simultaneously, instead of doing it one by one.

## How It Works

### Selection
1. **Single Block**: Works as normal - tune options appear when you select one block
2. **Multiple Blocks**: 
   - Select multiple blocks by holding Shift and clicking
   - Or use Ctrl+click to select non-adjacent blocks
   - When multiple blocks are selected, the multi-block tune menu automatically appears

### Converting Multiple Blocks
1. Select multiple blocks using mouse or keyboard
2. The multi-block conversion menu will appear automatically
3. Choose the target block type from the menu:
   - **Paragraph** - Convert to plain text paragraphs
   - **Heading** - Convert to H2 headings
   - **List** - Convert to unordered list items
   - **Checklist** - Convert to checklist items
   - **Quote** - Convert to quote blocks
   - **Code** - Convert to code blocks

### Keyboard Shortcuts
- **Cmd+Shift+T** (Mac) / **Ctrl+Shift+T** (Windows/Linux): Open multi-block menu when multiple blocks are selected
- **Escape**: Close the multi-block menu

## Technical Implementation

### Features
- **Smart Text Extraction**: Automatically extracts text content from any block type
- **Theme Support**: Matches your current theme (Light, Dark, Fallout)
- **Privacy-First**: All operations happen locally, no data sent anywhere
- **Undo Support**: All conversions can be undone with Cmd+Z

### Block Type Support
The tune supports conversion between all major block types:
- Paragraphs
- Headers (H1-H6)
- Lists (ordered/unordered)
- Checklists
- Quotes
- Code blocks
- Tables
- Images
- Embeds

### Data Preservation
When converting blocks, the system intelligently preserves:
- Text content (HTML stripped for plain text blocks)
- Basic formatting where applicable
- List structures (converted to appropriate format)

## Usage Examples

### Example 1: Convert Multiple Paragraphs to List
1. Select 3 paragraph blocks
2. Multi-block menu appears
3. Click "List" option
4. All 3 paragraphs become list items

### Example 2: Convert Mixed Blocks to Headings
1. Select a mix of paragraphs, lists, and quotes
2. Click "Heading" in the multi-block menu
3. All blocks become H2 headings with their text content preserved

## Styling

The multi-block menu automatically adapts to your current theme:

### Light Theme
- Clean white background with subtle shadows
- Gray text and borders

### Dark Theme  
- Dark background with lighter borders
- Light text for contrast

### Fallout Theme
- Terminal green color scheme
- Matches the retro aesthetic

## Browser Compatibility

Works in all modern browsers that support Editor.js:
- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Performance

- Lightweight implementation (~5KB)
- No external dependencies
- Efficient DOM manipulation
- Debounced selection detection for smooth performance
