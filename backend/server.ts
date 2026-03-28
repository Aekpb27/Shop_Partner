import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import multer from 'multer';
import { createProxyMiddleware } from 'http-proxy-middleware';

// 📝 Load environment variables
const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

const app = express();
const PORT = process.env.PORT || 80;

// 🔐 Supabase Configuration
const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\s/g, '');
const supabaseKey = (process.env.SUPABASE_KEY || '').trim();
let supabase: any;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(bodyParser.json());

// 1. 📁 Serve Backend Assets (Icons)
app.use('/assets', express.static(path.join(__dirname, 'assets'))); 

// 2. 📸 API: Upload Image
app.post('/api/upload', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!supabase) throw new Error('Supabase not connected');
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const file = req.file;
    const filePath = `products/${Date.now()}.${file.originalname.split('.').pop()}`;
    const { error } = await supabase.storage.from('product-images').upload(filePath, file.buffer, { contentType: file.mimetype, upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(filePath);
    res.json({ success: true, url: publicUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. 🐉 API: Data Management
app.get('/api/:table', async (req: Request, res: Response) => {
    if (!supabase) return res.json([]);
    const { table } = req.params;
    let query = supabase.from(table).select('*');
    
    // ✨ เพิ่มระบบการเรียงลำดับ
    if (table === 'orders') query = query.order('timestamp', { ascending: false });
    if (table === 'categories') query = query.order('order_index', { ascending: true });
    if (table === 'products') query = query.order('id', { ascending: true });
    
    const { data, error } = await query;
    res.json(error ? [] : data);
});

app.post('/api/:table', async (req: Request, res: Response) => {
    if (!supabase) return res.status(500).json({ error: 'X' });
    const { table } = req.params;
    let payload = req.body;
    if (table === 'products') {
        payload = (Array.isArray(payload) ? payload : [payload]).map((p: any) => {
            const { partnerId, ...rest } = p;
            return { ...rest, partnerIds: p.partnerIds || (partnerId ? [partnerId] : []) };
        });
    }
    const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id' });
    res.json({ success: !error, error: error?.message });
});

app.delete('/api/:table/:id', async (req: Request, res: Response) => {
    if (!supabase) return res.status(500).json({ error: 'X' });
    const { error } = await supabase.from(req.params.table).delete().eq('id', req.params.id);
    res.json({ success: !error });
});

app.post('/api/login', async (req: Request, res: Response) => {
    if (!supabase) return res.status(500).json({ error: 'X' });
    const { data, error } = await supabase.auth.signInWithPassword(req.body);
    if (error) return res.status(401).json({ error: error.message });
    res.json({ success: true, user: data.user });
});

// 4. 🏰 Admin Dashboard UI
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// บังคับใช้ static สำหรับไฟล์อื่นๆ ใน public (เช่น ถ้ามี css/js แยก)
app.use('/admin', express.static(path.join(__dirname, 'public')));

// 5. 🎯 Reverse Proxy to Frontend (Vite)
// ส่งต่อทุกอย่างที่ไม่ใช่ /api, /assets, /admin ไปที่ Vite พอร์ต 5173
app.use('/', createProxyMiddleware({
  target: 'http://localhost:5173',
  changeOrigin: true,
  ws: true, // รองรับ WebSocket สำหรับระบบ Hot Reload ของ Vite
  logLevel: 'silent',
  filter: (pathname) => {
    return !pathname.startsWith('/api') && 
           !pathname.startsWith('/assets') && 
           !pathname.startsWith('/admin');
  }
}));

// 🚀 Start Server
app.listen(PORT, '0.0.0.0', async () => {
  console.log('--------------------------------------------------');
  console.log(`🐉 Backend Gateway is PUBLICLY AVAILABLE! 🔥`);
  console.log(`🏠 Access via your Local IP (e.g. http://192.168.1.50)`);
  console.log(`⚙️  Admin Dashboard: http://localhost/admin`);
  console.log('--------------------------------------------------');
});
