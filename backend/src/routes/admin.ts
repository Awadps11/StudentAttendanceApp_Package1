import { Router } from 'express';
import { run, get } from '../services/Db';

const router = Router();

// POST /api/admin/wipe { scope: 'all' | 'attendance' | 'students', confirm?: string }
router.post('/wipe', async (req, res) => {
  try {
    const scope = String(req.body?.scope || '').toLowerCase();
    const confirm = String(req.body?.confirm || '');
    if (!scope) return res.status(400).json({ error: 'scope required' });

    // Extra safety confirmation words
    const requiredConfirm = scope === 'all' ? 'DELETE ALL' : (scope === 'attendance' ? 'ATTENDANCE' : (scope === 'students' ? 'STUDENTS' : ''));
    if (!requiredConfirm) return res.status(400).json({ error: 'invalid scope' });
    if (confirm !== requiredConfirm) return res.status(400).json({ error: 'confirmation mismatch', required: requiredConfirm });

    let deletedStudents = 0, deletedAttendance = 0, deletedDeviceLogs = 0;

    if (scope === 'all' || scope === 'attendance') {
      const cntA = await get<{ c: number }>(`SELECT COUNT(*) as c FROM attendance_logs`);
      deletedAttendance = cntA?.c || 0;
      await run(`DELETE FROM attendance_logs`);
      const cntD = await get<{ c: number }>(`SELECT COUNT(*) as c FROM device_logs`);
      deletedDeviceLogs = cntD?.c || 0;
      await run(`DELETE FROM device_logs`);
    }
    if (scope === 'all' || scope === 'students') {
      const cntS = await get<{ c: number }>(`SELECT COUNT(*) as c FROM students`);
      deletedStudents = cntS?.c || 0;
      await run(`DELETE FROM students`);
    }

    return res.json({ ok: true, scope, deleted: { students: deletedStudents, attendance_logs: deletedAttendance, device_logs: deletedDeviceLogs } });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
