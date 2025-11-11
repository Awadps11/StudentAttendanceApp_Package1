import { Router } from 'express';
import { all, get } from '../services/Db';
import { DateTime } from 'luxon';
import { writeText, writeTextAt } from '../utils/Text';
import ExcelJS from 'exceljs';
import { exportHtmlPdf } from '../utils/BrowserPdf';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const router = Router();

router.get('/daily', async (req, res) => {
  try {
    const dateStr = String(req.query.date || '');
    const cls = String(req.query.class || '');
    const section = String(req.query.section || '');
    const studentId = Number(req.query.student_id || 0);
    const zone = process.env.TZ || 'local';
    const base = dateStr ? DateTime.fromISO(dateStr, { zone }) : DateTime.now().setZone(zone);
    const dayStart = base.startOf('day').toISO();
    const dayEnd = base.endOf('day').toISO();
    const whereParts: string[] = [];
    const whereParams: any[] = [];
    if (cls) { whereParts.push('s.class = ?'); whereParams.push(cls); }
    if (section) { whereParts.push('s.section = ?'); whereParams.push(section); }
    if (studentId) { whereParts.push('s.id = ?'); whereParams.push(studentId); }
    const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const params: any[] = [...whereParams, dayStart, dayEnd];
    const sql = `SELECT s.name, s.class, s.section, a.status, a.late_minutes
       FROM students s
       ${where}
       LEFT JOIN (
         SELECT * FROM attendance_logs WHERE timestamp BETWEEN ? AND ?
       ) a ON a.student_id = s.id
       ORDER BY s.name ASC`;
    const rows = await all<any>(sql, params);
    res.json({ date: base.toISO().slice(0,10), records: rows });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/daily/export', async (req, res) => {
  try {
    const format = String(req.query.format || 'excel');
    const engineEnv = String(process.env.PDF_ENGINE || '').toLowerCase();
    const renderer = String(req.query.renderer || engineEnv || 'puppeteer');
    const dateStr = String(req.query.date || '');
    const cls = String(req.query.class || '');
    const section = String(req.query.section || '');
    const lang = String(req.query.lang || 'ar');
    const studentId = Number(req.query.student_id || 0);
    const zone = process.env.TZ || 'local';
    const base = dateStr ? DateTime.fromISO(dateStr, { zone }) : DateTime.now().setZone(zone);
    const dayStart = base.startOf('day').toISO();
    const dayEnd = base.endOf('day').toISO();
    const whereParts: string[] = [];
    const whereParams: any[] = [];
    if (cls) { whereParts.push('s.class = ?'); whereParams.push(cls); }
    if (section) { whereParts.push('s.section = ?'); whereParams.push(section); }
    if (studentId) { whereParts.push('s.id = ?'); whereParams.push(studentId); }
    const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const params: any[] = [...whereParams, dayStart, dayEnd];
    const sql = `SELECT s.name, s.class, s.section, a.status, a.late_minutes
       FROM students s
       ${where}
       LEFT JOIN (
         SELECT * FROM attendance_logs WHERE timestamp BETWEEN ? AND ?
       ) a ON a.student_id = s.id
       ORDER BY s.name ASC`;
    const rows = await all<any>(sql, params);
    const reportsDir = path.resolve(__dirname, '../../reports/saved');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
    const baseName = `daily_${base.toFormat('yyyy-LL-dd')}_${lang}`;
    if (format === 'pdf') {
      // Prefer browser-based rendering (Puppeteer) for robust RTL; fallback to PDFKit
      const fontsDir = path.resolve(__dirname, '../../assets/fonts');
      const cfg = await get<{ value: string }>(`SELECT value FROM settings WHERE key='pdfFont'`);
      const candidates = ['Amiri-Regular.ttf','NotoNaskhArabic-Regular.ttf','Cairo-Regular.ttf','Tajawal-Regular.ttf'];
      const chosen = cfg?.value && fs.existsSync(path.join(fontsDir, cfg.value)) ? cfg.value : (candidates.find(f => fs.existsSync(path.join(fontsDir, f))) || '');
      const fontUrl = chosen ? ('file:///' + path.join(fontsDir, chosen).replace(/\\/g,'/')) : '';
      const nowStr = DateTime.now().toFormat('yyyy-MM-dd hh:mm a');
      const isRtl = lang === 'ar';
      const html = `<!doctype html><html lang="${lang}" ${isRtl ? 'dir="rtl"' : ''}><head><meta charset="utf-8"/><style>
        @page{ margin:12mm }
        body{ font-family: ${chosen ? '"Amiri","Tajawal","NotoNaskhArabic", sans-serif' : 'Tajawal, sans-serif'}; }
        ${fontUrl ? `@font-face{ font-family:'Amiri'; src:url('${fontUrl}') format('truetype'); font-weight:400; font-style:normal; }` : ''}
        h1{ text-align:center; margin:0 0 8px; }
        .meta{ font-size:12px; margin-bottom:8px; ${isRtl ? 'text-align:right' : 'text-align:left'} }
        table{ width:100%; border-collapse:collapse; }
        th,td{ border:1px solid #ccc; padding:6px; ${isRtl ? 'text-align:right' : 'text-align:left'} }
        th{ background:#eee; }
        .credit{ position:fixed; left:12mm; bottom:8mm; font-size:11px; }
      </style></head><body>
        <div class="meta">${isRtl ? 'تاريخ التصدير' : 'Exported'}: ${nowStr}</div>
        <h1>${isRtl ? 'التقرير اليومي للحضور' : 'Daily Attendance Report'}</h1>
        <table><thead><tr>${isRtl ? '<th>الاسم</th><th>الصف</th><th>الشعبة</th><th>الحالة</th><th>التأخر بالدقيقة</th>' : '<th>Name</th><th>Class</th><th>Section</th><th>Status</th><th>Late (min)</th>'}</tr></thead><tbody>
        ${rows.map(r => `<tr><td>${r.name||''}</td><td>${r.class||''}</td><td>${r.section||''}</td><td>${isRtl ? (r.status||'غياب') : (r.status||'Absent')}</td><td>${r.late_minutes||0}</td></tr>`).join('')}
        </tbody></table>
        <div class="credit">${isRtl ? 'حقوق البرمجة: عوض لافي الزبيدي – مدرسة الفاروق بالمظيلف' : 'Programming Rights: Awad Lafi Al-Zubaidi – Al-Farouq School, Al-Muzaylif'}</div>
      </body></html>`;
      const file = path.join(reportsDir, baseName + '.pdf');
      if (renderer === 'puppeteer') {
        try {
          const headerTemplate = `<div style="font-size:10px; width:100%; ${isRtl ? 'text-align:right' : 'text-align:left'}; padding:4mm 6mm;">${isRtl ? 'التقرير اليومي للحضور' : 'Daily Attendance Report'}</div>`;
          const footerTemplate = `<div style="font-size:10px; width:100%; ${isRtl ? 'text-align:left' : 'text-align:right'}; padding:4mm 6mm;">${isRtl ? 'صفحة' : 'Page'} <span class="pageNumber"></span> / <span class="totalPages"></span></div>`;
          await exportHtmlPdf(html, file, {
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
            headerTemplate,
            footerTemplate,
            margin: { top: '16mm', bottom: '16mm', left: '12mm', right: '12mm' },
          });
          return res.json({ ok: true, file: `/saved-reports/${encodeURIComponent(baseName + '.pdf')}` });
        } catch (e) {
          console.warn('Puppeteer PDF failed, falling back to PDFKit:', (e as Error).message);
          // fall through to pdfkit
        }
      }
      // PDFKit fallback or explicit selection
      const doc = new PDFDocument({ size: 'A4' });
      const stream = fs.createWriteStream(file);
      doc.pipe(stream);
      // Load Arabic font if available or use configured pdfFont
      if (lang === 'ar') {
        try {
          const fontsDir = path.resolve(__dirname, '../../assets/fonts');
          const cfg = await get<{ value: string }>(`SELECT value FROM settings WHERE key='pdfFont'`);
          if (cfg?.value && fs.existsSync(path.join(fontsDir, cfg.value))) {
            doc.font(path.join(fontsDir, cfg.value));
          } else {
            const candidates = ['Amiri-Regular.ttf','NotoNaskhArabic-Regular.ttf','Cairo-Regular.ttf','Tajawal-Regular.ttf'];
            const found = candidates.find(f => fs.existsSync(path.join(fontsDir, f)));
            if (found) doc.font(path.join(fontsDir, found));
          }
        } catch {}
      }
      // Reuse the already computed nowStr for consistency
      if (lang === 'ar') {
        doc.fontSize(12); writeText(doc, `تاريخ التصدير: ${DateTime.now().toFormat('yyyy-MM-dd hh:mm a')}`, 'ar', { align: 'left' });
        doc.moveDown();
        doc.fontSize(18); writeText(doc, 'تقرير الحضور والغياب اليوم', 'ar', { align: 'center' });
      } else {
        doc.fontSize(12).text(`Exported: ${nowStr}`, { align: 'left' });
        doc.moveDown();
        doc.fontSize(18).text('Daily Attendance Report', { align: 'center' });
      }
      doc.moveDown();
      rows.forEach(r => {
        if (lang === 'ar') {
          doc.fontSize(12); writeText(doc, `${r.name} - ${r.class}${r.section ? ' / '+r.section : ''} - الحالة: ${r.status||'غياب'} - التأخر: ${r.late_minutes||0} دقيقة`, 'ar');
        } else {
          const statusText = r.status || 'Absent';
          doc.fontSize(12).text(`${r.name} - ${r.class}${r.section ? ' / '+r.section : ''} - Status: ${statusText} - Late: ${r.late_minutes||0} min`);
        }
      });
      // Small credit bottom-left
      const creditAr = 'حقوق البرمجة: عوض لافي الزبيدي – مدرسة الفاروق بالمظيلف';
      const creditEn = 'Programming Rights: Awad Lafi Al-Zubaidi – Al-Farouq School, Al-Muzaylif';
      doc.fontSize(9);
      if (lang==='ar') { writeTextAt(doc, creditAr, 'ar', 40, (doc as any).page.height - 40, { align: 'left' }); }
      else { doc.text(creditEn, 40, (doc as any).page.height - 40, { align: 'left' }); }
      doc.end();
      stream.on('finish', () => res.json({ ok: true, file: `/saved-reports/${encodeURIComponent(baseName + '.pdf')}` }));
    } else {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Daily');
      // Freeze header row and enable autofilter
      ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
      if (lang === 'ar') {
        ws.addRow(['الاسم','الصف','الشعبة','الحالة','التأخر بالدقيقة']);
        rows.forEach(r => ws.addRow([r.name, r.class, r.section, r.status || 'غياب', r.late_minutes || 0]));
        ws.addRow([]);
        ws.addRow(['حقوق البرمجة: عوض لافي الزبيدي – مدرسة الفاروق بالمظيلف']);
      } else {
        ws.addRow(['Name','Class','Section','Status','Late (min)']);
        rows.forEach(r => ws.addRow([r.name, r.class, r.section, r.status || 'Absent', r.late_minutes || 0]));
        ws.addRow([]);
        ws.addRow(['Programming Rights: Awad Lafi Al-Zubaidi – Al-Farouq School, Al-Muzaylif']);
      }
      // Apply simple conditional formatting for Late column (E) > 0, if supported
      try {
        const lastDataRow = 1 + rows.length; // header + rows
        (ws as any).addConditionalFormatting?.({
          ref: `E2:E${lastDataRow}`,
          rules: [{
            type: 'cellIs',
            operator: 'greaterThan',
            formulae: ['0'],
            style: {
              fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } },
              font: { color: { argb: 'FF9C0006' } },
            },
          }],
        });
      } catch {}
      // Add totals row for Late minutes
      const totalsRow = ws.addRow(['', '', '', lang==='ar' ? 'الإجمالي' : 'Total', { formula: `SUM(E2:E${1 + rows.length})`, result: rows.reduce((a, r) => a + (r.late_minutes || 0), 0) }]);
      totalsRow.font = { bold: true } as any;
      const file = path.join(reportsDir, baseName + '.xlsx');
      await wb.xlsx.writeFile(file);
      res.json({ ok: true, file: `/saved-reports/${encodeURIComponent(baseName + '.xlsx')}` });
    }
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

// Student range report (JSON)
// GET /api/reports/student?student_id=1&from=2025-01-01&to=2025-01-31
router.get('/student', async (req, res) => {
  try {
    const studentId = Number(req.query.student_id || 0);
    if (!studentId) return res.status(400).json({ error: 'student_id required' });
    const zone = process.env.TZ || 'local';
    const fromStr = String(req.query.from || '');
    const toStr = String(req.query.to || '');
    const from = fromStr ? DateTime.fromISO(fromStr, { zone }) : DateTime.now().setZone(zone).minus({ days: 30 });
    const to = toStr ? DateTime.fromISO(toStr, { zone }) : DateTime.now().setZone(zone);
    const fromIso = from.startOf('day').toISO();
    const toIso = to.endOf('day').toISO();
    const student = await get<any>(`SELECT id, name, class, section, national_id, guardian_phone, device_user_id FROM students WHERE id = ?`, [studentId]);
    if (!student) return res.status(404).json({ error: 'student not found' });
    // Fetch logs in range
    const rows = await all<any>(`SELECT DATE(timestamp) as day, status, late_minutes FROM attendance_logs WHERE student_id = ? AND timestamp BETWEEN ? AND ? ORDER BY timestamp ASC`, [studentId, fromIso, toIso]);
    const byDay = new Map<string, any>();
    (rows || []).forEach(r => { byDay.set(String(r.day), r); });
    // Load weekly holidays and vacations
    let weekly: number[] = [];
    let vacations: Array<{ from: string; to: string }> = [];
    try {
      const w = await get<{ value: string }>(`SELECT value FROM settings WHERE key='weeklyHolidays'`);
      weekly = w?.value ? JSON.parse(w.value) : [];
      const v = await get<{ value: string }>(`SELECT value FROM settings WHERE key='vacations'`);
      vacations = v?.value ? JSON.parse(v.value) : [];
    } catch {}
    // Build full list excluding weekly holidays and vacations
    const full: any[] = [];
    let cursor = from.startOf('day');
    const end = to.endOf('day');
    while (cursor <= end) {
      const isoDate = cursor.toISO().slice(0,10);
      const weekday = cursor.weekday; // 1=Mon .. 7=Sun
      const isWeeklyHoliday = weekly.includes(weekday);
      const isVacationDay = (vacations||[]).some(r => isoDate >= String(r.from||'') && isoDate <= String(r.to||''));
      if (!isWeeklyHoliday && !isVacationDay) {
        const found = byDay.get(isoDate);
        if (found && found.status === 'present') {
          full.push({ day: isoDate, status: 'present', late_minutes: found.late_minutes || 0 });
        } else {
          full.push({ day: isoDate, status: 'absent', late_minutes: 0 });
        }
      }
      cursor = cursor.plus({ days: 1 }).startOf('day');
    }
    // Totals based on weekdays only
    const present = full.filter(r => r.status === 'present').length;
    const late = full.filter(r => r.status === 'present' && (r.late_minutes||0) > 0).length;
    const total_late_minutes = full.reduce((acc, r) => acc + (r.status === 'present' ? (r.late_minutes||0) : 0), 0);
    const absent = full.filter(r => r.status !== 'present').length;
    const totals = { present, late, total_late_minutes, absent };
    res.json({ ok: true, student, from: fromIso.slice(0,10), to: toIso.slice(0,10), records: full, totals });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

// Student range export (Excel/PDF)
// GET /api/reports/student/export?student_id=1&from=YYYY-MM-DD&to=YYYY-MM-DD&format=excel|pdf&lang=ar|en
router.get('/student/export', async (req, res) => {
  try {
    const studentId = Number(req.query.student_id || 0);
    if (!studentId) return res.status(400).json({ error: 'student_id required' });
    const fromStr = String(req.query.from || '');
    const toStr = String(req.query.to || '');
    const format = String(req.query.format || 'excel');
    const renderer = String(req.query.renderer || 'pdfkit');
    const lang = String(req.query.lang || 'ar');
    const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 30*24*60*60*1000);
    const to = toStr ? new Date(toStr) : new Date();
    const fromIso = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0,0,0).toISOString();
    const toIso = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23,59,59).toISOString();
    const student = await get<any>(`SELECT id, name, class, section FROM students WHERE id = ?`, [studentId]);
    if (!student) return res.status(404).json({ error: 'student not found' });
    const rows = await all<any>(`SELECT DATE(timestamp) as day, status, late_minutes FROM attendance_logs WHERE student_id = ? AND timestamp BETWEEN ? AND ? ORDER BY timestamp ASC`, [studentId, fromIso, toIso]);
    const reportsDir = path.resolve(__dirname, '../../reports/saved');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
    const baseName = `student_${studentId}_${fromIso.slice(0,10)}_${toIso.slice(0,10)}`;
    if (format === 'pdf') {
      const fontsDir = path.resolve(__dirname, '../../assets/fonts');
      const cfg = await get<{ value: string }>(`SELECT value FROM settings WHERE key='pdfFont'`);
      const candidates = ['Amiri-Regular.ttf','NotoNaskhArabic-Regular.ttf','Cairo-Regular.ttf','Tajawal-Regular.ttf'];
      const chosen = cfg?.value && fs.existsSync(path.join(fontsDir, cfg.value)) ? cfg.value : (candidates.find(f => fs.existsSync(path.join(fontsDir, f))) || '');
      const fontUrl = chosen ? ('file:///' + path.join(fontsDir, chosen).replace(/\\/g,'/')) : '';
      const nowStr = DateTime.now().toFormat('yyyy-MM-dd hh:mm a');
      const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><style>
        body{ font-family: ${chosen ? '"Amiri","Tajawal","NotoNaskhArabic", sans-serif' : 'Tajawal, sans-serif'}; }
        ${fontUrl ? `@font-face{ font-family:'Amiri'; src:url('${fontUrl}') format('truetype'); font-weight:400; font-style:normal; }` : ''}
        h1{ text-align:center; margin:0 0 8px; }
        .meta{ font-size:12px; margin-bottom:8px; }
        table{ width:100%; border-collapse:collapse; }
        th,td{ border:1px solid #ccc; padding:6px; text-align:right; }
        th{ background:#eee; }
        .credit{ position:fixed; left:12mm; bottom:8mm; font-size:11px; }
      </style></head><body>
        <div class="meta">تاريخ التصدير: ${nowStr}</div>
        <h1>تقرير الطالب حسب الفترة</h1>
        <div class="meta">الاسم: ${student.name} | الصف: ${student.class} / الشعبة: ${student.section || ''} | الفترة: ${fromIso.slice(0,10)} - ${toIso.slice(0,10)}</div>
        <table><thead><tr><th>التاريخ</th><th>الحالة</th><th>التأخر بالدقيقة</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${r.day}</td><td>${r.status||'غياب'}</td><td>${r.late_minutes||0}</td></tr>`).join('')}
        </tbody></table>
        <div class="credit">حقوق البرمجة: عوض لافي الزبيدي – مدرسة الفاروق بالمظيلف</div>
      </body></html>`;
      const file = path.join(reportsDir, baseName + '.pdf');
      await exportHtmlPdf(html, file);
      return res.json({ ok: true, file: `/saved-reports/${encodeURIComponent(baseName + '.pdf')}` });
    } else if (format === 'pdf') {
      const file = path.join(reportsDir, baseName + '.pdf');
      const doc = new PDFDocument({ size: 'A4' });
      const stream = fs.createWriteStream(file);
      doc.pipe(stream);
      if (lang === 'ar') {
        try {
          const fontsDir = path.resolve(__dirname, '../../assets/fonts');
          const cfg = await get<{ value: string }>(`SELECT value FROM settings WHERE key='pdfFont'`);
          if (cfg?.value && fs.existsSync(path.join(fontsDir, cfg.value))) {
            doc.font(path.join(fontsDir, cfg.value));
          } else {
            const candidates = ['Amiri-Regular.ttf','NotoNaskhArabic-Regular.ttf','Cairo-Regular.ttf','Tajawal-Regular.ttf'];
            const found = candidates.find(f => fs.existsSync(path.join(fontsDir, f)));
            if (found) doc.font(path.join(fontsDir, found));
          }
        } catch {}
      }
      const nowStrSR = DateTime.now().toFormat('yyyy-MM-dd hh:mm a');
      if (lang === 'ar') {
        doc.fontSize(12); writeText(doc, `تاريخ التصدير: ${nowStrSR}`, 'ar', { align: 'left' });
        doc.moveDown();
        doc.fontSize(18); writeText(doc, 'تقرير الطالب حسب الفترة', 'ar', { align: 'center' });
      } else {
        doc.fontSize(12).text(`Exported: ${nowStrSR}`, { align: 'left' });
        doc.moveDown();
        doc.fontSize(18).text('Student Report (Range)', { align: 'center' });
      }
      doc.moveDown();
      if (lang === 'ar') {
        doc.fontSize(12); writeText(doc, `الاسم: ${student.name}`, 'ar');
        doc.fontSize(12); writeText(doc, `الصف: ${student.class} / الشعبة: ${student.section || ''}`, 'ar');
        doc.fontSize(12); writeText(doc, `من: ${fromIso.slice(0,10)} إلى: ${toIso.slice(0,10)}`, 'ar');
      } else {
        doc.fontSize(12).text(`Name: ${student.name}`);
        doc.fontSize(12).text(`Class: ${student.class} / Section: ${student.section || ''}`);
        doc.fontSize(12).text(`From: ${fromIso.slice(0,10)} To: ${toIso.slice(0,10)}`);
      }
      doc.moveDown();
      rows.forEach(r => {
        if (lang === 'ar') {
          doc.fontSize(12); writeText(doc, `${r.day} - الحالة: ${r.status||'غياب'} - التأخر: ${r.late_minutes||0} دقيقة`, 'ar');
        } else {
          const statusText = r.status || 'Absent';
          doc.fontSize(12).text(`${r.day} - Status: ${statusText} - Late: ${r.late_minutes||0} min`);
        }
      });
      // Small credit bottom-left
      const creditAr2 = 'حقوق البرمجة: عوض لافي الزبيدي – مدرسة الفاروق بالمظيلف';
      const creditEn2 = 'Programming Rights: Awad Lafi Al-Zubaidi – Al-Farouq School, Al-Muzaylif';
      doc.fontSize(9);
      if (lang==='ar') { writeTextAt(doc, creditAr2, 'ar', 40, (doc as any).page.height - 40, { align: 'left' }); }
      else { doc.text(creditEn2, 40, (doc as any).page.height - 40, { align: 'left' }); }
      doc.end();
      stream.on('finish', () => res.json({ ok: true, file }));
    } else {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('StudentRange');
      if (lang === 'ar') {
        ws.addRow(['الاسم', student.name]);
        ws.addRow(['الصف/الشعبة', `${student.class} / ${student.section || ''}`]);
        ws.addRow(['الفترة', `${fromIso.slice(0,10)} - ${toIso.slice(0,10)}`]);
        ws.addRow([]);
        ws.addRow(['التاريخ','الحالة','التأخر بالدقيقة']);
        rows.forEach(r => ws.addRow([r.day, r.status || 'غياب', r.late_minutes || 0]));
        ws.addRow([]);
        ws.addRow(['حقوق البرمجة: عوض لافي الزبيدي – مدرسة الفاروق بالمظيلف']);
      } else {
        ws.addRow(['Name', student.name]);
        ws.addRow(['Class/Section', `${student.class} / ${student.section || ''}`]);
        ws.addRow(['Range', `${fromIso.slice(0,10)} - ${toIso.slice(0,10)}`]);
        ws.addRow([]);
        ws.addRow(['Date','Status','Late (min)']);
        rows.forEach(r => ws.addRow([r.day, r.status || 'Absent', r.late_minutes || 0]));
        ws.addRow([]);
        ws.addRow(['Programming Rights: Awad Lafi Al-Zubaidi – Al-Farouq School, Al-Muzaylif']);
      }
      const file = path.join(reportsDir, baseName + '.xlsx');
      await wb.xlsx.writeFile(file);
      res.json({ ok: true, file });
    }
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

// Class range report (summary per student)
// GET /api/reports/class?class=...&section=...&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/class', async (req, res) => {
  try {
    const cls = String(req.query.class || '').trim();
    const section = String(req.query.section || '').trim();
    if (!cls) return res.status(400).json({ error: 'class required' });
    const fromStr = String(req.query.from || '');
    const toStr = String(req.query.to || '');
    const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 30*24*60*60*1000);
    const to = toStr ? new Date(toStr) : new Date();
    const fromIso = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0,0,0).toISOString();
    const toIso = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23,59,59).toISOString();
    const whereParts: string[] = ['s.class = ?'];
    const params: any[] = [cls, fromIso, toIso];
    if (section) { whereParts.push('s.section = ?'); params.splice(1, 0, section); }
    const where = `WHERE ${whereParts.join(' AND ')}`;
    const rows = await all<any>(`SELECT s.id, s.name, s.class, s.section, a.timestamp, a.status, a.late_minutes
      FROM students s
      ${where}
      LEFT JOIN (
        SELECT * FROM attendance_logs WHERE timestamp BETWEEN ? AND ?
      ) a ON a.student_id = s.id
      ORDER BY s.name ASC`, params);
    const zone = process.env.TZ || 'local';
    // Weekly holidays and vacations from settings
    let weekly: number[] = [];
    let vacations: Array<{ from: string; to: string }> = [];
    try {
      const w = await get<{ value: string }>(`SELECT value FROM settings WHERE key='weeklyHolidays'`);
      weekly = w?.value ? JSON.parse(w.value) : [];
      const v = await get<{ value: string }>(`SELECT value FROM settings WHERE key='vacations'`);
      vacations = v?.value ? JSON.parse(v.value) : [];
    } catch {}
    const summary = (rows as any[]).reduce((map, r) => {
      const key = r.id;
      if (!map[key]) map[key] = { id: r.id, name: r.name, class: r.class, section: r.section, present: 0, late: 0, total_late_minutes: 0 };
      if (r.status === 'present') {
        if (r.timestamp) {
          try {
            const wd = DateTime.fromISO(String(r.timestamp), { zone }).weekday;
            const dateStr = String(r.timestamp).slice(0,10);
            const isWeeklyHoliday = weekly.includes(wd);
            const isVacationDay = (vacations||[]).some(vr => dateStr >= String(vr.from||'') && dateStr <= String(vr.to||''));
            if (isWeeklyHoliday || isVacationDay) return map;
          } catch {}
        }
        map[key].present += 1;
        if ((r.late_minutes||0) > 0) map[key].late += 1;
        map[key].total_late_minutes += (r.late_minutes||0);
      }
      return map;
    }, {} as Record<string, any>);
    res.json({ ok: true, from: fromIso.slice(0,10), to: toIso.slice(0,10), class: cls, section, students: Object.values(summary) });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

// Class range export (Excel/PDF)
// GET /api/reports/class/export?class=...&section=...&from=YYYY-MM-DD&to=YYYY-MM-DD&format=excel|pdf&lang=ar|en
router.get('/class/export', async (req, res) => {
  try {
    const cls = String(req.query.class || '').trim();
    const section = String(req.query.section || '').trim();
    if (!cls) return res.status(400).json({ error: 'class required' });
    const fromStr = String(req.query.from || '');
    const toStr = String(req.query.to || '');
    const format = String(req.query.format || 'excel');
    const renderer = String(req.query.renderer || 'pdfkit');
    const lang = String(req.query.lang || 'ar');
    const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 30*24*60*60*1000);
    const to = toStr ? new Date(toStr) : new Date();
    const fromIso = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0,0,0).toISOString();
    const toIso = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23,59,59).toISOString();
    const whereParts: string[] = ['s.class = ?'];
    const params: any[] = [cls, fromIso, toIso];
    if (section) { whereParts.push('s.section = ?'); params.splice(1, 0, section); }
    const where = `WHERE ${whereParts.join(' AND ')}`;
    const rows = await all<any>(`SELECT s.id, s.name, s.class, s.section, a.timestamp, a.status, a.late_minutes
      FROM students s
      ${where}
      LEFT JOIN (
        SELECT * FROM attendance_logs WHERE timestamp BETWEEN ? AND ?
      ) a ON a.student_id = s.id
      ORDER BY s.name ASC`, params);
    const zoneCR = process.env.TZ || 'local';
    // Weekly holidays and vacations from settings
    let weekly: number[] = [];
    let vacations: Array<{ from: string; to: string }> = [];
    try {
      const w = await get<{ value: string }>(`SELECT value FROM settings WHERE key='weeklyHolidays'`);
      weekly = w?.value ? JSON.parse(w.value) : [];
      const v = await get<{ value: string }>(`SELECT value FROM settings WHERE key='vacations'`);
      vacations = v?.value ? JSON.parse(v.value) : [];
    } catch {}
    const summary = (rows as any[]).reduce((map, r) => {
      const key = r.id;
      if (!map[key]) map[key] = { id: r.id, name: r.name, class: r.class, section: r.section, present: 0, late: 0, total_late_minutes: 0 };
      if (r.status === 'present') {
        if (r.timestamp) {
          try {
            const wd = DateTime.fromISO(String(r.timestamp), { zone: zoneCR }).weekday;
            const dateStr = String(r.timestamp).slice(0,10);
            const isWeeklyHoliday = weekly.includes(wd);
            const isVacationDay = (vacations||[]).some(vr => dateStr >= String(vr.from||'') && dateStr <= String(vr.to||''));
            if (isWeeklyHoliday || isVacationDay) return map;
          } catch {}
        }
        map[key].present += 1;
        if ((r.late_minutes||0) > 0) map[key].late += 1;
        map[key].total_late_minutes += (r.late_minutes||0);
      }
      return map;
    }, {} as Record<string, any>);
    const list = Object.values(summary) as any[];
    const reportsDir = path.resolve(__dirname, '../../reports/saved');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
    const baseName = `class_${cls}_${fromIso.slice(0,10)}_${toIso.slice(0,10)}`;
    if (format === 'pdf') {
      const fontsDir = path.resolve(__dirname, '../../assets/fonts');
      const cfg = await get<{ value: string }>(`SELECT value FROM settings WHERE key='pdfFont'`);
      const candidates = ['Amiri-Regular.ttf','NotoNaskhArabic-Regular.ttf','Cairo-Regular.ttf','Tajawal-Regular.ttf'];
      const chosen = cfg?.value && fs.existsSync(path.join(fontsDir, cfg.value)) ? cfg.value : (candidates.find(f => fs.existsSync(path.join(fontsDir, f))) || '');
      const fontUrl = chosen ? ('file:///' + path.join(fontsDir, chosen).replace(/\\/g,'/')) : '';
      const nowStr = DateTime.now().toFormat('yyyy-MM-dd hh:mm a');
      const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><style>
        body{ font-family: ${chosen ? '"Amiri","Tajawal","NotoNaskhArabic", sans-serif' : 'Tajawal, sans-serif'}; }
        ${fontUrl ? `@font-face{ font-family:'Amiri'; src:url('${fontUrl}') format('truetype'); font-weight:400; font-style:normal; }` : ''}
        h1{ text-align:center; margin:0 0 8px; }
        .meta{ font-size:12px; margin-bottom:8px; }
        table{ width:100%; border-collapse:collapse; }
        th,td{ border:1px solid #ccc; padding:6px; text-align:right; }
        th{ background:#eee; }
        .credit{ position:fixed; left:12mm; bottom:8mm; font-size:11px; }
      </style></head><body>
        <div class="meta">تاريخ التصدير: ${nowStr}</div>
        <h1>تقرير الصف حسب الفترة</h1>
        <div class="meta">الصف: ${cls}${section?` | الشعبة: ${section}`:''} | الفترة: ${fromIso.slice(0,10)} - ${toIso.slice(0,10)}</div>
        <table><thead><tr><th>الاسم</th><th>حضور</th><th>تأخر</th><th>مجموع التأخر</th></tr></thead><tbody>
        ${list.map(r => `<tr><td>${r.name}</td><td>${r.present}</td><td>${r.late}</td><td>${(function(){const m=Math.max(0,Number(r.total_late_minutes)||0);const h=Math.floor(m/60);const mm=m%60;return lang==='ar'?(h>0?`${h} ساعة ${mm} دقيقة`:`${mm} دقيقة`):(h>0?`${h}h ${mm}m`:`${mm} min`);})()}</td></tr>`).join('')}
        </tbody></table>
        <div class="credit">حقوق البرمجة: عوض لافي الزبيدي – مدرسة الفاروق بالمظيلف</div>
      </body></html>`;
      const file = path.join(reportsDir, baseName + '.pdf');
      await exportHtmlPdf(html, file);
      return res.json({ ok: true, file: `/saved-reports/${encodeURIComponent(baseName + '.pdf')}` });
    } else if (format === 'pdf') {
      const file = path.join(reportsDir, baseName + '.pdf');
      const doc = new PDFDocument({ size: 'A4' });
      const stream = fs.createWriteStream(file);
      doc.pipe(stream);
      if (lang === 'ar') {
        try {
          const fontsDir = path.resolve(__dirname, '../../assets/fonts');
          const cfg = await get<{ value: string }>(`SELECT value FROM settings WHERE key='pdfFont'`);
          if (cfg?.value && fs.existsSync(path.join(fontsDir, cfg.value))) {
            doc.font(path.join(fontsDir, cfg.value));
          } else {
            const candidates = ['Amiri-Regular.ttf','NotoNaskhArabic-Regular.ttf','Cairo-Regular.ttf','Tajawal-Regular.ttf'];
            const found = candidates.find(f => fs.existsSync(path.join(fontsDir, f)));
            if (found) doc.font(path.join(fontsDir, found));
          }
        } catch {}
      }
      const nowStrCR = DateTime.now().toFormat('yyyy-MM-dd hh:mm a');
      if (lang === 'ar') {
        doc.fontSize(12); writeText(doc, `تاريخ التصدير: ${nowStrCR}`, 'ar', { align: 'left' });
        doc.moveDown();
        doc.fontSize(18); writeText(doc, 'تقرير الصف حسب الفترة', 'ar', { align: 'center' });
      } else {
        doc.fontSize(12).text(`Exported: ${nowStrCR}`, { align: 'left' });
        doc.moveDown();
        doc.fontSize(18).text('Class Report (Range)', { align: 'center' });
      }
      doc.moveDown();
      const sub = section ? (lang === 'ar' ? `الشعبة: ${section}` : `Section: ${section}`) : '';
      if (lang === 'ar') { doc.fontSize(12); writeText(doc, `الصف: ${cls}${section ? ` | الشعبة: ${section}`: ''}`, 'ar'); doc.fontSize(12); writeText(doc, `الفترة: ${fromIso.slice(0,10)} - ${toIso.slice(0,10)}`, 'ar'); }
      else { doc.fontSize(12).text(`Class: ${cls} ${sub}`); doc.fontSize(12).text(`Range: ${fromIso.slice(0,10)} - ${toIso.slice(0,10)}`); }
      doc.moveDown();
      list.forEach(r => {
        const m = Math.max(0, Number(r.total_late_minutes)||0);
        const h = Math.floor(m/60);
        const mm = m % 60;
        const textAr = `مجموع التأخر: ${h>0?`${h} ساعة ${mm} دقيقة`:`${mm} دقيقة`}`;
        const textEn = `Total Late: ${h>0?`${h}h ${mm}m`:`${mm} min`}`;
        if (lang === 'ar') { doc.fontSize(12); writeText(doc, `${r.name} - حضور: ${r.present} - تأخر: ${r.late} - ${textAr}`, 'ar'); }
        else doc.fontSize(12).text(`${r.name} - Present: ${r.present} - Late: ${r.late} - ${textEn}`);
      });
      const creditAr3 = 'حقوق البرمجة: عوض لافي الزبيدي – مدرسة الفاروق بالمظيلف';
      const creditEn3 = 'Programming Rights: Awad Lafi Al-Zubaidi – Al-Farouq School, Al-Muzaylif';
      doc.fontSize(9);
      if (lang==='ar') { writeTextAt(doc, creditAr3, 'ar', 40, (doc as any).page.height - 40, { align: 'left' }); }
      else { doc.text(creditEn3, 40, (doc as any).page.height - 40, { align: 'left' }); }
      doc.end();
      stream.on('finish', () => res.json({ ok: true, file }));
    } else {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('ClassRange');
      if (lang === 'ar') {
        ws.addRow(['الصف', cls]); if (section) ws.addRow(['الشعبة', section]); ws.addRow(['الفترة', `${fromIso.slice(0,10)} - ${toIso.slice(0,10)}`]); ws.addRow([]);
        ws.addRow(['الاسم','حضور','تأخر','مجموع التأخر']);
        list.forEach(r => { const m=Math.max(0,Number(r.total_late_minutes)||0); const h=Math.floor(m/60); const mm=m%60; ws.addRow([r.name, r.present, r.late, h>0?`${h} ساعة ${mm} دقيقة`:`${mm} دقيقة`]); });
        ws.addRow([]); ws.addRow(['حقوق البرمجة: عوض لافي الزبيدي – مدرسة الفاروق بالمظيلف']);
      } else {
        ws.addRow(['Class', cls]); if (section) ws.addRow(['Section', section]); ws.addRow(['Range', `${fromIso.slice(0,10)} - ${toIso.slice(0,10)}`]); ws.addRow([]);
        ws.addRow(['Name','Present','Late','Total Late']);
        list.forEach(r => { const m=Math.max(0,Number(r.total_late_minutes)||0); const h=Math.floor(m/60); const mm=m%60; ws.addRow([r.name, r.present, r.late, h>0?`${h}h ${mm}m`:`${mm} min`]); });
        ws.addRow([]); ws.addRow(['Programming Rights: Awad Lafi Al-Zubaidi – Al-Farouq School, Al-Muzaylif']);
      }
      const file = path.join(reportsDir, baseName + '.xlsx');
      await wb.xlsx.writeFile(file);
      res.json({ ok: true, file });
    }
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});
// Export today's status (present/absent/not_yet) with filters, as PDF
router.get('/today/export', async (req, res) => {
  try {
    const zone = process.env.TZ || 'local';
    const cls = String(req.query.class || '').trim();
    const section = String(req.query.section || '').trim();
    const statusFilter = String(req.query.status || '').trim();
    const lang = String(req.query.lang || 'ar');
    const now = DateTime.now().setZone(zone);
    // If configured weekly holiday or vacation day, export a minimal notice PDF and return
    let weekly: number[] = [];
    let vacations: Array<{ from: string; to: string }> = [];
    try {
      const w = await get<{ value: string }>(`SELECT value FROM settings WHERE key='weeklyHolidays'`);
      weekly = w?.value ? JSON.parse(w.value) : [];
      const v = await get<{ value: string }>(`SELECT value FROM settings WHERE key='vacations'`);
      vacations = v?.value ? JSON.parse(v.value) : [];
    } catch {}
    const todayStr = now.toISO().slice(0,10);
    const isHoliday = weekly.includes(now.weekday) || (vacations||[]).some(r => todayStr >= String(r.from||'') && todayStr <= String(r.to||''));
    if (isHoliday) {
      const reportsDir = path.resolve(__dirname, '../../reports/saved');
      if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
      const dateLabel = `${now.day.toString().padStart(2,'0')}-${(now.month.toString().padStart(2,'0'))}-${now.year}`;
      const html = `<!doctype html><html lang="${lang}" ${lang==='ar'?'dir="rtl"':''}><head><meta charset="utf-8"/><style>body{font-family:Tajawal, sans-serif; padding:20px;} h1{ text-align:center; } .meta{ text-align:center; color:#555; }</style></head><body><h1>${lang==='ar'?'اليوم عطلة':'Holiday Day'}</h1><div class="meta">${lang==='ar'?'لا يوجد عرض للحضور — يوم عطلة رسمية/إجازة':'No attendance report — Official holiday/vacation day'}</div><div class="meta">${dateLabel}</div></body></html>`;
      const fileName = `Holiday_${dateLabel}.pdf`;
      const file = path.join(reportsDir, fileName);
      await exportHtmlPdf(html, file);
      return res.json({ ok: true, file });
    }
    const dayStart = now.startOf('day').toISO();
    const dayEnd = now.endOf('day').toISO();
    const whereParts: string[] = [];
    const params: any[] = [dayStart, dayEnd];
    if (cls) { whereParts.push('s.class = ?'); params.push(cls); }
    if (section) { whereParts.push('s.section = ?'); params.push(section); }
    const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const rows = await all<any>(
      `SELECT s.id as student_id, s.name, s.class, s.section, a.timestamp, a.status, a.late_minutes
       FROM students s
       ${where}
       LEFT JOIN (
         SELECT * FROM attendance_logs WHERE timestamp BETWEEN ? AND ?
       ) a ON a.student_id = s.id
       ORDER BY s.name ASC`, params
    );
    const setting = await get<{ value: string }>(`SELECT value FROM settings WHERE key='scheduleStart'`);
    const scheduleStart = (setting?.value || '07:00');
    const cutoffSetting = await get<{ value: string }>(`SELECT value FROM settings WHERE key='absentCutoff'`);
    const absentCutoff = cutoffSetting?.value || '08:30';
    const [ch, cm] = absentCutoff.split(':').map(Number);
    const cutoffMinutes = ch*60 + cm;
    const nowMinutes = now.hour*60 + now.minute;
    const list = rows.map(r => {
      if (r.status === 'present') {
        const tsLux = DateTime.fromISO(r.timestamp, { zone });
        const hh = tsLux.hour.toString().padStart(2,'0');
        const mm = tsLux.minute.toString().padStart(2,'0');
        const late = Math.max(0, (Number(hh)*60+Number(mm)) - (Number(scheduleStart.split(':')[0])*60+Number(scheduleStart.split(':')[1])));
        return { name: r.name, class: r.class, section: r.section, status: 'present', late_minutes: late };
      }
      const st = (nowMinutes < cutoffMinutes) ? 'not_yet' : 'absent';
      return { name: r.name, class: r.class, section: r.section, status: st, late_minutes: 0 };
    }).filter(rec => !statusFilter || rec.status === statusFilter || (statusFilter === 'late' && rec.status==='present' && (rec.late_minutes||0)>0));

    // Build HTML and render via Chromium for robust RTL
    const reportsDir = path.resolve(__dirname, '../../reports/saved');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
    const dateLabel = `${now.day.toString().padStart(2,'0')}-${(now.month.toString().padStart(2,'0'))}-${now.year}`;
    const fileName = `تقرير الحضور و الغياب يوم ${dateLabel}.pdf`;
    const file = path.join(reportsDir, fileName);
    const fontsDir = path.resolve(__dirname, '../../assets/fonts');
    const cfg = await get<{ value: string }>(`SELECT value FROM settings WHERE key='pdfFont'`);
    const candidates = ['Amiri-Regular.ttf','NotoNaskhArabic-Regular.ttf','Cairo-Regular.ttf','Tajawal-Regular.ttf'];
    const chosen = cfg?.value && fs.existsSync(path.join(fontsDir, cfg.value)) ? cfg.value : (candidates.find(f => fs.existsSync(path.join(fontsDir, f))) || '');
    const fontUrl = chosen ? ('file:///' + path.join(fontsDir, chosen).replace(/\\/g,'/')) : '';
    const nowStr = DateTime.now().toFormat('yyyy-MM-dd hh:mm a');
    const html = `<!doctype html><html lang="${lang}" dir="rtl"><head><meta charset="utf-8"/><style>
      @page{ margin:12mm }
      body{ font-family: ${chosen ? '"Amiri","Tajawal","NotoNaskhArabic", sans-serif' : 'Tajawal, sans-serif'}; }
      ${fontUrl ? `@font-face{ font-family:'Amiri'; src:url('${fontUrl}') format('truetype'); font-weight:400; font-style:normal; }` : ''}
      h1{ text-align:center; margin:0 0 8px; }
      .meta{ font-size:12px; margin-bottom:8px; }
      table{ width:100%; border-collapse:collapse; }
      th,td{ border:1px solid #ccc; padding:6px; text-align:right; }
      th{ background:#eee; }
      .credit{ position:fixed; left:12mm; bottom:8mm; font-size:11px; }
    </style></head><body>
      <div class="meta">تاريخ التصدير: ${nowStr}</div>
      <h1>تقرير الحضور والغياب اليوم</h1>
      <table><thead><tr><th>الاسم</th><th>الصف</th><th>الشعبة</th><th>الحالة</th><th>التأخر بالدقيقة</th></tr></thead><tbody>
      ${list.map(rec => {
        const label = rec.status === 'present' ? (rec.late_minutes>0 ? `حضور (تأخر ${rec.late_minutes} دقيقة)` : 'حضور') : (rec.status === 'not_yet' ? 'لم يصل بعد' : 'غياب');
        return `<tr><td>${rec.name||''}</td><td>${rec.class||''}</td><td>${rec.section||''}</td><td>${label}</td><td>${rec.late_minutes||0}</td></tr>`;
      }).join('')}
      </tbody></table>
      <div class="credit">حقوق البرمجة: عوض لافي الزبيدي – مدرسة الفاروق بالمظيلف</div>
    </body></html>`;
    await exportHtmlPdf(html, file);
    return res.json({ ok: true, file: `/saved-reports/${encodeURIComponent(fileName)}` });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});
function rtl(text: string): string {
  const RLE = '\u202B';
  const PDFM = '\u202C';
  return RLE + String(text||'') + PDFM;
}
