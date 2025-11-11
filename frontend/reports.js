// Simple helpers
async function getJSON(url, opts) { const r = await fetch(url, opts); return r.json(); }
document.getElementById('toggle-theme')?.addEventListener('click', () => { document.body.classList.toggle('dark'); });

// Apply UI font from settings on reports page
(async function applyUiFont(){
  try {
    const s = await getJSON('/api/settings');
    const file = s.uiFont || '';
    if (file) {
      const family = file.replace(/\.ttf$/i,'').replace(/\.woff2?$/i,'').replace(/-Regular/i,'');
      const id = 'dyn-font-' + family; if (!document.getElementById(id)) {
        const style = document.createElement('style'); style.id = id;
        style.textContent = `@font-face{font-family:'${family}';src:url('/assets/fonts/${file}') format('truetype');font-weight:400;font-style:normal;font-display:swap;}`;
        document.head.appendChild(style);
      }
      document.documentElement.style.setProperty('--font-ui', `'${family}'`);
    }
  } catch {}
})();

// Tabs
document.querySelectorAll('.tab-button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.getAttribute('data-tab');
    document.querySelectorAll('.tab-section').forEach(sec => {
      sec.classList.toggle('active', sec.getAttribute('data-tab') === tab);
    });
  });
});

// Hijri toggle UI
document.getElementById('useHijri')?.addEventListener('change', () => {
  const on = !!document.getElementById('useHijri')?.checked;
  const hijri = document.getElementById('hijriInputs'); if (hijri) hijri.style.display = on ? 'flex' : 'none';
  document.getElementById('rangeFromDate')?.toggleAttribute('disabled', on);
  document.getElementById('rangeToDate')?.toggleAttribute('disabled', on);
  if (on) { ensureHijriSelectsPopulated('rangeFromHijri', 'rangeToHijri'); }
});

