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
  const from = document.getElementById('rangeFromDate')?.value || '';
  const to = document.getElementById('rangeToDate')?.value || '';
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
document.getElementById('rangeClass')?.addEventListener('input', () => loadStudentsForReports());
document.getElementById('rangeSection')?.addEventListener('input', () => loadStudentsForReports());

async function exportStudentRange(format) {
  const studentId = document.getElementById('filterStudent')?.value || '';
  if (!studentId) { alert('اختر الطالب أولاً'); return; }
  const from = document.getElementById('rangeFromDate')?.value || '';
  const to = document.getElementById('rangeToDate')?.value || '';
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
  const from = document.getElementById('classFromDate')?.value || '';
  const to = document.getElementById('classToDate')?.value || '';
  const lang = localStorage.getItem('lang') || 'ar';
  const params = new URLSearchParams({ class: cls, format, lang }); if (section) params.set('section', section); if (from) params.set('from', from); if (to) params.set('to', to);
  const r = await getJSON(`/api/reports/class/export?${params.toString()}`);
  const area = document.getElementById('reportsArea2'); if (!area) return;
  if (r.ok) { area.innerHTML = ''; const a = document.createElement('a'); a.href = r.file; a.textContent = `فتح الملف ${format.toUpperCase()}`; a.target = '_blank'; a.style.display='inline-block'; a.style.marginTop='6px'; area.appendChild(a); } else { area.textContent = `خطأ: ${r.error}`; }
}
document.getElementById('exportClassExcel')?.addEventListener('click', () => exportClassRange('excel'));
document.getElementById('exportClassPdf')?.addEventListener('click', () => exportClassRange('pdf'));

(async function init(){ await loadStudentsForReports(); })();

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
