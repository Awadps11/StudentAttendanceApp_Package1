import type PDFDocument from 'pdfkit';
// Twitter CLDR for BiDi reordering
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TwitterCldrLoader = require('twitter_cldr');
const TwitterCldr = TwitterCldrLoader.load('ar');

export function shapeRTL(input: string): string {
  const txt = String(input || '');
  try {
    const bidiText = TwitterCldr.Bidi.from_string(txt, { direction: 'RTL' });
    bidiText.reorder_visually();
    return bidiText.toString();
  } catch {
    return txt; // fallback
  }
}

export function writeText(doc: PDFDocument, text: string, lang: 'ar' | 'en', options: any = {}) {
  const opts = { ...options };
  if (lang === 'ar') {
    opts.features = Array.isArray(opts.features) ? Array.from(new Set([...opts.features, 'rtla'])) : ['rtla'];
    // Align to right by default for Arabic unless explicitly provided
    if (!('align' in opts)) opts.align = 'right';
    const shaped = shapeRTL(text);
    return (doc as any).text(shaped, opts);
  }
  return (doc as any).text(text, opts);
}

export function writeTextAt(doc: PDFDocument, text: string, lang: 'ar' | 'en', x: number, y: number, options: any = {}) {
  const opts = { ...options };
  if (lang === 'ar') {
    opts.features = Array.isArray(opts.features) ? Array.from(new Set([...opts.features, 'rtla'])) : ['rtla'];
    if (!('align' in opts)) opts.align = 'right';
    const shaped = shapeRTL(text);
    return (doc as any).text(shaped, x, y, opts);
  }
  return (doc as any).text(text, x, y, opts);
}
