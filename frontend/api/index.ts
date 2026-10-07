import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

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
      include: { shifts: { orderBy: { checkInTime: 'asc' } } }
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
  const { name, checkInTime, checkOutTime, divisionId } = req.body;
  if (!name || !checkInTime || !checkOutTime || !divisionId) {
    return res.status(400).json({ success: false, error: 'Semua field wajib diisi' });
  }
  try {
    const shift = await prisma.shift.create({
      data: { name, checkInTime, checkOutTime, divisionId }
    });
    res.json({ success: true, shift });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// PUT /api/shifts/:id — edit shift
app.put('/api/shifts/:id', async (req, res) => {
  const { name, checkInTime, checkOutTime } = req.body;
  try {
    const shift = await prisma.shift.update({
      where: { id: req.params.id },
      data: { name, checkInTime, checkOutTime }
    });
    res.json({ success: true, shift });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// DELETE /api/shifts/:id
app.delete('/api/shifts/:id', async (req, res) => {
  try {
    await prisma.shift.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
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
