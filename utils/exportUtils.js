import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell } from 'docx';
import { create } from 'xmlbuilder2';
import { stringify } from 'csv-stringify/sync';

export const exportToPDF = (content, title) => {
  const doc = new jsPDF();
  let yOffset = 10;

  content.blocks.forEach((block) => {
    switch (block.type) {
      case 'header':
        doc.setFontSize(16 + (6 - (block.data.level || 1)) * 2);
        doc.text(block.data.text || '', 10, yOffset);
        yOffset += 10;
        break;
      case 'paragraph':
        doc.setFontSize(12);
        const lines = doc.splitTextToSize(block.data.text || '', 190);
        doc.text(lines, 10, yOffset);
        yOffset += 5 * lines.length;
        break;
      case 'list':
        doc.setFontSize(12);
        block.data.items?.forEach((item) => {
          doc.text(`• ${item}`, 15, yOffset);
          yOffset += 7;
        });
        break;
      case 'checklist':
        doc.setFontSize(12);
        block.data.items?.forEach((item) => {
          const checkbox = item.checked ? '[x]' : '[ ]';
          doc.text(`${checkbox} ${item.text}`, 10, yOffset);
          yOffset += 7;
        });
        break;
      case 'table':
        doc.setFontSize(12);
        block.data.content.forEach((row, rowIndex) => {
          row.forEach((cell, cellIndex) => {
            doc.text(cell, 10 + cellIndex * 40, yOffset + rowIndex * 10);
          });
        });
        yOffset += block.data.content.length * 10;
        break;
      case 'quote':
        doc.setFontSize(12);
        doc.text(`"${block.data.text}" - ${block.data.caption}`, 10, yOffset);
        yOffset += 10;
        break;
      case 'code':
        doc.setFontSize(12);
        const codeLines = doc.splitTextToSize(block.data.code || '', 190);
        doc.text(codeLines, 10, yOffset);
        yOffset += 5 * codeLines.length;
        break;
      case 'image':
        doc.addImage(block.data.file.url, 'JPEG', 10, yOffset, 180, 100);
        yOffset += 105;
        break;
      case 'delimiter':
        doc.setFontSize(12);
        doc.text('---', 10, yOffset);
        yOffset += 10;
        break;
    }
    yOffset += 5;
  });

  doc.save(`${title}.pdf`);
};

export const exportToMarkdown = (content) => {
  const createNestedMarkdownList = (items, level = 0) => {
    return items.map(item => {
      const indent = '  '.repeat(level);
      let markdown = `${indent}- ${item.content}\n`;
      if (item.items && item.items.length > 0) {
        markdown += createNestedMarkdownList(item.items, level + 1);
      }
      return markdown;
    }).join('');
  };

  return content.blocks.map((block) => {
    switch (block.type) {
      case 'header':
        return '#'.repeat(block.data.level || 1) + ' ' + (block.data.text || '') + '\n\n';
      case 'paragraph':
        return (block.data.text || '') + '\n\n';
      case 'list':
        return (block.data.items?.map(item => `- ${item}`).join('\n') || '') + '\n\n';
      case 'checklist':
        return (block.data.items?.map(item => `- [${item.checked ? 'x' : ' '}] ${item.text}`).join('\n') || '') + '\n\n';
      case 'table':
        const header = block.data.content[0].join(' | ');
        const separator = block.data.content[0].map(() => '---').join(' | ');
        const rows = block.data.content.slice(1).map(row => row.join(' | ')).join('\n');
        return `${header}\n${separator}\n${rows}\n\n`;
      case 'quote':
        return `> ${block.data.text}\n> - ${block.data.caption}\n\n`;
      case 'code':
        return `\`\`\`\n${block.data.code}\n\`\`\`\n\n`;
      case 'image':
        return `![${block.data.caption}](${block.data.file.url})\n\n`;
      case 'delimiter':
        return `---\n\n`;
      case 'nestedlist':
        return createNestedMarkdownList(block.data.items) + '\n';
      default:
        return '';
    }
  }).join('');
};

