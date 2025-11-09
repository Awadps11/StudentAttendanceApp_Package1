import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import { all, run, get } from '../services/Db';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const cls = String(req.query.class || '').trim();
    const section = String(req.query.section || '').trim();
    const national_id = String(req.query.national_id || '').trim();
    if (national_id) {
      const s = await get<any>(`SELECT * FROM students WHERE national_id = ?`, [national_id]);
      return res.json({ student: s || null });
    }
    let sql = `SELECT * FROM students`;
    const params: any[] = [];
    const where: string[] = [];
    if (cls) { where.push('class = ?'); params.push(cls); }
    if (section) { where.push('section = ?'); params.push(section); }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY name ASC`;
    const students = await all(sql, params);
    res.json({ students });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

// Get student by national id (explicit route)
router.get('/by-national/:nid', async (req, res) => {
  try {
    const nid = String(req.params.nid || '').trim();
    if (!nid) return res.status(400).json({ error: 'nid required' });
    const s = await get<any>(`SELECT * FROM students WHERE national_id = ?`, [nid]);
    res.json({ student: s || null });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  const { name, national_id, guardian_phone, class: cls, section, device_user_id } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    // Duplicate checks
    if (national_id) {
      const existing = await get<{ id:number }>(`SELECT id FROM students WHERE national_id = ?`, [national_id]);
      if (existing) return res.status(409).json({ error: 'Duplicate national_id' });
    }
    if (device_user_id) {
      const existingDev = await get<{ id:number }>(`SELECT id FROM students WHERE device_user_id = ?`, [device_user_id]);
      if (existingDev) return res.status(409).json({ error: 'Duplicate device_user_id' });
    }
    await run(`INSERT INTO students(name, national_id, guardian_phone, class, section) VALUES(?,?,?,?,?)`, [
      name, national_id || '', guardian_phone || '', cls || '', section || ''
    ]);
    if (device_user_id) {
      await run(`UPDATE students SET device_user_id=? WHERE rowid = last_insert_rowid()`, [device_user_id]);
    }
    res.json({ ok: true });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

// Update student by id
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const { name, national_id, guardian_phone, class: cls, section, device_user_id } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    // Duplicate checks (exclude current id)
    if (national_id) {
      const dup = await get<{ id:number }>(`SELECT id FROM students WHERE national_id = ? AND id <> ?`, [national_id, id]);
      if (dup) return res.status(409).json({ error: 'Duplicate national_id' });
    }
    if (device_user_id) {
      const dupDev = await get<{ id:number }>(`SELECT id FROM students WHERE device_user_id = ? AND id <> ?`, [device_user_id, id]);
      if (dupDev) return res.status(409).json({ error: 'Duplicate device_user_id' });
    }
    await run(
      `UPDATE students SET name=?, national_id=?, guardian_phone=?, class=?, section=?, device_user_id=? WHERE id=?`,
      [name, national_id || '', guardian_phone || '', cls || '', section || '', device_user_id || '', id]
    );
    res.json({ ok: true });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

// Delete student by id
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const count = await get<{ c:number }>(`SELECT COUNT(*) as c FROM attendance_logs WHERE student_id = ?`, [id]);
    const hasLogs = (count?.c || 0) > 0;
    const force = String(req.query.force || '') === 'true';
    if (hasLogs && !force) {
      return res.status(409).json({ error: 'student has logs', count: count?.c || 0 });
    }
    if (hasLogs && force) {
      await run(`DELETE FROM attendance_logs WHERE student_id = ?`, [id]);
    }
    await run(`DELETE FROM students WHERE id=?`, [id]);
    res.json({ ok: true });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

// Count logs for a student (used to confirm deletion)
router.get('/:id/logs/count', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const row = await get<{ c:number }>(`SELECT COUNT(*) as c FROM attendance_logs WHERE student_id = ?`, [id]);
    res.json({ ok: true, count: row?.c || 0 });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/import', async (req, res) => {
  try {
    // Support multiple candidate files from the package root
    const candidates = [
      'StudentsTemplate (1).xlsx',
      'StudentsTemplate.xlsx',
      'SampleStudents.xlsx',
      'SampleStudents.csv'
    ];
    const resolved = candidates.map(fn => path.resolve(__dirname, '../../..', fn));
    const existing = resolved.find(p => fs.existsSync(p));
    let imported = 0;

    if (!existing) {
      return res.status(404).json({ error: 'No student import file found (StudentsTemplate (1).xlsx / StudentsTemplate.xlsx / SampleStudents.xlsx / .csv)' });
    }

    function cellText(val: any): string {
      if (val == null) return '';
      if (typeof val === 'object' && val && 'result' in val) {
        // ExcelJS formula cell with cached result
        const r = (val as any).result;
        return String(r ?? '').trim();
      }
      return String(val).trim();
    }

    if (existing.toLowerCase().endsWith('.xlsx')) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(existing);
      const sheet = wb.worksheets[0];
      sheet.eachRow((row, rowNumber) => {
        // Skip header (row 1) and instruction row (common in template, row 2)
        if (rowNumber <= 2) return;
        const name = cellText(row.getCell(1).value);
        const national_id = cellText(row.getCell(2).value);
        const guardian_phone = cellText(row.getCell(3).value);
        // Prefer class_code column (7) mapping; fallback to class text (4)
        let clsCode = cellText(row.getCell(7).value);
        let clsText = cellText(row.getCell(4).value);
        let cls = mapClassCode(clsCode || clsText);
        const section = cellText(row.getCell(5).value);
        const device_user_id = cellText(row.getCell(6).value);
        if (!name) return;
        run(`INSERT OR IGNORE INTO students(name, national_id, guardian_phone, class, section, device_user_id) VALUES(?,?,?,?,?,?)`, [
          name, national_id, guardian_phone, cls, section, device_user_id
        ]).then(() => imported++);
      });
    } else if (existing.toLowerCase().endsWith('.csv')) {
      const raw = fs.readFileSync(existing, 'utf8');
      const lines = raw.split(/\r?\n/).filter(Boolean);
      for (let i = 1; i < lines.length; i++) { // skip header
        const cols = lines[i].split(',');
        const name = (cols[0] || '').trim();
        const national_id = (cols[1] || '').trim();
        const guardian_phone = (cols[2] || '').trim();
        let clsCodeOrText = (cols[6] || '').trim() || (cols[3] || '').trim();
        const cls = mapClassCode(clsCodeOrText);
        const section = (cols[4] || '').trim();
        const device_user_id = (cols[5] || '').trim();
        if (!name) continue;
        await run(`INSERT OR IGNORE INTO students(name, national_id, guardian_phone, class, section, device_user_id) VALUES(?,?,?,?,?,?)`, [
          name, national_id, guardian_phone, cls, section, device_user_id
        ]);
        imported++;
      }
    }

    res.json({ ok: true, imported, file: existing });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

// Provide Excel template matching DB schema
router.get('/template', async (req, res) => {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('StudentsTemplate');
    ws.addRow(['name','national_id','guardian_phone','class','section','device_user_id','class_code']);
    // Instructions row
    ws.addRow(['ملاحظة: اكتب رقم الصف في عمود class_code (1..6)، وسيتم تحويله تلقائيًا إلى نص في عمود class.','', '', '', '', '', '1=الأول متوسط, 2=الثاني متوسط, 3=الثالث متوسط, 4=الأول ثانوي, 5=الثاني ثانوي, 6=الثالث ثانوي']);
    // Prepare formula for class to map from class_code (column G)
    for (let r = 3; r <= 200; r++) {
      const cell = ws.getCell(`D${r}`); // class column
      cell.value = { formula: `IFERROR(CHOOSE(G${r},"الأول متوسط","الثاني متوسط","الثالث متوسط","الأول ثانوي","الثاني ثانوي","الثالث ثانوي"),"")` } as any;
    }
    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="StudentsTemplate.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

function mapClassCode(val: string): string {
  const s = String(val||'').trim();
  if (/^[1-6]$/.test(s)) {
    switch (s) {
      case '1': return 'الأول متوسط';
      case '2': return 'الثاني متوسط';
      case '3': return 'الثالث متوسط';
      case '4': return 'الأول ثانوي';
      case '5': return 'الثاني ثانوي';
      case '6': return 'الثالث ثانوي';
    }
  }
  // already textual or empty
  return s;
}

// Export current students to Excel (saved reports directory)
// POST /api/students/export
router.post('/export', async (req, res) => {
  try {
    const rows = await all<any>(`SELECT name, national_id, guardian_phone, class, section, device_user_id FROM students ORDER BY name ASC`);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Students');
    ws.addRow(['name','national_id','guardian_phone','class','section','device_user_id','class_code']);
    const codeFromClass = (cls: string): string => {
      const m: Record<string,string> = {
        'الأول متوسط': '1', 'الثاني متوسط': '2', 'الثالث متوسط': '3',
        'الأول ثانوي': '4', 'الثاني ثانوي': '5', 'الثالث ثانوي': '6'
      };
      return m[String(cls||'').trim()] || '';
    };
    rows.forEach(r => {
      ws.addRow([r.name||'', r.national_id||'', r.guardian_phone||'', r.class||'', r.section||'', r.device_user_id||'', codeFromClass(r.class||'')]);
    });
    const reportsDir = path.resolve(__dirname, '../../reports/saved');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
    const fileName = 'StudentsData.xlsx';
    const filePath = path.join(reportsDir, fileName);
    await wb.xlsx.writeFile(filePath);
    res.json({ ok: true, file: `/saved-reports/${encodeURIComponent(fileName)}`, count: rows.length });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
