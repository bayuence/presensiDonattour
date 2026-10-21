import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

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
  try {
    const users = await prisma.user.findMany({
      include: { division: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, users });
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
    res.json({ success: true, divisions });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// POST /api/divisions
app.post('/api/divisions', async (req, res) => {
  const { name } = req.body;
  try {
    const division = await prisma.division.create({ data: { name } });
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
    notifyGoogleSheet();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});


// ==========================================
// SCHEDULE DB — Kelola jadwal shift dari database
// ==========================================

// GET /api/schedules?month=2026-10 — ambil semua jadwal bulan ini
app.get('/api/schedules', async (req, res) => {
  const { month, divisionId, userId } = req.query; // month format: "YYYY-MM"
  try {
    const where: any = {};
    if (month) {
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
            location: { select: { id: true, name: true, radius: true } }
          }
        }
      },
      orderBy: { date: 'asc' }
    });
    // Filter by division on application side
    const filtered = divisionId
      ? schedules.filter(s => s.user.divisionId === divisionId)
      : schedules;
    res.json({ success: true, schedules: filtered });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// POST /api/schedules — upsert jadwal (1 hari 1 user)
app.post('/api/schedules', async (req, res) => {
  const { userId, shiftId, date } = req.body; // date format: "YYYY-MM-DD"
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
    notifyGoogleSheet();
    res.json({ success: true, schedule });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
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
  const { month, divisionId, offPerPerson } = req.body; // month: "YYYY-MM", offPerPerson: number
  if (!month || !divisionId) {
    return res.status(400).json({ success: false, error: 'month dan divisionId wajib diisi' });
  }
  try {
    const [year, monthNum] = month.split('-').map(Number);
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    // Ambil users dan shifts dari divisi
    const users = await prisma.user.findMany({
      where: { divisionId },
      select: { id: true, name: true }
    });
    const shifts = await prisma.shift.findMany({
      where: { divisionId },
      select: { id: true, name: true, checkInTime: true, checkOutTime: true }
    });

    if (users.length === 0) return res.status(400).json({ success: false, error: 'Tidak ada karyawan di divisi ini' });
    if (shifts.length === 0) return res.status(400).json({ success: false, error: 'Tidak ada shift di divisi ini' });

    const offShift = shifts.find(s => s.checkInTime === '00:00' && s.checkOutTime === '00:00');
    const workShifts = shifts.filter(s => s.checkInTime !== '00:00' || s.checkOutTime !== '00:00');
    const targetOff = Math.min(offPerPerson || 4, daysInMonth - 1);

    // Buat grid jadwal [userIndex][dayIndex]
    const grid: string[][] = users.map(() => new Array(daysInMonth).fill(''));
    const shiftCount: number[][] = users.map(() => new Array(workShifts.length).fill(0));
    const maxOffPerDay = Math.ceil((users.length * targetOff) / daysInMonth) + 1;

    // 1. Assign OFF
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

    // 2. Assign shift kerja secara adil
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

    // 3. Hapus jadwal bulan ini yang sudah ada untuk divisi ini
    const existingIds = (await prisma.schedule.findMany({
      where: { date: { startsWith: month }, user: { divisionId } },
      select: { id: true }
    })).map(s => s.id);
    if (existingIds.length > 0) await prisma.schedule.deleteMany({ where: { id: { in: existingIds } } });

    // 4. Insert baru
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

// GET /api/schedule?name=Bayu
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
      // Ambil user dan divisinya dari Supabase
      const userDb = await prisma.user.findFirst({
        where: { name: String(name) },
        include: { division: { include: { shifts: true } } }
      });

      if (userDb?.division?.shifts?.length) {
        const shifts = userDb.division.shifts;

        // Helper untuk menerjemahkan kode jadwal mentah dari Spreadsheet ke format Jam Supabase
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

        // Timpa jadwal hari ini
        if (data.jadwal) {
          const rawCode = data.jadwal;
          data.jadwal = translateCode(data.jadwal);
          const matched = shifts.find(s => s.name.toUpperCase() === rawCode.toUpperCase());
          if (matched && matched.locationId) {
            data.locationId = matched.locationId;
          }
        }

        // Timpa jadwal 1 bulan penuh (jika diminta)
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

// GET /api/locations
app.get('/api/locations', async (req, res) => {
  try {
    const locations = await prisma.location.findMany({ orderBy: { name: 'asc' } });
    res.json({ success: true, locations });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// POST /api/locations
app.post('/api/locations', async (req, res) => {
  const { name, latitude, longitude, radius } = req.body;
  try {
    const location = await prisma.location.create({
      data: { name, latitude, longitude, radius: radius || 50 }
    });
    res.json({ success: true, location });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// PUT /api/locations/:id
app.put('/api/locations/:id', async (req, res) => {
  const { name, latitude, longitude, radius } = req.body;
  try {
    const location = await prisma.location.update({
      where: { id: req.params.id },
      data: { name, latitude, longitude, radius }
    });
    res.json({ success: true, location });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// DELETE /api/locations/:id
app.delete('/api/locations/:id', async (req, res) => {
  try {
    await prisma.location.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// GET /api/attendance — semua rekap presensi (untuk Apps Script sync)
app.get('/api/attendance', async (req, res) => {
  try {
    const records = await prisma.attendance.findMany({
      orderBy: { timestamp: 'desc' },
      take: 500,
      include: {
        user: {
          select: { id: true, name: true, role: true, division: true }
        }
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
    res.json({ success: true, record });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// GET /api/attendance/:userId — ambil riwayat presensi user
app.get('/api/attendance/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const records = await prisma.attendance.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: 20,
    });
    res.json({ success: true, records });
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
