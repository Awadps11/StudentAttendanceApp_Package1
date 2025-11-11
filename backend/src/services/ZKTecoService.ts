import net from 'net';
import dotenv from 'dotenv';
// Optional SDK import; if not installed or not used, service falls back
let ZKLibModule: any;
try { ZKLibModule = require('node-zklib'); } catch {}
dotenv.config();
export interface ZKAttendanceRecord { deviceUserId: string; timestamp: string; verifyMode?: number; workCode?: string; }
export type ZKProtocol = 'auto' | 'tcp' | 'udp';
export interface DeviceConfig {
  ip: string;
  port?: number;
  password?: string;
  commKey?: string | null;
  useSdk?: boolean;
  timeoutMs?: number;
  retries?: number;
  protocol?: ZKProtocol;
}
export class ZKTecoService {
  private config: DeviceConfig;
  private socket?: net.Socket;
  private sdk?: any;
  public mockMode: boolean;
  constructor(config: DeviceConfig) {
    const envTimeout = Number(process.env.ZK_TIMEOUT_MS || '5000');
    const envRetries = Number(process.env.ZK_RETRIES || '3');
    const envProtocol = (String(process.env.ZK_PROTOCOL || 'tcp').toLowerCase() as ZKProtocol);
    const envUseSdk = String(process.env.ZK_USE_SDK || 'false') === 'true';
    this.config = {
      port: Number(process.env.ZK_PORT) || 4370,
      timeoutMs: Number.isFinite(envTimeout) ? envTimeout : 5000,
      retries: Number.isFinite(envRetries) ? envRetries : 3,
      protocol: envProtocol,
      useSdk: envUseSdk,
      ...config,
    };
    this.mockMode = String(process.env.ZK_MOCK ?? 'true') !== 'false';
  }
  async connect(): Promise<boolean> {
    if (this.mockMode) { await new Promise((r) => setTimeout(r, 100)); return true; }
    if (this.config.useSdk && ZKLibModule) {
      try {
        const ZK = ZKLibModule.ZKLib ? ZKLibModule.ZKLib : ZKLibModule;
        this.sdk = new ZK(this.config.ip, this.config.port || 4370, this.config.timeoutMs || 5000, 0);
        const ok = await this.sdk.createSocket();
        return !!ok;
      } catch (e) { console.error('node-zklib connect failed', e); }
    }
    return new Promise<boolean>((resolve) => {
      this.socket = new net.Socket();
      this.socket.setTimeout(this.config.timeoutMs || 5000);
      this.socket.connect(this.config.port!, this.config.ip, () => resolve(true));
      this.socket.on('error', (err) => { console.error('ZK socket error', err); resolve(false); });
      this.socket.on('timeout', () => { console.warn('ZK socket timeout'); this.socket?.destroy(); resolve(false); });
    });
  }
  async disconnect(): Promise<void> { if (this.mockMode) return; try { if (this.sdk?.disconnect) await this.sdk.disconnect(); } catch {} if (this.socket) { this.socket.end(); this.socket.destroy(); } }
  async fetchAttendance(): Promise<ZKAttendanceRecord[]> {
    if (this.mockMode) {
      const now = new Date(); const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
      return [
        { deviceUserId: '1001', timestamp: new Date(y,m,d,7,15).toISOString(), verifyMode:1 },
        { deviceUserId: '1002', timestamp: new Date(y,m,d,6,55).toISOString(), verifyMode:1 },
        { deviceUserId: '1003', timestamp: new Date(y,m,d,7,45).toISOString(), verifyMode:1 }
      ];
    }
    if (this.config.useSdk && this.sdk) {
      try {
        const res = await this.sdk.getAttendances();
        const data = res?.data || res || [];
        const list: ZKAttendanceRecord[] = [];
        for (const item of data) {
          const userId = item?.userId ?? item?.deviceUserId ?? item?.uid;
          const timeVal = item?.timestamp ?? item?.record?.timestamp ?? item?.time;
          if (userId && timeVal) list.push({ deviceUserId: String(userId), timestamp: new Date(timeVal).toISOString(), verifyMode: item?.verifyMode, workCode: item?.workCode });
        }
        return list;
      } catch (e) { console.error('node-zklib getAttendances failed', e); return []; }
    }
    throw new Error('TCP packet handling not implemented. Enable useSdk or mock mode.');
  }
  setConfig(next: Partial<DeviceConfig> & { mockMode?: boolean }) {
    this.config = { ...this.config, ...next };
    if (typeof next.mockMode === 'boolean') this.mockMode = next.mockMode;
  }

