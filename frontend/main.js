let currentLang = localStorage.getItem('lang') || 'ar';
let allRecords = [];

async function fetchToday() {
  const res = await fetch('/api/attendance/today');
  const data = await res.json();
  return data.records || [];
}

function renderCards(records) {
  const cards = document.getElementById('cards');
  cards.innerHTML = '';
  records.forEach(r => {
    const status = r.status || 'absent';
    const badgeClass = status === 'present' ? (r.late_minutes > 0 ? 'late' : 'present') : 'absent';
    const t = {
      ar: { present: 'حضور', absent: 'غياب', lateLabel: 'التأخر', minutes: 'دقيقة' },
      en: { present: 'Present', absent: 'Absent', lateLabel: 'Late', minutes: 'min' }
    }[currentLang];
    const isLate = status === 'present' && (r.late_minutes > 0);
    const lateText = status === 'present'
      ? (isLate ? `${t.lateLabel}: ${r.late_minutes} ${t.minutes}` : t.present)
      : t.absent;
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <div class="badge ${badgeClass}">${status === 'present' ? t.present : t.absent}</div>
      <div class="student-name">${r.name}</div>
      <small>${r.class || ''} ${r.section || ''}</small>
      <div>${lateText}</div>
    `;
    cards.appendChild(div);
  });
}

document.getElementById('toggle-theme')?.addEventListener('click', () => {
  document.body.classList.toggle('dark');
});

// Apply UI font from settings across dashboard
(async function applyUiFont(){
  try {
    const s = await (await fetch('/api/settings')).json();
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

document.getElementById('refresh')?.addEventListener('click', async () => {
  const records = await fetchToday();
  allRecords = records;
  populateFilters();
  renderCards(getFilteredRecords());
});

function applyLang(lang) {
  currentLang = lang;
  document.documentElement.lang = lang === 'ar' ? 'ar' : 'en';
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  if (lang === 'ar') {
    setText('dash-title', 'لوحة الحضور اليومية');
    setText('toggle-theme', 'الوضع الليلي/النهاري');
    setText('refresh', 'تحديث');
    setText('lbl-class', 'الصف');
    setText('lbl-section', 'الشعبة');
    setText('lbl-status', 'الحالة');
    setText('opt-class-all', 'الكل');
    setText('opt-section-all', 'الكل');
    setText('opt-status-all', 'الكل');
    setText('opt-status-present', 'حضور');
    setText('opt-status-absent', 'غياب');
    setText('opt-status-late', 'تأخر');
  } else {
    setText('dash-title', 'Daily Attendance');
    setText('toggle-theme', 'Light/Dark');
    setText('refresh', 'Refresh');
    setText('lbl-class', 'Class');
    setText('lbl-section', 'Section');
    setText('lbl-status', 'Status');
    setText('opt-class-all', 'All');
    setText('opt-section-all', 'All');
    setText('opt-status-all', 'All');
    setText('opt-status-present', 'Present');
    setText('opt-status-absent', 'Absent');
    setText('opt-status-late', 'Late');
  }
}

applyLang(currentLang);
document.getElementById('toggle-lang')?.addEventListener('click', () => {
  const next = (localStorage.getItem('lang') || 'ar') === 'ar' ? 'en' : 'ar';
  localStorage.setItem('lang', next);
  applyLang(next);
  // Re-render to reflect language labels
  renderCards(getFilteredRecords());
});

(async function init(){
  const records = await fetchToday();
  allRecords = records;
  populateFilters();
  renderCards(getFilteredRecords());
})();

function populateFilters() {
  const rawClasses = Array.from(new Set(allRecords.map(r => r.class).filter(Boolean)));
  const preferredOrder = [
    'الأول متوسط','الثاني متوسط','الثالث متوسط',
    'الأول ثانوي','الثاني ثانوي','الثالث ثانوي'
  ];
  const inOrder = preferredOrder.filter(c => rawClasses.includes(c));
  const others = rawClasses.filter(c => !preferredOrder.includes(c)).sort((a,b) => a.localeCompare(b));
  const classes = [...inOrder, ...others];
  const sections = Array.from(new Set(allRecords.map(r => r.section).filter(Boolean)));
  const classSel = document.getElementById('classFilter');
  const sectionSel = document.getElementById('sectionFilter');
  if (classSel) {
    const preserveFirst = classSel.querySelector('option[value=""]');
    classSel.innerHTML = '';
    if (preserveFirst) classSel.appendChild(preserveFirst);
    classes.forEach(c => { const opt = document.createElement('option'); opt.value = c; opt.textContent = c; classSel.appendChild(opt); });
  }
  if (sectionSel) {
    const preserveFirst = sectionSel.querySelector('option[value=""]');
    sectionSel.innerHTML = '';
    if (preserveFirst) sectionSel.appendChild(preserveFirst);
    sections.forEach(s => { const opt = document.createElement('option'); opt.value = s; opt.textContent = s; sectionSel.appendChild(opt); });
  }
}

function getFilteredRecords() {
  const classVal = document.getElementById('classFilter')?.value || '';
  const sectionVal = document.getElementById('sectionFilter')?.value || '';
  const statusVal = document.getElementById('statusFilter')?.value || '';
  return allRecords.filter(r => {
    const clsOk = !classVal || r.class === classVal;
    const secOk = !sectionVal || r.section === sectionVal;
    let stOk = true;
    if (statusVal === 'present') stOk = (r.status === 'present');
    else if (statusVal === 'absent') stOk = (r.status !== 'present');
    else if (statusVal === 'late') stOk = (r.status === 'present' && r.late_minutes > 0);
    return clsOk && secOk && stOk;
  });
}

document.getElementById('classFilter')?.addEventListener('change', () => renderCards(getFilteredRecords()));
document.getElementById('sectionFilter')?.addEventListener('change', () => renderCards(getFilteredRecords()));
document.getElementById('statusFilter')?.addEventListener('change', () => renderCards(getFilteredRecords()));
