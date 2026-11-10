import 'dotenv/config';
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
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
      where: { name, dob, role: { not: 'DELETED' } },
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

// PUT /api/users/:id/dob — update tanggal lahir user
app.put('/api/users/:id/dob', async (req, res) => {
  const { id } = req.params;
  const { dob } = req.body;

  if (!dob) {
    res.status(400).json({ success: false, message: 'Tanggal lahir wajib diisi.' });
    return;
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { dob },
      select: { id: true, name: true, role: true, dob: true, photo: true, divisionId: true, division: true },
    });
    
    // Invalidate cache users
    invalidateCache('users:');
    
    // Notify Google Sheet untuk sync
    notifyGoogleSheet();
    
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
      where: { role: { not: 'DELETED' } },
      include: { division: true },
      orderBy: { name: 'asc' }
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

// DELETE /api/users/:id — hapus user (cerdas: jika masih ada foto kehadiran, tandai akun sebagai DELETED agar foto bisa ditinjau & dibersihkan di menu Hapus Foto)
app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const photoCount = await prisma.attendance.count({
      where: { userId: id, photo: { not: null } },
    });

    // Hapus relasi yang tidak perlu disimpan
    await prisma.schedule.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.shiftChangeRequest.deleteMany({ where: { userId: id } }).catch(() => {});

    if (photoCount > 0) {
      // Tandai role sebagai 'DELETED' agar akun nonaktif dan tidak bisa login,
      // tetapi nama dan fotonya tetap terlacak di menu "Hapus Foto"
      await prisma.user.update({
        where: { id },
        data: { role: 'DELETED' },
      });
      invalidateCache('users:');
      notifyGoogleSheet();
      return res.json({
        success: true,
        photosRemaining: photoCount,
        message: 'Akun dinonaktifkan/dihapus. Foto presensi masih tersimpan dan dapat dibersihkan di menu Foto Kehadiran > Hapus Foto.',
      });
    } else {
      await prisma.attendance.deleteMany({ where: { userId: id } });
      await prisma.leaveRequest.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.user.delete({ where: { id } });
      invalidateCache('users:');
      notifyGoogleSheet();
      return res.json({ success: true, photosRemaining: 0, message: 'Akun berhasil dihapus permanen.' });
    }
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
          orderBy: { name: 'asc' },
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

// GET /api/shifts?divisionId=xxx — ambil shift berdasarkan divisi
app.get('/api/shifts', async (req, res) => {
  const { divisionId } = req.query;
  
  if (!divisionId) {
    return res.status(400).json({ success: false, error: 'divisionId wajib diisi' });
  }

  const cacheKey = `shifts:division:${divisionId}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const shifts = await prisma.shift.findMany({
      where: { divisionId: divisionId as string },
      orderBy: { name: 'asc' },
      include: { location: true }
    });
    const result = { success: true, shifts };
    setCache(cacheKey, result, 60_000); // cache 60 detik
    res.json(result);
  } catch (error) {
    console.error('Error fetching shifts:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

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

// GET /api/attendance/photos — galeri foto kehadiran 1 nama (IN & OUT dijadikan satu kartu)
app.get('/api/attendance/photos', async (req, res) => {
  const { date, divisionId, statusFilter, q } = req.query;

  try {
    const where: any = {
      photo: { not: null },
    };

    if (date) {
      const { startUtc, endUtc } = getWibDayRange(String(date));
      where.timestamp = { gte: startUtc, lte: endUtc };
    }

    const userWhere: any = {};
    if (divisionId) {
      userWhere.divisionId = String(divisionId);
    }
    if (q) {
      userWhere.name = { contains: String(q), mode: 'insensitive' };
    }
    if (Object.keys(userWhere).length > 0) {
      where.user = userWhere;
    }

    // Ambil data presensi urut dari awal (asc) agar in dan out terekam runtut
    const records = await prisma.attendance.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: 500,
      select: {
        id: true,
        userId: true,
        type: true,
        location: true,
        photo: true,
        timestamp: true,
        user: {
          select: {
            id: true,
            name: true,
            role: true,
            photo: true,
            division: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Satukan IN dan OUT per karyawan (1 user = 1 item)
    const userMap: Record<string, any> = {};

    for (const r of records) {
      if (!userMap[r.userId]) {
        userMap[r.userId] = {
          userId: r.userId,
          userName: r.user.name,
          userRole: r.user.role,
          userAvatar: r.user.photo,
          divisionName: r.user.division?.name || '-',
          inRecord: null,
          outRecord: null,
        };
      }

      let locObj: any = null;
      try {
        if (r.location) locObj = JSON.parse(r.location);
      } catch {}

      const detail = {
        id: r.id,
        timestamp: r.timestamp,
        photo: r.photo,
        outlet: locObj?.outlet || null,
        latitude: locObj?.latitude ?? null,
        longitude: locObj?.longitude ?? null,
        distance: locObj?.distance ?? null,
        accuracy: locObj?.accuracy ?? null,
      };

      if (r.type === 'in' && !userMap[r.userId].inRecord) {
        userMap[r.userId].inRecord = detail;
      } else if (r.type === 'out') {
        userMap[r.userId].outRecord = detail;
      }
    }

    let items = Object.values(userMap);

    // Filter status khusus jika diminta
    if (statusFilter === 'in_only') {
      items = items.filter((it: any) => it.inRecord && !it.outRecord);
    } else if (statusFilter === 'complete') {
      items = items.filter((it: any) => it.inRecord && it.outRecord);
    } else if (statusFilter === 'out_only') {
      items = items.filter((it: any) => !it.inRecord && it.outRecord);
    }

    // Urutkan berdasarkan nama karyawan (A-Z)
    items.sort((a: any, b: any) => a.userName.localeCompare(b.userName));

    res.json({ success: true, count: items.length, items });
  } catch (error) {
    console.error('Error fetching attendance photos:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ==========================================
// PHOTO CLEANUP & TRACKING APIS
// ==========================================

// GET /api/attendance/photos/cleanup-summary
// Mengambil ringkasan foto per karyawan (termasuk akun aktif & akun yang sudah dihapus)
app.get('/api/attendance/photos/cleanup-summary', async (req, res) => {
  try {
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        role: true,
        photo: true,
        divisionId: true,
        division: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    const attendances = await prisma.attendance.findMany({
      select: {
        id: true,
        userId: true,
        photo: true,
        timestamp: true,
      },
      orderBy: { timestamp: 'desc' },
    });

    const userStatsMap: Record<string, {
      photoCount: number;
      totalCount: number;
      latestDate: string | null;
      earliestDate: string | null;
    }> = {};

    let grandTotalPhotos = 0;
    const grandTotalAttendances = attendances.length;

    for (const att of attendances) {
      if (!userStatsMap[att.userId]) {
        userStatsMap[att.userId] = {
          photoCount: 0,
          totalCount: 0,
          latestDate: null,
          earliestDate: null,
        };
      }
      const st = userStatsMap[att.userId];
      st.totalCount += 1;
      if (att.photo) {
        st.photoCount += 1;
        grandTotalPhotos += 1;
      }
      const tsIso = att.timestamp.toISOString();
      if (!st.latestDate) st.latestDate = tsIso;
      st.earliestDate = tsIso;
    }

    const userSummaries = allUsers.map((u) => {
      const stats = userStatsMap[u.id] || {
        photoCount: 0,
        totalCount: 0,
        latestDate: null,
        earliestDate: null,
      };
      const isDeleted = u.role === 'DELETED';
      // Rata-rata ukuran foto base64 ~170 KB
      const approxSizeKb = Math.round(stats.photoCount * 170);

      return {
        userId: u.id,
        name: u.name,
        userAvatar: u.photo,
        role: u.role,
        isDeleted,
        divisionName: u.division?.name || '-',
        divisionId: u.divisionId,
        photoCount: stats.photoCount,
        attendanceCount: stats.totalCount,
        latestDate: stats.latestDate,
        earliestDate: stats.earliestDate,
        approxSizeKb,
      };
    });

    const deletedAccountsWithPhotos = userSummaries.filter(
      (u) => u.isDeleted && u.photoCount > 0
    );

    const grandApproxSizeMb = Number(((grandTotalPhotos * 170) / 1024).toFixed(1));

    res.json({
      success: true,
      grandTotalPhotos,
      grandTotalAttendances,
      grandApproxSizeMb,
      deletedAccountsWithPhotos,
      userSummaries,
    });
  } catch (error) {
    console.error('Error fetching photo cleanup summary:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// GET /api/attendance/photos/user/:userId
// Mengambil seluruh riwayat foto presensi milik 1 karyawan tertentu, dikelompokkan per tanggal (IN & OUT disatukan)
// Mendukung filter bulan (?month=YYYY-MM) dan daftar bulan yang tersedia
app.get('/api/attendance/photos/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const monthParam = req.query.month ? String(req.query.month) : null;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        photo: true,
        division: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User tidak ditemukan' });
    }

    // Helper WIB Date YYYY-MM-DD
    const getWibDateStr = (date: Date) => {
      const wib = new Date(date.getTime() + (7 * 3600 * 1000));
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${wib.getUTCFullYear()}-${pad(wib.getUTCMonth() + 1)}-${pad(wib.getUTCDate())}`;
    };

    // Ambil SEMUA rekaman foto user untuk mendeteksi bulan-bulan yang tersedia
    const allRecords = await prisma.attendance.findMany({
      where: {
        userId,
        photo: { not: null },
      },
      orderBy: { timestamp: 'desc' },
      select: {
        id: true,
        type: true,
        timestamp: true,
        location: true,
        photo: true,
      },
    });

    // Deteksi bulan apa saja yang memiliki foto
    const monthSet = new Set<string>();
    for (const r of allRecords) {
      const dStr = getWibDateStr(r.timestamp);
      monthSet.add(dStr.substring(0, 7)); // 'YYYY-MM'
    }
    const availableMonths = Array.from(monthSet).sort((a, b) => b.localeCompare(a));

    // Filter berdasarkan bulan jika diminta
    let filteredRecords = allRecords;
    if (monthParam && monthParam !== 'all' && /^\d{4}-\d{2}$/.test(monthParam)) {
      filteredRecords = allRecords.filter((r) => {
        const dStr = getWibDateStr(r.timestamp);
        return dStr.startsWith(monthParam);
      });
    }

    // Urutkan asc untuk memproses IN sebelum OUT
    const recordsAsc = [...filteredRecords].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Satukan IN dan OUT per tanggal yang sama
    const dateMap: Record<string, {
      dateStr: string;
      inRecord: any | null;
      outRecord: any | null;
      status: 'complete' | 'in_only' | 'out_only';
    }> = {};

    for (const r of recordsAsc) {
      const dateStr = getWibDateStr(r.timestamp);
      if (!dateMap[dateStr]) {
        dateMap[dateStr] = {
          dateStr,
          inRecord: null,
          outRecord: null,
          status: 'in_only',
        };
      }

      let locObj: any = null;
      try {
        if (r.location) locObj = JSON.parse(r.location);
      } catch {}

      const detail = {
        id: r.id,
        type: r.type,
        timestamp: r.timestamp,
        photo: r.photo,
        outlet: locObj?.outlet || null,
        latitude: locObj?.lat || locObj?.latitude || null,
        longitude: locObj?.lng || locObj?.longitude || null,
        distance: locObj?.distance ?? null,
        accuracy: locObj?.accuracy ?? null,
      };

      if (r.type === 'in' && !dateMap[dateStr].inRecord) {
        dateMap[dateStr].inRecord = detail;
      } else if (r.type === 'out') {
        dateMap[dateStr].outRecord = detail;
      }
    }

    // Beri status tiap tanggal
    for (const d of Object.values(dateMap)) {
      if (d.inRecord && d.outRecord) {
        d.status = 'complete';
      } else if (d.inRecord) {
        d.status = 'in_only';
      } else {
        d.status = 'out_only';
      }
    }

    // Urutkan tanggal dari terbaru ke terlama (desc)
    const dailyRecords = Object.values(dateMap).sort((a, b) => b.dateStr.localeCompare(a.dateStr));

    // Flat items untuk kompatibilitas
    const items = filteredRecords.map((r) => {
      let locObj: any = null;
      try {
        if (r.location) locObj = JSON.parse(r.location);
      } catch {}

      return {
        id: r.id,
        type: r.type,
        timestamp: r.timestamp,
        photo: r.photo,
        outlet: locObj?.outlet || null,
        latitude: locObj?.lat || locObj?.latitude || null,
        longitude: locObj?.lng || locObj?.longitude || null,
        distance: locObj?.distance ?? null,
        accuracy: locObj?.accuracy ?? null,
      };
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        isDeleted: user.role === 'DELETED',
        userAvatar: user.photo,
        divisionName: user.division?.name || '-',
      },
      availableMonths,
      selectedMonth: monthParam || (availableMonths[0] || null),
      totalPhotos: allRecords.length,
      filteredPhotos: filteredRecords.length,
      dailyRecords,
      items,
    });
  } catch (error) {
    console.error('Error fetching user photos:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// DELETE /api/attendance/record/:id/photo
// Menghapus 1 foto tertentu (mengosongkan foto pada baris absensi)
app.delete('/api/attendance/record/:id/photo', async (req, res) => {
  const { id } = req.params;
  try {
    const updated = await prisma.attendance.update({
      where: { id },
      data: { photo: null },
    });
    res.json({ success: true, message: 'Foto berhasil dihapus.', record: updated });
  } catch (error) {
    console.error('Error deleting single photo:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// DELETE /api/attendance/photos/user/:userId
// Menghapus foto dari 1 karyawan:
// - mode: 'photos_only' (mengosongkan photo = null agar jam & laporan tetap aman)
// - mode: 'purge_all' (menghapus seluruh row attendance, dan jika user DELETED juga menghapus user row)
app.delete('/api/attendance/photos/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const mode = req.query.mode || req.body?.mode || 'photos_only';

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User tidak ditemukan' });
    }

    if (mode === 'photos_only') {
      const result = await prisma.attendance.updateMany({
        where: { userId, photo: { not: null } },
        data: { photo: null },
      });
      return res.json({
        success: true,
        mode: 'photos_only',
        affectedCount: result.count,
        message: `Berhasil mengosongkan ${result.count} foto presensi atas nama ${user.name}. Riwayat jam & kehadiran tetap tersimpan aman.`,
      });
    } else {
      const delAtt = await prisma.attendance.deleteMany({
        where: { userId },
      });

      if (user.role === 'DELETED') {
        await prisma.leaveRequest.deleteMany({ where: { userId } }).catch(() => {});
        await prisma.schedule.deleteMany({ where: { userId } }).catch(() => {});
        await prisma.shiftChangeRequest.deleteMany({ where: { userId } }).catch(() => {});
        await prisma.user.delete({ where: { id: userId } }).catch(() => {});
      }

      return res.json({
        success: true,
        mode: 'purge_all',
        affectedCount: delAtt.count,
        message: `Berhasil menghapus seluruh ${delAtt.count} rekaman presensi beserta foto atas nama ${user.name}.`,
      });
    }
  } catch (error) {
    console.error('Error deleting user attendance photos:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// POST /api/attendance/photos/purge-all-deleted
// Bersihkan sekaligus seluruh foto dari semua akun yang sudah dihapus
app.post('/api/attendance/photos/purge-all-deleted', async (req, res) => {
  try {
    const deletedUsers = await prisma.user.findMany({
      where: { role: 'DELETED' },
      select: { id: true },
    });

    if (deletedUsers.length === 0) {
      return res.json({ success: true, count: 0, message: 'Tidak ada akun terhapus yang ditemukan.' });
    }

    const ids = deletedUsers.map((u) => u.id);
    const delResult = await prisma.attendance.deleteMany({
      where: { userId: { in: ids } },
    });

    await prisma.leaveRequest.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
    await prisma.schedule.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
    await prisma.shiftChangeRequest.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});

    res.json({
      success: true,
      count: delResult.count,
      usersPurged: ids.length,
      message: `Berhasil membersihkan ${delResult.count} foto presensi dari ${ids.length} akun yang telah dihapus.`,
    });
  } catch (error) {
    console.error('Error purging deleted accounts photos:', error);
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

// GET /api/reports/monthly-detail?month=2026-11&divisionId=...
// Periode: tgl 11 bulan berjalan s/d tgl 10 bulan berikutnya
// Return data per user per tanggal: jam in (HH:mm:ss), jam out (HH:mm:ss), diff waktu (- untuk telat, + untuk lebih awal), shift, summary
app.get('/api/reports/monthly-detail', async (req, res) => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const defaultMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const monthStr = String(req.query.month || defaultMonth);
  const divisionId = req.query.divisionId ? String(req.query.divisionId) : null;

  const cacheKey = `reports:monthly-detail-v4:${monthStr}:${divisionId || 'all'}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const [year, monthNum] = monthStr.split('-').map(Number);
    const daysInCurrentMonth = new Date(year, monthNum, 0).getDate();

    const nextMonthDate = new Date(year, monthNum, 1);
    const nextYear = nextMonthDate.getFullYear();
    const nextMonthNum = nextMonthDate.getMonth() + 1;

    // Waktu sekarang dalam WIB (UTC+7)
    const nowUtc = new Date();
    const nowWib = new Date(nowUtc.getTime() + (7 * 3600 * 1000));
    const todayWibStr = `${nowWib.getUTCFullYear()}-${pad(nowWib.getUTCMonth() + 1)}-${pad(nowWib.getUTCDate())}`;
    const currentWibMinutes = nowWib.getUTCHours() * 60 + nowWib.getUTCMinutes();

    // Daftar tanggal periode: 11 s/d akhir bulan ini, lanjut 1 s/d 10 bulan berikutnya
    const days: string[] = [];
    for (let d = 11; d <= daysInCurrentMonth; d++) {
      days.push(`${year}-${pad(monthNum)}-${pad(d)}`);
    }
    for (let d = 1; d <= 10; d++) {
      days.push(`${nextYear}-${pad(nextMonthNum)}-${pad(d)}`);
    }

    const startUtc = new Date(Date.UTC(year, monthNum - 1, 11, 0, 0, 0) - (7 * 3600 * 1000));
    const endUtc = new Date(Date.UTC(nextYear, nextMonthNum - 1, 10, 23, 59, 59, 999) - (7 * 3600 * 1000));

    const userWhere: any = {};
    if (divisionId) userWhere.divisionId = divisionId;

    const [users, schedules, attendanceRecords] = await Promise.all([
      prisma.user.findMany({
        where: userWhere,
        select: { id: true, name: true, role: true, createdAt: true, division: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.schedule.findMany({
        where: { date: { in: days } },
        select: {
          userId: true, date: true,
          shift: { select: { id: true, name: true, checkInTime: true, checkOutTime: true } },
        },
      }),
      prisma.attendance.findMany({
        where: { timestamp: { gte: startUtc, lte: endUtc } },
        select: { userId: true, timestamp: true, type: true },
        orderBy: { timestamp: 'asc' },
      }),
    ]);

    // Map schedule per user per date
    const schedMap: Record<string, Record<string, any>> = {};
    for (const s of schedules) {
      if (!schedMap[s.userId]) schedMap[s.userId] = {};
      schedMap[s.userId][s.date] = s.shift;
    }

    // Map attendance per user per date (in & out dengan jam:menit:detik lengkap WIB)
    const attMap: Record<string, Record<string, { in?: string; out?: string; inWibDate?: Date; outWibDate?: Date }>> = {};
    for (const a of attendanceRecords) {
      const d = new Date(a.timestamp);
      // Konversi murni ke WIB (UTC+7)
      const wib = new Date(d.getTime() + (7 * 3600 * 1000));
      const dateKey = `${wib.getUTCFullYear()}-${pad(wib.getUTCMonth() + 1)}-${pad(wib.getUTCDate())}`;
      const timeStr = `${pad(wib.getUTCHours())}:${pad(wib.getUTCMinutes())}:${pad(wib.getUTCSeconds())}`;

      if (!attMap[a.userId]) attMap[a.userId] = {};
      if (!attMap[a.userId][dateKey]) attMap[a.userId][dateKey] = {};

      if (a.type === 'in' && !attMap[a.userId][dateKey].in) {
        attMap[a.userId][dateKey].in = timeStr;
        attMap[a.userId][dateKey].inWibDate = wib;
      }
      if (a.type === 'out') {
        attMap[a.userId][dateKey].out = timeStr;
        attMap[a.userId][dateKey].outWibDate = wib;
      }
    }

    const userRows = users.map(u => {
      // Tanggal user dibuat/terdaftar (WIB)
      const userCreatedWib = new Date(new Date(u.createdAt).getTime() + (7 * 3600 * 1000));
      const userCreatedDateStr = `${userCreatedWib.getUTCFullYear()}-${pad(userCreatedWib.getUTCMonth() + 1)}-${pad(userCreatedWib.getUTCDate())}`;

      const dailyData: Record<string, {
        shiftName: string | null;
        shiftIn: string | null;
        shiftOut: string | null;
        isOff: boolean;
        inTime: string | null;
        outTime: string | null;
        diffText: string | null; // delta jam masuk (e.g. -12m 30s atau +15m 10s)
        diffSeconds: number | null;
        isLate: boolean;
        isEarly: boolean;
        outDiffText: string | null; // delta jam pulang (e.g. -10m atau +25m)
        outDiffSeconds: number | null;
        isOutEarly: boolean;
        isOutLate: boolean;
        noOutScan: boolean;
        status: 'present' | 'off' | 'absent' | 'unscheduled' | 'upcoming';
        statusText: string;
        isBeforeJoin: boolean;
      }> = {};

      let totalWorkDays = 0;       // Hari kerja terjadwal yang sudah berjalan
      let totalPresent = 0;        // Hadir
      let totalLateCount = 0;      // Frekuensi telat
      let totalLateSeconds = 0;    // Akumulasi detik telat
      let totalEarlySeconds = 0;   // Akumulasi detik lebih awal
      let totalOff = 0;            // Hari libur terjadwal
      let totalAbsent = 0;         // MANGKIR (terjadwal kerja tapi tidak hadir)
      let totalUnscheduled = 0;    // Belum dijadwalkan / Karyawan baru
      let totalUpcomingWork = 0;   // Terjadwal di masa depan

      for (const dateStr of days) {
        const shift = schedMap[u.id]?.[dateStr] || null;
        const att = attMap[u.id]?.[dateStr] || {};
        const isOffShift = shift ? (
          (shift.checkInTime === '00:00' && shift.checkOutTime === '00:00') ||
          ['OFF','LIBUR','CUTI','IZIN','SAKIT'].some(k => shift.name.toUpperCase().includes(k))
        ) : false;

        const isBeforeJoin = dateStr < userCreatedDateStr;
        const isFuture = dateStr > todayWibStr;
        const isToday = dateStr === todayWibStr;

        let diffText: string | null = null;
        let diffSec: number | null = null;
        let isLate = false;
        let isEarly = false;

        let outDiffText: string | null = null;
        let outDiffSec: number | null = null;
        let isOutEarly = false;
        let isOutLate = false;
        let noOutScan = false;

        let status: 'present' | 'off' | 'absent' | 'unscheduled' | 'upcoming' = 'unscheduled';
        let statusText = 'Belum Ada Jadwal';

        // KASUS 1: BELUM DIJADWALKAN / BELUM MASUK (Karyawan baru atau admin belum atur jadwal)
        if (!shift || isBeforeJoin) {
          status = 'unscheduled';
          statusText = isBeforeJoin ? 'Belum Masuk' : 'Belum Terjadwal';
          totalUnscheduled++;
        }
        // KASUS 2: JADWAL OFF / LIBUR
        else if (isOffShift) {
          status = 'off';
          statusText = shift.name || 'OFF';
          totalOff++;
        }
        // KASUS 3: ADA JADWAL KERJA AKTIF
        else {
          // A. Jika ada presensi masuk -> HADIR
          if (att.in && att.inWibDate) {
            status = 'present';
            statusText = 'Hadir';
            totalWorkDays++;
            totalPresent++;

            // Hitung delta Jam Masuk (In)
            if (shift.checkInTime) {
              const [sh, sm, ss = 0] = shift.checkInTime.split(':').map(Number);
              const schedSec = sh * 3600 + sm * 60 + ss;
              const actualSec = att.inWibDate.getUTCHours() * 3600 + att.inWibDate.getUTCMinutes() * 60 + att.inWibDate.getUTCSeconds();
              const delta = actualSec - schedSec;
              diffSec = delta;

              if (delta > 0) {
                // Telat: beri tanda minus (-)
                isLate = true;
                totalLateCount++;
                totalLateSeconds += delta;
                const h = Math.floor(delta / 3600);
                const m = Math.floor((delta % 3600) / 60);
                const s = delta % 60;
                diffText = h > 0 ? `-${h}j ${m}m ${s}s` : m > 0 ? `-${m}m ${s}s` : `-${s}s`;
              } else if (delta < 0) {
                // Lebih awal / cepat: beri tanda plus (+)
                isEarly = true;
                const absDelta = Math.abs(delta);
                totalEarlySeconds += absDelta;
                const h = Math.floor(absDelta / 3600);
                const m = Math.floor((absDelta % 3600) / 60);
                const s = absDelta % 60;
                diffText = h > 0 ? `+${h}j ${m}m ${s}s` : m > 0 ? `+${m}m ${s}s` : `+${s}s`;
              } else {
                diffText = '0s';
              }
            }

            // Hitung delta Jam Pulang (Out) atau deteksi tidak presensi out
            if (att.out && att.outWibDate) {
              if (shift.checkOutTime) {
                const [soh, som, sos = 0] = shift.checkOutTime.split(':').map(Number);
                const schedOutSec = soh * 3600 + som * 60 + sos;
                const actualOutSec = att.outWibDate.getUTCHours() * 3600 + att.outWibDate.getUTCMinutes() * 60 + att.outWibDate.getUTCSeconds();
                const outDelta = actualOutSec - schedOutSec;
                outDiffSec = outDelta;

                if (outDelta < 0) {
                  // Pulang lebih cepat: beri tanda minus (-)
                  isOutEarly = true;
                  const absD = Math.abs(outDelta);
                  const h = Math.floor(absD / 3600);
                  const m = Math.floor((absD % 3600) / 60);
                  const s = absD % 60;
                  outDiffText = h > 0 ? `-${h}j ${m}m ${s}s` : m > 0 ? `-${m}m ${s}s` : `-${s}s`;
                } else if (outDelta > 0) {
                  // Pulang setelah jam shift (lembur/stay): beri tanda plus (+)
                  isOutLate = true;
                  const h = Math.floor(outDelta / 3600);
                  const m = Math.floor((outDelta % 3600) / 60);
                  const s = outDelta % 60;
                  outDiffText = h > 0 ? `+${h}j ${m}m ${s}s` : m > 0 ? `+${m}m ${s}s` : `+${s}s`;
                } else {
                  outDiffText = '0s';
                }
              }
            } else {
              // Jika hari sudah lewat atau shift hari ini sudah selesai tapi belum scan out
              const [soh = 0, som = 0] = (shift.checkOutTime || '00:00').split(':').map(Number);
              const shiftEndMinutes = soh * 60 + som;
              if (!isToday || currentWibMinutes >= shiftEndMinutes) {
                noOutScan = true; // Tidak Presensi Out
              }
            }
          }
          // B. Jika BELUM ada presensi masuk
          else {
            if (isFuture) {
              // Tanggal masa depan -> Terjadwal di masa depan (BUKAN mangkir!)
              status = 'upcoming';
              statusText = shift.name || 'Terjadwal';
              totalUpcomingWork++;
            } else if (isToday) {
              // Hari ini: periksa apakah jam shift sudah mulai
              const [sh = 0, sm = 0] = (shift.checkInTime || '00:00').split(':').map(Number);
              const shiftStartMinutes = sh * 60 + sm;
              if (currentWibMinutes < shiftStartMinutes) {
                // Shift baru akan mulai nanti hari ini
                status = 'upcoming';
                statusText = `Mulai ${shift.checkInTime}`;
                totalUpcomingWork++;
              } else {
                // Jam shift sudah lewat hari ini dan tidak presensi -> TIDAK HADIR
                status = 'absent';
                statusText = 'Tidak Hadir';
                totalWorkDays++;
                totalAbsent++;
              }
            } else {
              // Tanggal yang sudah lewat di mana ada jadwal tapi karyawan tidak hadir -> TIDAK HADIR DARI JADWAL
              status = 'absent';
              statusText = 'Tidak Hadir';
              totalWorkDays++;
              totalAbsent++;
            }
          }
        }

        dailyData[dateStr] = {
          shiftName: shift?.name || null,
          shiftIn: shift?.checkInTime || null,
          shiftOut: shift?.checkOutTime || null,
          isOff: isOffShift,
          inTime: att.in || null,
          outTime: att.out || null,
          diffText,
          diffSeconds: diffSec,
          isLate,
          isEarly,
          outDiffText,
          outDiffSeconds: outDiffSec,
          isOutEarly,
          isOutLate,
          noOutScan,
          status,
          statusText,
          isBeforeJoin,
        };
      }

      const presencePercent = totalWorkDays > 0 ? Math.round((totalPresent / totalWorkDays) * 100) : 0;
      return {
        user: { id: u.id, name: u.name, role: u.role, createdAt: u.createdAt, division: u.division },
        summary: {
          totalWorkDays,
          totalPresent,
          totalLateCount,
          totalLateSeconds,
          totalEarlySeconds,
          totalOff,
          totalAbsent,
          totalUnscheduled,
          totalUpcomingWork,
          presencePercent,
        },
        dailyData,
      };
    });

    const result = {
      success: true,
      month: monthStr,
      todayWib: todayWibStr,
      periodLabel: `${monthStr}-11 s/d ${nextYear}-${pad(nextMonthNum)}-10`,
      days,
      users: userRows,
    };
    setCache(cacheKey, result, 60_000); // 1 menit
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

// GET /api/attendance/:userId — ambil riwayat presensi user (mendukung filter ?month=YYYY-MM)
app.get('/api/attendance/:userId', async (req, res) => {
  const { userId } = req.params;
  const { month } = req.query;
  const cacheKey = `attendance:${userId}:${month || 'recent'}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const where: any = { userId };
    if (month && /^\d{4}-\d{2}$/.test(String(month))) {
      const [y, m] = String(month).split('-').map(Number);
      const startUtc = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0) - (7 * 3600 * 1000));
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const endUtc = new Date(Date.UTC(y, m - 1, lastDay, 23, 59, 59, 999) - (7 * 3600 * 1000));
      where.timestamp = { gte: startUtc, lte: endUtc };
    }

    const records = await prisma.attendance.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: month ? 200 : 100,
    });
    const result = { success: true, records };
    setCache(cacheKey, result, 30_000); // cache 30 detik
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFIKASI WHATSAPP - PENGAJUAN GANTI SHIFT
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/notifications/send-shift-change', async (req, res) => {
  const { userName, userDivision, currentShiftName, currentShiftTime, newShiftName, newShiftTime, requestDate, reason } = req.body;

  const fonnteToken = process.env.FONNTE_TOKEN;
  const fonnteTarget = process.env.FONNTE_TARGET;

  if (!fonnteToken || !fonnteTarget) {
    console.error('Missing FONNTE_TOKEN or FONNTE_TARGET');
    return res.status(500).json({ success: false, error: 'Fonnte not configured' });
  }

  // Format pesan WhatsApp
  const message = `📋 *Pengajuan Ganti Shift*

• *Nama:* ${userName}
• *Divisi:* ${userDivision}
• *Tanggal:* ${requestDate}

🔄 *Perubahan Shift:*
• Shift Saat Ini: ${currentShiftName} (${currentShiftTime})
• Shift Baru: ${newShiftName} (${newShiftTime})

💬 *Alasan:*
${reason}

⏰ _Dikirim: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}_

> _Sent via Presensi Donattour_`;

  // Retry logic untuk Fonnte API
  const sendWithRetry = async (attempt = 1): Promise<boolean> => {
    try {
      const response = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: {
          'Authorization': fonnteToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target: fonnteTarget,
          message: message,
          countryCode: '62',
        }),
      });

      const data = await response.json();
      if (data.status === true || response.ok) {
        console.log(`✅ Notifikasi shift change terkirim (attempt ${attempt})`);
        return true;
      } else {
        throw new Error(data.reason || 'Fonnte API error');
      }
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:`, error);
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 1000 * attempt)); // Exponential backoff
        return sendWithRetry(attempt + 1);
      }
      return false;
    }
  };

  const success = await sendWithRetry();
  if (success) {
    res.json({ success: true, message: 'Notification sent' });
  } else {
    res.status(500).json({ success: false, error: 'Failed to send notification after 3 attempts' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SHIFT CHANGE REQUESTS - PENGAJUAN GANTI SHIFT
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/shift-change-requests?userId=...&status=...
// Admin: Ambil semua request (filter by status: pending/approved/rejected)
// Karyawan: Hanya ambil request milik sendiri
app.get('/api/shift-change-requests', async (req, res) => {
  const { userId, status } = req.query;
  
  try {
    const where: any = {};
    
    // Filter by userId jika disediakan
    if (userId) {
      where.userId = userId as string;
    }
    
    // Filter by status jika disediakan (pending/approved/rejected)
    if (status) {
      where.status = status as string;
    }
    
    const requests = await prisma.shiftChangeRequest.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            division: {
              select: {
                name: true,
              },
            },
          },
        },
        currentShift: {
          select: {
            id: true,
            name: true,
            checkInTime: true,
            checkOutTime: true,
          },
        },
        newShift: {
          select: {
            id: true,
            name: true,
            checkInTime: true,
            checkOutTime: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    res.json({ success: true, requests });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// POST /api/shift-change-requests
// Karyawan mengajukan perubahan shift
app.post('/api/shift-change-requests', async (req, res) => {
  const { userId, currentShiftId, newShiftId, requestDate, reason } = req.body;
  
  if (!userId || !currentShiftId || !newShiftId || !requestDate || !reason) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  
  try {
    const request = await prisma.shiftChangeRequest.create({
      data: {
        userId,
        currentShiftId,
        newShiftId,
        requestDate,
        reason,
        status: 'pending',
      },
      include: {
        user: {
          select: {
            name: true,
            division: {
              select: {
                name: true,
              },
            },
          },
        },
        currentShift: true,
        newShift: true,
      },
    });
    
    res.json({ success: true, request });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to create request' });
  }
});

// PATCH /api/shift-change-requests/:id
// Admin approve/reject pengajuan shift
app.patch('/api/shift-change-requests/:id', async (req, res) => {
  const { id } = req.params;
  const { status, adminNote } = req.body; // status: 'approved' atau 'rejected'
  
  if (!status || !['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status' });
  }
  
  try {
    // Update status request
    const request = await prisma.shiftChangeRequest.update({
      where: { id },
      data: {
        status,
        adminNote: adminNote || null,
        updatedAt: new Date(),
      },
      include: {
        user: true,
        currentShift: true,
        newShift: true,
      },
    });
    
    // Jika APPROVED, update jadwal karyawan di tanggal tersebut
    if (status === 'approved') {
      // Cek apakah ada schedule existing di tanggal tersebut
      const existingSchedule = await prisma.schedule.findFirst({
        where: {
          userId: request.userId,
          date: request.requestDate,
        },
      });
      
      if (existingSchedule) {
        // Update shift yang ada
        await prisma.schedule.update({
          where: { id: existingSchedule.id },
          data: {
            shiftId: request.newShiftId,
          },
        });
      } else {
        // Buat schedule baru jika belum ada
        await prisma.schedule.create({
          data: {
            userId: request.userId,
            shiftId: request.newShiftId,
            date: request.requestDate,
          },
        });
      }
    }
    
    res.json({ success: true, request });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to update request' });
  }
});

// ==========================================
// NOTIFICATIONS — WhatsApp via Fonnte
// ==========================================

// POST /api/notifications/send-shift-change
// Kirim notifikasi WhatsApp ke admin/grup tentang pengajuan shift change
app.post('/api/notifications/send-shift-change', async (req, res) => {
  const { 
    userName, 
    userDivision, 
    currentShiftName, 
    currentShiftTime, 
    newShiftName, 
    newShiftTime, 
    requestDate, 
    reason 
  } = req.body;
  
  const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
  const TARGET_NUMBER = process.env.FONNTE_TARGET_NUMBER; // Format: 628xxxxxxxxxx atau group ID
  
  if (!FONNTE_TOKEN || !TARGET_NUMBER) {
    console.error('Fonnte credentials not configured');
    return res.status(500).json({ success: false, error: 'Notification service not configured' });
  }
  
  // Format pesan WhatsApp
  const message = `🔄 *PENGAJUAN GANTI SHIFT*\n\n` +
    `👤 *Nama:* ${userName}\n` +
    `🏢 *Divisi:* ${userDivision}\n` +
    `📅 *Tanggal:* ${requestDate}\n\n` +
    `⏰ *Shift Saat Ini:*\n${currentShiftName} (${currentShiftTime})\n\n` +
    `🔄 *Shift Baru:*\n${newShiftName} (${newShiftTime})\n\n` +
    `📝 *Alasan:*\n${reason}\n\n` +
    `_Silakan cek aplikasi untuk approve/reject._`;
  
  // Retry logic: 3x percobaan
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      const response = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: {
          'Authorization': FONNTE_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target: TARGET_NUMBER,
          message: message,
          countryCode: '62', // Indonesia
        }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.status) {
        console.log('✅ WhatsApp notification sent successfully');
        return res.json({ success: true, data });
      } else {
        console.error(`❌ Fonnte API error (attempt ${attempts + 1}):`, data);
        attempts++;
        
        if (attempts >= maxAttempts) {
          return res.status(500).json({ 
            success: false, 
            error: 'Failed to send notification after 3 attempts',
            details: data 
          });
        }
        
        // Wait 1 second before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`❌ Network error sending notification (attempt ${attempts + 1}):`, error);
      attempts++;
      
      if (attempts >= maxAttempts) {
        return res.status(500).json({ 
          success: false, 
          error: 'Network error after 3 attempts' 
        });
      }
      
      // Wait 1 second before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LEAVE REQUESTS - PENGAJUAN IZIN (DENGAN BUKTI FOTO WAJIB)
// ═══════════════════════════════════════════════════════════════════════════════

let leaveTableInitialized = false;
const ensureLeaveRequestTable = async () => {
  if (leaveTableInitialized) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "LeaveRequest" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "requestDate" TEXT NOT NULL,
      "reason" TEXT NOT NULL,
      "photo" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "adminNote" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
    );
  `);
  leaveTableInitialized = true;
};

// GET /api/leave-requests?userId=...&status=...
app.get('/api/leave-requests', async (req, res) => {
  const { userId, status } = req.query;
  try {
    await ensureLeaveRequestTable();

    let rows: any[] = [];
    if (userId && status) {
      rows = await prisma.$queryRaw`
        SELECT * FROM "LeaveRequest"
        WHERE "userId" = ${String(userId)} AND "status" = ${String(status)}
        ORDER BY "createdAt" DESC
      `;
    } else if (userId) {
      rows = await prisma.$queryRaw`
        SELECT * FROM "LeaveRequest"
        WHERE "userId" = ${String(userId)}
        ORDER BY "createdAt" DESC
      `;
    } else if (status) {
      rows = await prisma.$queryRaw`
        SELECT * FROM "LeaveRequest"
        WHERE "status" = ${String(status)}
        ORDER BY "createdAt" DESC
      `;
    } else {
      rows = await prisma.$queryRaw`
        SELECT * FROM "LeaveRequest"
        ORDER BY "createdAt" DESC
      `;
    }

    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            name: true,
            divisionId: true,
            division: { select: { name: true } },
          },
        })
      : [];

    const userMap: Record<string, any> = {};
    for (const u of users) userMap[u.id] = u;

    const requests = rows.map((r) => ({
      ...r,
      user: userMap[r.userId] || { id: r.userId, name: 'Karyawan', division: null },
    }));

    res.json({ success: true, requests });
  } catch (error) {
    console.error('Error fetching leave requests:', error);
    res.status(500).json({ success: false, error: 'Gagal memuat pengajuan izin' });
  }
});

