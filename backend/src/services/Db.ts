import sqlite3 from 'sqlite3';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

sqlite3.verbose();

const dbFile = process.env.DATABASE_URL?.startsWith('file:')
  ? process.env.DATABASE_URL.replace('file:', '')
  : process.env.DATABASE_URL || path.resolve(__dirname, '../../attendance.db');

export const db = new sqlite3.Database(dbFile);

export function initDb() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      national_id TEXT,
      guardian_phone TEXT,
      class TEXT,
      section TEXT,
      device_user_id TEXT
    )`);
    // Unique indexes to prevent duplicates (allowing multiple blanks via partial indexes)
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_students_national_id ON students(national_id) WHERE national_id IS NOT NULL AND national_id <> ''`);
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_students_device_user_id ON students(device_user_id) WHERE device_user_id IS NOT NULL AND device_user_id <> ''`);
    db.run(`CREATE TABLE IF NOT EXISTS attendance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      timestamp TEXT NOT NULL,
      status TEXT,
      late_minutes INTEGER DEFAULT 0,
      FOREIGN KEY(student_id) REFERENCES students(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE,
      value TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      path TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS device_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      status TEXT,
      message TEXT
    )`);
    // Seed default schedule start if not set
    db.get(`SELECT value FROM settings WHERE key='scheduleStart'`, (err, row) => {
      if (!row) {
        db.run(`INSERT INTO settings(key, value) VALUES('scheduleStart', '07:00')`);
      }
    });
  });
}

export function run(sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows as T[]);
    });
  });
}

export function get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row as T);
    });
  });
}
