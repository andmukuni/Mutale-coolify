import { renderCvDocumentHtml } from '../../shared/cvDocumentHtml.js';

const PRINT_DELAY_MS = 400;
const PRINT_IFRAME_CLEANUP_MS = 20_000;

let activePrintIframe = null;

/**
 * Open rendered CV HTML in a hidden iframe and trigger the browser print dialog (Save as PDF).
 * @param {string} html
 */
export function openHtmlForPrint(html) {
  if (!html?.trim()) {
    throw new Error('Could not generate CV for download.');
  }

  if (activePrintIframe?.parentNode) {
    activePrintIframe.remove();
    activePrintIframe = null;
  }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'CV print');
  iframe.setAttribute('sandbox', 'allow-same-origin allow-modals');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;height:1123px;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  activePrintIframe = iframe;

  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) iframe.remove();
      if (activePrintIframe === iframe) activePrintIframe = null;
    }, PRINT_IFRAME_CLEANUP_MS);
  };

  const triggerPrint = () => {
    const win = iframe.contentWindow;
    if (!win?.print) {
      iframe.remove();
      if (activePrintIframe === iframe) activePrintIframe = null;
      return openHtmlForPrintInPopup(html);
    }
    win.focus();
    win.print();
    cleanup();
  };

  iframe.onload = () => {
    setTimeout(triggerPrint, PRINT_DELAY_MS);
  };

  iframe.srcdoc = html;
}

/**
 * Fallback: new tab without noopener so document.write remains available.
 * @param {string} html
 */
export function openHtmlForPrintInPopup(html) {
  const win = window.open('', '_blank');
  if (!win) {
    throw new Error('Pop-up blocked. Allow pop-ups to download or print your CV.');
  }

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();

  const schedulePrint = () => {
    setTimeout(() => {
      try {
        win.print();
      } catch {
        // User can print manually from the new tab
      }
    }, PRINT_DELAY_MS);
  };

  if (win.document.readyState === 'complete') {
    schedulePrint();
  } else {
    win.addEventListener('load', schedulePrint, { once: true });
  }
}

/**
 * Open CV in print view for save as PDF.
 * @param {object} opts
 * @param {string} [opts.html] - Pre-rendered HTML (avoids duplicate render when preview exists)
 */
export function openCvForPrint(opts) {
  const html = opts.html?.trim()
    ? opts.html
    : renderCvDocumentHtml({
      user: opts.user,
      certificates: opts.certificates,
      developmentEvents: opts.developmentEvents,
      templateId: opts.templateId,
      profilePhotoUrl: opts.profilePhotoUrl,
    });
  openHtmlForPrint(html);
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Download CV as Word (.docx).
 * @param {object} opts
 */
export async function downloadCvDocx(opts) {
  const { buildCvDocxBlobWithFilename } = await import('../../shared/cvDocx.js');
  const { blob, filename } = await buildCvDocxBlobWithFilename({
    user: opts.user,
    certificates: opts.certificates,
    developmentEvents: opts.developmentEvents,
    templateId: opts.templateId,
  });
  triggerBlobDownload(blob, filename);
}
