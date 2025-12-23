import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import saveAs from 'file-saver';
import { ExtractedTableData } from '../types';

export const exportToPDF = (content: string) => {
  const doc = new jsPDF({
    unit: 'cm',
    format: 'a4'
  });
  
  // Basic cleaning of HTML tags for PDF preview
  let textToPrint = content;
  if (content.trim().startsWith('<')) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = content;
    textToPrint = tempDiv.innerText || tempDiv.textContent || "";
  }

  // Set font to Times
  doc.setFont("times", "normal");
  doc.setFontSize(12);

  // Split text for A4 (Approximate)
  const splitText = doc.splitTextToSize(textToPrint, 14); // 21cm - 4cm left - 3cm right = 14cm width
  
  let cursorY = 4; // Top Margin 4cm
  const pageHeight = 29.7;
  const bottomMargin = 3;

  splitText.forEach((line: string) => {
    if (cursorY > pageHeight - bottomMargin) {
      doc.addPage();
      cursorY = 4; // Reset to top margin
    }
    doc.text(line, 4, cursorY); // Left margin 4cm
    cursorY += 0.7; // Line height approx
  });

  doc.save('document_preview.pdf');
};

export const exportToExcel = (data: ExtractedTableData) => {
  const wsData = [data.headers, ...data.rows];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, "table_data.xlsx");
};

export const exportToWord = (content: string) => {
  const isHtml = content.trim().startsWith('<');

  // MSO-specific HTML header to enforce Word settings (Margins 4-4-3-3)
  // Top: 4cm, Left: 4cm, Bottom: 3cm, Right: 3cm
  // 1cm = 567 twips (Word unit). 
  // But easier to use CSS in @page.
  const header = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' 
          xmlns:w='urn:schemas-microsoft-com:office:word' 
          xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>Export</title>
      <style>
        @page WordSection1 {
          size: 21.0cm 29.7cm; 
          margin: 4.0cm 3.0cm 3.0cm 4.0cm; 
          mso-header-margin: 35.4pt; 
          mso-footer-margin: 35.4pt; 
          mso-paper-source:0;
        }
        div.WordSection1 { 
          page: WordSection1; 
        }
        body { 
          font-family: 'Times New Roman', serif; 
          font-size: 12pt; 
          line-height: 200%; /* Double Spacing */
          text-align: justify;
        }
        p { margin: 0; text-indent: 1.27cm; margin-bottom: 0pt; }
        h3 { text-align: center; font-weight: bold; text-transform: uppercase; font-size: 14pt; margin-bottom: 12pt; }
        h4 { font-weight: bold; margin-top: 12pt; margin-bottom: 6pt; font-size: 12pt; }
        table { border-collapse: collapse; width: 100%; font-size: 11pt; line-height: 1.0; margin-bottom: 12pt; }
        td, th { border: 1px solid black; padding: 5px; }
      </style>
    </head>
    <body>`;
  
  let bodyContent = "";

  if (isHtml) {
    bodyContent = `<div class="WordSection1">${content}</div>`;
  } else {
    // Basic text to HTML
    const formattedContent = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");
    bodyContent = `<div class="WordSection1"><p>${formattedContent}</p></div>`;
  }

  const footer = "</body></html>";
  const sourceHTML = header + bodyContent + footer;

  const blob = new Blob(['\ufeff', sourceHTML], {
      type: 'application/msword'
  });
  
  saveAs(blob, 'Draft_Skripsi_Chapter.doc');
};