async function getJSON(url, opts) { const r = await fetch(url, opts); return r.json(); }

async function initSettings() {
  const s = await getJSON('/api/settings');
  document.getElementById('scheduleStart').value = s.scheduleStart || '07:00';
  const ac = document.getElementById('absentCutoff'); if (ac) ac.value = s.absentCutoff || '08:30';
  // Weekly holidays
  try {
    const weeks = Array.isArray(s.weeklyHolidays) ? s.weeklyHolidays.map(Number) : [];
    document.querySelectorAll('#weeklyHolidaysArea input[type="checkbox"]').forEach(ch => {
      const wd = Number(ch.getAttribute('data-weekday'));
      ch.checked = weeks.includes(wd);
    });
  } catch {}
  // Vacations list
  window._vacations = Array.isArray(s.vacations) ? s.vacations.slice() : [];
  renderVacations();
  // Load fonts list
  let fonts = [];
  try { const fr = await getJSON('/api/assets/fonts'); fonts = fr.fonts || []; } catch {}
  const uiSel = document.getElementById('uiFontSelect'); const pdfSel = document.getElementById('pdfFontSelect');
  const buildLabel = (name) => {
    const base = name.replace(/\.ttf$/i,'').replace(/\.woff2?$/i,'').replace(/-Regular/i,'');
    return base;
  };
  function fillSelect(sel, items, includeSystem=false) {
    if (!sel) return; sel.innerHTML = '';
    if (includeSystem) { const optSys = document.createElement('option'); optSys.value = ''; optSys.textContent = 'System UI'; sel.appendChild(optSys); }
    items.forEach(f => { const opt = document.createElement('option'); opt.value = f.name; opt.textContent = buildLabel(f.name); sel.appendChild(opt); });
  }
  fillSelect(uiSel, fonts, true); fillSelect(pdfSel, fonts, true);
  if (uiSel) uiSel.value = s.uiFont || '';
  if (pdfSel) pdfSel.value = s.pdfFont || '';
  // Apply UI font immediately
  applyUiFontFromSetting(s.uiFont || '');
  // Hook changes to auto-save and apply
  uiSel?.addEventListener('change', async () => {
    const file = uiSel.value || '';
    await getJSON('/api/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ uiFont: file }) });
    applyUiFontFromSetting(file);
  });
  pdfSel?.addEventListener('change', async () => {
    const file = pdfSel.value || '';
    await getJSON('/api/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pdfFont: file }) });
    alert('تم حفظ خط PDF');
  });
}

// --- Hijri helpers for Admin vacations ---
async function hijriToGregorian(hijriStr) {
  try {
    const [y,m,d] = String(hijriStr||'').split('-').map(s => s.trim());
    if (!y || !m || !d) return '';
    const url = `https://api.aladhan.com/v1/hToG/${d}-${m}-${y}`;
    const r = await fetch(url);
    const j = await r.json();
    const g = j?.data?.gregorian?.date; // DD-MM-YYYY
    if (!g) return '';
    const [dd,mm,yy] = String(g).split('-');
    return `${yy}-${mm}-${dd}`;
  } catch { return ''; }
}

function ensureHijriSelectsPopulated(prefixFrom, prefixTo) {
  try {
    const years = []; const currentYear = 1445; for (let y = currentYear - 10; y <= currentYear + 10; y++) years.push(y);
    const months = [
      { v: 1, n: 'محرم' }, { v: 2, n: 'صفر' }, { v: 3, n: 'ربيع الأول' }, { v: 4, n: 'ربيع الآخر' },
      { v: 5, n: 'جمادى الأولى' }, { v: 6, n: 'جمادى الآخرة' }, { v: 7, n: 'رجب' }, { v: 8, n: 'شعبان' },
      { v: 9, n: 'رمضان' }, { v: 10, n: 'شوال' }, { v: 11, n: 'ذو القعدة' }, { v: 12, n: 'ذو الحجة' }
    ];
    const days = Array.from({length:30}, (_,i) => i+1);
    const fill = (id, values, toText) => { const el = document.getElementById(id); if (!el) return; if (el.options.length > 0) return; el.innerHTML = ''; values.forEach(v => { const o = document.createElement('option'); o.value = String(v.v ?? v); o.textContent = toText ? toText(v) : String(v); el.appendChild(o); }); };
    fill(`${prefixFrom}Year`, years, v => String(v));
    fill(`${prefixFrom}Month`, months, v => v.n);
    fill(`${prefixFrom}Day`, days, v => String(v).padStart(2,'0'));
    fill(`${prefixTo}Year`, years, v => String(v));
    fill(`${prefixTo}Month`, months, v => v.n);
    fill(`${prefixTo}Day`, days, v => String(v).padStart(2,'0'));
  } catch {}
}

document.getElementById('useHijriVac')?.addEventListener('change', () => {
  const on = !!document.getElementById('useHijriVac')?.checked;
  const hijri = document.getElementById('vacHijriInputs'); if (hijri) hijri.style.display = on ? 'flex' : 'none';
  document.getElementById('vacFrom')?.toggleAttribute('disabled', on);
  document.getElementById('vacTo')?.toggleAttribute('disabled', on);
  if (on) { ensureHijriSelectsPopulated('vacFromHijri','vacToHijri'); }
});

document.getElementById('saveSchedule')?.addEventListener('click', async () => {
  const v = document.getElementById('scheduleStart').value;
  const cutoff = document.getElementById('absentCutoff')?.value || '08:30';
  const r = await getJSON('/api/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ scheduleStart: v, absentCutoff: cutoff }) });
  alert(msg(r.ok ? 'saveOk' : 'saveErr'));
});

document.getElementById('saveWeeklyHolidays')?.addEventListener('click', async () => {
  try {
    const days = Array.from(document.querySelectorAll('#weeklyHolidaysArea input[type="checkbox"]'))
      .filter(ch => ch.checked)
      .map(ch => Number(ch.getAttribute('data-weekday')));
    const r = await getJSON('/api/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ weeklyHolidays: days }) });
    alert(r.ok ? 'تم حفظ العطلة الأسبوعية' : 'فشل الحفظ');
  } catch { alert('فشل الحفظ'); }
});

document.getElementById('addVacation')?.addEventListener('click', async () => {
  const useHijri = !!document.getElementById('useHijriVac')?.checked;
  let from = document.getElementById('vacFrom')?.value || '';
  let to = document.getElementById('vacTo')?.value || '';
  if (useHijri) {
    const fy = document.getElementById('vacFromHijriYear')?.value || '';
    const fm = document.getElementById('vacFromHijriMonth')?.value || '';
    const fd = document.getElementById('vacFromHijriDay')?.value || '';
    const ty = document.getElementById('vacToHijriYear')?.value || '';
    const tm = document.getElementById('vacToHijriMonth')?.value || '';
    const td = document.getElementById('vacToHijriDay')?.value || '';
    const hFrom = fy && fm && fd ? `${fy}-${String(fm).padStart(2,'0')}-${String(fd).padStart(2,'0')}` : '';
    const hTo = ty && tm && td ? `${ty}-${String(tm).padStart(2,'0')}-${String(td).padStart(2,'0')}` : '';
    const gFrom = await hijriToGregorian(hFrom);
    const gTo = await hijriToGregorian(hTo);
    from = gFrom || '';
    to = gTo || '';
    if (!from && hFrom) { alert('تعذر تحويل تاريخ البداية (هجري) إلى ميلادي'); return; }
    if (!to && hTo) { alert('تعذر تحويل تاريخ النهاية (هجري) إلى ميلادي'); return; }
  }
  if (!from || !to) { alert('أدخل تاريخي البداية والنهاية'); return; }
  window._vacations = window._vacations || [];
  window._vacations.push({ from, to });
  const vf = document.getElementById('vacFrom'); if (vf) vf.value = '';
  const vt = document.getElementById('vacTo'); if (vt) vt.value = '';
  renderVacations();
});

document.getElementById('saveVacations')?.addEventListener('click', async () => {
  try {
    const r = await getJSON('/api/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ vacations: window._vacations || [] }) });
    document.getElementById('vacStatus').textContent = r.ok ? 'تم حفظ فترات الإجازات' : 'فشل حفظ الفترات';
  } catch { document.getElementById('vacStatus').textContent = 'فشل حفظ الفترات'; }
});

document.getElementById('applyVacations')?.addEventListener('click', async () => {
  if (!confirm('سيتم حذف سجلات الحضور ضمن فترات الإجازات المحددة. هل أنت متأكد؟')) return;
  try {
    const r = await getJSON('/api/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ vacations: window._vacations || [], applyVacations: true }) });
    document.getElementById('vacStatus').textContent = r.ok ? 'تم تطبيق الإجازات وحذف السجلات' : 'فشل التطبيق';
  } catch { document.getElementById('vacStatus').textContent = 'فشل التطبيق'; }
});

document.getElementById('importStudents')?.addEventListener('click', async () => {
  const s = document.getElementById('importStatus'); s.textContent = msg('importing');
  const r = await getJSON('/api/students/import', { method:'POST' });
  s.textContent = r.ok ? msg('importOk', { n: r.imported }) : msg('importErr', { e: r.error });
});

document.getElementById('saveZk')?.addEventListener('click', async () => {
  const ip = document.getElementById('zkIp').value || undefined;
  const port = Number(document.getElementById('zkPort').value) || undefined;
  const commKey = document.getElementById('zkCommKey').value || undefined;
  const password = document.getElementById('zkPassword').value || undefined;
  const useSdk = document.getElementById('zkUseSdk').checked;
  const mockMode = document.getElementById('zkMock').checked;
  const r = await getJSON('/api/zk/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ip, port, mockMode, useSdk, commKey, password }) });
  alert(msg(r.ok ? 'saveDeviceOk' : 'saveDeviceErr'));
});

document.getElementById('ingest')?.addEventListener('click', async () => {
  const s = document.getElementById('ingestStatus'); s.textContent = msg('ingestFetching');
  const r = await getJSON('/api/attendance/ingest', { method:'POST' });
  s.textContent = r.ok ? msg('ingestOk', { n: r.stored }) : msg('ingestErr', { e: r.error });
});

// Manual attlog import from a file on server disk
document.getElementById('manualImportBtn')?.addEventListener('click', async () => {
  const s = document.getElementById('manualImportStatus');
  if (s) s.textContent = msg('manualImporting');
  const pEl = document.getElementById('manualAttlogPath');
  const p = (pEl && 'value' in pEl) ? String(pEl.value).trim() : '';
  const body = p ? { path: p } : {};
  const r = await getJSON('/api/attendance/import-file', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (s) s.textContent = r.ok ? msg('manualOk', { stored: r.stored, parsed: r.parsed, unknown: r.unknown }) : msg('manualErr', { e: r.error });
});

async function exportDaily(format) {
  const cls = document.getElementById('filterClass')?.value.trim();
  const section = document.getElementById('filterSection')?.value.trim();
  const date = document.getElementById('reportDate')?.value.trim();
  const lang = localStorage.getItem('lang') || 'ar';
  const studentId = document.getElementById('filterStudent')?.value || '';
  const params = new URLSearchParams({ format, lang });
  if (cls) params.set('class', cls);
  if (section) params.set('section', section);
  if (date) params.set('date', date);
  if (studentId) params.set('student_id', String(studentId));
  const r = await getJSON(`/api/reports/daily/export?${params.toString()}`);
  const area = document.getElementById('reportsArea');
  if (r.ok) {
    area.innerHTML = '';
    const a = document.createElement('a'); a.href = r.file; a.textContent = `${msg('openFile')} ${format.toUpperCase()}`; a.target = '_blank'; a.style.display='inline-block'; a.style.marginTop='6px';
    area.appendChild(a);
  } else { area.textContent = msg('exportErr', { e: r.error }); }
}

document.getElementById('exportExcel')?.addEventListener('click', () => exportDaily('excel'));
document.getElementById('exportPdf')?.addEventListener('click', () => exportDaily('pdf'));

document.getElementById('runBackup')?.addEventListener('click', async () => {
  const r = await getJSON('/api/backups/run', { method:'POST' });
  alert(r.ok ? msg('backupOk', { p: r.path }) : msg('backupErr', { e: r.error }));
});

// Wire data wipe buttons with confirmations and backend calls
document.getElementById('wipeAllBtn')?.addEventListener('click', async () => {
  const required = 'DELETE ALL';
  const input = prompt(msg('wipeConfirmAll'));
  if (!input) return;
  if (input.trim() !== required) { alert(msg('wipeConfirmMismatch', { required })); return; }
  const r = await getJSON('/api/admin/wipe', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ scope: 'all', confirm: input.trim() }) });
  const s = document.getElementById('wipeStatus'); if (s) s.textContent = r.ok ? msg('wipeOk') : msg('wipeErr', { e: r.error });
});

document.getElementById('wipeAttendanceBtn')?.addEventListener('click', async () => {
  const required = 'ATTENDANCE';
  const input = prompt(msg('wipeConfirmAttendance'));
  if (!input) return;
  if (input.trim() !== required) { alert(msg('wipeConfirmMismatch', { required })); return; }
  const r = await getJSON('/api/admin/wipe', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ scope: 'attendance', confirm: input.trim() }) });
  const s = document.getElementById('wipeStatus'); if (s) s.textContent = r.ok ? msg('wipeOk') : msg('wipeErr', { e: r.error });
});

document.getElementById('wipeStudentsBtn')?.addEventListener('click', async () => {
  const required = 'STUDENTS';
  const input = prompt(msg('wipeConfirmStudents'));
  if (!input) return;
  if (input.trim() !== required) { alert(msg('wipeConfirmMismatch', { required })); return; }
  const r = await getJSON('/api/admin/wipe', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ scope: 'students', confirm: input.trim() }) });
  const s = document.getElementById('wipeStatus'); if (s) s.textContent = r.ok ? msg('wipeOk') : msg('wipeErr', { e: r.error });
});

