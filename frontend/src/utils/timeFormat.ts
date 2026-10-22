/**
 * Utility untuk memformat waktu dan selisih presensi dalam jam, menit, dan detik secara rinci.
 */

export interface TimeDeltaInfo {
  label: string;
  color: string;
  bgColor: string;
  totalSeconds: number;
}

/**
 * Memformat Date atau string timestamp menjadi format jam lengkap "HH:mm:ss"
 * Contoh: "16:24:35"
 */
export const formatAttendanceTime = (date: Date | string | null | undefined): string => {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

/**
 * Menghitung selisih waktu dalam satuan detik antara jam aktual dan jadwal shift "HH:mm".
 * Positif jika aktual > jadwal, negatif jika aktual < jadwal.
 */
export const diffSeconds = (actual: Date, hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  const sched = new Date(actual);
  sched.setHours(h, m, 0, 0);
  return Math.round((actual.getTime() - sched.getTime()) / 1000);
};

/**
 * Mengubah detik menjadi teks rinci jam, menit, dan detik.
 * Contoh:
 * - 564 menit 15 detik -> "9 jam 24 mnt 15 dtk"
 * - 23 menit 40 detik  -> "23 mnt 40 dtk"
 * - 45 detik          -> "45 dtk"
 */
export const formatDuration = (totalSec: number): string => {
  const abs = Math.abs(totalSec);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;

  const parts: string[] = [];
  if (h > 0) parts.push(`${h} jam`);
  if (m > 0) parts.push(`${m} mnt`);
  if (s > 0 || parts.length === 0) parts.push(`${s} dtk`);

  return parts.join(' ');
};

/**
 * Label & Warna selisih untuk Absen Masuk (Clock IN)
 */
export const getDeltaIn = (sec: number): TimeDeltaInfo => {
  if (sec === 0) {
    return { label: 'Tepat waktu', color: '#16a34a', bgColor: '#f0fdf4', totalSeconds: sec };
  }
  if (sec > 0) {
    return { label: `Telat ${formatDuration(sec)}`, color: '#dc2626', bgColor: '#fef2f2', totalSeconds: sec };
  }
  return { label: `Awal ${formatDuration(sec)}`, color: '#2563eb', bgColor: '#eff6ff', totalSeconds: sec };
};

/**
 * Label & Warna selisih untuk Absen Keluar (Clock OUT)
 * Memperjelas tanda + (lebih lama/lembur) dan - (pulang lebih awal) dalam jam, menit, detik
 */
export const getDeltaOut = (sec: number): TimeDeltaInfo => {
  if (sec === 0) {
    return { label: 'Tepat waktu', color: '#16a34a', bgColor: '#f0fdf4', totalSeconds: sec };
  }
  if (sec > 0) {
    return { label: `+${formatDuration(sec)}`, color: '#7c3aed', bgColor: '#f5f3ff', totalSeconds: sec };
  }
  return { label: `- ${formatDuration(sec)} (Awal)`, color: '#d97706', bgColor: '#fffbeb', totalSeconds: sec };
};
