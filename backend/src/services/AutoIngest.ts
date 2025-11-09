import { get } from './Db';
import { ZKTecoService } from './ZKTecoService';
import { AttendanceService } from './AttendanceService';
import { DateTime } from 'luxon';
import { run } from './Db';

export async function runIngestOnce(): Promise<{ stored: number }> {
  const svc = new ZKTecoService({ ip: process.env.ZK_IP || '192.168.1.201', useSdk: String(process.env.ZK_USE_SDK||'false')==='true' });
  const connected = await svc.connect();
  if (!connected) return { stored: 0 };
  const logs = await svc.fetchAttendance();
  const setting = await get<{ value: string }>(`SELECT value FROM settings WHERE key='scheduleStart'`);
  const schedule = (setting?.value || '07:00');
  const calc = new AttendanceService();
  let stored = 0;
  for (const log of logs) {
    const tsLux = DateTime.fromISO(log.timestamp, { zone: process.env.TZ || 'local' });
    const hh = tsLux.hour.toString().padStart(2, '0');
    const mm = tsLux.minute.toString().padStart(2, '0');
    const delay = calc.computeDelay(schedule, `${hh}:${mm}`);
    const student = await get<{ id: number }>(`SELECT id FROM students WHERE device_user_id=?`, [log.deviceUserId]);
    const studentId = student?.id || null;
    const exists = await get<{ id: number }>(`SELECT id FROM attendance_logs WHERE student_id IS ? AND timestamp = ?`, [studentId, log.timestamp]);
    if (!exists) {
      await run(`INSERT INTO attendance_logs(student_id, timestamp, status, late_minutes) VALUES(?,?,?,?)`, [
        studentId, log.timestamp, 'present', delay
      ]);
      stored++;
    }
  }
  try {
    const ts = new Date().toISOString();
    await run(`INSERT INTO device_logs(timestamp, status, message) VALUES(?,?,?)`, [ts, 'auto_ingest', 'stored '+String(stored)]);
  } catch {}
  await svc.disconnect();
  return { stored };
}

export function startAutoIngest() {
  const auto = String(process.env.AUTO_INGEST || 'true') !== 'false';
  if (!auto) return;
  const zone = process.env.TZ || 'local';
  const intervalMin = Number(process.env.INGEST_INTERVAL_MIN || 10);
  const intervalAfterMin = Number(process.env.INGEST_INTERVAL_AFTER_CUTOFF_MIN || 30);
  let consecutiveFailures = 0;

  async function step() {
    const now = DateTime.now().setZone(zone);
    // Stop hard after 09:00
    if (now.hour >= 9) return;
    try {
      const { stored } = await runIngestOnce();
      consecutiveFailures = 0;
    } catch {
      consecutiveFailures++;
    }
    // Determine next interval
    const cutoffSetting = await get<{ value: string }>(`SELECT value FROM settings WHERE key='absentCutoff'`);
    const absentCutoff = cutoffSetting?.value || '08:30';
    const [ch, cm] = absentCutoff.split(':').map(Number);
    const cutoffToday = now.set({ hour: ch, minute: cm, second: 0, millisecond: 0 });
    let nextMin = (now < cutoffToday) ? intervalMin : intervalAfterMin;
    // Backoff on failures (max 2x)
    if (consecutiveFailures >= 2) nextMin = Math.min(nextMin * 2, 60);
    setTimeout(step, nextMin * 60 * 1000);
  }
  // Kick off
  step();
}