(async function init(){
  await initSettings();
  // Initialize Hijri inputs visibility and options on load
  ensureHijriSelectsPopulated('vacFromHijri','vacToHijri');
  const on = !!document.getElementById('useHijriVac')?.checked;
  const hijri = document.getElementById('vacHijriInputs'); if (hijri) hijri.style.display = on ? 'flex' : 'none';
  document.getElementById('vacFrom')?.toggleAttribute('disabled', on);
  document.getElementById('vacTo')?.toggleAttribute('disabled', on);
})();

function ensureFontFace(family, file) {
  if (!family || !file) return;
  const id = 'dyn-font-' + family;
  if (document.getElementById(id)) return;
  const style = document.createElement('style'); style.id = id;
  style.textContent = `@font-face{font-family:'${family}';src:url('/assets/fonts/${file}') format('truetype');font-weight:400;font-style:normal;font-display:swap;}`;
  document.head.appendChild(style);
}

function applyUiFontFromSetting(file) {
  // Derive family from file name
  if (!file) { document.documentElement.style.setProperty('--font-ui', `'Amiri','NotoNaskhArabic','Tajawal'`); return; }
  const family = file.replace(/\.ttf$/i,'').replace(/\.woff2?$/i,'').replace(/-Regular/i,'');
  ensureFontFace(family, file);
  document.documentElement.style.setProperty('--font-ui', `'${family}'`);
}