async function hijriToGregorian(hijriStr) {
  // Expects YYYY-MM-DD (Hijri). Uses Aladhan API hToG.
  try {
    const [y,m,d] = String(hijriStr||'').split('-').map(s => s.trim());
    if (!y || !m || !d) return '';
    const url = `https://api.aladhan.com/v1/hToG/${d}-${m}-${y}`;
    const r = await fetch(url);
    const j = await r.json();
    const g = j?.data?.gregorian?.date; // format: DD-MM-YYYY
    if (!g) return '';
    const [dd,mm,yy] = String(g).split('-');
    return `${yy}-${mm}-${dd}`; // ISO-like YYYY-MM-DD
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

function buildHijriISO(fromPrefix, toPrefix) {
  const fy = document.getElementById(`${fromPrefix}Year`)?.value || '';
  const fm = document.getElementById(`${fromPrefix}Month`)?.value || '';
  const fd = document.getElementById(`${fromPrefix}Day`)?.value || '';
  const ty = document.getElementById(`${toPrefix}Year`)?.value || '';
  const tm = document.getElementById(`${toPrefix}Month`)?.value || '';
  const td = document.getElementById(`${toPrefix}Day`)?.value || '';
  const from = fy && fm && fd ? `${fy}-${String(fm).padStart(2,'0')}-${String(fd).padStart(2,'0')}` : '';
  const to = ty && tm && td ? `${ty}-${String(tm).padStart(2,'0')}-${String(td).padStart(2,'0')}` : '';
  return { from, to };
}

function sortClassesArabic(classes) {
  const preferredOrder = [
    'الأول متوسط','الثاني متوسط','الثالث متوسط',
    'الأول ثانوي','الثاني ثانوي','الثالث ثانوي'
  ];
  const uniq = Array.from(new Set((classes||[]).map(c => String(c||'').trim()).filter(Boolean)));
  const inOrder = preferredOrder.filter(c => uniq.includes(c));
  const others = uniq.filter(c => !preferredOrder.includes(c)).sort((a,b) => a.localeCompare(b));
  return [...inOrder, ...others];
}

async function populateClassAndSectionFilters() {
  try {
    const r = await getJSON('/api/students');
    const students = r.students || [];
    const classes = sortClassesArabic(students.map(s => s.class));
    const sections = Array.from(new Set(students.map(s => String(s.section||'').trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
    const fillSel = (id, arr) => { const el = document.getElementById(id); if (!el) return; const prev = el.value || ''; el.innerHTML = ''; const def = document.createElement('option'); def.value = ''; def.textContent = 'الكل'; el.appendChild(def); arr.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; el.appendChild(o); }); if (prev && arr.includes(prev)) el.value = prev; };
    fillSel('rangeClass', classes);
    fillSel('filterClass', classes);
    fillSel('rangeSection', sections);
    fillSel('filterSection', sections);
  } catch {}
}

// Populate students for student report
async function loadStudentsForReports() {
  try {
    const cls = document.getElementById('rangeClass')?.value.trim() || '';
    const section = document.getElementById('rangeSection')?.value.trim() || '';
    const q = new URLSearchParams(); if (cls) q.set('class', cls); if (section) q.set('section', section);
    const r = await getJSON(`/api/students?${q.toString()}`);
    const sel = document.getElementById('filterStudent');
    if (sel) {
      const current = sel.value;
      sel.innerHTML = '';
      const def = document.createElement('option'); def.value = ''; def.textContent = 'اختر الطالب'; sel.appendChild(def);
      (r.students || []).forEach(s => { const opt = document.createElement('option'); opt.value = s.id; opt.textContent = s.name; sel.appendChild(opt); });
      if (current) sel.value = current;
    }
  } catch {}
}

// Student range
document.getElementById('viewStudentRange')?.addEventListener('click', async () => {
  let studentId = document.getElementById('filterStudent')?.value || '';
  const civil = document.getElementById('studentCivil')?.value.trim() || '';
  if (civil) {
    try {
      const s = await getJSON(`/api/students/by-national/${encodeURIComponent(civil)}`);
      if (s.student?.id) studentId = String(s.student.id);
    } catch {}
  }
  if (!studentId) { alert('اختر الطالب أولاً أو أدخل السجل المدني'); return; }
  const useHijri = !!document.getElementById('useHijri')?.checked;
  let from = document.getElementById('rangeFromDate')?.value || '';
  let to = document.getElementById('rangeToDate')?.value || '';
  if (useHijri) {
    const h = buildHijriISO('rangeFromHijri','rangeToHijri');
    const gf = await hijriToGregorian(h.from);
    const gt = await hijriToGregorian(h.to);
    from = gf || '';
    to = gt || '';
    if (!from && h.from) { alert('تعذر تحويل تاريخ البداية (هجري) إلى ميلادي'); return; }
    if (!to && h.to) { alert('تعذر تحويل تاريخ النهاية (هجري) إلى ميلادي'); return; }
  }
  const params = new URLSearchParams(); params.set('student_id', studentId); if (from) params.set('from', from); if (to) params.set('to', to);
  try {
    const r = await getJSON(`/api/reports/student?${params.toString()}`);
    window._studentRangeRecords = r.records || [];
    window._studentRangeMeta = { id: r.student?.id || null, name: r.student?.name || '', class: r.student?.class || '', section: r.student?.section || '', from: r.from, to: r.to };
    window._studentRangeSortKey = window._studentRangeSortKey || 'day';
    window._studentRangeSortAsc = typeof window._studentRangeSortAsc === 'boolean' ? window._studentRangeSortAsc : true;
    window._studentRangeTotals = r.totals || null;
    // Populate edit form with current student data (basic fields)
    document.getElementById('editStudentName')?.setAttribute('value', r.student?.name || '');
    document.getElementById('editStudentNational')?.setAttribute('value', r.student?.national_id || '');
    document.getElementById('editStudentPhone')?.setAttribute('value', r.student?.guardian_phone || '');
    document.getElementById('editStudentClass')?.setAttribute('value', r.student?.class || '');
    document.getElementById('editStudentSection')?.setAttribute('value', r.student?.section || '');
    document.getElementById('editStudentDeviceId')?.setAttribute('value', r.student?.device_user_id || '');
    renderStudentRangeTable();
  } catch { alert('تعذر عرض تقرير الطالب'); }
});

function renderStudentRangeTable() {
  const area = document.getElementById('reportsArea'); if (!area) return; area.innerHTML = '';
  const meta = document.createElement('div'); meta.textContent = `الطالب: ${window._studentRangeMeta?.name||''} | الصف: ${window._studentRangeMeta?.class||''} / ${window._studentRangeMeta?.section||''} | الفترة: ${window._studentRangeMeta?.from||''} - ${window._studentRangeMeta?.to||''}`;
  area.appendChild(meta);
  const table = document.createElement('table'); table.style.width = '100%'; table.style.borderCollapse = 'collapse'; table.border = '1';
  const thead = document.createElement('thead'); const htr = document.createElement('tr');
  const headers = [
    { key: 'day', label: 'التاريخ (اليوم)' },
    { key: 'status', label: 'الحالة' },
    { key: 'late_minutes', label: 'التأخر بالدقيقة' }
  ];
  headers.forEach(h => { const th = document.createElement('th'); th.textContent = h.label; th.style.cursor = 'pointer'; th.addEventListener('click', () => { if (window._studentRangeSortKey === h.key) { window._studentRangeSortAsc = !window._studentRangeSortAsc; } else { window._studentRangeSortKey = h.key; window._studentRangeSortAsc = true; } renderStudentRangeTable(); }); htr.appendChild(th); });
  thead.appendChild(htr); table.appendChild(thead);
  const tbody = document.createElement('tbody');
  let records = filterStudentRangeRecords(window._studentRangeRecords || []);
  const key = window._studentRangeSortKey, asc = window._studentRangeSortAsc;
  records = records.slice().sort((a,b) => { const va = a[key] ?? ''; const vb = b[key] ?? ''; if (key === 'late_minutes') return asc ? ((va||0) - (vb||0)) : ((vb||0) - (va||0)); return asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va)); });
  let present = 0, late = 0, totalLateMinutes = 0;
  records.forEach(rec => {
    const tr = document.createElement('tr');
    // Row coloring: حضور أخضر فاتح، غياب أحمر فاتح، حضور متأخر برتقالي فاتح
    if (rec.status === 'present' && (rec.late_minutes||0) > 0) { tr.style.background = '#fff3e0'; }
    else if (rec.status === 'present') { tr.style.background = '#e8f5e9'; }
    else { tr.style.background = '#ffebee'; }
    const tdDate = document.createElement('td'); tdDate.textContent = `${String(rec.day||'')} (${arabicDayName(rec.day)})`; tr.appendChild(tdDate);
    const tdStatus = document.createElement('td'); tdStatus.textContent = rec.status === 'present' ? ((rec.late_minutes||0) > 0 ? 'حضور (متأخر)' : 'حضور') : 'غياب'; tr.appendChild(tdStatus);
    const tdLate = document.createElement('td'); tdLate.textContent = String(rec.late_minutes || 0); tr.appendChild(tdLate);
    tbody.appendChild(tr);
    if (rec.status === 'present') { present += 1; if ((rec.late_minutes||0) > 0) { late += 1; totalLateMinutes += (rec.late_minutes||0); } else { totalLateMinutes += 0; } }
  });
  table.appendChild(tbody);
  const t = window._studentRangeTotals || { present, late, total_late_minutes: totalLateMinutes, absent: (records.length - present) };
  // Update cards
  setCardValue('cardTotalPresent', t.present);
  setCardValue('cardTotalAbsent', t.absent);
  setCardValue('cardTotalLate', t.late);
  setCardLateMinutes('cardTotalLateMinutes', t.total_late_minutes);
  area.appendChild(table);
}

function filterStudentRangeRecords(all) {
  const dateQ = (document.getElementById('searchStudentRangeDate')?.value || '').trim().toLowerCase();
  const statusQ = (document.getElementById('studentRangeStatusFilter')?.value || '').trim();
  return (all || []).filter(rec => { const dateOk = !dateQ || String(rec.day||'').toLowerCase().includes(dateQ); let statusOk = true; if (statusQ === 'present') statusOk = (rec.status === 'present'); else if (statusQ === 'absent') statusOk = (rec.status !== 'present'); else if (statusQ === 'late') statusOk = (rec.status === 'present' && (rec.late_minutes||0) > 0); return dateOk && statusOk; });
}

document.getElementById('searchStudentRangeDate')?.addEventListener('input', () => renderStudentRangeTable());
document.getElementById('studentRangeStatusFilter')?.addEventListener('change', () => renderStudentRangeTable());
document.getElementById('rangeClass')?.addEventListener('change', () => loadStudentsForReports());
document.getElementById('rangeSection')?.addEventListener('change', () => loadStudentsForReports());

async function exportStudentRange(format) {
  const studentId = document.getElementById('filterStudent')?.value || '';
  if (!studentId) { alert('اختر الطالب أولاً'); return; }
  let from = document.getElementById('rangeFromDate')?.value || '';
  let to = document.getElementById('rangeToDate')?.value || '';
  const useHijri = !!document.getElementById('useHijri')?.checked;
  if (useHijri) {
    const h = buildHijriISO('rangeFromHijri','rangeToHijri');
    const gf = await hijriToGregorian(h.from);
    const gt = await hijriToGregorian(h.to);
    from = gf || '';
    to = gt || '';
    if (!from && h.from) { alert('تعذر تحويل تاريخ البداية (هجري) إلى ميلادي'); return; }
    if (!to && h.to) { alert('تعذر تحويل تاريخ النهاية (هجري) إلى ميلادي'); return; }
  }
  const lang = localStorage.getItem('lang') || 'ar';
  const params = new URLSearchParams({ format, lang, student_id: String(studentId) }); if (from) params.set('from', from); if (to) params.set('to', to);
  const r = await getJSON(`/api/reports/student/export?${params.toString()}`);
  const area = document.getElementById('reportsArea'); if (!area) return;
  if (r.ok) { area.innerHTML = ''; const a = document.createElement('a'); a.href = r.file; a.textContent = `فتح الملف ${format.toUpperCase()}`; a.target = '_blank'; a.style.display='inline-block'; a.style.marginTop='6px'; area.appendChild(a); } else { area.textContent = `خطأ: ${r.error}`; }
}
document.getElementById('exportStudentExcel')?.addEventListener('click', () => exportStudentRange('excel'));
document.getElementById('exportStudentPdf')?.addEventListener('click', () => exportStudentRange('pdf'));

// Export students data file (Excel)
document.getElementById('exportStudentsFile')?.addEventListener('click', async () => {
  try {
    const r = await getJSON('/api/students/export', { method: 'POST' });
    const area = document.getElementById('reportsArea'); if (area) { area.innerHTML = ''; }
    if (r.ok && r.file) {
      const a = document.createElement('a'); a.href = r.file; a.textContent = 'فتح ملف الطلاب (Excel)'; a.target = '_blank'; a.style.display='inline-block'; a.style.marginTop='6px'; (area||document.body).appendChild(a);
    } else {
      (area||document.body).appendChild(document.createTextNode(`خطأ: ${r.error||'تعذر الحفظ'}`));
    }
  } catch { alert('تعذر حفظ ملف الطلاب'); }
});

// Class range
document.getElementById('viewClassRange')?.addEventListener('click', async () => {
  const cls = document.getElementById('filterClass')?.value.trim(); if (!cls) { alert('أدخل الصف أولاً'); return; }
  const section = document.getElementById('filterSection')?.value.trim();
  let from = document.getElementById('classFromDate')?.value || '';
  let to = document.getElementById('classToDate')?.value || '';
  const useHijriClass = !!document.getElementById('useHijriClass')?.checked;
  if (useHijriClass) {
    ensureHijriSelectsPopulated('classFromHijri', 'classToHijri');
    const h = buildHijriISO('classFromHijri', 'classToHijri');
    const gf = await hijriToGregorian(h.from);
    const gt = await hijriToGregorian(h.to);
    from = gf || '';
    to = gt || '';
    if (!from && h.from) { alert('تعذر تحويل تاريخ البداية (هجري) إلى ميلادي'); return; }
    if (!to && h.to) { alert('تعذر تحويل تاريخ النهاية (هجري) إلى ميلادي'); return; }
  }
  const params = new URLSearchParams({ class: cls }); if (section) params.set('section', section); if (from) params.set('from', from); if (to) params.set('to', to);
  try {
    const r = await getJSON(`/api/reports/class?${params.toString()}`);
    window._classRangeRecords = r.students || [];
    window._classRangeMeta = { cls: r.class, section: r.section, from: r.from, to: r.to };
    window._classRangeSortKey = window._classRangeSortKey || 'name';
    window._classRangeSortAsc = typeof window._classRangeSortAsc === 'boolean' ? window._classRangeSortAsc : true;
    renderClassRangeTable();
  } catch { alert('تعذر عرض تقرير الصف'); }
});

function renderClassRangeTable() {
  const area = document.getElementById('reportsArea2'); if (!area) return; area.innerHTML = '';
  const meta = document.createElement('div'); meta.textContent = `الصف: ${window._classRangeMeta?.cls||''} ${window._classRangeMeta?.section?('| الشعبة: '+window._classRangeMeta.section):''} | الفترة: ${window._classRangeMeta?.from||''} - ${window._classRangeMeta?.to||''}`;
  area.appendChild(meta);
  const table = document.createElement('table'); table.style.width = '100%'; table.style.borderCollapse = 'collapse'; table.border = '1';
  const thead = document.createElement('thead'); const htr = document.createElement('tr');
  const headers = [ { key: 'name', label: 'الاسم' }, { key: 'present', label: 'حضور' }, { key: 'late', label: 'تأخر' }, { key: 'total_late_minutes', label: 'مجموع دقائق التأخر' } ];
  headers.forEach(h => { const th = document.createElement('th'); th.textContent = h.label; th.style.cursor = 'pointer'; th.addEventListener('click', () => { if (window._classRangeSortKey === h.key) { window._classRangeSortAsc = !window._classRangeSortAsc; } else { window._classRangeSortKey = h.key; window._classRangeSortAsc = true; } renderClassRangeTable(); }); htr.appendChild(th); });
  thead.appendChild(htr); table.appendChild(thead);
  const tbody = document.createElement('tbody');
  let records = filterClassRangeRecords(window._classRangeRecords || []);
  const key = window._classRangeSortKey, asc = window._classRangeSortAsc;
  records = records.slice().sort((a,b) => { const va = a[key] ?? ''; const vb = b[key] ?? ''; if (typeof va === 'number' && typeof vb === 'number') return asc ? (va - vb) : (vb - va); return asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va)); });
  let totalPresent = 0, totalLate = 0, totalLateMinutes = 0;
  records.forEach(rec => { const tr = document.createElement('tr'); [rec.name, rec.present, rec.late, rec.total_late_minutes].forEach(val => { const td = document.createElement('td'); td.textContent = String(val||''); tr.appendChild(td); }); tbody.appendChild(tr); totalPresent += (rec.present||0); totalLate += (rec.late||0); totalLateMinutes += (rec.total_late_minutes||0); });
  table.appendChild(tbody);
  const totals = document.createElement('div'); totals.style.margin = '8px 0'; totals.textContent = `الإجمالي: حضور ${totalPresent} | تأخر ${totalLate} | مجموع دقائق التأخر ${totalLateMinutes}`;
  area.appendChild(totals);
  area.appendChild(table);
}

