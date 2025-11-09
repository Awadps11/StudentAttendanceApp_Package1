const puppeteer = require('puppeteer');

/**
 * Render HTML (string or URL) to a PDF file using Chromium (Puppeteer).
 * @param {string} htmlOrUrl - Raw HTML string or a URL (http/https/file).
 * @param {string} outPath - Absolute or relative path of the output PDF file.
 * @param {object} options - Optional settings: { format, margin, printBackground, timeoutMs }
 * @returns {Promise<void>}
 */
async function exportHtmlPdf(htmlOrUrl, outPath, options = {}) {
  const format = options.format || 'A4';
  const margin = options.margin || { top: '12mm', bottom: '16mm', left: '12mm', right: '12mm' };
  const printBackground = options.printBackground !== false; // default true
  const timeoutMs = options.timeoutMs || 30000;

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(timeoutMs);
    if (/^https?:\/\//i.test(htmlOrUrl) || /^file:\/\//i.test(htmlOrUrl)) {
      await page.goto(htmlOrUrl, { waitUntil: 'networkidle0' });
    } else {
      await page.setContent(htmlOrUrl, { waitUntil: 'networkidle0' });
    }
    await page.pdf({ path: outPath, format, printBackground, margin });
  } finally {
    await browser.close();
  }
}

module.exports = { exportHtmlPdf };

