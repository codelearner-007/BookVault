/*
  Print and PDF of a document card ([data-document-paper]): both render a clean copy of the card in the
  light paper palette (.paper-light re-declares the light tokens), so the output never carries app chrome
  or the dark theme. PDF is made in the browser (html2canvas-pro + jsPDF, loaded on demand): no server or
  external service.
*/

const PRINT_ROOT_ID = 'bv-print-root';
const PRINTING_CLASS = 'bv-printing';
const A4 = { widthMm: 210, heightMm: 297, marginMm: 14 };
// A4 content width at 96 dpi (210mm - 2 x 14mm), so the PDF copy wraps like the printed page.
const PAPER_WIDTH_PX = 688;
const PDF_SCALE = 2;

export const DOCUMENT_PAPER_SELECTOR = '[data-document-paper]';

// The copy ends with a footer: the business contact (rendered hidden by DocumentHeader) and the generated date.
function paperCopy(node) {
  const root = document.createElement('div');
  root.id = PRINT_ROOT_ID;
  root.className = 'paper-light';
  const copy = node.cloneNode(true);
  const footer = document.createElement('footer');
  footer.setAttribute('data-print-page-footer', '');
  const contact = copy.querySelector('[data-print-footer]');
  if (contact) footer.appendChild(contact);
  const generated = document.createElement('p');
  generated.textContent = `Generated ${new Date().toLocaleDateString(undefined, { dateStyle: 'medium' })}`;
  footer.appendChild(generated);
  copy.appendChild(footer);
  root.appendChild(copy);
  document.body.appendChild(root);
  return root;
}

// A CSS colour token as [r, g, b] for jsPDF (the browser resolves oklch through a canvas pixel).
function tokenRgb(root, token) {
  const probe = document.createElement('canvas').getContext('2d');
  probe.fillStyle = getComputedStyle(root).getPropertyValue(token).trim();
  probe.fillRect(0, 0, 1, 1);
  return Array.from(probe.getImageData(0, 0, 1, 1).data.slice(0, 3));
}

export function printDocument(node) {
  const root = paperCopy(node);
  const html = document.documentElement;
  html.classList.add(PRINTING_CLASS);
  const cleanup = () => {
    html.classList.remove(PRINTING_CLASS);
    root.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

function safeFileName(name) {
  return `${name.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'document'}.pdf`;
}

export async function downloadPdf(node, name) {
  const [{ default: html2canvas }, { jsPDF: JsPdf }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
  const root = paperCopy(node);
  root.classList.add('bv-pdf-root');
  root.style.width = `${PAPER_WIDTH_PX}px`;
  try {
    const background = getComputedStyle(root).backgroundColor;
    const canvas = await html2canvas(root, { scale: PDF_SCALE, backgroundColor: background, logging: false });
    const muted = tokenRgb(root, '--muted-foreground');
    const pdf = new JsPdf({ unit: 'mm', format: 'a4' });
    const contentWidth = A4.widthMm - 2 * A4.marginMm;
    const pageHeight = A4.heightMm - 2 * A4.marginMm;
    const pxPerMm = canvas.width / contentWidth;
    const slicePx = Math.floor(pageHeight * pxPerMm);
    for (let top = 0, page = 0; top < canvas.height; top += slicePx, page += 1) {
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = Math.min(slicePx, canvas.height - top);
      slice.getContext('2d').drawImage(canvas, 0, top, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/png'), 'PNG', A4.marginMm, A4.marginMm, contentWidth, slice.height / pxPerMm);
    }
    const pages = pdf.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      pdf.setPage(page);
      pdf.setFontSize(8);
      pdf.setTextColor(...muted);
      pdf.text(`Page ${page} of ${pages}`, A4.widthMm - A4.marginMm, A4.heightMm - A4.marginMm / 2, { align: 'right' });
    }
    pdf.save(safeFileName(name));
  } finally {
    root.remove();
  }
}
