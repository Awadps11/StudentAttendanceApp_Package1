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
router.get('/diagnose', async (req, res) => {
  try {
    const ip = String(req.query.ip || process.env.ZK_IP || '192.168.1.201');
    const port = Number(req.query.port || process.env.ZK_PORT || 4370);
    const timeoutMs = Number(req.query.timeout_ms || process.env.ZK_TIMEOUT_MS || 5000);
    const retries = Number(req.query.retries || process.env.ZK_RETRIES || 3);
    const useSdk = String(req.query.useSdk || process.env.ZK_USE_SDK || 'false') === 'true';
    const queryMock = req.query.mock;
    const mockMode = typeof queryMock !== 'undefined' ? (String(queryMock) === 'true') : false; // default false for real diagnose
    svc.setConfig({ ip, port, timeoutMs, retries, useSdk, mockMode });
    const report = await svc.diagnose();
    try {
      const { run } = require('../services/Db');
      const ts = new Date().toISOString();
      await run(`INSERT INTO device_logs(timestamp, status, message) VALUES(?,?,?)`, [ts, report.finalOk ? 'diagnose_ok' : 'diagnose_fail', `${ip}:${port} ${report.message}`]);
    } catch {}
    res.json(report);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
router.post('/config', (req, res) => {
  const { ip, port, mockMode, useSdk, commKey, password } = req.body || {};
  svc.setConfig({ ip, port, mockMode, useSdk, commKey, password });
  res.json({ ok: true, config: { ip, port, mockMode, useSdk, commKey, password } });
});
export default router;