function renderVacations() {
  const cont = document.getElementById('vacationsList'); if (!cont) return;
  cont.innerHTML = '';
  (window._vacations || []).forEach((v, idx) => {
    const row = document.createElement('div');
    row.style.display = 'flex'; row.style.gap = '8px'; row.style.alignItems = 'center'; row.style.margin = '6px 0';
    const span = document.createElement('span'); span.textContent = `من ${v.from} إلى ${v.to}`;
    const del = document.createElement('button'); del.textContent = 'حذف';
    del.addEventListener('click', () => { window._vacations.splice(idx, 1); renderVacations(); });
    row.appendChild(span); row.appendChild(del);
    cont.appendChild(row);
  });
}

// Fonts subtab switching and text size preview
document.querySelectorAll('section[data-tab="fonts"] .subtab-button').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.getAttribute('data-subtab');
    const container = document.querySelector('section[data-tab="fonts"]');
    container.querySelectorAll('.subtab-button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    container.querySelectorAll('.subtab').forEach(st => {
      st.style.display = st.getAttribute('data-subtab') === tab ? 'block' : 'none';
    });
  });
});

const textSizeRange = document.getElementById('textSizeRange');
const textPreview = document.getElementById('textPreview');
textSizeRange?.addEventListener('input', async () => {
  const scale = Number(textSizeRange.value || '1');
  document.documentElement.style.setProperty('--text-scale', String(scale));
  if (textPreview) textPreview.style.fontSize = `calc(16px * ${scale})`;
  await getJSON('/api/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ uiFont: (document.getElementById('uiFontSelect')?.value || ''), pdfFont: (document.getElementById('pdfFontSelect')?.value || '') }) });
});

// Bilingual support (Arabic/English)
const i18n = {
  ar: {
    adminTitle: 'لوحة الإدارة', navHome: 'الرئيسية 🏠', navDashboard: 'لوحة العرض 📊', navReports: 'التقارير 📑', navStudents: 'الطلاب 👨‍🎓',
    secSchedule: 'إعدادات الوقت الرسمي والخطوط', lblSchedule: 'ساعة الدخول الرسمية', save: 'حفظ',
    lblUiFont: 'خط الواجهة', lblPdfFont: 'خط PDF',
    lblAbsentCutoff: 'حد الغياب',
    secStudents: 'إدارة الطلاب', thName: 'الاسم', thClass: 'الصف', thSection: 'الشعبة', thDevice: 'رقم الجهاز',
    addStudent: 'إضافة طالب',
    secImport: 'استيراد الطلاب', importNote: 'سيتم الاستيراد من ملف SampleStudents.xlsx في الحزمة.', importBtn: 'استيراد',
    secDevice: 'جلب سجلات الجهاز', lblIp: 'IP الجهاز', lblPort: 'Port', lblMock: 'وضع المحاكاة', saveDevice: 'حفظ الإعدادات', testConnect: 'اختبار الاتصال', ingest: 'جلب وتخزين الحضور',
    diagnose: 'تشخيص الاتصال',
    secManualImport: 'استيراد ملف الحضور يدوياً', lblManualFile: 'مسار الملف (attlog.dat)', manualImportBtn: 'استيراد', manualImportNote: 'إن لم تُحدد مساراً، سيتم استخدام الملف الموجود في الجذر باسم BRC7222260114_attlog.dat',
    secReports: 'التقارير والنسخ الاحتياطي', lblClass: 'الصف', lblSection: 'الشعبة', lblDate: 'التاريخ', exportExcel: 'تصدير تقرير يومي (Excel)', exportPdf: 'تصدير تقرير يومي (PDF)', runBackup: 'تشغيل النسخ الاحتياطي',
    secBackups: 'النسخ الاحتياطي والاسترجاع', secBackupsList: 'النسخ المتوفرة والاسترجاع', openFile: 'فتح الملف', restore: 'استرجاع',
    lblVacHijri: 'استخدام التاريخ الهجري',
    secDataMgmt: 'إدارة البيانات الحساسة',
    lblWipeAll: 'حذف جميع البيانات (طلاب + سجلات + حركات)',
    lblWipeAtt: 'حذف سجلات الحضور والحركات',
    lblWipeStu: 'حذف الطلاب بالكامل',
    msg: {
      saveOk: 'تم الحفظ', saveErr: 'حدث خطأ',
      importing: 'جاري الاستيراد...', importOk: (p) => `تم الاستيراد: ${p.n}`, importErr: (p) => `خطأ: ${p.e}`,
      saveDeviceOk: 'تم حفظ إعدادات الجهاز', saveDeviceErr: 'فشل حفظ الإعدادات',
      ingestFetching: 'جاري الجلب...', ingestOk: (p) => `تم التخزين: ${p.n}`, ingestErr: (p) => `خطأ: ${p.e}`,
      manualImporting: 'جاري الاستيراد اليدوي...', manualOk: (p) => `تم تخزين السجلات: ${p.stored} (مقروء: ${p.parsed}، غير معروف: ${p.unknown})`, manualErr: (p) => `خطأ: ${p.e}`,
      exportErr: (p) => `خطأ: ${p.e}`,
      backupOk: (p) => `تم النسخ: ${p.p}`, backupErr: (p) => `خطأ: ${p.e}`,
      noBackups: 'لا توجد نسخ بعد.',
      restoreConfirm: 'سيتم استرجاع قاعدة البيانات من النسخة المختارة، هل أنت متأكد؟',
      restoreOk: 'تم الاسترجاع بنجاح', restoreErr: (p) => `خطأ: ${p.e}`,
      listLoadErr: 'تعذر تحميل قائمة النسخ',
      studentsLoadErr: 'تعذر تحميل قائمة الطلاب',
      studentAddOk: 'تمت إضافة الطالب', studentAddErr: (p) => `خطأ: ${p.e}`,
      zkConnectOk: 'تم الاتصال بالجهاز بنجاح', zkConnectErr: (p) => `فشل الاتصال: ${p.e}`,
      wipeConfirmAll: 'للتأكيد، اكتب: DELETE ALL',
      wipeConfirmAttendance: 'للتأكيد، اكتب: ATTENDANCE',
      wipeConfirmStudents: 'للتأكيد، اكتب: STUDENTS',
      wipeConfirmMismatch: (p) => `يجب كتابة النص المطلوب بالضبط: ${p.required}`,
      wipeOk: 'تم الحذف بنجاح',
      wipeErr: (p) => `خطأ: ${p.e}`
    }
  },
  en: {
    adminTitle: 'Admin Panel', navHome: 'Home 🏠', navDashboard: 'Dashboard 📊', navReports: 'Reports 📑', navStudents: 'Students 👨‍🎓',
    secSchedule: 'Official Time & Fonts', lblSchedule: 'Official start time', save: 'Save',
    lblUiFont: 'UI Font', lblPdfFont: 'PDF Font',
    lblAbsentCutoff: 'Absence Cutoff',
    secStudents: 'Student Management', thName: 'Name', thClass: 'Class', thSection: 'Section', thDevice: 'Device ID',
    addStudent: 'Add Student',
    secImport: 'Import Students', importNote: 'Importing from SampleStudents.xlsx included in the package.', importBtn: 'Import',
    secDevice: 'Fetch Device Logs', lblIp: 'Device IP', lblPort: 'Port', lblMock: 'Mock Mode', saveDevice: 'Save Settings', testConnect: 'Test Connection', ingest: 'Fetch & Store Attendance',
    diagnose: 'Diagnose Connection',
    secManualImport: 'Manual attlog import', lblManualFile: 'File path (attlog.dat)', manualImportBtn: 'Import', manualImportNote: 'If not specified, the root file BRC7222260114_attlog.dat will be used.',
    secReports: 'Reports & Backups', lblClass: 'Class', lblSection: 'Section', lblDate: 'Date', exportExcel: 'Export Daily (Excel)', exportPdf: 'Export Daily (PDF)', runBackup: 'Run Backup',
    secBackups: 'Backup & Restore', secBackupsList: 'Available Backups & Restore', openFile: 'Open File', restore: 'Restore',
    lblVacHijri: 'Use Hijri date',
    secDataMgmt: 'Sensitive Data Management',
    lblWipeAll: 'Wipe all data (students + logs + movements)',
    lblWipeAtt: 'Wipe attendance logs and device movements',
    lblWipeStu: 'Wipe all students',
    msg: {
      saveOk: 'Saved', saveErr: 'An error occurred',
      importing: 'Importing...', importOk: (p) => `Imported: ${p.n}`, importErr: (p) => `Error: ${p.e}`,
      saveDeviceOk: 'Device settings saved', saveDeviceErr: 'Failed to save settings',
      ingestFetching: 'Fetching...', ingestOk: (p) => `Stored: ${p.n}`, ingestErr: (p) => `Error: ${p.e}`,
      manualImporting: 'Importing manually...', manualOk: (p) => `Stored: ${p.stored} (parsed: ${p.parsed}, unknown: ${p.unknown})`, manualErr: (p) => `Error: ${p.e}`,
      exportErr: (p) => `Error: ${p.e}`,
      backupOk: (p) => `Backed up: ${p.p}`, backupErr: (p) => `Error: ${p.e}`,
      noBackups: 'No backups yet.',
      restoreConfirm: 'Database will be restored from the selected backup. Are you sure?',
      restoreOk: 'Restore completed successfully', restoreErr: (p) => `Error: ${p.e}`,
      listLoadErr: 'Failed to load backup list',
      studentsLoadErr: 'Failed to load students list',
      studentAddOk: 'Student added successfully', studentAddErr: (p) => `Error: ${p.e}`,
      zkConnectOk: 'Device connected successfully', zkConnectErr: (p) => `Connection failed: ${p.e}`,
      wipeConfirmAll: 'To confirm, type: DELETE ALL',
      wipeConfirmAttendance: 'To confirm, type: ATTENDANCE',
      wipeConfirmStudents: 'To confirm, type: STUDENTS',
      wipeConfirmMismatch: (p) => `You must type exactly: ${p.required}`,
      wipeOk: 'Deletion completed successfully',
      wipeErr: (p) => `Error: ${p.e}`
    }
  }
};

function applyLang(lang) {
  const t = i18n[lang]; if (!t) return;
  document.documentElement.lang = lang === 'ar' ? 'ar' : 'en';
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  setText('admin-title', t.adminTitle);
  setText('nav-home', t.navHome);
  setText('nav-dashboard', t.navDashboard);
  setText('nav-reports', t.navReports);
  setText('nav-students', t.navStudents);
  setText('sec-schedule', t.secSchedule);
  setText('lbl-schedule', t.lblSchedule);
  setText('saveSchedule', t.save);
  setText('lbl-absent-cutoff', t.lblAbsentCutoff);
  setText('lbl-ui-font', t.lblUiFont);
  setText('lbl-pdf-font', t.lblPdfFont);
  setText('sec-students', t.secStudents);
  setText('th-name', t.thName);
  setText('th-class', t.thClass);
  setText('th-section', t.thSection);
  setText('th-device', t.thDevice);
  setText('addStudent', t.addStudent);
  setText('sec-import', t.secImport);
  setText('import-note', t.importNote);
  setText('importStudents', t.importBtn);
  setText('sec-device', t.secDevice);
  setText('sec-manual-import', t.secManualImport);
  setText('lbl-ip', t.lblIp);
  setText('lbl-port', t.lblPort);
  setText('lbl-mock', t.lblMock);
  setText('saveZk', t.saveDevice);
  setText('testConnect', t.testConnect);
  setText('diagnoseBtn', t.diagnose || 'تشخيص الاتصال');
  setText('ingest', t.ingest);
  setText('lbl-manual-file', t.lblManualFile);
  setText('manualImportBtn', t.manualImportBtn);
  setText('manualImportNote', t.manualImportNote);
  setText('sec-reports', t.secReports);
  setText('lbl-class', t.lblClass);
  setText('lbl-section', t.lblSection);
  setText('lbl-student', t.lblStudent || 'الطالب');
  setText('lbl-date', t.lblDate);
  setText('exportExcel', t.exportExcel);
  setText('exportPdf', t.exportPdf);
  setText('runBackup', t.runBackup);
  setText('sec-backups', t.secBackups);
  setText('sec-backups-list', t.secBackupsList || t.secBackups);
  setText('sec-data-mgmt', t.secDataMgmt || (lang==='ar' ? 'إدارة البيانات الحساسة' : 'Sensitive Data Management'));
  setText('lbl-wipe-all', t.lblWipeAll || (lang==='ar' ? 'حذف جميع البيانات (طلاب + سجلات + حركات)' : 'Wipe all data (students + logs + device movements)'));
  setText('lbl-wipe-att', t.lblWipeAtt || (lang==='ar' ? 'حذف سجلات الحضور والحركات' : 'Wipe attendance logs and device movements'));
  setText('lbl-wipe-stu', t.lblWipeStu || (lang==='ar' ? 'حذف الطلاب بالكامل' : 'Wipe all students'));
  setText('lbl-vac-hijri', t.lblVacHijri);
  document.querySelectorAll('#backupsList a').forEach(a => a.textContent = t.openFile);
  document.querySelectorAll('#backupsList button').forEach(b => b.textContent = t.restore);
}

const savedLang = localStorage.getItem('lang') || 'ar';
applyLang(savedLang);
document.getElementById('toggle-lang')?.addEventListener('click', () => {
  const next = (localStorage.getItem('lang') || 'ar') === 'ar' ? 'en' : 'ar';
  localStorage.setItem('lang', next);
  applyLang(next);
  // reload backups list so empty message/date locale reflects the language
  loadBackups();
  loadStudents();
});

// Theme toggle for admin
document.getElementById('toggle-theme')?.addEventListener('click', () => {
  document.body.classList.toggle('dark');
});

function msg(key, params = {}) {
  const lang = localStorage.getItem('lang') || 'ar';
  const m = i18n[lang]?.msg?.[key];
  if (!m) return key;
  return typeof m === 'function' ? m(params) : m;
}

async function loadBackups() {
  try {
    const r = await getJSON('/api/backups/list');
    const list = document.getElementById('backupsList');
    list.innerHTML = '';
    if (!r.backups || r.backups.length === 0) { list.textContent = msg('noBackups'); return; }
    r.backups.forEach(b => {
      const div = document.createElement('div');
      const lang = localStorage.getItem('lang') || 'ar';
      const date = new Date(b.date).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US');
      div.style.display = 'flex'; div.style.gap = '8px'; div.style.alignItems = 'center'; div.style.margin = '6px 0';
      const span = document.createElement('span'); span.textContent = `${lang === 'ar' ? 'تاريخ:' : 'Date:'} ${date}`;
      const a = document.createElement('a'); a.href = b.path; a.textContent = i18n[lang].openFile; a.target = '_blank';
      const btn = document.createElement('button'); btn.textContent = i18n[lang].restore;
      btn.addEventListener('click', async () => {
        if (!confirm(msg('restoreConfirm'))) return;
        const resp = await getJSON('/api/backups/restore', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: b.path }) });
        alert(resp.ok ? msg('restoreOk') : msg('restoreErr', { e: resp.error }));
      });
      div.appendChild(span); div.appendChild(a); div.appendChild(btn);
      list.appendChild(div);
    });
  } catch (e) {
    const list = document.getElementById('backupsList');
    list.textContent = msg('listLoadErr');
  }
}

