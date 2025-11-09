import net from 'net';
import dotenv from 'dotenv';
// Optional SDK import; if not installed or not used, service falls back
let ZKLibModule: any;
try { ZKLibModule = require('node-zklib'); } catch {}
dotenv.config();
export interface ZKAttendanceRecord { deviceUserId: string; timestamp: string; verifyMode?: number; workCode?: string; }
export interface DeviceConfig { ip: string; port?: number; password?: string; commKey?: string | null; useSdk?: boolean; }
export class ZKTecoService {
  private config: DeviceConfig;
  private socket?: net.Socket;
  private sdk?: any;
  public mockMode: boolean;
  constructor(config: DeviceConfig) {
    this.config = { port: Number(process.env.ZK_PORT) || 4370, ...config };
    this.mockMode = String(process.env.ZK_MOCK ?? 'true') !== 'false';
  }
  async connect(): Promise<boolean> {
    if (this.mockMode) { await new Promise((r) => setTimeout(r, 100)); return true; }
    if (this.config.useSdk && ZKLibModule) {
      try {
        const ZK = ZKLibModule.ZKLib ? ZKLibModule.ZKLib : ZKLibModule;
        this.sdk = new ZK(this.config.ip, this.config.port || 4370, 5000, 0);
        const ok = await this.sdk.createSocket();
        return !!ok;
      } catch (e) { console.error('node-zklib connect failed', e); }
    }
    return new Promise<boolean>((resolve) => {
      this.socket = new net.Socket();
      this.socket.setTimeout(5000);
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
}
