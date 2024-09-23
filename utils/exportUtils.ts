import jsPDF from 'jspdf';

interface Block {
  type: string;
  data: {
    text?: string;
    level?: number;
    items?: string[];
    // Add other possible data properties here
  };
}

interface Content {
  blocks: Block[];
}

export const exportToPDF = (content: Content, title: string): void => {
  const doc = new jsPDF();
  let yOffset = 10;

  content.blocks.forEach((block) => {
    switch (block.type) {
      case 'header':
        const fontSize = 16 + (6 - (block.data.level || 1)) * 2;
        doc.setFontSize(fontSize);
        doc.text(block.data.text || '', 10, yOffset);
        yOffset += fontSize / 2 + 5;
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
      // Add more cases for other block types as needed
    }
    yOffset += 5; // Add some space between blocks

    // Check if we need a new page
    if (yOffset > 280) {
      doc.addPage();
      yOffset = 10;
    }
  });

  doc.save(`${title}.pdf`);
};

export const exportToMarkdown = (content: Content): string => {
  return content.blocks.map((block) => {
    switch (block.type) {
      case 'header':
        return '#'.repeat(block.data.level || 1) + ' ' + (block.data.text || '') + '\n\n';
      case 'paragraph':
        return (block.data.text || '') + '\n\n';
      case 'list':
        return (block.data.items?.map(item => `- ${item}`).join('\n') || '') + '\n\n';
      // Add more cases for other block types as needed
      default:
        return '';
    }
  }).join('');
};

export const exportToPlainText = (content: Content): string => {
  return content.blocks.map((block) => {
    switch (block.type) {
      case 'header':
      case 'paragraph':
        return (block.data.text || '') + '\n\n';
      case 'list':
        return (block.data.items?.map(item => `- ${item}`).join('\n') || '') + '\n\n';
      // Add more cases for other block types as needed
      default:
        return '';
    }
  }).join('');
};

export const downloadFile = (content: string, fileName: string, contentType: string): void => {
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
