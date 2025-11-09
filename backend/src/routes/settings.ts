import { Router } from 'express';
import { get, run } from '../services/Db';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const schedule = await get<{ value: string }>(`SELECT value FROM settings WHERE key='scheduleStart'`);
    const uiFont = await get<{ value: string }>(`SELECT value FROM settings WHERE key='uiFont'`);
    const pdfFont = await get<{ value: string }>(`SELECT value FROM settings WHERE key='pdfFont'`);
    const absentCutoff = await get<{ value: string }>(`SELECT value FROM settings WHERE key='absentCutoff'`);
    res.json({ scheduleStart: schedule?.value || '07:00', uiFont: uiFont?.value || '', pdfFont: pdfFont?.value || '', absentCutoff: absentCutoff?.value || '08:30' });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { scheduleStart, uiFont, pdfFont, absentCutoff } = req.body || {};
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
    res.json({ ok: true });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