function filterClassRangeRecords(all) { const nameQ = (document.getElementById('searchClassName')?.value || '').trim().toLowerCase(); const onlyLate = !!document.getElementById('classOnlyLate')?.checked; return (all || []).filter(rec => { const nameOk = !nameQ || String(rec.name||'').toLowerCase().includes(nameQ); const lateOk = !onlyLate || ((rec.late||0) > 0 || (rec.total_late_minutes||0) > 0); return nameOk && lateOk; }); }
document.getElementById('searchClassName')?.addEventListener('input', () => renderClassRangeTable());
document.getElementById('classOnlyLate')?.addEventListener('change', () => renderClassRangeTable());

async function exportClassRange(format) {
  const cls = document.getElementById('filterClass')?.value.trim(); if (!cls) { alert('أدخل الصف أولاً'); return; }
  const section = document.getElementById('filterSection')?.value.trim();
  let from = document.getElementById('classFromDate')?.value || '';
  let to = document.getElementById('classToDate')?.value || '';
  const useHijriClass = !!document.getElementById('useHijriClass')?.checked;
  if (useHijriClass) {
    ensureHijriSelectsPopulated('classFromHijri', 'classToHijri');
    const h = buildHijriISO('classFromHijri', 'classToHijri');
    const gf = await hijriToGregorian(h.from);
    const gt = await hijriToGregorian(h.to);
    from = gf || '';
    to = gt || '';
    if (!from && h.from) { alert('تعذر تحويل تاريخ البداية (هجري) إلى ميلادي'); return; }
    if (!to && h.to) { alert('تعذر تحويل تاريخ النهاية (هجري) إلى ميلادي'); return; }
  }
  const lang = localStorage.getItem('lang') || 'ar';
  const params = new URLSearchParams({ class: cls, format, lang }); if (section) params.set('section', section); if (from) params.set('from', from); if (to) params.set('to', to);
  const r = await getJSON(`/api/reports/class/export?${params.toString()}`);
  const area = document.getElementById('reportsArea2'); if (!area) return;
  if (r.ok) { area.innerHTML = ''; const a = document.createElement('a'); a.href = r.file; a.textContent = `فتح الملف ${format.toUpperCase()}`; a.target = '_blank'; a.style.display='inline-block'; a.style.marginTop='6px'; area.appendChild(a); } else { area.textContent = `خطأ: ${r.error}`; }
}
document.getElementById('exportClassExcel')?.addEventListener('click', () => exportClassRange('excel'));
document.getElementById('exportClassPdf')?.addEventListener('click', () => exportClassRange('pdf'));