// POST /api/leave-requests
app.post('/api/leave-requests', async (req, res) => {
  const { userId, requestDate, reason, photo } = req.body;

  if (!userId || !requestDate || !reason || !photo) {
    return res.status(400).json({
      success: false,
      error: 'Tanggal izin, keterangan, dan bukti foto wajib diisi.',
    });
  }

  try {
    await ensureLeaveRequestTable();

    const id = crypto.randomUUID();
    const now = new Date();

    await prisma.$executeRaw`
      INSERT INTO "LeaveRequest" ("id", "userId", "requestDate", "reason", "photo", "status", "createdAt", "updatedAt")
      VALUES (${id}, ${String(userId)}, ${String(requestDate)}, ${String(reason)}, ${String(photo)}, 'pending', ${now}, ${now})
    `;

    const user = await prisma.user.findUnique({
      where: { id: String(userId) },
      select: { id: true, name: true, division: { select: { name: true } } },
    });

    // Kirim notifikasi WhatsApp ke Admin/Grup via Fonnte (async, non-blocking)
    const fonnteToken = process.env.FONNTE_TOKEN;
    const fonnteTarget = process.env.FONNTE_TARGET || process.env.FONNTE_TARGET_NUMBER;
    if (fonnteToken && fonnteTarget && user) {
      const dateFormatted = new Date(requestDate).toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const waMsg =
        `📝 *PENGAJUAN IZIN KARYAWAN*\n\n` +
        `👤 *Nama:* ${user.name}\n` +
        `🏢 *Divisi:* ${user.division?.name || '-'}\n` +
        `📅 *Tanggal Izin:* ${dateFormatted}\n\n` +
        `💬 *Keterangan:*\n${reason}\n\n` +
        `📸 _Bukti foto telah dilampirkan di aplikasi._\n` +
        `_Silakan buka menu Pengajuan Izin di aplikasi untuk menyetujui/menolak._`;

      fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: {
          Authorization: fonnteToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target: fonnteTarget,
          message: waMsg,
          countryCode: '62',
        }),
      }).catch((err) => console.error('Fonnte leave notify error:', err));
    }

    res.json({
      success: true,
      request: {
        id,
        userId,
        requestDate,
        reason,
        photo,
        status: 'pending',
        adminNote: null,
        createdAt: now,
        updatedAt: now,
        user: user || { id: userId, name: 'Karyawan', division: null },
      },
    });
  } catch (error) {
    console.error('Error creating leave request:', error);
    res.status(500).json({ success: false, error: 'Gagal mengirim pengajuan izin' });
  }
});

