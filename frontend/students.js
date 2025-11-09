async function getJSON(url, opts) { const r = await fetch(url, opts); return r.json(); }
document.getElementById('toggle-theme')?.addEventListener('click', () => { document.body.classList.toggle('dark'); });

// Apply UI font from settings on students page
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

async function loadStudents() {
  try {
    const r = await getJSON('/api/students');
    window._studentsData = r.students || [];
    renderStudents();
  } catch (e) {
    document.getElementById('studentsStatus').textContent = 'تعذر تحميل قائمة الطلاب';
  }
}

function renderStudents() {
  const tbody = document.querySelector('#studentsTable tbody'); if (!tbody) return; tbody.innerHTML = '';
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
    const delBtn = document.createElement('button'); delBtn.textContent = 'حذف';
    delBtn.addEventListener('click', () => deleteStudent(s));
    actionsTd.appendChild(delBtn);
    tr.appendChild(nameTd); tr.appendChild(classTd); tr.appendChild(sectionTd); tr.appendChild(deviceTd); tr.appendChild(actionsTd);
    tbody.appendChild(tr);
  });
}

document.getElementById('searchName')?.addEventListener('input', renderStudents);
document.getElementById('searchClass')?.addEventListener('input', renderStudents);
document.getElementById('resetSearch')?.addEventListener('click', () => { const n = document.getElementById('searchName'); if (n) n.value = ''; const c = document.getElementById('searchClass'); if (c) c.value = ''; renderStudents(); });

document.getElementById('addStudent')?.addEventListener('click', async () => {
  try {
    const name = document.getElementById('newName').value.trim();
    const national_id = document.getElementById('newNational').value.trim();
    const guardian_phone = document.getElementById('newGuardian').value.trim();
    const cls = document.getElementById('newClass').value.trim();
    const section = document.getElementById('newSection').value.trim();
    const device_user_id = document.getElementById('newDeviceId').value.trim();
    const r = await getJSON('/api/students', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, national_id, guardian_phone, class: cls, section, device_user_id }) });
    alert(r.ok ? 'تمت إضافة الطالب' : `خطأ: ${r.error}`);
    await loadStudents();
  } catch (e) { alert('تعذر إضافة الطالب'); }
});

document.getElementById('importStudents')?.addEventListener('click', async () => {
  const s = document.getElementById('importStatus'); s.textContent = 'جاري الاستيراد...';
  const r = await getJSON('/api/students/import', { method:'POST' });
  s.textContent = r.ok ? `تم الاستيراد: ${r.imported}` : `خطأ: ${r.error}`;
  await loadStudents();
});

document.getElementById('downloadTemplate')?.addEventListener('click', () => {
  window.location.href = '/api/students/template';
});

async function deleteStudent(s) {
  try {
    const cResp = await getJSON(`/api/students/${s.id}/logs/count`);
    const count = cResp.count || 0;
    let ok = false;
    if (count > 0) { ok = confirm(`يوجد ${count} سجل حضور مرتبط بهذا الطالب. هل تريد الحذف؟`); }
    else { ok = confirm('هل تريد حذف هذا الطالب؟'); }
    if (!ok) return;
    const url = count > 0 ? `/api/students/${s.id}?force=true` : `/api/students/${s.id}`;
    const r = await getJSON(url, { method:'DELETE' });
    if (!r.ok) { alert(`خطأ: ${r.error}`); return; }
    await loadStudents();
  } catch (e) { alert('تعذر حذف الطالب'); }
}

(async function init(){ await loadStudents(); })();