(document.getElementById('useHijriClass'))?.addEventListener('change', () => {
  const on = !!document.getElementById('useHijriClass')?.checked;
  const hijri = document.getElementById('hijriClassInputs'); if (hijri) hijri.style.display = on ? 'flex' : 'none';
  document.getElementById('classFromDate')?.toggleAttribute('disabled', on);
  document.getElementById('classToDate')?.toggleAttribute('disabled', on);
  if (on) ensureHijriSelectsPopulated('classFromHijri', 'classToHijri');
});

(async function init(){ await populateClassAndSectionFilters(); ensureHijriSelectsPopulated('rangeFromHijri','rangeToHijri'); await loadStudentsForReports(); })();

// Utilities
function arabicDayName(dateStr) {
  try {
    const d = new Date(String(dateStr));
    const day = d.getDay(); // 0=Sun..6=Sat
    const names = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
    return names[day] || '';
  } catch { return ''; }
}

function setCardValue(cardId, value) {
  const el = document.querySelector(`#${cardId} .card-value`);
  if (el) el.textContent = String(value || 0);
}

function setCardLateMinutes(cardId, totalMinutes) {
  const el = document.querySelector(`#${cardId} .card-value`);
  if (!el) return;
  const m = Number(totalMinutes || 0);
  if (m >= 60) {
    const h = Math.floor(m / 60); const rm = m % 60;
    el.textContent = `${h} ساعة و ${rm} دقيقة`;
  } else {
    el.textContent = `${m} دقيقة`;
  }
}

