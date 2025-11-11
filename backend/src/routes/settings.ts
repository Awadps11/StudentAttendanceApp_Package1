import { Router } from 'express';
import { get, run } from '../services/Db';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const schedule = await get<{ value: string }>(`SELECT value FROM settings WHERE key='scheduleStart'`);
    const uiFont = await get<{ value: string }>(`SELECT value FROM settings WHERE key='uiFont'`);
    const pdfFont = await get<{ value: string }>(`SELECT value FROM settings WHERE key='pdfFont'`);
    const absentCutoff = await get<{ value: string }>(`SELECT value FROM settings WHERE key='absentCutoff'`);
    const weeklyHolidays = await get<{ value: string }>(`SELECT value FROM settings WHERE key='weeklyHolidays'`);
    const vacations = await get<{ value: string }>(`SELECT value FROM settings WHERE key='vacations'`);
    res.json({
      scheduleStart: schedule?.value || '07:00',
      uiFont: uiFont?.value || '',
      pdfFont: pdfFont?.value || '',
      absentCutoff: absentCutoff?.value || '08:30',
      weeklyHolidays: weeklyHolidays?.value ? JSON.parse(weeklyHolidays.value) : [],
      vacations: vacations?.value ? JSON.parse(vacations.value) : []
    });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { scheduleStart, uiFont, pdfFont, absentCutoff, weeklyHolidays, vacations, applyVacations } = req.body || {};
    if (scheduleStart) {
      await run(`INSERT INTO settings(key, value) VALUES('scheduleStart', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [scheduleStart]);
    }
    if (typeof uiFont === 'string') {
      await run(`INSERT INTO settings(key, value) VALUES('uiFont', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [uiFont]);
    }
    if (typeof pdfFont === 'string') {
      await run(`INSERT INTO settings(key, value) VALUES('pdfFont', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [pdfFont]);
    }
    if (typeof absentCutoff === 'string') {
      await run(`INSERT INTO settings(key, value) VALUES('absentCutoff', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [absentCutoff]);
    }
    if (Array.isArray(weeklyHolidays)) {
      await run(`INSERT INTO settings(key, value) VALUES('weeklyHolidays', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [JSON.stringify(weeklyHolidays.map(Number))]);
    }
    if (Array.isArray(vacations)) {
      await run(`INSERT INTO settings(key, value) VALUES('vacations', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [JSON.stringify(vacations)]);
      // Optional application: delete attendance logs in vacation ranges
      if (applyVacations) {
        try {
          for (const v of vacations) {
            const from = String(v.from||''); const to = String(v.to||'');
            if (!from || !to) continue;
            const fromIso = new Date(from + 'T00:00:00').toISOString();
            const toIso = new Date(to + 'T23:59:59').toISOString();
            await run(`DELETE FROM attendance_logs WHERE timestamp BETWEEN ? AND ?`, [fromIso, toIso]);
          }
        } catch {}
      }
    }
    res.json({ ok: true });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
