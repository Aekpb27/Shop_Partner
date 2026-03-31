import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import multer from 'multer';
import { createProxyMiddleware } from 'http-proxy-middleware';

// 📝 Load environment variables
const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

const app = express();
// พยายามใช้ Port 80 ถ้าไม่ได้ให้ไปใช้ 3001 (เพื่อความปลอดภัยบน Windows)
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

// 2. 🐉 API: Login
app.post('/api/login', async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!supabase) return res.status(500).json({ error: 'ไม่ได้เชื่อมต่อ Supabase' });

    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return res.status(401).json({ error: error.message });
        res.json({ success: true, user: data.user });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// 3. 📸 API: Upload Image
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

// 4. 🐉 API: Data Management
app.get('/api/:table', async (req: Request, res: Response) => {
    if (!supabase) return res.json([]);
    const { table } = req.params;
    let query = supabase.from(table).select('*');
    
    if (table === 'orders') query = query.order('timestamp', { ascending: false });
    if (table === 'categories') query = query.order('order_index', { ascending: true });
    if (table === 'products') query = query.order('id', { ascending: true });
    
    const { data, error } = await query;

    // 🛑 DEBUGGING: Log the data being sent for the 'orders' table
    if (table === 'orders') {
        console.log(`[DEBUG] GET /api/orders - Found ${data?.length || 0} records.`);
        if (data && data.length > 0) {
            console.log('[DEBUG] Sample Order:', JSON.stringify(data[0], null, 2));
        } else {
            console.log('[DEBUG] No order data found. Error:', error?.message);
        }
    }

    res.json(error ? [] : data);
});

app.post('/api/:table', async (req: Request, res: Response) => {
    if (!supabase) return res.status(500).json({ error: 'X' });
    const { table } = req.params;
    let payload = req.body;
    
    console.log(`📦 Incoming POST for table: ${table}`);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id' });
    if (error) console.error(`❌ Supabase Error (${table}):`, error.message);
    
    res.json({ success: !error, error: error?.message });
});

app.delete('/api/:table/:id', async (req: Request, res: Response) => {
    if (!supabase) return res.status(500).json({ error: 'X' });
    const { error } = await supabase.from(req.params.table).delete().eq('id', req.params.id);
    res.json({ success: !error });
});

// 5. 🐉 API: Order Status Update (PATCH)
app.patch('/api/orders/:id', async (req: Request, res: Response) => {
    if (!supabase) return res.status(500).json({ error: 'X' });
    const { id } = req.params;
    const { status } = req.body;
    
    console.log(`📝 Updating order ${id} status to: ${status}`);
    
    const { error } = await supabase.from('orders').update({ status }).eq('id', id);
    if (error) console.error('❌ Supabase Update Error:', error.message);
    
    res.json({ success: !error, error: error?.message });
});

// 6. 🏰 Admin Dashboard UI
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// สำคัญ: ต้องใช้ path.resolve เพื่อความแม่นยำบน Windows
app.use('/admin', express.static(path.resolve(__dirname, 'public')));

// 🛑 บล็อกการเข้าถึงหน้าแรกตรงๆ (ตามคำสั่ง)
app.get('/', (req, res) => {
  res.status(404).send('404 Not Found - กรุณาระบุรหัสร้านค้าเพื่อเข้าใช้งาน');
});

// 6. 🎯 Reverse Proxy to Frontend (Vite)
// ปรับปรุงให้รองรับ http-proxy-middleware v3
app.use('/', createProxyMiddleware({
  target: 'http://localhost:5173',
  changeOrigin: true,
  ws: true,
  logger: console, // เปิด log เพื่อดูปัญหาถ้าเชื่อมต่อไม่ได้
  pathFilter: (pathname) => {
    return !pathname.startsWith('/api') && 
           !pathname.startsWith('/assets') && 
           !pathname.startsWith('/admin');
  }
}));

// 🚀 Start Server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('--------------------------------------------------');
  console.log(`🐉 Backend Gateway is ONLINE! 🔥`);
  console.log(`🏠 Network Access: http://localhost:${PORT}`);
  console.log(`⚙️  Admin Dashboard: http://localhost:${PORT}/admin`);
  console.log('--------------------------------------------------');
});

// ตรวจสอบ Error กรณีรันไม่ได้ (เช่น Port ซ้ำ)
server.on('error', (e: any) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`❌ Error: Port ${PORT} ถูกใช้งานอยู่แล้ว!`);
    console.info(`💡 วิธีแก้: ลองปิดโปรแกรมที่ใช้ Port 80 หรือเปลี่ยน PORT ใน .env ครับ`);
  } else {
    console.error('❌ Server Error:', e);
  }
});
