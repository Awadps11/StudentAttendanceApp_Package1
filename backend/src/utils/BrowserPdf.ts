import puppeteer from 'puppeteer';

export type BrowserPdfOptions = {
  executablePath?: string;
  headerTemplate?: string;
  footerTemplate?: string;
  margin?: { top?: string; bottom?: string; left?: string; right?: string };
};

export async function exportHtmlPdf(html: string, outPath: string, opts: BrowserPdfOptions = {}) {
  const executablePath = opts.executablePath || process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath,
    args: ['--no-sandbox','--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const displayHeaderFooter = !!(opts.headerTemplate || opts.footerTemplate);
  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter,
    headerTemplate: opts.headerTemplate || '<div></div>',
    footerTemplate: opts.footerTemplate || '<div></div>',
    margin: opts.margin || { top: '12mm', bottom: '16mm', left: '12mm', right: '12mm' }
  });
  await browser.close();
}
