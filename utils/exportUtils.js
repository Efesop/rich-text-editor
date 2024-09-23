import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
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
    }
    yOffset += 5;
  });

  doc.save(`${title}.pdf`);
};

export const exportToMarkdown = (content) => {
  return content.blocks.map((block) => {
    switch (block.type) {
      case 'header':
        return '#'.repeat(block.data.level || 1) + ' ' + (block.data.text || '') + '\n\n';
      case 'paragraph':
        return (block.data.text || '') + '\n\n';
      case 'list':
        return (block.data.items?.map(item => `- ${item}`).join('\n') || '') + '\n\n';
      default:
        return '';
    }
  }).join('');
};

export const exportToPlainText = (content) => {
  return content.blocks.map((block) => {
    switch (block.type) {
      case 'header':
      case 'paragraph':
        return (block.data.text || '') + '\n\n';
      case 'list':
        return (block.data.items?.map(item => `- ${item}`).join('\n') || '') + '\n\n';
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
          case 'list':
            return block.data.items?.map(item => new Paragraph({
              text: item,
              bullet: {
                level: 0
              }
            })) || [];
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
