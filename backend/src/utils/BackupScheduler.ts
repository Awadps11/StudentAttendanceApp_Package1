import cron from 'node-cron';
import http from 'http';

// Schedules automatic backups by calling the existing HTTP endpoint.
// - Daily backup at 23:30 local time
// - Monthly backup on the 1st day at 00:05 local time
// - Yearly backup on January 1st at 00:10 local time

function simplePost(urlStr: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(urlStr);
      const req = http.request({
        hostname: u.hostname,
        port: Number(u.port) || 80,
        path: u.pathname + (u.search || ''),
        method: 'POST',
      }, (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve());
      });
      req.on('error', reject);
      req.end();
    } catch (e) { reject(e); }
  });
}

export function startBackupScheduler(baseUrl: string = 'http://localhost:3000') {
  // Daily backup
  cron.schedule('30 23 * * *', async () => {
    try {
      await simplePost(`${baseUrl}/api/backups/run`);
      console.log('[BackupScheduler] Daily backup completed');
    } catch (e) {
      console.error('[BackupScheduler] Daily backup failed', e);
    }
  }, { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });

  // Monthly backup (extra copy, useful for retention)
  cron.schedule('5 0 1 * *', async () => {
    try {
      await simplePost(`${baseUrl}/api/backups/run`);
      console.log('[BackupScheduler] Monthly backup completed');
    } catch (e) {
      console.error('[BackupScheduler] Monthly backup failed', e);
    }
  }, { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });

  // Yearly backup (additional retention point)
  cron.schedule('10 0 1 1 *', async () => {
    try {
      await simplePost(`${baseUrl}/api/backups/run`);
      console.log('[BackupScheduler] Yearly backup completed');
    } catch (e) {
      console.error('[BackupScheduler] Yearly backup failed', e);
    }
  }, { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
}
