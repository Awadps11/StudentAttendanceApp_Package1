import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { run, all } from '../services/Db';
import { spawn } from 'child_process';
import AdmZip from 'adm-zip';

const router = Router();

router.post('/run', async (req, res) => {
  try {
    const now = new Date();
    const y = now.getFullYear();
    const m = (now.getMonth()+1).toString().padStart(2,'0');
    const d = now.getDate().toString().padStart(2,'0');
    const baseDir = path.resolve(__dirname, '../../backups');
    const yearDir = path.join(baseDir, String(y));
    const monthDir = path.join(yearDir, m);
    if (!fs.existsSync(monthDir)) fs.mkdirSync(monthDir, { recursive: true });
    const src = path.resolve(__dirname, '../../attendance.db');
    const hh = now.getHours().toString().padStart(2,'0');
    const mm = now.getMinutes().toString().padStart(2,'0');
    const ss = now.getSeconds().toString().padStart(2,'0');
    const zipPath = path.join(monthDir, `attendance_${y}-${m}-${d}_${hh}-${mm}-${ss}.zip`);
    const zip = new AdmZip();
    zip.addLocalFile(src);
    zip.writeZip(zipPath);
    await run(`INSERT INTO backups(date, path) VALUES(?,?)`, [now.toISOString(), zipPath]);
    // Optional post-backup script
    const script = path.resolve(__dirname, '../../../Scripts/AfterBackup.ps1');
    if (fs.existsSync(script)) {
      spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', script, zipPath], { stdio: 'ignore' });
    }
    res.json({ ok: true, path: zipPath });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/list', async (req, res) => {
  try {
    const rows = await all(`SELECT * FROM backups ORDER BY date DESC`);
    res.json({ backups: rows });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

// Restore a backup from a provided path (ZIP or DB)
router.post('/restore', async (req, res) => {
  try {
    const { path: backupPath } = req.body || {};
    if (!backupPath) return res.status(400).json({ error: 'path required' });
    const absPath = path.isAbsolute(backupPath) ? backupPath : path.resolve(__dirname, '../../', backupPath);
    if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'backup not found' });
    const destDb = path.resolve(__dirname, '../../attendance.db');
    if (absPath.toLowerCase().endsWith('.zip')) {
      const zip = new AdmZip(absPath);
      const entries = zip.getEntries();
      const dbEntry = entries.find(e => e.entryName.endsWith('.db'));
      if (!dbEntry) return res.status(400).json({ error: 'no .db file in zip' });
      const tmpDir = path.resolve(__dirname, '../../tmp_restore');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const tmpDb = path.join(tmpDir, dbEntry.entryName);
      zip.extractEntryTo(dbEntry, tmpDir, false, true);
      fs.copyFileSync(tmpDb, destDb);
      // cleanup
      try { fs.unlinkSync(tmpDb); } catch {}
    } else if (absPath.toLowerCase().endsWith('.db')) {
      fs.copyFileSync(absPath, destDb);
    } else {
      return res.status(400).json({ error: 'unsupported backup format' });
    }
    res.json({ ok: true });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