// Save inline student edit
document.getElementById('saveStudentEdit')?.addEventListener('click', async () => {
  try {
    const id = window._studentRangeMeta?.id || document.getElementById('filterStudent')?.value || '';
    if (!id) { alert('اختر الطالب أولاً'); return; }
    const name = document.getElementById('editStudentName')?.value || '';
    const national_id = document.getElementById('editStudentNational')?.value || '';
    const guardian_phone = document.getElementById('editStudentPhone')?.value || '';
    const cls = document.getElementById('editStudentClass')?.value || '';
    const section = document.getElementById('editStudentSection')?.value || '';
    const device_user_id = document.getElementById('editStudentDeviceId')?.value || '';
    const r = await getJSON(`/api/students/${encodeURIComponent(id)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, national_id, guardian_phone, class: cls, section, device_user_id }) });
    const s = document.getElementById('editStudentStatus'); if (s) { s.textContent = r.ok ? 'تم حفظ بيانات الطالب' : `خطأ: ${r.error}`; }
    if (r.ok) {
      // Refresh student list and re-render report if already loaded
      await loadStudentsForReports();
      if (window._studentRangeRecords) renderStudentRangeTable();
    }
  } catch (e) {
    const s = document.getElementById('editStudentStatus'); if (s) { s.textContent = `خطأ: ${String(e)}`; }
  }
});
