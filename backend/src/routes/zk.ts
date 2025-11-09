import { Router } from 'express';
import { ZKTecoService } from '../services/ZKTecoService';
const router = Router();
const svc = new ZKTecoService({ ip: process.env.ZK_IP || '192.168.1.201' });
router.get('/connect', async (req, res) => {
  const ok = await svc.connect();
  try {
    const { run } = require('../services/Db');
    const ts = new Date().toISOString();
    await run(`INSERT INTO device_logs(timestamp, status, message) VALUES(?,?,?)`, [ts, ok ? 'connected' : 'failed', ok ? '' : 'connect failed']);
  } catch {}
  res.json({ connected: ok });
});
router.get('/fetch', async (req, res) => {
  const list = await svc.fetchAttendance();
  res.json({ records: list });
});
router.post('/config', (req, res) => {
  const { ip, port, mockMode, useSdk, commKey, password } = req.body || {};
  svc.setConfig({ ip, port, mockMode, useSdk, commKey, password });
  res.json({ ok: true, config: { ip, port, mockMode, useSdk, commKey, password } });
});
export default router;