  private attemptConnectOnce(): Promise<{ ok: boolean; error?: string; code?: string; durationMs: number; via: 'sdk'|'tcp' }> {
    const start = Date.now();
    if (this.mockMode) {
      return new Promise((resolve) => setTimeout(() => resolve({ ok: true, durationMs: Date.now()-start, via: 'tcp' }), 50));
    }
    if (this.config.useSdk && ZKLibModule) {
      try {
        const ZK = ZKLibModule.ZKLib ? ZKLibModule.ZKLib : ZKLibModule;
        this.sdk = new ZK(this.config.ip, this.config.port || 4370, this.config.timeoutMs || 5000, 0);
        return new Promise(async (resolve) => {
          try {
            const ok = await this.sdk.createSocket();
            resolve({ ok: !!ok, durationMs: Date.now()-start, via: 'sdk' });
          } catch (e: any) {
            resolve({ ok: false, error: String(e?.message || e), durationMs: Date.now()-start, via: 'sdk' });
          }
        });
      } catch (e: any) {
        return Promise.resolve({ ok: false, error: String(e?.message || e), durationMs: Date.now()-start, via: 'sdk' });
      }
    }
    return new Promise((resolve) => {
      const sock = new net.Socket();
      let settled = false;
      const finish = (res: { ok: boolean; error?: string; code?: string }) => {
        if (settled) return; settled = true;
        try { sock.end(); sock.destroy(); } catch {}
        resolve({ ...res, durationMs: Date.now()-start, via: 'tcp' });
      };
      sock.setTimeout(this.config.timeoutMs || 5000);
      sock.connect(this.config.port!, this.config.ip, () => finish({ ok: true }));
      sock.on('error', (err: any) => finish({ ok: false, error: String(err?.message || err), code: String(err?.code || '') }));
      sock.on('timeout', () => finish({ ok: false, error: 'timeout' }));
    });
  }

  async diagnose(): Promise<{
    ip: string;
    port: number;
    protocol: ZKProtocol;
    retries: number;
    timeoutMs: number;
    attempts: Array<{ ok: boolean; error?: string; code?: string; durationMs: number; via: 'sdk'|'tcp' }>;
    finalOk: boolean;
    message: string;
  }> {
    const attempts: Array<{ ok: boolean; error?: string; code?: string; durationMs: number; via: 'sdk'|'tcp' }> = [];
    const total = Math.max(1, this.config.retries || 1);
    for (let i = 0; i < total; i++) {
      const res = await this.attemptConnectOnce();
      attempts.push(res);
      if (res.ok) break;
      // small delay before next attempt
      await new Promise((r) => setTimeout(r, 100));
    }
    const finalOk = attempts.some(a => a.ok);
    const lastErr = attempts.findLast ? attempts.findLast(a => !a.ok) : attempts.slice().reverse().find(a => !a.ok);
    const msg = finalOk ? 'connected' : `failed${lastErr?.code ? ' '+lastErr.code : ''}${lastErr?.error ? ': '+lastErr.error : ''}`;
    return {
      ip: this.config.ip,
      port: this.config.port || 4370,
      protocol: (this.config.protocol || 'tcp'),
      retries: total,
      timeoutMs: this.config.timeoutMs || 5000,
      attempts,
      finalOk,
      message: msg,
    };
  }
}
