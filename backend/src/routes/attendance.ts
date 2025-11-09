import { Router } from 'express';
import { all, get, run } from '../services/Db';
import { DateTime } from 'luxon';
import { AttendanceService } from '../services/AttendanceService';
import { ZKTecoService } from '../services/ZKTecoService';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const router = Router();
const svc = new ZKTecoService({ ip: process.env.ZK_IP || '192.168.1.201' });
const calc = new AttendanceService();

router.post('/ingest', async (req, res) => {
  try {
    const connected = await svc.connect();
    if (!connected) return res.status(500).json({ error: 'Device connect failed' });
    const logs = await svc.fetchAttendance();
    const setting = await get<{ value: string }>(`SELECT value FROM settings WHERE key='scheduleStart'`);
    const schedule = (setting?.value || '07:00');
    let stored = 0;
    for (const log of logs) {
      const tsLux = DateTime.fromISO(log.timestamp, { zone: process.env.TZ || 'local' });
      const hh = tsLux.hour.toString().padStart(2, '0');
      const mm = tsLux.minute.toString().padStart(2, '0');
      const delay = calc.computeDelay(schedule, `${hh}:${mm}`);
      let student = await get<{ id: number }>(`SELECT id FROM students WHERE device_user_id = ?`, [log.deviceUserId]);
      if (!student && log.workCode) {
        student = await get<{ id: number }>(`SELECT id FROM students WHERE national_id = ?`, [String(log.workCode)]);
      }
      if (!student && log.deviceUserId) {
        // بعض المدارس تسجل السجل المدني كـ userId في الجهاز
        student = await get<{ id: number }>(`SELECT id FROM students WHERE national_id = ?`, [String(log.deviceUserId)]);
      }
      const studentId = student?.id ?? null;
      // Deduplicate: skip if record exists for same student and timestamp
      const exists = await get<{ id: number }>(`SELECT id FROM attendance_logs WHERE student_id IS ? AND timestamp = ?`, [studentId, log.timestamp]);
      if (!exists) {
        await run(`INSERT INTO attendance_logs(student_id, timestamp, status, late_minutes) VALUES(?,?,?,?)`, [
          studentId, log.timestamp, 'present', delay
        ]);
        stored++;
      }
    }
    res.json({ ok: true, stored });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  } finally {
    await svc.disconnect();
    // Optional post-fetch script
    const path = require('path'); const fs = require('fs');
    const script = path.resolve(__dirname, '../../../Scripts/AfterFetch.ps1');
    if (fs.existsSync(script)) {
      spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', script], { stdio: 'ignore' });
    }
    try {
      const ts = new Date().toISOString();
      await run(`INSERT INTO device_logs(timestamp, status, message) VALUES(?,?,?)`, [ts, 'ingest', 'stored ' + String(stored)]);
    } catch {}
  }
});

