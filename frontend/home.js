async function getJSON(url, opts) { const r = await fetch(url, opts); return r.json(); }

function renderHomeCards(records) {
  const cards = document.getElementById('homeCards'); if (!cards) return;
  cards.innerHTML = '';
  const classQ = (document.getElementById('homeClassFilter')?.value || '').trim();
  const sectionQ = (document.getElementById('homeSectionFilter')?.value || '').trim();
  const stageQ = (document.getElementById('homeStageFilter')?.value || '').trim();
  const statusQ = (document.getElementById('homeStatusFilter')?.value || '').trim();
  const filtered = (records||[]).filter(r => {
    const clsOk = !classQ || r.class === classQ;
    const secOk = !sectionQ || r.section === sectionQ;
    const stageOk = !stageQ || matchStage(r.class, stageQ);
    let stOk = true;
    if (statusQ === 'present') stOk = (r.status === 'present');
    else if (statusQ === 'absent') stOk = (r.status === 'absent');
    else if (statusQ === 'late') stOk = (r.status === 'present' && (r.late_minutes||0) > 0);
    else if (statusQ === 'not_yet') stOk = (r.status === 'not_yet');
    return clsOk && secOk && stageOk && stOk;
  });
  filtered.forEach(r => {
    const status = r.status || 'absent';
    let badgeClass = 'absent'; let labelAr = 'غياب';
    if (status === 'present') { badgeClass = (r.late_minutes > 0) ? 'late' : 'present'; labelAr = 'حضور'; }
    else if (status === 'not_yet') { badgeClass = 'late'; labelAr = 'لم يصل بعد'; }
    const lateText = (status === 'present') ? ((r.late_minutes>0)? `التأخر: ${r.late_minutes} دقيقة`: 'حضور') : (status === 'not_yet' ? 'لم يصل بعد' : 'غياب');
    const div = document.createElement('div'); div.className = 'card';
    div.innerHTML = `
      <div class="badge ${badgeClass}">${labelAr}</div>
      <div class="student-name">${r.name}</div>
      <small>${r.class || ''} ${r.section || ''}</small>
      <div>${lateText}</div>
    `;
    cards.appendChild(div);
  });
}

async function refreshHome() {
  try {
    const r = await getJSON('/api/attendance/today');
    window._homeRecords = r.records || [];
    window._homeWeekend = !!r.weekend;
    renderHomeCards(window._homeRecords);
    renderHomeCounters(window._homeRecords);
    renderTopBadge(window._homeRecords, { weekend: window._homeWeekend });
  } catch {}
}

document.getElementById('homeRefresh')?.addEventListener('click', refreshHome);
document.getElementById('homeClassFilter')?.addEventListener('input', () => renderHomeCards(window._homeRecords || []));
document.getElementById('homeSectionFilter')?.addEventListener('input', () => renderHomeCards(window._homeRecords || []));
document.getElementById('homeStageFilter')?.addEventListener('change', () => renderHomeCards(window._homeRecords || []));
document.getElementById('homeStatusFilter')?.addEventListener('change', () => renderHomeCards(window._homeRecords || []));

async function autoImportFromRoot() {
  try {
    // Import students from known root files (supports StudentsTemplate (1).xlsx)
    await getJSON('/api/students/import', { method:'POST' });
  } catch {}
  try {
    // Import attendance logs from default root file if present
    await getJSON('/api/attendance/import-file', { method:'POST' });
  } catch {}
}

(async function init(){ await autoImportFromRoot(); await refreshHome(); })();

function matchStage(clsText, stage) {
  const t = String(clsText||'');
  const middle = ['الأول متوسط','الثاني متوسط','الثالث متوسط'];
  const high = ['الأول ثانوي','الثاني ثانوي','الثالث ثانوي'];
  if (stage === 'middle') return middle.some(x => t.includes(x));
  if (stage === 'high') return high.some(x => t.includes(x));
  return true;
}

function renderHomeCounters(records) {
  const c = document.getElementById('homeCounters'); if (!c) return;
  let present = 0, late = 0, absent = 0, notYet = 0;
  (records||[]).forEach(r => { if (r.status === 'present') { present++; if ((r.late_minutes||0)>0) late++; } else if (r.status === 'absent') absent++; else if (r.status === 'not_yet') notYet++; });
  c.innerHTML = '';
  const makeChip = (label, value, color) => { const div = document.createElement('div'); div.style.background = color; div.style.color = '#fff'; div.style.borderRadius = '999px'; div.style.padding = '6px 10px'; div.textContent = `${label}: ${value}`; return div; };
  c.appendChild(makeChip('حضور', present, 'var(--present)'));
  c.appendChild(makeChip('غياب', absent, 'var(--absent)'));
  c.appendChild(makeChip('تأخر', late, 'var(--late)'));
  c.appendChild(makeChip('لم يصل بعد', notYet, 'var(--accent)'));
}

async function renderTopBadge(records, opts) {
  const el = document.getElementById('homeBadge'); if (!el) return;
  if (opts && opts.weekend) {
    el.innerHTML = '';
    const chip = document.createElement('div'); chip.className = 'badge'; chip.style.padding = '6px 10px'; chip.style.fontSize = '13px'; chip.style.borderRadius = '999px'; chip.style.background = 'var(--accent)';
    chip.textContent = 'اليوم عطلة (الجمعة/السبت) — لا يُحتسب الغياب';
    el.appendChild(chip);
    return;
  }
  let absent = 0, notYet = 0; (records||[]).forEach(r => { if (r.status === 'absent') absent++; else if (r.status === 'not_yet') notYet++; });
  try {
    const s = await getJSON('/api/settings');
    const cutoff = s.absentCutoff || '08:30'; const [hh,mm] = cutoff.split(':').map(Number);
    const now = new Date(); const beforeCutoff = (now.getHours()*60 + now.getMinutes()) < (hh*60 + mm);
    el.innerHTML = '';
    const chip = document.createElement('div'); chip.className = 'badge'; chip.style.padding = '6px 10px'; chip.style.fontSize = '13px'; chip.style.borderRadius = '999px'; chip.style.background = 'var(--accent)';
    chip.textContent = beforeCutoff ? `لم يصل بعد: ${notYet}` : `الغياب: ${absent}`;
    el.appendChild(chip);
  } catch {}
}

document.getElementById('homeExportPdf')?.addEventListener('click', async () => {
  const cls = document.getElementById('homeClassFilter')?.value.trim() || '';
  const section = document.getElementById('homeSectionFilter')?.value.trim() || '';
  const status = document.getElementById('homeStatusFilter')?.value || '';
  const lang = localStorage.getItem('lang') || 'ar';
  const q = new URLSearchParams({ lang }); if (cls) q.set('class', cls); if (section) q.set('section', section); if (status) q.set('status', status);
  const r = await getJSON(`/api/reports/today/export?${q.toString()}`);
  const cont = document.getElementById('homeExportLink');
  if (r.ok && r.file && cont) {
    cont.innerHTML = '';
    const a = document.createElement('a'); a.href = r.file; a.textContent = 'فتح الملف'; a.target = '_blank'; a.style.marginInlineStart = '8px'; a.style.display = 'inline-block';
    cont.appendChild(a);
  } else { alert('تعذر التصدير'); }
});
