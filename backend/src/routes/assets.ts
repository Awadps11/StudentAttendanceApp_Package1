import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';

const router = Router();
const fontsDir = path.resolve(__dirname, '../../assets/fonts');
if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });

// Storage config
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, fontsDir),
  filename: (_req, file, cb) => cb(null, file.originalname)
});
const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['.ttf', '.woff', '.woff2'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true); else cb(new Error('Invalid font type'));
  }
});

// List fonts
router.get('/fonts', (_req, res) => {
  try {
    const files = fs.readdirSync(fontsDir).filter(f => !f.toLowerCase().endsWith('.md'));
    const fonts = files.map(name => {
      const stat = fs.statSync(path.join(fontsDir, name));
      return { name, size: stat.size };
    });
    res.json({ ok: true, fonts });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

// Upload font
router.post('/fonts/upload', upload.single('font'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ ok: true, name: req.file.originalname });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