async function loadStudents() {
  try {
    const r = await getJSON('/api/students');
    window._studentsData = r.students || [];
    // populate report student filter
    const sel = document.getElementById('filterStudent');
    if (sel) {
      const current = sel.value;
      sel.innerHTML = '';
      const allOpt = document.createElement('option'); allOpt.value = ''; allOpt.textContent = 'الكل'; sel.appendChild(allOpt);
      (window._studentsData || []).forEach(s => { const opt = document.createElement('option'); opt.value = s.id; opt.textContent = s.name; sel.appendChild(opt); });
      if (current) sel.value = current;
    }
    renderStudents();
  } catch (e) {
    const st = document.getElementById('studentsStatus'); if (st) st.textContent = msg('studentsLoadErr');
  }
}

function renderStudents() {
  const tbody = document.querySelector('#studentsTable tbody');
  if (!tbody) return; tbody.innerHTML = '';
  const nameQ = (document.getElementById('searchName')?.value || '').trim().toLowerCase();
  const classQ = (document.getElementById('searchClass')?.value || '').trim().toLowerCase();
  const filtered = (window._studentsData || []).filter(s => {
    const nameOk = !nameQ || String(s.name||'').toLowerCase().includes(nameQ);
    const classOk = !classQ || String(s.class||'').toLowerCase().includes(classQ);
    return nameOk && classOk;
  });
  filtered.forEach(s => {
    const tr = document.createElement('tr');
    const nameTd = document.createElement('td'); nameTd.textContent = s.name || '';
    const classTd = document.createElement('td'); classTd.textContent = s.class || '';
    const sectionTd = document.createElement('td'); sectionTd.textContent = s.section || '';
    const deviceTd = document.createElement('td'); deviceTd.textContent = s.device_user_id || '';
    const actionsTd = document.createElement('td');
    const editBtn = document.createElement('button'); editBtn.textContent = 'تعديل';
    const delBtn = document.createElement('button'); delBtn.textContent = 'حذف'; delBtn.style.marginInlineStart = '8px';
    editBtn.addEventListener('click', () => startEditStudent(s));
    delBtn.addEventListener('click', () => deleteStudent(s));
    actionsTd.appendChild(editBtn); actionsTd.appendChild(delBtn);
    tr.appendChild(nameTd); tr.appendChild(classTd); tr.appendChild(sectionTd); tr.appendChild(deviceTd); tr.appendChild(actionsTd);
    tbody.appendChild(tr);
  });
}