// Manual attlog file import
// POST /api/attendance/import-file { path?: string }
// Reads an attendance log file (e.g., BRC7222260114_attlog.dat) from disk, parses entries,
// matches students by device_user_id or national_id, and stores attendance_logs with late minutes.
router.post('/import-file', async (req, res) => {
  try {
    const zone = process.env.TZ || 'local';
    const providedPath = String((req.body?.path || '').toString().trim());
    const defaultPath = path.resolve(__dirname, '../../..', 'BRC7222260114_attlog.dat');
    const filePath = providedPath ? (path.isAbsolute(providedPath) ? providedPath : path.resolve(__dirname, '../../..', providedPath)) : defaultPath;

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `file not found: ${filePath}` });
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const setting = await get<{ value: string }>(`SELECT value FROM settings WHERE key='scheduleStart'`);
    const schedule = (setting?.value || '07:00');
    const parseTs = (s: string) => {
      // Try ISO
      let dt = DateTime.fromISO(s, { zone });
      if (!dt.isValid) {
        // Common formats: yyyy-MM-dd HH:mm[:ss], dd/MM/yyyy HH:mm[:ss], yyyy/MM/dd HH:mm[:ss], dd-MM-yyyy HH:mm[:ss]
        const tryFormats = [
          'yyyy-MM-dd HH:mm:ss','yyyy-MM-dd HH:mm',
          'dd/MM/yyyy HH:mm:ss','dd/MM/yyyy HH:mm',
          'yyyy/MM/dd HH:mm:ss','yyyy/MM/dd HH:mm',
          'dd-MM-yyyy HH:mm:ss','dd-MM-yyyy HH:mm'
        ];
        for (const fmt of tryFormats) { dt = DateTime.fromFormat(s, fmt, { zone }); if (dt.isValid) break; }
      }
      return dt.isValid ? dt : null;
    };
    function parseLine(line: string): { deviceUserId?: string; timestamp?: string; workCode?: string } | null {
      const l = line.trim(); if (!l) return null;
      // PIN=, USERID=, WorkCode=
      const mPin = l.match(/\b(PIN|USERID)\s*=\s*(\d{1,18})/i);
      const mWork = l.match(/\bWorkCode\s*=\s*(\w{1,32})/i);
      // Extract timestamp substring using regex
      const mTs = l.match(/(\d{4}[-\/]\d{2}[-\/]\d{2}[ T]\d{2}:\d{2}(:\d{2})?)/) || l.match(/(\d{2}[-\/]\d{2}[-\/]\d{4}[ T]\d{2}:\d{2}(:\d{2})?)/);
      let dt: DateTime | null = null;
      if (mTs) dt = parseTs(mTs[0]);
      // Fallback: split by commas/semicolons/tabs and try tokens for ts
      if (!dt) {
        const tokens = l.split(/[;,\t]+/).map(s => s.trim()).filter(Boolean);
        for (const t of tokens) { const p = parseTs(t); if (p) { dt = p; break; } }
      }
      // Determine user id: prefer PIN/USERID; else first numeric token at line start
      let uid = mPin?.[2];
      if (!uid) {
        const mStartNum = l.match(/^(\d{1,18})\D/);
        if (mStartNum) uid = mStartNum[1];
      }
      if (!dt) return null;
      return { deviceUserId: uid, timestamp: dt.toISO(), workCode: mWork?.[1] };
    }

    const calcLocal = new AttendanceService();
    let stored = 0, parsed = 0, unknown = 0;
    for (const line of lines) {
      const rec = parseLine(line);
      if (!rec || !rec.timestamp) { unknown++; continue; }
      parsed++;
      // Compute delay
      const tsLux = DateTime.fromISO(rec.timestamp, { zone });
      const hh = tsLux.hour.toString().padStart(2, '0');
      const mm = tsLux.minute.toString().padStart(2, '0');
      const delay = calcLocal.computeDelay(schedule, `${hh}:${mm}`);
      // Map student
      let student = undefined as { id: number } | undefined;
      if (rec.deviceUserId) {
        student = await get<{ id: number }>(`SELECT id FROM students WHERE device_user_id = ?`, [rec.deviceUserId]);
      }
      if (!student && rec.workCode) {
        student = await get<{ id: number }>(`SELECT id FROM students WHERE national_id = ?`, [String(rec.workCode)]);
      }
      if (!student && rec.deviceUserId) {
        student = await get<{ id: number }>(`SELECT id FROM students WHERE national_id = ?`, [String(rec.deviceUserId)]);
      }
      const studentId = student?.id ?? null;
      const exists = await get<{ id: number }>(`SELECT id FROM attendance_logs WHERE student_id IS ? AND timestamp = ?`, [studentId, rec.timestamp]);
      if (!exists) {
        await run(`INSERT INTO attendance_logs(student_id, timestamp, status, late_minutes) VALUES(?,?,?,?)`, [
          studentId, rec.timestamp, 'present', delay
        ]);
        stored++;
      }
    }

    try {
      const ts = new Date().toISOString();
      await run(`INSERT INTO device_logs(timestamp, status, message) VALUES(?,?,?)`, [ts, 'manual_import', `file ${path.basename(filePath)} parsed ${parsed}, stored ${stored}, unknown ${unknown}`]);
    } catch {}

    res.json({ ok: true, file: filePath, parsed, stored, unknown });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/today', async (req, res) => {
  try {
    const zone = process.env.TZ || 'local';
    const now = DateTime.now().setZone(zone);
    // Ignore weekends (Friday/Saturday). Luxon weekday: Monday=1..Sunday=7
    if (now.weekday === 5 || now.weekday === 6) {
      return res.json({ records: [], weekend: true });
    }
    const dayStart = now.startOf('day').toISO();
    const dayEnd = now.endOf('day').toISO();
    const rows = await all<any>(
      `SELECT s.id as student_id, s.name, s.class, s.section,
              a.timestamp, a.status, a.late_minutes
       FROM students s
       LEFT JOIN (
         SELECT * FROM attendance_logs WHERE timestamp BETWEEN ? AND ?
       ) a ON a.student_id = s.id
       ORDER BY s.name ASC`, [dayStart, dayEnd]
    );
    const setting = await get<{ value: string }>(`SELECT value FROM settings WHERE key='scheduleStart'`);
    const scheduleStart = (setting?.value || '07:00');
    const cutoffSetting = await get<{ value: string }>(`SELECT value FROM settings WHERE key='absentCutoff'`);
    const absentCutoff = cutoffSetting?.value || '08:30';
    const cutoffMinutes = (() => { const [h,m] = absentCutoff.split(':').map(Number); return h*60+m; })();
    const nowMinutes = now.hour*60 + now.minute;
    const data = rows.map(r => {
      if (r.status === 'present') {
        const tsLux = DateTime.fromISO(r.timestamp, { zone });
        const hh = tsLux.hour.toString().padStart(2,'0');
        const mm = tsLux.minute.toString().padStart(2,'0');
        const delay = calc.computeDelay(scheduleStart, `${hh}:${mm}`) || 0;
        return { student_id: r.student_id, name: r.name, class: r.class, section: r.section, status: 'present', late_minutes: delay };
      }
      const status = (nowMinutes < cutoffMinutes) ? 'not_yet' : 'absent';
      return { student_id: r.student_id, name: r.name, class: r.class, section: r.section, status, late_minutes: 0 };
    });
    res.json({ records: data });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
