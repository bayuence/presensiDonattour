import 'dotenv/config';
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

// ─── Singleton Prisma — mencegah connection leak di Vercel serverless ───
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient; cache: Map<string, { data: any; exp: number }> };
const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// ─── In-memory cache sederhana (TTL 60 detik) ───
if (!globalForPrisma.cache) globalForPrisma.cache = new Map();
const cache = globalForPrisma.cache;

const getCache = (key: string) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.exp) { cache.delete(key); return null; }
  return entry.data;
};
const setCache = (key: string, data: any, ttlMs = 60_000) => {
  cache.set(key, { data, exp: Date.now() + ttlMs });
};
const invalidateCache = (prefix: string) => {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
};

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// Utility untuk memanggil Google Apps Script Webhook (Auto-Sync Sheet)
const notifyGoogleSheet = () => {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  if (webhookUrl) {
    fetch(webhookUrl, { method: 'POST' }).catch(err => console.error('Webhook error:', err));
  }
};

// Rute dasar (Root) untuk mengecek apakah server berjalan
app.get('/', (req, res) => {
  res.send('Server Presensi Donattour berjalan dengan baik! 🚀');
});

// POST /api/login — autentikasi berdasarkan nama & tanggal lahir
app.post('/api/login', async (req, res) => {
  const { name, dob } = req.body;

  if (!name || !dob) {
    res.status(400).json({ success: false, message: 'Nama dan tanggal lahir wajib diisi.' });
    return;
  }

  try {
    const user = await prisma.user.findFirst({
      where: { name, dob },
      select: { id: true, name: true, role: true, dob: true, photo: true, divisionId: true, division: true },
    });

    if (user) {
      res.json({ success: true, user });
    } else {
      res.status(401).json({ success: false, message: 'Nama atau tanggal lahir tidak ditemukan.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// PUT /api/users/:id/photo — update foto user (base64)
app.put('/api/users/:id/photo', async (req, res) => {
  const { id } = req.params;
  const { photo } = req.body;

  if (!photo) {
    res.status(400).json({ success: false, message: 'Foto wajib diisi.' });
    return;
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { photo },
    });
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// GET /api/users — ambil semua user
app.get('/api/users', async (req, res) => {
  const cacheKey = 'users:all';
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const users = await prisma.user.findMany({
      include: { division: true },
      orderBy: { createdAt: 'desc' }
    });
    const result = { success: true, users };
    setCache(cacheKey, result, 60_000); // cache 60 detik
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// GET /api/users/:id — ambil detail 1 user beserta divisinya
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { division: true }
    });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User tidak ditemukan' });
    }
    res.json({ success: true, user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// POST /api/users — buat user baru
app.post('/api/users', async (req, res) => {
  const { name, dob, role, divisionId } = req.body;
  if (!name || !dob) {
    res.status(400).json({ success: false, message: 'Nama dan tanggal lahir wajib diisi.' });
    return;
  }
  try {
    const newUser = await prisma.user.create({
      data: { name, dob, role: role || 'Karyawan', divisionId },
      include: { division: true }
    });
    invalidateCache('users:');
    notifyGoogleSheet();
    res.json({ success: true, user: newUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// PUT /api/users/:id — update profil user dasar
app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, dob, role, divisionId } = req.body;
  try {
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { name, dob, role, divisionId },
      include: { division: true }
    });
    invalidateCache('users:');
    notifyGoogleSheet();
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// DELETE /api/users/:id — hapus user
app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.attendance.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });
    invalidateCache('users:');
    notifyGoogleSheet();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ==========================================
// DIVISIONS
// ==========================================

// GET /api/divisions (include shifts)
app.get('/api/divisions', async (req, res) => {
  const cacheKey = 'divisions:all';
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const divisions = await prisma.division.findMany({
      orderBy: { name: 'asc' },
      include: {
        shifts: {
          orderBy: { checkInTime: 'asc' },
          include: { location: true }
        }
      }
    });
    const result = { success: true, divisions };
    setCache(cacheKey, result, 60_000); // cache 60 detik
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// POST /api/divisions
app.post('/api/divisions', async (req, res) => {
  const { name } = req.body;
  try {
    const division = await prisma.division.create({ data: { name } });
    invalidateCache('divisions:');
    notifyGoogleSheet();
    res.json({ success: true, division });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// PUT /api/divisions/:id
app.put('/api/divisions/:id', async (req, res) => {
  const { name } = req.body;
  try {
    const division = await prisma.division.update({
      where: { id: req.params.id },
      data: { name }
    });
    invalidateCache('divisions:');
    notifyGoogleSheet();
    res.json({ success: true, division });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// DELETE /api/divisions/:id
app.delete('/api/divisions/:id', async (req, res) => {
  try {
    await prisma.user.updateMany({ where: { divisionId: req.params.id }, data: { divisionId: null } });
    await prisma.division.delete({ where: { id: req.params.id } });
    invalidateCache('divisions:');
    invalidateCache('users:');
    notifyGoogleSheet();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ==========================================
// SHIFTS
// ==========================================

// POST /api/shifts — tambah shift ke divisi
app.post('/api/shifts', async (req, res) => {
  const { name, description, checkInTime, checkOutTime, divisionId, locationId } = req.body;
  if (!name || !checkInTime || !checkOutTime || !divisionId) {
    return res.status(400).json({ success: false, error: 'Semua field wajib diisi' });
  }
  try {
    const shift = await prisma.shift.create({
      data: { name, description, checkInTime, checkOutTime, divisionId, locationId }
    });
    invalidateCache('divisions:');
    notifyGoogleSheet();
    res.json({ success: true, shift });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// PUT /api/shifts/:id — edit shift
app.put('/api/shifts/:id', async (req, res) => {
  const { name, description, checkInTime, checkOutTime, locationId } = req.body;
  try {
    const shift = await prisma.shift.update({
      where: { id: req.params.id },
      data: { name, description, checkInTime, checkOutTime, locationId }
    });
    invalidateCache('divisions:');
    notifyGoogleSheet();
    res.json({ success: true, shift });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// DELETE /api/shifts/:id
app.delete('/api/shifts/:id', async (req, res) => {
  try {
    await prisma.shift.delete({ where: { id: req.params.id } });
    invalidateCache('divisions:');
    notifyGoogleSheet();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});


// ==========================================
// SCHEDULE DB — Kelola jadwal shift dari database
// ==========================================

// GET /api/schedules?month=2026-10 or ?date=2026-10-21 — ambil jadwal bulan atau hari spesifik
app.get('/api/schedules', async (req, res) => {
  const { month, date, divisionId, userId } = req.query;
  const cacheKey = `schedules:${userId ?? ''}:${month ?? ''}:${date ?? ''}:${divisionId ?? ''}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const where: any = {};
    if (date) {
      where.date = String(date);
    } else if (month) {
      where.date = { startsWith: String(month) };
    }
    if (userId) {
      where.userId = String(userId);
    }
    const schedules = await prisma.schedule.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, divisionId: true, division: { select: { id: true, name: true } } } },
        shift: {
          select: {
            id: true,
            name: true,
            description: true,
            checkInTime: true,
            checkOutTime: true,
            divisionId: true,
            locationId: true,
            location: { select: { id: true, name: true, radius: true, latitude: true, longitude: true } }
          }
        }
      },
      orderBy: { date: 'asc' }
    });
    const filtered = divisionId
      ? schedules.filter(s => s.user.divisionId === divisionId)
      : schedules;
    const result = { success: true, schedules: filtered };
    setCache(cacheKey, result, 60_000); // cache 60 detik
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// POST /api/schedules — upsert jadwal (1 hari 1 user)
app.post('/api/schedules', async (req, res) => {
  const { userId, shiftId, date } = req.body;
  if (!userId || !shiftId || !date) {
    return res.status(400).json({ success: false, error: 'userId, shiftId, date wajib diisi' });
  }
  try {
    const schedule = await prisma.schedule.upsert({
      where: { userId_date: { userId, date } },
      update: { shiftId },
      create: { userId, shiftId, date },
      include: {
        user: { select: { id: true, name: true, divisionId: true, division: { select: { id: true, name: true } } } },
        shift: { select: { id: true, name: true, description: true, checkInTime: true, checkOutTime: true, divisionId: true } }
      }
    });
    invalidateCache('schedules:'); // hapus cache jadwal setelah update
    notifyGoogleSheet();
    res.json({ success: true, schedule });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// POST /api/schedules/batch — simpan banyak jadwal sekaligus (dari Excel)
app.post('/api/schedules/batch', async (req, res) => {
  const { month, divisionId, items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'Data jadwal (items) tidak boleh kosong' });
  }

  try {
    const validItems = items.filter(
      (it: any) => it.userId && it.shiftId && it.date
    );

    if (validItems.length === 0) {
      return res.status(400).json({ success: false, error: 'Tidak ada item jadwal yang valid' });
    }

    const userIds = [...new Set(validItems.map((it: any) => it.userId))];
    const dates = [...new Set(validItems.map((it: any) => it.date))];

    // Hapus jadwal existing untuk kombinasi user & tanggal tersebut agar tidak duplicate key
    await prisma.schedule.deleteMany({
      where: {
        userId: { in: userIds },
        date: { in: dates },
      },
    });

    // Simpan semua jadwal sekaligus secara bulk
    await prisma.schedule.createMany({
      data: validItems.map((it: any) => ({
        userId: it.userId,
        shiftId: it.shiftId,
        date: it.date,
      })),
      skipDuplicates: true,
    });

    invalidateCache('schedules:');
    notifyGoogleSheet();

    res.json({
      success: true,
      count: validItems.length,
    });
  } catch (error: any) {
    console.error('Error batch importing schedules:', error);
    res.status(500).json({ success: false, error: error.message || 'Database error' });
  }
});

// DELETE /api/schedules/:id — hapus 1 jadwal
app.delete('/api/schedules/:id', async (req, res) => {
  try {
    await prisma.schedule.delete({ where: { id: req.params.id } });
    notifyGoogleSheet();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// POST /api/schedules/bulk — auto-generate jadwal sebulan (adil & acak)
app.post('/api/schedules/bulk', async (req, res) => {
  const { month, divisionId, offPerPerson } = req.body;
  if (!month || !divisionId) {
    return res.status(400).json({ success: false, error: 'month dan divisionId wajib diisi' });
  }
  try {
    const [year, monthNum] = month.split('-').map(Number);
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    const [users, shifts] = await Promise.all([
      prisma.user.findMany({ where: { divisionId }, select: { id: true, name: true } }),
      prisma.shift.findMany({ where: { divisionId }, select: { id: true, name: true, checkInTime: true, checkOutTime: true } })
    ]);

    if (users.length === 0) return res.status(400).json({ success: false, error: 'Tidak ada karyawan di divisi ini' });
    if (shifts.length === 0) return res.status(400).json({ success: false, error: 'Tidak ada shift di divisi ini' });

    const offShift = shifts.find(s => s.checkInTime === '00:00' && s.checkOutTime === '00:00');
    const workShifts = shifts.filter(s => s.checkInTime !== '00:00' || s.checkOutTime !== '00:00');
    const targetOff = Math.min(offPerPerson || 4, daysInMonth - 1);

    const grid: string[][] = users.map(() => new Array(daysInMonth).fill(''));
    const shiftCount: number[][] = users.map(() => new Array(workShifts.length).fill(0));
    const maxOffPerDay = Math.ceil((users.length * targetOff) / daysInMonth) + 1;

    if (offShift) {
      for (let u = 0; u < users.length; u++) {
        let assigned = 0, attempts = 0;
        while (assigned < targetOff && attempts < 2000) {
          attempts++;
          const d = Math.floor(Math.random() * daysInMonth);
          if (grid[u][d] !== '') continue;
          const dayOffCount = grid.filter((_, j) => grid[j][d] === offShift.id).length;
          const consecutive = (d > 0 && grid[u][d-1] === offShift.id) || (d < daysInMonth-1 && grid[u][d+1] === offShift.id);
          if (dayOffCount < maxOffPerDay && (!consecutive || attempts > 100)) {
            grid[u][d] = offShift.id;
            assigned++;
          }
        }
      }
    }

    for (let d = 0; d < daysInMonth; d++) {
      const order = [...Array(users.length).keys()].sort(() => 0.5 - Math.random());
      for (const u of order) {
        if (grid[u][d] !== '') continue;
        if (workShifts.length === 0) continue;
        let minIdx = 0;
        for (let s = 1; s < workShifts.length; s++) {
          if (shiftCount[u][s] < shiftCount[u][minIdx]) minIdx = s;
        }
        grid[u][d] = workShifts[minIdx].id;
        shiftCount[u][minIdx]++;
      }
    }

    const existingIds = (await prisma.schedule.findMany({
      where: { date: { startsWith: month }, user: { divisionId } },
      select: { id: true }
    })).map(s => s.id);
    if (existingIds.length > 0) await prisma.schedule.deleteMany({ where: { id: { in: existingIds } } });

    const inserts: any[] = [];
    for (let u = 0; u < users.length; u++) {
      for (let d = 0; d < daysInMonth; d++) {
        if (grid[u][d]) {
          const day = String(d + 1).padStart(2, '0');
          inserts.push({ userId: users[u].id, shiftId: grid[u][d], date: `${month}-${day}` });
        }
      }
    }
    await prisma.schedule.createMany({ data: inserts });
    notifyGoogleSheet();
    res.json({ success: true, generated: inserts.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ==========================================
// SCHEDULE (From Google Sheets)
// ==========================================

app.get('/api/schedule', async (req, res) => {
  const { name, full } = req.query;
  const GAS_URL = process.env.GAS_WEBAPP_URL;

  if (!GAS_URL) {
    return res.status(500).json({ success: false, error: 'GAS_WEBAPP_URL belum diatur di .env backend' });
  }

  try {
    const url = `${GAS_URL}?name=${encodeURIComponent(name as string)}${full === 'true' ? '&full=true' : ''}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.success && name) {
      const userDb = await prisma.user.findFirst({
        where: { name: String(name) },
        include: { division: { include: { shifts: true } } }
      });

      if (userDb?.division?.shifts?.length) {
        const shifts = userDb.division.shifts;
        const translateCode = (rawCode: string) => {
          if (!rawCode || rawCode === '-') return rawCode;
          const matched = shifts.find(s => s.name.toUpperCase() === rawCode.toUpperCase());
          if (matched) {
            if (matched.checkInTime === '00:00' && matched.checkOutTime === '00:00') {
              return `Libur / OFF (${matched.name})`;
            }
            return `${matched.checkInTime} - ${matched.checkOutTime} (${matched.name})`;
          }
          return rawCode;
        };

        if (data.jadwal) {
          const rawCode = data.jadwal;
          data.jadwal = translateCode(data.jadwal);
          const matched = shifts.find(s => s.name.toUpperCase() === rawCode.toUpperCase());
          if (matched && matched.locationId) {
            data.locationId = matched.locationId;
          }
        }

        if (data.jadwalBulanIni) {
          for (const [tgl, kode] of Object.entries(data.jadwalBulanIni)) {
            data.jadwalBulanIni[tgl] = translateCode(kode as string);
          }
        }
      }
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Gagal mengambil jadwal dari spreadsheet' });
  }
});

// ==========================================
// LOCATIONS / OUTLETS
// ==========================================

app.get('/api/locations', async (req, res) => {
  const cacheKey = 'locations:all';
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const locations = await prisma.location.findMany({ orderBy: { name: 'asc' } });
    const result = { success: true, locations };
    setCache(cacheKey, result, 60_000); // cache 60 detik
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.post('/api/locations', async (req, res) => {
  const { name, latitude, longitude, radius } = req.body;
  try {
    const location = await prisma.location.create({
      data: { name, latitude, longitude, radius: radius || 50 }
    });
    invalidateCache('locations:');
    res.json({ success: true, location });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.put('/api/locations/:id', async (req, res) => {
  const { name, latitude, longitude, radius } = req.body;
  try {
    const location = await prisma.location.update({
      where: { id: req.params.id },
      data: { name, latitude, longitude, radius }
    });
    invalidateCache('locations:');
    res.json({ success: true, location });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.delete('/api/locations/:id', async (req, res) => {
  try {
    await prisma.location.delete({ where: { id: req.params.id } });
    invalidateCache('locations:');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Utility untuk mengirim pesan WhatsApp via Fonnte dengan otomatis uji ulang (Retry Logic)
const sendFonnteWithRetry = async (target: string, message: string, maxAttempts = 3) => {
  const token = process.env.FONNTE_TOKEN || '4hx9LBigZiCK6fgZDiJc';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[Fonnte] Mengirim notifikasi WA keterlambatan (Percobaan ${attempt}/${maxAttempts})...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 detik per percobaan

      const fonnteRes = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target,
          message,
          countryCode: '62',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const fonnteResult = await fonnteRes.json().catch(() => null);

      // Cek apakah pesan sudah terkirim / masuk antrean Fonnte
      if (fonnteResult && fonnteResult.status === true) {
        console.log(`✅ [Fonnte] Pesan keterlambatan BERHASIL terkirim pada percobaan ke-${attempt}!`, fonnteResult.target);
        return true;
      } else {
        console.warn(`⚠️ [Fonnte] Percobaan ${attempt} belum terkirim (${fonnteResult?.detail || 'gagal'}), menguji ulang...`);
      }
    } catch (err: any) {
      console.error(`⚠️ [Fonnte] Percobaan ${attempt} error:`, err?.name === 'AbortError' ? 'Timeout 6s' : err?.message || err);
    }

    // Jika belum berhasil dan masih ada kesempatan retry, tunggu 2 detik sebelum uji lagi
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.error(`❌ [Fonnte] Gagal mengirim pesan setelah ${maxAttempts} kali percobaan.`);
  return false;
};

// Utility untuk mengecek keterlambatan dan memicu pengiriman notifikasi Fonnte
const notifyFonnteLateness = async (userId: string, timestamp: Date, locationStr: string) => {
  const token = process.env.FONNTE_TOKEN || '4hx9LBigZiCK6fgZDiJc';
  const target = process.env.FONNTE_TARGET || '085748120828,082273952703,120363291321455700@g.us';
  if (!token || !target) {
    console.warn('⚠️ Fonnte Token/Target belum diatur di environment variable!');
    return null;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { division: true },
    });
    if (!user) return null;

    // Perhitungan Waktu Indonesia Barat (UTC+7) murni — tahan di semua zona waktu server
    const wibMs = new Date(timestamp).getTime() + (7 * 3600 * 1000);
    const wibDate = new Date(wibMs);
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${wibDate.getUTCFullYear()}-${pad(wibDate.getUTCMonth() + 1)}-${pad(wibDate.getUTCDate())}`;

    const schedule = await prisma.schedule.findUnique({
      where: { userId_date: { userId, date: dateStr } },
      include: { shift: true },
    });

    if (!schedule || !schedule.shift) return null;
    const shift = schedule.shift;

    // Abaikan jika shift libur / OFF
    if (shift.checkInTime === '00:00' && shift.checkOutTime === '00:00') return null;
    if (shift.name.toUpperCase().includes('OFF') || shift.name.toUpperCase().includes('LIBUR')) return null;

    const actualH = wibDate.getUTCHours();
    const actualM = wibDate.getUTCMinutes();
    const actualS = wibDate.getUTCSeconds();

    const [schedH, schedM] = shift.checkInTime.split(':').map(Number);
    const actualTotalSec = (actualH * 3600) + (actualM * 60) + actualS;
    const schedTotalSec = (schedH * 3600) + (schedM * 60);
    const diffSeconds = actualTotalSec - schedTotalSec;

    // Jika tidak terlambat (tepat waktu / datang lebih awal)
    if (diffSeconds <= 0) {
      return { isLate: false, diffSeconds: 0, durationText: '', shiftCheckIn: shift.checkInTime };
    }

    const hours = Math.floor(diffSeconds / 3600);
    const minutes = Math.floor((diffSeconds % 3600) / 60);
    const seconds = diffSeconds % 60;

    const durationParts: string[] = [];
    if (hours > 0) durationParts.push(`${hours} Jam`);
    if (minutes > 0) durationParts.push(`${minutes} Menit`);
    if (durationParts.length === 0 || seconds > 0) durationParts.push(`${seconds} Detik`);
    const durationText = durationParts.join(' ');

    let outletName = '';
    try {
      const locObj = JSON.parse(locationStr || '{}');
      if (locObj.outlet) outletName = locObj.outlet.trim();
    } catch {}

    const divName = user.division?.name ? user.division.name.trim() : '';
    const userMeta = [divName, outletName].filter(Boolean).join(' · ');
    const metaStr = userMeta ? ` (${userMeta})` : '';

    const actualTimeStr = `${pad(actualH)}:${pad(actualM)}:${pad(actualS)}`;

    const message =
      `⚠️ *Notifikasi Telat*\n` +
      `• *Nama:* ${user.name}${metaStr}\n` +
      `• *Jam:* ${shift.checkInTime} ➔ ${actualTimeStr} WIB\n` +
      `• *Durasi:* Telat ${durationText}`;

    // Kirim pesan WA dengan mekanisme uji ulang (Retry) di background — TIDAK memperlambat respons presensi!
    sendFonnteWithRetry(target, message, 3).catch((err) => {
      console.error('Background Fonnte dispatch error:', err);
    });

    return {
      isLate: true,
      diffSeconds,
      durationText,
      shiftCheckIn: shift.checkInTime,
    };
  } catch (err) {
    console.error('Error in notifyFonnteLateness:', err);
    return null;
  }
};

// POST /api/notifications/send-absent — kirim notifikasi WA untuk karyawan yang belum presensi
app.post('/api/notifications/send-absent', async (req, res) => {
  const token = process.env.FONNTE_TOKEN || '4hx9LBigZiCK6fgZDiJc';
  const target = process.env.FONNTE_TARGET || '085748120828,082273952703,120363291321455700@g.us';

  if (!token || !target) {
    return res.status(500).json({ success: false, message: 'Fonnte Token/Target belum diatur' });
  }

  const { userId, userName, divisionName, outletName, checkInTime, overdueText } = req.body;

  if (!userId || !userName) {
    return res.status(400).json({ success: false, message: 'Data tidak lengkap' });
  }

  try {
    // Format metadata
    const userMeta = [divisionName, outletName].filter(Boolean).join(' · ');
    const metaStr = userMeta ? ` (${userMeta})` : '';

    // Format pesan WhatsApp
    const message =
      `🔔 *Belum Presensi*\n` +
      `• *Nama:* ${userName}${metaStr}\n` +
      `• *Jadwal Masuk:* ${checkInTime || '-'} WIB\n` +
      `• *Status:* ${overdueText || 'Belum Presensi Masuk'}`;

    console.log(`[Fonnte] Mengirim notifikasi belum presensi untuk: ${userName}`);

    // Kirim via Fonnte dengan retry
    const success = await sendFonnteWithRetry(target, message, 3);

    if (success) {
      return res.json({
        success: true,
        message: 'Notifikasi berhasil dikirim ke WhatsApp',
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Gagal mengirim notifikasi setelah beberapa percobaan',
      });
    }
  } catch (err) {
    console.error('Error in send-absent notification:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ==========================================
// REPORTS (REKAPAN PRESENSI)
// ==========================================

const getWibDayRange = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const startUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - (7 * 3600 * 1000));
  const endUtc = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - (7 * 3600 * 1000));
  return { startUtc, endUtc };
};

const getWibMonthRange = (monthStr: string) => {
  const [y, m] = monthStr.split('-').map(Number);
  const startUtc = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0) - (7 * 3600 * 1000));
  const endDay = new Date(y, m, 0).getDate();
  const endUtc = new Date(Date.UTC(y, m - 1, endDay, 23, 59, 59, 999) - (7 * 3600 * 1000));
  return { startUtc, endUtc };
};

// POST /api/reports/send-wa — kirim rekapan harian (telat & belum presensi) ke grup WhatsApp via Fonnte
app.post('/api/reports/send-wa', async (req, res) => {
  const token = process.env.FONNTE_TOKEN;
  // Khusus rekapan harian: kirim ke Grup dan WA IT Ence (082273952703)
  const target = process.env.FONNTE_RECAP_TARGET || '120363291321455700@g.us,082273952703';

  if (!token || !target) {
    return res.status(500).json({ success: false, message: 'Fonnte Token atau Target belum diatur di file .env' });
  }

  const { date, divisionId } = req.body;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const wibNow = new Date(now.getTime() + (7 * 3600 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
  const defaultDate = `${wibNow.getFullYear()}-${pad(wibNow.getMonth() + 1)}-${pad(wibNow.getDate())}`;
  const dateStr = String(date || defaultDate);

  try {
    const { startUtc, endUtc } = getWibDayRange(dateStr);

    const userWhere: any = {};
    if (divisionId) userWhere.divisionId = divisionId;

    const [users, schedules, attendanceRecords, divisionInfo] = await Promise.all([
      prisma.user.findMany({
        where: userWhere,
        select: {
          id: true,
          name: true,
          division: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.schedule.findMany({
        where: { date: dateStr },
        select: {
          userId: true,
          shift: {
            select: {
              name: true,
              checkInTime: true,
              checkOutTime: true,
              location: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.attendance.findMany({
        where: { timestamp: { gte: startUtc, lte: endUtc } },
        select: {
          id: true,
          userId: true,
          type: true,
          location: true,
          timestamp: true,
        },
        orderBy: { timestamp: 'asc' },
      }),
      divisionId ? prisma.division.findUnique({ where: { id: divisionId } }) : null,
    ]);

    const schedMap: Record<string, any> = {};
    for (const s of schedules) schedMap[s.userId] = s.shift;

    const attMap: Record<string, { in?: any; out?: any }> = {};
    for (const a of attendanceRecords) {
      if (!attMap[a.userId]) attMap[a.userId] = {};
      if (a.type === 'in' && !attMap[a.userId].in) attMap[a.userId].in = a;
      if (a.type === 'out') attMap[a.userId].out = a;
    }

    const lateList: string[] = [];
    const unmarkedList: string[] = [];
    let totalPresent = 0;
    let totalOnTime = 0;

    for (const u of users) {
      const shift = schedMap[u.id] || null;
      const att = attMap[u.id] || {};
      const inRec = att.in || null;

      const isOffShift = shift
        ? (shift.checkInTime === '00:00' && shift.checkOutTime === '00:00') ||
          shift.name.toUpperCase().includes('OFF') ||
          shift.name.toUpperCase().includes('LIBUR') ||
          shift.name.toUpperCase().includes('CUTI') ||
          shift.name.toUpperCase().includes('IZIN') ||
          shift.name.toUpperCase().includes('SAKIT')
        : false;

      if (isOffShift) continue; // Lewati shift libur

      if (inRec) {
        totalPresent++;
        if (shift && shift.checkInTime) {
          const inDate = new Date(inRec.timestamp);
          const inWib = new Date(inDate.getTime() + (7 * 3600 * 1000) + (inDate.getTimezoneOffset() * 60 * 1000));
          const [sh, sm] = shift.checkInTime.split(':').map(Number);
          const schedWib = new Date(inWib);
          schedWib.setHours(sh, sm, 0, 0);

          const diffSec = Math.round((inWib.getTime() - schedWib.getTime()) / 1000);
          if (diffSec > 0) {
            const h = Math.floor(diffSec / 3600);
            const m = Math.floor((diffSec % 3600) / 60);
            const durArr = [];
            if (h > 0) durArr.push(`${h}j`);
            if (m > 0 || durArr.length === 0) durArr.push(`${m}m`);
            const durStr = durArr.join(' ');

            let outlet = shift.location?.name && shift.location.name !== '-' ? `/${shift.location.name.trim()}` : '';
            try {
              const loc = JSON.parse(inRec.location || '{}');
              if (loc.outlet && loc.outlet !== '-') outlet = `/${loc.outlet.trim()}`;
            } catch {}

            const inTimeStr = `${pad(inWib.getHours())}:${pad(inWib.getMinutes())}`;
            const divName = u.division?.name || '-';
            lateList.push(
              `${lateList.length + 1}. *${u.name}* (${divName}${outlet}) ➔ Masuk ${inTimeStr} *(Telat ${durStr})*`
            );
          } else {
            totalOnTime++;
          }
        } else {
          totalOnTime++;
        }
      } else if (shift) {
        // Karyawan terjadwal kerja tapi belum presensi masuk
        const [sh, sm] = shift.checkInTime ? shift.checkInTime.split(':').map(Number) : [0, 0];
        const schedWib = new Date(wibNow);
        schedWib.setHours(sh, sm, 0, 0);
        const overdueMinutes = Math.round((wibNow.getTime() - schedWib.getTime()) / (60 * 1000));

        let statusText = 'Belum Masuk';
        if (dateStr === defaultDate) {
          if (overdueMinutes > 0) {
            const oh = Math.floor(overdueMinutes / 60);
            const om = overdueMinutes % 60;
            statusText = oh > 0 ? `Lewat ${oh}j ${om}m` : `Lewat ${om}m`;
          } else {
            statusText = `Shift ${shift.checkInTime} WIB`;
          }
        } else if (dateStr < defaultDate) {
          statusText = 'Tidak Hadir';
        }

        const outlet = shift.location?.name && shift.location.name !== '-' ? `/${shift.location.name.trim()}` : '';
        const divName = u.division?.name || '-';
        unmarkedList.push(
          `${unmarkedList.length + 1}. *${u.name}* (${divName}${outlet}) ➔ Shift ${shift.checkInTime || '-'} *(${statusText})*`
        );
      }
    }

    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const tanggalIndo = dateObj.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const jamUpdate = `${pad(wibNow.getHours())}:${pad(wibNow.getMinutes())} WIB`;

    let message =
      `📢 *REKAP PRESENSI DONATTOUR*\n` +
      `📅 ${tanggalIndo} · Update ${jamUpdate}\n`;

    if (divisionInfo) {
      message += `🏢 Divisi: ${divisionInfo.name}\n`;
    }

    message += `\n🚨 *TERLAMBAT (${lateList.length}):*\n`;
    message += lateList.length > 0 ? lateList.join('\n') + '\n' : '_Nihil (Semua tepat waktu) 🎉_\n';

    message += `\n⏳ *BELUM PRESENSI (${unmarkedList.length}):*\n`;
    message += unmarkedList.length > 0 ? unmarkedList.join('\n') + '\n' : '_Nihil (Semua sudah check-in) ✅_\n';

    message += `\n📊 *TOTAL:* ${totalOnTime} Tepat Waktu · ${lateList.length} Telat · ${unmarkedList.length} Belum Masuk`;

    const fonnteRes = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target,
        message,
        countryCode: '62',
      }),
    });

    const fonnteData = await fonnteRes.json().catch(() => null);
    console.log('📢 Fonnte group recap broadcast result:', fonnteData);

    res.json({
      success: true,
      message: 'Rekapan berhasil dikirim ke grup WhatsApp!',
      totalLate: lateList.length,
      totalUnmarked: unmarkedList.length,
      fonnte: fonnteData,
    });
  } catch (error: any) {
    console.error('Error broadcasting daily report to WA:', error);
    res.status(500).json({ success: false, message: error.message || 'Database error' });
  }
});

// GET /api/attendance/:id/photo — ambil foto presensi on-demand (sangat cepat & hemat bandwidth)
app.get('/api/attendance/:id/photo', async (req, res) => {
  const { id } = req.params;
  const cacheKey = `att:photo:${id}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const record = await prisma.attendance.findUnique({
      where: { id },
      select: { photo: true },
    });
    if (!record || !record.photo) {
      return res.status(404).json({ success: false, message: 'Foto tidak ditemukan' });
    }
    const result = { success: true, photo: record.photo };
    setCache(cacheKey, result, 300_000); // cache foto 5 menit
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// GET /api/reports/daily?date=2026-10-23&divisionId=...
app.get('/api/reports/daily', async (req, res) => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const wibNow = new Date(now.getTime() + (7 * 3600 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
  const defaultDate = `${wibNow.getFullYear()}-${pad(wibNow.getMonth() + 1)}-${pad(wibNow.getDate())}`;

  const dateStr = String(req.query.date || defaultDate);
  const divisionId = req.query.divisionId ? String(req.query.divisionId) : null;

  const cacheKey = `reports:daily:${dateStr}:${divisionId || 'all'}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const { startUtc, endUtc } = getWibDayRange(dateStr);

    const userWhere: any = {};
    if (divisionId) userWhere.divisionId = divisionId;

    const [users, schedules, attendanceRecords] = await Promise.all([
      prisma.user.findMany({
        where: userWhere,
        select: {
          id: true,
          name: true,
          role: true,
          photo: true,
          division: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.schedule.findMany({
        where: { date: dateStr },
        select: {
          userId: true,
          shift: {
            select: {
              name: true,
              checkInTime: true,
              checkOutTime: true,
              location: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.attendance.findMany({
        where: { timestamp: { gte: startUtc, lte: endUtc } },
        select: {
          id: true,
          userId: true,
          type: true,
          location: true,
          timestamp: true,
        },
        orderBy: { timestamp: 'asc' },
      }),
    ]);

    const schedMap: Record<string, any> = {};
    for (const s of schedules) schedMap[s.userId] = s.shift;

    const attMap: Record<string, { in?: any; out?: any }> = {};
    for (const a of attendanceRecords) {
      if (!attMap[a.userId]) attMap[a.userId] = {};
      if (a.type === 'in' && !attMap[a.userId].in) attMap[a.userId].in = a;
      if (a.type === 'out') attMap[a.userId].out = a;
    }

    let totalPresent = 0;
    let totalLate = 0;
    let totalOnTime = 0;
    let totalOff = 0;
    let totalAbsent = 0;
    let totalLateSeconds = 0;

    const items = users.map((u) => {
      const shift = schedMap[u.id] || null;
      const att = attMap[u.id] || {};
      const inRec = att.in || null;
      const outRec = att.out || null;

      const isOffShift = shift
        ? (shift.checkInTime === '00:00' && shift.checkOutTime === '00:00') ||
          shift.name.toUpperCase().includes('OFF') ||
          shift.name.toUpperCase().includes('LIBUR') ||
          shift.name.toUpperCase().includes('CUTI') ||
          shift.name.toUpperCase().includes('IZIN') ||
          shift.name.toUpperCase().includes('SAKIT')
        : false;

      let isLate = false;
      let lateSeconds = 0;
      let status: 'late' | 'on_time' | 'early' | 'off' | 'absent' | 'incomplete' = 'absent';

      if (isOffShift) {
        status = 'off';
        totalOff++;
      } else if (inRec) {
        totalPresent++;
        if (shift && shift.checkInTime) {
          const inDate = new Date(inRec.timestamp);
          const inWib = new Date(inDate.getTime() + (7 * 3600 * 1000) + (inDate.getTimezoneOffset() * 60 * 1000));
          const [sh, sm] = shift.checkInTime.split(':').map(Number);
          const schedWib = new Date(inWib);
          schedWib.setHours(sh, sm, 0, 0);

          const diffSec = Math.round((inWib.getTime() - schedWib.getTime()) / 1000);
          if (diffSec > 0) {
            isLate = true;
            lateSeconds = diffSec;
            totalLate++;
            totalLateSeconds += diffSec;
            status = 'late';
          } else {
            totalOnTime++;
            status = 'on_time';
          }
        } else {
          status = 'on_time';
          totalOnTime++;
        }
      } else {
        totalAbsent++;
        status = 'absent';
      }

      let inLocationObj: any = null;
      let outLocationObj: any = null;
      try { if (inRec?.location) inLocationObj = JSON.parse(inRec.location); } catch {}
      try { if (outRec?.location) outLocationObj = JSON.parse(outRec.location); } catch {}

      return {
        user: { id: u.id, name: u.name, role: u.role, photo: u.photo, division: u.division },
        shift: shift ? {
          name: shift.name,
          checkInTime: shift.checkInTime,
          checkOutTime: shift.checkOutTime,
          isOff: isOffShift,
          location: shift.location,
        } : null,
        inRecord: inRec ? {
          id: inRec.id,
          timestamp: inRec.timestamp,
          outlet: inLocationObj?.outlet || null,
          hasPhoto: true,
        } : null,
        outRecord: outRec ? {
          id: outRec.id,
          timestamp: outRec.timestamp,
          outlet: outLocationObj?.outlet || null,
          hasPhoto: true,
        } : null,
        isLate,
        lateSeconds,
        status,
      };
    });

    const result = {
      success: true,
      date: dateStr,
      summary: {
        totalUsers: users.length,
        totalPresent,
        totalLate,
        totalOnTime,
        totalOff,
        totalAbsent,
        totalLateSeconds,
      },
      items,
    };

    setCache(cacheKey, result, 600_000); // cache 10 menit (otomatis di-reset seketika saat presensi baru)
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// GET /api/reports/monthly?month=2026-10&divisionId=...
app.get('/api/reports/monthly', async (req, res) => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const defaultMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const monthStr = String(req.query.month || defaultMonth);
  const divisionId = req.query.divisionId ? String(req.query.divisionId) : null;

  const cacheKey = `reports:monthly:${monthStr}:${divisionId || 'all'}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const { startUtc, endUtc } = getWibMonthRange(monthStr);

    const userWhere: any = {};
    if (divisionId) userWhere.divisionId = divisionId;

    const [users, schedules, attendanceRecords] = await Promise.all([
      prisma.user.findMany({
        where: userWhere,
        select: {
          id: true,
          name: true,
          role: true,
          division: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.schedule.findMany({
        where: { date: { startsWith: monthStr } },
        select: {
          userId: true,
          date: true,
          shift: {
            select: {
              id: true,
              name: true,
              checkInTime: true,
              checkOutTime: true,
            },
          },
        },
      }),
      prisma.attendance.findMany({
        where: { timestamp: { gte: startUtc, lte: endUtc } },
        select: {
          userId: true,
          timestamp: true,
          type: true,
        },
        orderBy: { timestamp: 'asc' },
      }),
    ]);

    const schedByUserAndDate: Record<string, Record<string, any>> = {};
    for (const s of schedules) {
      if (!schedByUserAndDate[s.userId]) schedByUserAndDate[s.userId] = {};
      schedByUserAndDate[s.userId][s.date] = s.shift;
    }

    const attByUserAndDate: Record<string, Record<string, any>> = {};
    for (const a of attendanceRecords) {
      const d = new Date(a.timestamp);
      const wib = new Date(d.getTime() + (7 * 3600 * 1000) + (d.getTimezoneOffset() * 60 * 1000));
      const dateKey = `${wib.getFullYear()}-${pad(wib.getMonth() + 1)}-${pad(wib.getDate())}`;
      if (!attByUserAndDate[a.userId]) attByUserAndDate[a.userId] = {};
      if (a.type === 'in' && !attByUserAndDate[a.userId][dateKey]) {
        attByUserAndDate[a.userId][dateKey] = a;
      }
    }

    const userStats = users.map((u) => {
      const uScheds = schedByUserAndDate[u.id] || {};
      const uAtts = attByUserAndDate[u.id] || {};

      let totalWorkDays = 0;
      let totalPresent = 0;
      let totalLateCount = 0;
      let totalLateSeconds = 0;
      let totalOff = 0;

      for (const [date, shift] of Object.entries(uScheds)) {
        const isOffShift = (shift.checkInTime === '00:00' && shift.checkOutTime === '00:00') ||
          shift.name.toUpperCase().includes('OFF') ||
          shift.name.toUpperCase().includes('LIBUR') ||
          shift.name.toUpperCase().includes('CUTI') ||
          shift.name.toUpperCase().includes('IZIN') ||
          shift.name.toUpperCase().includes('SAKIT');

        if (isOffShift) {
          totalOff++;
          continue;
        }

        totalWorkDays++;
        const inRec = uAtts[date];
        if (inRec) {
          totalPresent++;
          if (shift.checkInTime) {
            const inDate = new Date(inRec.timestamp);
            const inWib = new Date(inDate.getTime() + (7 * 3600 * 1000) + (inDate.getTimezoneOffset() * 60 * 1000));
            const [sh, sm] = shift.checkInTime.split(':').map(Number);
            const schedWib = new Date(inWib);
            schedWib.setHours(sh, sm, 0, 0);

            const diffSec = Math.round((inWib.getTime() - schedWib.getTime()) / 1000);
            if (diffSec > 0) {
              totalLateCount++;
              totalLateSeconds += diffSec;
            }
          }
        }
      }

      // Hitung present jika ada presensi di luar jadwal shift tercatat
      const allPresentKeys = Object.keys(uAtts);
      if (totalWorkDays === 0 && allPresentKeys.length > 0) {
        totalPresent = allPresentKeys.length;
      }

      const presencePercent = totalWorkDays > 0 ? Math.round((totalPresent / totalWorkDays) * 100) : 0;

      return {
        user: { id: u.id, name: u.name, role: u.role, division: u.division },
        totalWorkDays,
        totalPresent,
        totalLateCount,
        totalLateSeconds,
        totalOff,
        presencePercent,
      };
    });

    const result = {
      success: true,
      month: monthStr,
      users: userStats,
    };

    setCache(cacheKey, result, 600_000); // 10 menit (otomatis di-reset seketika saat presensi baru)
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// GET /api/attendance — semua rekap presensi
app.get('/api/attendance', async (req, res) => {
  try {
    const records = await prisma.attendance.findMany({
      orderBy: { timestamp: 'desc' },
      take: 500,
      include: {
        user: { select: { id: true, name: true, role: true, division: true } }
      }
    });
    res.json({ success: true, records });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// POST /api/attendance — simpan data presensi
app.post('/api/attendance', async (req, res) => {
  const { userId, type, location, photo } = req.body;

  if (!userId || !type || !location) {
    res.status(400).json({ success: false, message: 'userId, type, dan location wajib diisi.' });
    return;
  }

  try {
    const record = await prisma.attendance.create({
      data: { userId, type, location, photo },
    });
    invalidateCache(`attendance:${userId}`); // hapus cache setelah presensi baru
    invalidateCache('reports:'); // hapus cache laporan harian & bulanan
    // Notify sheet secara async — tidak blokir response
    notifyGoogleSheet();

    // Jika presensi masuk (Clock IN), cek keterlambatan dan kirim ke WhatsApp via Fonnte
    let lateInfo: any = null;
    if (type === 'in') {
      try {
        lateInfo = await notifyFonnteLateness(userId, record.timestamp, location);
      } catch (err) {
        console.error('Fonnte notify error:', err);
      }
    }

    res.json({ success: true, record, lateInfo });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// GET /api/attendance/:userId — ambil riwayat presensi user
app.get('/api/attendance/:userId', async (req, res) => {
  const { userId } = req.params;
  const cacheKey = `attendance:${userId}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const records = await prisma.attendance.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: 20,
    });
    const result = { success: true, records };
    setCache(cacheKey, result, 30_000); // cache 30 detik
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Jalankan server lokal jika bukan di Vercel
if (!process.env.VERCEL) {
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`✅ Server berjalan di http://localhost:${port}`);
  });
}

// Export untuk Vercel Serverless Function
export default app;
