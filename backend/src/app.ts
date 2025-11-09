import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenvSafe from 'dotenv-safe';
import dotenv from 'dotenv';
import zkRoutes from './routes/zk';
import studentsRoutes from './routes/students';
import attendanceRoutes from './routes/attendance';
import reportsRoutes from './routes/reports';
import settingsRoutes from './routes/settings';
import backupsRoutes from './routes/backups';
import assetsRoutes from './routes/assets';
import { initDb } from './services/Db';
import { startBackupScheduler } from './utils/BackupScheduler';
import { startAutoIngest } from './services/AutoIngest';
try {
  dotenvSafe.config({ allowEmptyValues: true });
} catch (e) {
  // Fallback to standard dotenv if example variables are not yet provided
  dotenv.config();
  console.warn('dotenv-safe validation skipped:', (e as Error).message);
}
const app = express();
app.use(cors());
app.use(express.json());
// Initialize database and tables
initDb();
app.get('/', (req, res) => res.send('Student Attendance Backend running'));
app.use('/api/zk', zkRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/backups', backupsRoutes);
app.use('/api/assets', assetsRoutes);

// Serve static frontend
const frontendDir = path.resolve(__dirname, '../../frontend');
app.use('/', express.static(frontendDir));
// Serve static assets (fonts, etc.)
const assetsDir = path.resolve(__dirname, '../assets');
app.use('/assets', express.static(assetsDir));
// Serve saved reports for download
const savedReportsDir = path.resolve(__dirname, '../reports/saved');
app.use('/saved-reports', express.static(savedReportsDir));
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on ${port}`);
  // Start automatic backups
  try { startBackupScheduler(`http://localhost:${port}`); } catch (e) {
    console.error('Backup scheduler failed to start', e);
  }
  // Start auto ingest to fetch device logs at startup and until 9:00
  try { startAutoIngest(); } catch (e) { console.warn('Auto ingest failed to start', e); }
});