document.getElementById('searchName')?.addEventListener('input', renderStudents);
document.getElementById('searchClass')?.addEventListener('input', renderStudents);
document.getElementById('resetSearch')?.addEventListener('click', () => {
  const n = document.getElementById('searchName'); if (n) n.value = '';
  const c = document.getElementById('searchClass'); if (c) c.value = '';
  renderStudents();
});

let editingId = null;
let originalDeviceUserId = '';
function startEditStudent(s) {
  editingId = s.id;
  document.getElementById('newName').value = s.name || '';
  document.getElementById('newNational').value = s.national_id || '';
  document.getElementById('newGuardian').value = s.guardian_phone || '';
  document.getElementById('newClass').value = s.class || '';
  document.getElementById('newSection').value = s.section || '';
  document.getElementById('newDeviceId').value = s.device_user_id || '';
  originalDeviceUserId = s.device_user_id || '';
  const addBtn = document.getElementById('addStudent'); addBtn.textContent = 'تحديث الطالب';
  const cancelBtn = document.getElementById('cancelEdit'); cancelBtn.style.display = '';
}

document.getElementById('cancelEdit')?.addEventListener('click', () => {
  editingId = null;
  document.getElementById('newName').value = '';
  document.getElementById('newNational').value = '';
  document.getElementById('newGuardian').value = '';
  document.getElementById('newClass').value = '';
  document.getElementById('newSection').value = '';
  document.getElementById('newDeviceId').value = '';
  const addBtn = document.getElementById('addStudent'); addBtn.textContent = 'إضافة طالب';
  const cancelBtn = document.getElementById('cancelEdit'); cancelBtn.style.display = 'none';
});

