import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// POST /api/auth/login — autentikasi berdasarkan nama & tanggal lahir
router.post('/login', async (req, res) => {
  const { name, dob } = req.body;

  if (!name || !dob) {
    res.status(400).json({ success: false, message: 'Nama dan tanggal lahir wajib diisi.' });
    return;
  }

  try {
    const user = await prisma.user.findFirst({
      where: { name, dob },
      select: { id: true, name: true, role: true, dob: true },
    });

    if (user) {
      res.json({ success: true, user });
    } else {
      res.status(401).json({ success: false, message: 'Nama atau tanggal lahir tidak ditemukan.' });
    }
  } catch (error) {
    console.error('[auth/login]', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

export default router;