export const exportToPlainText = (content) => {
  const createNestedPlainTextList = (items, level = 0) => {
    return items.map(item => {
      const indent = '  '.repeat(level);
      let text = `${indent}- ${item.content}\n`;
      if (item.items && item.items.length > 0) {
        text += createNestedPlainTextList(item.items, level + 1);
      }
      return text;
    }).join('');
  };

  return content.blocks.map((block) => {
    switch (block.type) {
      case 'header':
      case 'paragraph':
        return (block.data.text || '') + '\n\n';
      case 'list':
        return (block.data.items?.map(item => `- ${item}`).join('\n') || '') + '\n\n';
      case 'checklist':
        return (block.data.items?.map(item => `- [${item.checked ? 'x' : ' '}] ${item.text}`).join('\n') || '') + '\n\n';
      case 'table':
        return block.data.content.map(row => row.join('\t')).join('\n') + '\n\n';
      case 'quote':
        return `"${block.data.text}" - ${block.data.caption}\n\n`;
      case 'code':
        return `${block.data.code}\n\n`;
      case 'image':
        return `[Image: ${block.data.caption}]\n\n`;
      case 'delimiter':
        return `---\n\n`;
      case 'nestedlist':
        return createNestedPlainTextList(block.data.items) + '\n';
      default:
        return '';
    }
  }).join('');
};

export const exportToRTF = (content) => {
  let rtf = '{\\rtf1\\ansi\\deff0 {\\fonttbl{\\f0 Times New Roman;}}\n';
  
  content.blocks.forEach((block) => {
    switch (block.type) {
      case 'header':
        rtf += `{\\b\\fs${28 + (6 - (block.data.level || 1)) * 2} ${block.data.text || ''}}\n\\par\n`;
        break;
      case 'paragraph':
        rtf += `${block.data.text || ''}\n\\par\n`;
        break;
      case 'list':
        block.data.items?.forEach((item) => {
          rtf += `{\\pntext\\f0 \\'B7\\tab}{\\*\\pn\\pnlvlblt\\pnf0\\pnindent0{\\pntxtb\\'B7}}${item}\n\\par\n`;
        });
        break;
      case 'checklist':
        block.data.items?.forEach((item) => {
          const checkbox = item.checked ? '[x]' : '[ ]';
          rtf += `${checkbox} ${item.text}\n\\par\n`;
        });
        break;
      case 'table':
        block.data.content.forEach((row) => {
          rtf += row.join('\\tab') + '\\par\n';
        });
        break;
      case 'quote':
        rtf += `{\\i "${block.data.text}" - ${block.data.caption}}\n\\par\n`;
        break;
      case 'code':
        rtf += `{\\f1 ${block.data.code}}\n\\par\n`;
        break;
      case 'image':
        // RTF does not support embedding images directly, so we add a placeholder
        rtf += `[Image: ${block.data.caption}]\n\\par\n`;
        break;
      case 'delimiter':
        rtf += `---\n\\par\n`;
        break;
    }
  });
  
  rtf += '}';
  return rtf;
};