// PATCH /api/leave-requests/:id — Admin setujui / tolak pengajuan izin
app.patch('/api/leave-requests/:id', async (req, res) => {
  const { id } = req.params;
  const { status, adminNote } = req.body;

  if (!status || !['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Status tidak valid' });
  }

  try {
    await ensureLeaveRequestTable();
    const now = new Date();

    await prisma.$executeRaw`
      UPDATE "LeaveRequest"
      SET "status" = ${String(status)}, "adminNote" = ${adminNote ? String(adminNote) : null}, "updatedAt" = ${now}
      WHERE "id" = ${String(id)}
    `;

    // Jika disetujui (approved), cek apakah divisi user memiliki shift IZIN dan update jadwal di tanggal tersebut
    if (status === 'approved') {
      const rows: any[] = await prisma.$queryRaw`
        SELECT * FROM "LeaveRequest" WHERE "id" = ${String(id)} LIMIT 1
      `;
      const leaveReq = rows[0];
      if (leaveReq) {
        const user = await prisma.user.findUnique({
          where: { id: leaveReq.userId },
          include: { division: { include: { shifts: true } } },
        });
        const shifts = user?.division?.shifts || [];
        // Prioritaskan shift yang bernama 'IZIN'
        let izinShift = shifts.find((s) => s.name.toUpperCase().includes('IZIN'));

        // Jika belum ada shift IZIN di divisi ini, otomatis buatkan shift 'IZIN' (00:00 - 00:00)
        if (!izinShift && user?.divisionId) {
          try {
            izinShift = await prisma.shift.create({
              data: {
                name: 'IZIN',
                description: 'Izin',
                checkInTime: '00:00',
                checkOutTime: '00:00',
                divisionId: user.divisionId,
              },
            });
          } catch (e) {
            console.error('Error creating IZIN shift:', e);
          }
        }

        // Fallback jika pembuatan shift gagal: gunakan shift 00:00 / OFF
        if (!izinShift) {
          izinShift =
            shifts.find((s) => s.checkInTime === '00:00' && s.checkOutTime === '00:00') ||
            shifts.find((s) => s.name.toUpperCase().includes('OFF') || s.name.toUpperCase().includes('LIBUR'));
        }

        if (izinShift) {
          const existingSchedule = await prisma.schedule.findFirst({
            where: { userId: leaveReq.userId, date: leaveReq.requestDate },
          });
          if (existingSchedule) {
            await prisma.schedule.update({
              where: { id: existingSchedule.id },
              data: { shiftId: izinShift.id },
            });
          } else {
            await prisma.schedule.create({
              data: {
                userId: leaveReq.userId,
                shiftId: izinShift.id,
                date: leaveReq.requestDate,
              },
            });
          }
          invalidateCache('schedules:');
          invalidateCache('reports:');
          invalidateCache('shifts:');
        }
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating leave request:', error);
    res.status(500).json({ success: false, error: 'Gagal memperbarui status pengajuan izin' });
  }
});

// DELETE /api/leave-requests/:id — Hapus / batalkan pengajuan izin
app.delete('/api/leave-requests/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await ensureLeaveRequestTable();
    await prisma.$executeRaw`
      DELETE FROM "LeaveRequest" WHERE "id" = ${String(id)}
    `;
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting leave request:', error);
    res.status(500).json({ success: false, error: 'Gagal menghapus pengajuan izin' });
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