document.getElementById('addStudent')?.addEventListener('click', async () => {
  try {
    const name = document.getElementById('newName').value.trim();
    const national_id = document.getElementById('newNational').value.trim();
    const guardian_phone = document.getElementById('newGuardian').value.trim();
    const cls = document.getElementById('newClass').value.trim();
    const section = document.getElementById('newSection').value.trim();
    const device_user_id = document.getElementById('newDeviceId').value.trim();
    let r;
    if (editingId) {
      // confirm device_user_id change
      if ((device_user_id || '') !== (originalDeviceUserId || '')) {
        const ok = confirm('سيؤثر تغيير رقم المستخدم بالجهاز على ربط السجلات بالحضور، هل أنت متأكد؟');
        if (!ok) return;
      }
      r = await getJSON(`/api/students/${editingId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, national_id, guardian_phone, class: cls, section, device_user_id }) });
    } else {
      r = await getJSON('/api/students', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, national_id, guardian_phone, class: cls, section, device_user_id }) });
    }
    alert(r.ok ? (editingId ? 'تم تحديث الطالب' : msg('studentAddOk')) : msg('studentAddErr', { e: r.error }));
    editingId = null;
    document.getElementById('cancelEdit').style.display = 'none';
    document.getElementById('addStudent').textContent = 'إضافة طالب';
    await loadStudents();
  } catch (e) {
    alert(msg('studentAddErr', { e: String(e) }));
  }
});

async function deleteStudent(s) {
  if (!confirm('هل تريد حذف هذا الطالب؟')) return;
  const r = await getJSON(`/api/students/${s.id}`, { method:'DELETE' });
  if (!r.ok) { alert(msg('studentAddErr', { e: r.error })); return; }
  await loadStudents();
}

document.getElementById('testConnect')?.addEventListener('click', async () => {
  try {
    const r = await getJSON('/api/zk/connect');
    alert(r.ok ? msg('zkConnectOk') : msg('zkConnectErr', { e: r.error }));
  } catch (e) {
    alert(msg('zkConnectErr', { e: String(e) }));
  }
});

document.getElementById('diagnoseBtn')?.addEventListener('click', async () => {
  try {
    const ip = (document.getElementById('zkIp')?.value || '').trim();
    const portVal = Number(document.getElementById('zkPort')?.value || '0');
    const useSdk = !!document.getElementById('zkUseSdk')?.checked;
    const mockMode = !!document.getElementById('zkMock')?.checked;
    const params = new URLSearchParams();
    if (ip) params.set('ip', ip);
    if (portVal) params.set('port', String(portVal));
    params.set('useSdk', String(useSdk));
    params.set('mock', String(mockMode));
    const area = document.getElementById('diagnoseArea');
    const lang = localStorage.getItem('lang') || 'ar';
    if (area) area.textContent = lang === 'ar' ? 'جاري التشخيص...' : 'Diagnosing...';
    const r = await getJSON(`/api/zk/diagnose?${params.toString()}`);
    renderDiagnose(r);
  } catch (e) {
    const area = document.getElementById('diagnoseArea');
    if (area) area.textContent = msg('exportErr', { e: String(e) });
  }
});

function renderDiagnose(report) {
  const area = document.getElementById('diagnoseArea');
  if (!area) return;
  const lang = localStorage.getItem('lang') || 'ar';
  area.innerHTML = '';
  const title = document.createElement('div');
  title.textContent = lang === 'ar' ? 'نتيجة التشخيص' : 'Diagnosis Result';
  title.style.fontWeight = 'bold';
  area.appendChild(title);

  const summary = document.createElement('div');
  summary.style.margin = '6px 0';
  const okText = report.finalOk ? (lang === 'ar' ? 'نجح الاتصال' : 'Connection OK') : (lang === 'ar' ? 'فشل الاتصال' : 'Connection failed');
  summary.textContent = `${okText} — ${report.ip}:${report.port} — ${lang==='ar'?'الرسالة':'Message'}: ${report.message}`;
  summary.style.color = report.finalOk ? 'green' : 'red';
  area.appendChild(summary);

  const cfg = document.createElement('div');
  cfg.textContent = `${lang==='ar'?'المحاولات':'Retries'}: ${report.retries} | ${lang==='ar'?'المهلة':'Timeout'}: ${report.timeoutMs}ms | ${lang==='ar'?'البروتوكول':'Protocol'}: ${report.protocol}`;
  area.appendChild(cfg);

  const table = document.createElement('table');
  table.style.width = '100%'; table.style.borderCollapse = 'collapse'; table.border = '1';
  const thead = document.createElement('thead'); const htr = document.createElement('tr');
  const headers = [
    lang==='ar'? 'المحاولة' : 'Attempt',
    lang==='ar'? 'النتيجة' : 'Result',
    lang==='ar'? 'طريقة' : 'Via',
    lang==='ar'? 'المدة (ملّي)' : 'Duration (ms)',
    lang==='ar'? 'رمز الخطأ' : 'Error Code',
    lang==='ar'? 'الخطأ' : 'Error'
  ];
  headers.forEach(text => { const th = document.createElement('th'); th.textContent = text; htr.appendChild(th); });
  thead.appendChild(htr); table.appendChild(thead);
  const tbody = document.createElement('tbody');
  (report.attempts || []).forEach((a, i) => {
    const tr = document.createElement('tr');
    const vals = [i+1, a.ok ? (lang==='ar'?'نجاح':'OK') : (lang==='ar'?'فشل':'Fail'), a.via, a.durationMs, a.code||'', a.error||''];
    vals.forEach(v => { const td = document.createElement('td'); td.textContent = String(v); tr.appendChild(td); });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  area.appendChild(table);
}

(async function initBackups(){ await loadBackups(); })();
(async function initStudents(){ await loadStudents(); })();
(function initTabs(){
  const bar = document.querySelector('.tab-bar'); if (!bar) return;
  function showTab(tab) {
    document.querySelectorAll('.tab-section').forEach(sec => {
      const target = sec.getAttribute('data-tab');
      sec.style.display = (target === tab) ? 'block' : 'none';
    });
  }
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showTab(btn.getAttribute('data-tab'));
    });
  });
  // Hide non-active sections initially
  document.querySelectorAll('.tab-section').forEach(sec => {
    if (!sec.classList.contains('active')) sec.style.display = 'none';
    else sec.style.display = 'block';
  });
})();

// --- Additional report viewing and student range export ---
document.getElementById('viewDaily')?.addEventListener('click', viewDaily);

async function viewDaily() {
  try {
    const cls = document.getElementById('filterClass')?.value.trim();
    const section = document.getElementById('filterSection')?.value.trim();
    const date = document.getElementById('reportDate')?.value.trim();
    const studentId = document.getElementById('filterStudent')?.value || '';
    const params = new URLSearchParams();
    if (cls) params.set('class', cls);
    if (section) params.set('section', section);
    if (date) params.set('date', date);
    if (studentId) params.set('student_id', String(studentId));
    const r = await getJSON(`/api/reports/daily?${params.toString()}`);
    window._dailyRecords = r.records || [];
    window._dailySortKey = window._dailySortKey || 'name';
    window._dailySortAsc = typeof window._dailySortAsc === 'boolean' ? window._dailySortAsc : true;
    renderDailyTable();
  } catch (e) {
    const area = document.getElementById('reportsArea'); area.textContent = 'تعذر عرض التقرير';
  }
}

function filterDailyRecords(all) {
  const nameQ = (document.getElementById('searchDailyName')?.value || '').trim().toLowerCase();
  const statusQ = (document.getElementById('dailyStatusFilter')?.value || '').trim();
  return (all || []).filter(rec => {
    const nameOk = !nameQ || String(rec.name||'').toLowerCase().includes(nameQ);
    let statusOk = true;
    if (statusQ === 'present') statusOk = (rec.status === 'present');
    else if (statusQ === 'absent') statusOk = (rec.status !== 'present');
    else if (statusQ === 'late') statusOk = (rec.status === 'present' && (rec.late_minutes||0) > 0);
    return nameOk && statusOk;
  });
}

document.getElementById('searchDailyName')?.addEventListener('input', () => viewDaily());
document.getElementById('dailyStatusFilter')?.addEventListener('change', () => viewDaily());

function renderDailyTable() {
  const area = document.getElementById('reportsArea');
  if (!area) return;
  area.innerHTML = '';
  const table = document.createElement('table'); table.style.width = '100%'; table.style.borderCollapse = 'collapse'; table.border = '1';
  const thead = document.createElement('thead'); const htr = document.createElement('tr');
  const headers = [
    { key: 'name', label: 'الاسم' },
    { key: 'class', label: 'الصف' },
    { key: 'section', label: 'الشعبة' },
    { key: 'status', label: 'الحالة' },
    { key: 'late_minutes', label: 'التأخر بالدقيقة' }
  ];
  headers.forEach(h => {
    const th = document.createElement('th'); th.textContent = h.label; th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      if (window._dailySortKey === h.key) { window._dailySortAsc = !window._dailySortAsc; }
      else { window._dailySortKey = h.key; window._dailySortAsc = true; }
      renderDailyTable();
    });
    htr.appendChild(th);
  });
  thead.appendChild(htr); table.appendChild(thead);
  const tbody = document.createElement('tbody');
  let records = filterDailyRecords(window._dailyRecords || []);
  const key = window._dailySortKey, asc = window._dailySortAsc;
  records = records.slice().sort((a,b) => {
    const va = a[key] ?? ''; const vb = b[key] ?? '';
    if (typeof va === 'number' && typeof vb === 'number') return asc ? (va - vb) : (vb - va);
    return asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });
  let present = 0, late = 0, absent = 0, totalLateMinutes = 0;
  records.forEach(rec => {
    const tr = document.createElement('tr');
    [rec.name, rec.class, rec.section, rec.status || 'غياب', rec.late_minutes || 0].forEach(val => { const td = document.createElement('td'); td.textContent = String(val||''); tr.appendChild(td); });
    tbody.appendChild(tr);
    if (rec.status === 'present') {
      present += 1; if ((rec.late_minutes||0) > 0) { late += 1; totalLateMinutes += (rec.late_minutes||0); }
    } else { absent += 1; }
  });
  table.appendChild(tbody);
  const totals = document.createElement('div'); totals.style.margin = '8px 0';
  totals.textContent = `إجمالي: حضور ${present} | تأخر ${late} | غياب ${absent} | مجموع دقائق التأخر ${totalLateMinutes}`;
  area.appendChild(totals);
  area.appendChild(table);
}

// Redefine deleteStudent with logs count confirmation
async function deleteStudent(s) {
  try {
    const cResp = await getJSON(`/api/students/${s.id}/logs/count`);
    const count = cResp.count || 0;
    let ok = false;
    if (count > 0) {
      ok = confirm(`يوجد ${count} سجل حضور مرتبط بهذا الطالب. هل تريد الحذف؟`);
    } else {
      ok = confirm('هل تريد حذف هذا الطالب؟');
    }
    if (!ok) return;
    const url = count > 0 ? `/api/students/${s.id}?force=true` : `/api/students/${s.id}`;
    const r = await getJSON(url, { method:'DELETE' });
    if (!r.ok) { alert(msg('studentAddErr', { e: r.error })); return; }
    await loadStudents();
  } catch (e) {
    alert(msg('studentAddErr', { e: String(e) }));
  }
}

// Student range report handlers
document.getElementById('viewStudentRange')?.addEventListener('click', async () => {
  const studentId = document.getElementById('filterStudent')?.value || '';
  if (!studentId) { alert('اختر الطالب أولاً'); return; }
  const from = document.getElementById('rangeFromDate')?.value || '';
  const to = document.getElementById('rangeToDate')?.value || '';
  const params = new URLSearchParams(); params.set('student_id', studentId); if (from) params.set('from', from); if (to) params.set('to', to);
  try {
    const r = await getJSON(`/api/reports/student?${params.toString()}`);
    window._studentRangeRecords = r.records || [];
    window._studentRangeMeta = { name: r.student?.name || '', from: r.from, to: r.to };
    window._studentRangeSortKey = window._studentRangeSortKey || 'day';
    window._studentRangeSortAsc = typeof window._studentRangeSortAsc === 'boolean' ? window._studentRangeSortAsc : true;
    renderStudentRangeTable();
  } catch (e) {
    alert('تعذر عرض تقرير الطالب');
  }
});

function renderStudentRangeTable() {
  const area = document.getElementById('reportsArea');
  if (!area) return; area.innerHTML = '';
  const meta = document.createElement('div'); meta.textContent = `الطالب: ${window._studentRangeMeta?.name||''} | الفترة: ${window._studentRangeMeta?.from||''} - ${window._studentRangeMeta?.to||''}`;
  area.appendChild(meta);
  const table = document.createElement('table'); table.style.width = '100%'; table.style.borderCollapse = 'collapse'; table.border = '1';
  const thead = document.createElement('thead'); const htr = document.createElement('tr');
  const headers = [
    { key: 'day', label: 'التاريخ' },
    { key: 'status', label: 'الحالة' },
    { key: 'late_minutes', label: 'التأخر بالدقيقة' }
  ];
  headers.forEach(h => {
    const th = document.createElement('th'); th.textContent = h.label; th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      if (window._studentRangeSortKey === h.key) { window._studentRangeSortAsc = !window._studentRangeSortAsc; }
      else { window._studentRangeSortKey = h.key; window._studentRangeSortAsc = true; }
      renderStudentRangeTable();
    });
    htr.appendChild(th);
  });
  thead.appendChild(htr); table.appendChild(thead);
  const tbody = document.createElement('tbody');
  let records = filterStudentRangeRecords(window._studentRangeRecords || []);
  const key = window._studentRangeSortKey, asc = window._studentRangeSortAsc;
  records = records.slice().sort((a,b) => {
    const va = a[key] ?? ''; const vb = b[key] ?? '';
    if (key === 'late_minutes') return asc ? ((va||0) - (vb||0)) : ((vb||0) - (va||0));
    return asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });
  let present = 0, late = 0, totalLateMinutes = 0;
  records.forEach(rec => {
    const tr = document.createElement('tr');
    // Row coloring: حضور أخضر فاتح، غياب أحمر فاتح، حضور متأخر برتقالي فاتح
    if (rec.status === 'present' && (rec.late_minutes||0) > 0) { tr.style.background = '#fff3e0'; }
    else if (rec.status === 'present') { tr.style.background = '#e8f5e9'; }
    else { tr.style.background = '#ffebee'; }
    [rec.day, (rec.status==='present' ? ((rec.late_minutes||0)>0 ? 'حضور (متأخر)' : 'حضور') : 'غياب'), rec.late_minutes || 0].forEach(val => { const td = document.createElement('td'); td.textContent = String(val||''); tr.appendChild(td); });
    tbody.appendChild(tr);
    if (rec.status === 'present') {
      present += 1; if ((rec.late_minutes||0) > 0) { late += 1; totalLateMinutes += (rec.late_minutes||0); }
    }
  });
  table.appendChild(tbody);
  const totals = document.createElement('div'); totals.style.margin = '8px 0'; totals.textContent = `إجمالي: حضور ${present} | تأخر ${late} | مجموع دقائق التأخر ${totalLateMinutes}`;
  area.appendChild(totals);
  area.appendChild(table);
}

function filterStudentRangeRecords(all) {
  const dateQ = (document.getElementById('searchStudentRangeDate')?.value || '').trim().toLowerCase();
  const statusQ = (document.getElementById('studentRangeStatusFilter')?.value || '').trim();
  return (all || []).filter(rec => {
    const dateOk = !dateQ || String(rec.day||'').toLowerCase().includes(dateQ);
    let statusOk = true;
    if (statusQ === 'present') statusOk = (rec.status === 'present');
    else if (statusQ === 'absent') statusOk = (rec.status !== 'present');
    else if (statusQ === 'late') statusOk = (rec.status === 'present' && (rec.late_minutes||0) > 0);
    return dateOk && statusOk;
  });
}

document.getElementById('searchStudentRangeDate')?.addEventListener('input', () => renderStudentRangeTable());
document.getElementById('studentRangeStatusFilter')?.addEventListener('change', () => renderStudentRangeTable());

async function exportStudentRange(format) {
  const studentId = document.getElementById('filterStudent')?.value || '';
  if (!studentId) { alert('اختر الطالب أولاً'); return; }
  const from = document.getElementById('rangeFromDate')?.value || '';
  const to = document.getElementById('rangeToDate')?.value || '';
  const lang = localStorage.getItem('lang') || 'ar';
  const params = new URLSearchParams({ format, lang, student_id: String(studentId) }); if (from) params.set('from', from); if (to) params.set('to', to);
  const r = await getJSON(`/api/reports/student/export?${params.toString()}`);
  const area = document.getElementById('reportsArea');
  if (r.ok) {
    const a = document.createElement('a'); a.href = r.file; a.textContent = `${msg('openFile')} ${format.toUpperCase()}`; a.target = '_blank';
    area.innerHTML = ''; area.appendChild(a);
  } else { area.textContent = msg('exportErr', { e: r.error }); }
}

document.getElementById('exportStudentExcel')?.addEventListener('click', () => exportStudentRange('excel'));
document.getElementById('exportStudentPdf')?.addEventListener('click', () => exportStudentRange('pdf'));

// Class range report handlers
document.getElementById('viewClassRange')?.addEventListener('click', async () => {
  const cls = document.getElementById('filterClass')?.value.trim();
  if (!cls) { alert('أدخل الصف أولاً'); return; }
  const section = document.getElementById('filterSection')?.value.trim();
  const from = document.getElementById('classFromDate')?.value || '';
  const to = document.getElementById('classToDate')?.value || '';
  const params = new URLSearchParams({ class: cls }); if (section) params.set('section', section); if (from) params.set('from', from); if (to) params.set('to', to);
  try {
    const r = await getJSON(`/api/reports/class?${params.toString()}`);
    window._classRangeRecords = r.students || [];
    window._classRangeMeta = { cls: r.class, section: r.section, from: r.from, to: r.to };
    window._classRangeSortKey = window._classRangeSortKey || 'name';
    window._classRangeSortAsc = typeof window._classRangeSortAsc === 'boolean' ? window._classRangeSortAsc : true;
    renderClassRangeTable();
  } catch (e) {
    alert('تعذر عرض تقرير الصف');
  }
});

function renderClassRangeTable() {
  const area = document.getElementById('reportsArea'); if (!area) return; area.innerHTML = '';
  const meta = document.createElement('div'); meta.textContent = `الصف: ${window._classRangeMeta?.cls||''} ${window._classRangeMeta?.section?('| الشعبة: '+window._classRangeMeta.section):''} | الفترة: ${window._classRangeMeta?.from||''} - ${window._classRangeMeta?.to||''}`;
  area.appendChild(meta);
  const table = document.createElement('table'); table.style.width = '100%'; table.style.borderCollapse = 'collapse'; table.border = '1';
  const thead = document.createElement('thead'); const htr = document.createElement('tr');
  const headers = [
    { key: 'name', label: 'الاسم' },
    { key: 'present', label: 'حضور' },
    { key: 'late', label: 'تأخر' },
    { key: 'total_late_minutes', label: 'مجموع دقائق التأخر' }
  ];
  headers.forEach(h => {
    const th = document.createElement('th'); th.textContent = h.label; th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      if (window._classRangeSortKey === h.key) { window._classRangeSortAsc = !window._classRangeSortAsc; }
      else { window._classRangeSortKey = h.key; window._classRangeSortAsc = true; }
      renderClassRangeTable();
    });
    htr.appendChild(th);
  });
  thead.appendChild(htr); table.appendChild(thead);
  const tbody = document.createElement('tbody');
  let records = filterClassRangeRecords(window._classRangeRecords || []);
  const key = window._classRangeSortKey, asc = window._classRangeSortAsc;
  records = records.slice().sort((a,b) => {
    const va = a[key] ?? ''; const vb = b[key] ?? '';
    if (typeof va === 'number' && typeof vb === 'number') return asc ? (va - vb) : (vb - va);
    return asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });
  let totalPresent = 0, totalLate = 0, totalLateMinutes = 0;
  records.forEach(rec => {
    const tr = document.createElement('tr');
    [rec.name, rec.present, rec.late, rec.total_late_minutes].forEach(val => { const td = document.createElement('td'); td.textContent = String(val||''); tr.appendChild(td); });
    tbody.appendChild(tr);
    totalPresent += (rec.present||0);
    totalLate += (rec.late||0);
    totalLateMinutes += (rec.total_late_minutes||0);
  });
  table.appendChild(tbody);
  const totals = document.createElement('div'); totals.style.margin = '8px 0'; totals.textContent = `الإجمالي: حضور ${totalPresent} | تأخر ${totalLate} | مجموع دقائق التأخر ${totalLateMinutes}`;
  area.appendChild(totals);
  area.appendChild(table);
}

function filterClassRangeRecords(all) {
  const nameQ = (document.getElementById('searchClassName')?.value || '').trim().toLowerCase();
  const onlyLate = !!document.getElementById('classOnlyLate')?.checked;
  return (all || []).filter(rec => {
    const nameOk = !nameQ || String(rec.name||'').toLowerCase().includes(nameQ);
    const lateOk = !onlyLate || ((rec.late||0) > 0 || (rec.total_late_minutes||0) > 0);
    return nameOk && lateOk;
  });
}

document.getElementById('searchClassName')?.addEventListener('input', () => renderClassRangeTable());
document.getElementById('classOnlyLate')?.addEventListener('change', () => renderClassRangeTable());

async function exportClassRange(format) {
  const cls = document.getElementById('filterClass')?.value.trim();
  if (!cls) { alert('أدخل الصف أولاً'); return; }
  const section = document.getElementById('filterSection')?.value.trim();
  const from = document.getElementById('classFromDate')?.value || '';
  const to = document.getElementById('classToDate')?.value || '';
  const lang = localStorage.getItem('lang') || 'ar';
  const params = new URLSearchParams({ format, lang, class: cls }); if (section) params.set('section', section); if (from) params.set('from', from); if (to) params.set('to', to);
  const r = await getJSON(`/api/reports/class/export?${params.toString()}`);
  const area = document.getElementById('reportsArea');
  if (r.ok) {
    const a = document.createElement('a'); a.href = r.file; a.textContent = `${msg('openFile')} ${format.toUpperCase()}`; a.target = '_blank';
    area.innerHTML = ''; area.appendChild(a);
  } else { area.textContent = msg('exportErr', { e: r.error }); }
}

document.getElementById('exportClassExcel')?.addEventListener('click', () => exportClassRange('excel'));
document.getElementById('exportClassPdf')?.addEventListener('click', () => exportClassRange('pdf'));

// Fonts management
async function loadFonts() {
  try {
    const r = await getJSON('/api/assets/fonts');
    const area = document.getElementById('fontsList');
    if (!area) return;
    area.innerHTML = '';
    const fonts = r.fonts || [];
    if (fonts.length === 0) { area.textContent = 'لا توجد خطوط بعد.'; return; }
    const ul = document.createElement('ul');
    fonts.forEach(f => { const li = document.createElement('li'); li.textContent = `${f.name} (${Math.round((f.size||0)/1024)} KB)`; ul.appendChild(li); });
    area.appendChild(ul);
  } catch (e) {
    const area = document.getElementById('fontsList'); if (area) area.textContent = 'تعذر تحميل قائمة الخطوط';
  }
}

document.getElementById('uploadFontBtn')?.addEventListener('click', async () => {
  try {
    const inp = document.getElementById('fontFile');
    if (!inp || !inp.files || inp.files.length === 0) { alert('اختر ملف الخط أولاً'); return; }
    const fd = new FormData(); fd.append('font', inp.files[0]);
    const r = await fetch('/api/assets/fonts/upload', { method:'POST', body: fd });
    const j = await r.json();
    if (!j.ok) { alert(`خطأ: ${j.error}`); return; }
    alert('تم رفع الخط بنجاح');
    await loadFonts();
  } catch (e) {
    alert('فشل رفع الخط');
  }
});

(async function initFonts(){ await loadFonts(); })();