export const exportToDocx = async (content) => {
  console.log('exportToDocx called with content:', content);
  const doc = new Document({
    sections: [{
      properties: {},
      children: content.blocks.map(block => {
        switch (block.type) {
          case 'header':
            return new Paragraph({
              text: block.data.text || '',
              heading: HeadingLevel[`HEADING_${block.data.level || 1}`]
            });
          case 'paragraph':
            return new Paragraph({
              children: [new TextRun(block.data.text || '')]
            });
          case 'nestedlist':
            const createNestedList = (items, level = 0) => {
              return items.flatMap(item => {
                const paragraph = new Paragraph({
                  text: item.content,
                  bullet: {
                    level: level
                  }
                });
                if (item.items && item.items.length > 0) {
                  return [paragraph, ...createNestedList(item.items, level + 1)];
                }
                return paragraph;
              });
            };
            return createNestedList(block.data.items);
          case 'checklist':
            return block.data.items?.map(item => new Paragraph({
              text: `${item.checked ? '[x]' : '[ ]'} ${item.text}`
            })) || [];
          case 'table':
            return new Table({
              rows: block.data.content.map(row => new TableRow({
                children: row.map(cell => new TableCell({
                  children: [new Paragraph(cell)]
                }))
              }))
            });
          case 'quote':
            return new Paragraph({
              children: [new TextRun({ text: `"${block.data.text}" - ${block.data.caption}`, italics: true })]
            });
          case 'code':
            return new Paragraph({
              children: [new TextRun({ text: block.data.code, font: 'Courier New' })]
            });
          case 'image':
            // DOCX does not support embedding images directly, so we add a placeholder
            return new Paragraph(`[Image: ${block.data.caption}]`);
          case 'delimiter':
            return new Paragraph('---');
          default:
            return new Paragraph('');
        }
      }).flat()
    }],
    creator: 'Your App Name',
    description: 'A document created by Your App Name',
  });
  
  const buffer = await Packer.toBuffer(doc);
  return buffer;
};

export const exportToCSV = (content) => {
  const data = content.blocks.flatMap((block) => {
    switch (block.type) {
      case 'header':
        return [['Header', block.data.level || 1, block.data.text || '']];
      case 'paragraph':
        return [['Paragraph', '', block.data.text || '']];
      case 'list':
        return block.data.items?.map(item => ['List Item', '', item]) || [];
      case 'checklist':
        return block.data.items?.map(item => ['Checklist Item', item.checked ? 'Checked' : 'Unchecked', item.text]) || [];
      case 'table':
        return block.data.content.map(row => ['Table Row', '', row.join(', ')]);
      case 'quote':
        return [['Quote', '', `"${block.data.text}" - ${block.data.caption}`]];
      case 'code':
        return [['Code', '', block.data.code]];
      case 'image':
        return [['Image', '', block.data.caption]];
      case 'delimiter':
        return [['Delimiter', '', '---']];
      default:
        return [];
    }
  });

  return stringify(data, {
    header: true,
    columns: ['Type', 'Level', 'Content']
  });
};

export const exportToJSON = (content) => {
  return JSON.stringify(content, null, 2);
};

export const exportToXML = (content) => {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('content');
  
  const createNestedXMLList = (parentElement, items) => {
    items.forEach(item => {
      const listItem = parentElement.ele('item').txt(item.content);
      if (item.items && item.items.length > 0) {
        const nestedList = listItem.ele('nestedList');
        createNestedXMLList(nestedList, item.items);
      }
    });
  };

  content.blocks.forEach((block) => {
    switch (block.type) {
      case 'header':
        root.ele('header', { level: block.data.level || 1 })
          .txt(block.data.text || '');
        break;
      case 'paragraph':
        root.ele('paragraph')
          .txt(block.data.text || '');
        break;
      case 'list':
        const list = root.ele('list');
        block.data.items?.forEach((item) => {
          list.ele('item').txt(item);
        });
        break;
      case 'checklist':
        const checklist = root.ele('checklist');
        block.data.items?.forEach((item) => {
          checklist.ele('item', { checked: item.checked }).txt(item.text);
        });
        break;
      case 'table':
        const table = root.ele('table');
        block.data.content.forEach((row) => {
          const rowElement = table.ele('row');
          row.forEach((cell) => {
            rowElement.ele('cell').txt(cell);
          });
        });
        break;
      case 'quote':
        root.ele('quote', { caption: block.data.caption })
          .txt(block.data.text || '');
        break;
      case 'code':
        root.ele('code')
          .txt(block.data.code || '');
        break;
      case 'image':
        root.ele('image', { caption: block.data.caption })
          .txt(block.data.file.url);
        break;
      case 'delimiter':
        root.ele('delimiter')
          .txt('---');
        break;
      case 'nestedlist':
        const nestedList = root.ele('nestedList');
        createNestedXMLList(nestedList, block.data.items);
        break;
    }
  });
  
  return root.end({ prettyPrint: true });
};

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
