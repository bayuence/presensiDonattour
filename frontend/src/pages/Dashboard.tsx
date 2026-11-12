import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Clock, Calendar, MapPin, ArrowRight, User, ChevronLeft, ChevronRight, X, RefreshCw, CheckCircle2, AlertTriangle, MinusCircle, AlertCircle, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { InstallPwaBanner } from '../components/InstallPwaBanner';

type AttendanceLog = {
  id: string;
  type: 'in' | 'out';
  timestamp: string;
  location: string;
};

type ShiftInfo = {
  id: string;
  name: string;
  description?: string;
  checkInTime: string;
  checkOutTime: string;
};

type ScheduleEntry = {
  id: string;
  date: string;
  shift: ShiftInfo;
};

const isOffShift = (shift: ShiftInfo) =>
  shift.checkInTime === '00:00' && shift.checkOutTime === '00:00';

const getShiftColor = (shift: ShiftInfo): { bg: string; text: string; border: string } => {
  if (isOffShift(shift)) return { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' };
  const n = shift.name.toUpperCase();
  if (n.includes('L1')) return { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' };
  if (n.includes('L2')) return { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' };
  if (n.includes('K1')) return { bg: '#fdf4ff', text: '#7e22ce', border: '#e9d5ff' };
  if (n.includes('K2')) return { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' };
  if (n.includes('CFD')) return { bg: '#fefce8', text: '#a16207', border: '#fde68a' };
  if (n.includes('OTR')) return { bg: '#f8fafc', text: '#475569', border: '#cbd5e1' };
  return { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe' };
};


import { formatAttendanceTime, diffSeconds, formatDuration } from '../utils/timeFormat';

const buildWeeks = (year: number, month: number): (number | null)[][] => {
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
};

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

// Helper konversi timestamp ke YYYY-MM-DD WIB
const getWibDateKey = (timestamp: string | Date): string => {
  const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
};

// Helper waktu dalam menit WIB (0 - 1439)
const getWibMinutes = (timestamp: string | Date): number => {
  const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
    return hour * 60 + minute;
  } catch {
    return d.getHours() * 60 + d.getMinutes();
  }
};

// Helper format HH:mm WIB
const formatTimeHHMM = (timestamp: string | Date): string => {
  const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d).replace('.', ':');
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
};

interface PastDayStatus {
  isPastWorkDay: boolean;
  topColor: string;
  bottomColor: string;
  inTitle: string;
  outTitle: string;
}

const getPastAttendanceStatus = (
  dateStr: string,
  todayStr: string,
  entry: ScheduleEntry | undefined,
  dayLogs: AttendanceLog[]
): PastDayStatus => {
  const isPast = dateStr < todayStr;
  const isTodayDate = dateStr === todayStr;
  const isWorkDay = Boolean(entry && !isOffShift(entry.shift));

  // Hari ini ikut diwarnai realtime sesuai aktivitas; hari mendatang & libur tidak
  if (!(isPast || isTodayDate) || !isWorkDay || !entry) {
    return {
      isPastWorkDay: false,
      topColor: 'transparent',
      bottomColor: 'transparent',
      inTitle: '',
      outTitle: '',
    };
  }

  // Warna "belum terjadi" untuk hari ini (biru/indigo, sama dengan highlight hari ini)
  const PENDING = '#4f46e5';

  // Parse shift times (HH:mm)
  const [inH, inM] = entry.shift.checkInTime.split(':').map(Number);
  const schedInMins = inH * 60 + inM;
  const [outH, outM] = entry.shift.checkOutTime.split(':').map(Number);
  const schedOutMins = outH * 60 + outM;

  const inRecords = dayLogs.filter(l => l.type === 'in');
  const outRecords = dayLogs.filter(l => l.type === 'out');

  // Clock In paling awal, Clock Out paling akhir
  const firstIn = inRecords.length > 0
    ? inRecords.reduce((earliest, cur) => new Date(cur.timestamp) < new Date(earliest.timestamp) ? cur : earliest)
    : null;
  const lastOut = outRecords.length > 0
    ? outRecords.reduce((latest, cur) => new Date(cur.timestamp) > new Date(latest.timestamp) ? cur : latest)
    : null;

  // Bagian ATAS (Clock In):
  // Hijau: <= schedInMins (Tepat waktu)
  // Kuning: > schedInMins (Terlambat)
  // Merah: Tidak absen masuk (hari lewat) / Biru: belum absen (hari ini)
  let topColor = isTodayDate ? PENDING : '#ef4444';
  let inTitle = isTodayDate ? 'Masuk: Belum Absen' : 'Masuk: Tidak Absen';
  if (firstIn) {
    const actualInMins = getWibMinutes(firstIn.timestamp);
    const timeStr = formatTimeHHMM(firstIn.timestamp);
    if (actualInMins <= schedInMins) {
      topColor = '#22c55e'; // Hijau
      inTitle = `Masuk: ${timeStr} WIB (Tepat Waktu, jadwal ${entry.shift.checkInTime})`;
    } else {
      topColor = '#eab308'; // Kuning
      const diff = actualInMins - schedInMins;
      inTitle = `Masuk: ${timeStr} WIB (Telat ${diff} mnt, jadwal ${entry.shift.checkInTime})`;
    }
  }

  // Bagian BAWAH (Clock Out):
  // Hijau: >= schedOutMins (Sesuai/lewat jadwal)
  // Kuning: < schedOutMins (Pulang lebih awal)
  // Merah: Tidak absen pulang
  let bottomColor = isTodayDate ? PENDING : '#ef4444';
  let outTitle = isTodayDate ? 'Pulang: Belum Absen' : 'Pulang: Tidak Absen';
  if (lastOut) {
    const actualOutMins = getWibMinutes(lastOut.timestamp);
    const timeStr = formatTimeHHMM(lastOut.timestamp);
    if (actualOutMins >= schedOutMins) {
      bottomColor = '#22c55e'; // Hijau
      outTitle = `Pulang: ${timeStr} WIB (Sesuai/Lewat Jadwal ${entry.shift.checkOutTime})`;
    } else {
      bottomColor = '#eab308'; // Kuning
      const diff = schedOutMins - actualOutMins;
      outTitle = `Pulang: ${timeStr} WIB (Awal ${diff} mnt, jadwal ${entry.shift.checkOutTime})`;
    }
  }

  return {
    isPastWorkDay: true,
    topColor,
    bottomColor,
    inTitle,
    outTitle,
  };
};

const getDayAttendanceDetail = (
  dayData: { date: Date; dateKey: string; inLog?: AttendanceLog; outLog?: AttendanceLog },
  todayStr: string,
  entry: ScheduleEntry | undefined
) => {
  const isPast = dayData.dateKey < todayStr;
  const isToday = dayData.dateKey === todayStr;
  const shift = entry?.shift;
  const isOff = shift && isOffShift(shift);

  const inT = dayData.inLog ? new Date(dayData.inLog.timestamp) : null;
  const outT = dayData.outLog ? new Date(dayData.outLog.timestamp) : null;

  // IN Calculation
  let inTimeStr = '—';
  let inDeltaLabel = '';
  let inDeltaColor = '#9ca3af';
  let inStatus: 'on_time' | 'early' | 'late' | 'missing' | 'today_pending' | 'none' = 'none';

  if (inT) {
    inTimeStr = formatAttendanceTime(inT);
    if (shift && !isOff) {
      const sec = diffSeconds(inT, shift.checkInTime);
      if (sec <= 0) {
        inStatus = sec === 0 ? 'on_time' : 'early';
        inDeltaLabel = sec === 0 ? 'Tepat waktu' : `Awal ${formatDuration(sec)}`;
        inDeltaColor = '#16a34a';
      } else {
        inStatus = 'late';
        inDeltaLabel = `Telat ${formatDuration(sec)}`;
        inDeltaColor = '#dc2626';
      }
    } else {
      inStatus = 'on_time';
      inDeltaLabel = 'Presensi tercatat';
      inDeltaColor = '#4b5563';
    }
  } else {
    if (isPast && shift && !isOff) {
      inStatus = 'missing';
      inTimeStr = 'Tidak Absen';
      inDeltaLabel = 'Tidak presensi masuk';
      inDeltaColor = '#dc2626';
    } else if (isToday) {
      inStatus = 'today_pending';
      inTimeStr = 'Belum Absen';
      inDeltaLabel = shift ? `Jadwal: ${shift.checkInTime} WIB` : 'Menunggu presensi';
      inDeltaColor = '#d97706';
    }
  }

  // OUT Calculation
  let outTimeStr = '—';
  let outDeltaLabel = '';
  let outDeltaColor = '#9ca3af';
  let outStatus: 'on_time' | 'early' | 'overtime' | 'missing' | 'today_pending' | 'none' = 'none';

  if (outT) {
    outTimeStr = formatAttendanceTime(outT);
    if (shift && !isOff) {
      const sec = diffSeconds(outT, shift.checkOutTime);
      if (sec >= 0) {
        outStatus = sec === 0 ? 'on_time' : 'overtime';
        outDeltaLabel = sec === 0 ? 'Tepat waktu' : `+${formatDuration(sec)} (Lembur)`;
        outDeltaColor = '#16a34a';
      } else {
        outStatus = 'early';
        outDeltaLabel = `Pulang awal ${formatDuration(sec)}`;
        outDeltaColor = '#d97706';
      }
    } else {
      outStatus = 'on_time';
      outDeltaLabel = 'Presensi tercatat';
      outDeltaColor = '#4b5563';
    }
  } else {
    if (isPast) {
      outStatus = 'missing';
      outTimeStr = 'Tidak Absen Pulang';
      outDeltaLabel = shift ? `Jadwal pulang: ${shift.checkOutTime} WIB` : 'Lewat hari · Tidak absen pulang';
      outDeltaColor = '#dc2626';
    } else if (isToday) {
      outStatus = 'today_pending';
      outTimeStr = 'Belum Absen Pulang';
      outDeltaLabel = shift ? `Jadwal pulang: ${shift.checkOutTime} WIB` : 'Sedang bertugas';
      outDeltaColor = '#d97706';
    }
  }

  // Total Jam Kerja Calculation
  let workDurationStr = '—';
  let workStatusText = '';
  let workStatusColor = '#6b7280';
  let isComplete = false;

  if (inT && outT) {
    const durationSec = Math.max(0, Math.round((outT.getTime() - inT.getTime()) / 1000));
    workDurationStr = formatDuration(durationSec);
    isComplete = true;

    if (shift && !isOff) {
      const [inH, inM] = shift.checkInTime.split(':').map(Number);
      const [outH, outM] = shift.checkOutTime.split(':').map(Number);
      const targetSec = Math.max(0, ((outH * 60 + outM) - (inH * 60 + inM)) * 60);

      if (durationSec >= targetSec) {
        workStatusText = 'Optimal (Target shift tercapai)';
        workStatusColor = '#16a34a';
      } else {
        workStatusText = `Kurang ${formatDuration(targetSec - durationSec)} dari target`;
        workStatusColor = '#d97706';
      }
    } else {
      workStatusText = 'Presensi lengkap';
      workStatusColor = '#16a34a';
    }
  } else if (inT && !outT) {
    if (isPast) {
      workDurationStr = 'Tidak Lengkap';
      workStatusText = 'Tidak dapat dihitung · Tidak absen pulang';
      workStatusColor = '#dc2626';
    } else {
      workDurationStr = 'Sedang Berjalan';
      workStatusText = 'Menunggu presensi pulang';
      workStatusColor = '#4f46e5';
    }
  } else if (!inT && outT) {
    workDurationStr = 'Tidak Lengkap';
    workStatusText = 'Hanya presensi pulang tercatat';
    workStatusColor = '#dc2626';
  } else {
    workDurationStr = '0 jam';
    workStatusText = 'Tidak Hadir';
    workStatusColor = '#dc2626';
  }

  return {
    inTimeStr,
    inDeltaLabel,
    inDeltaColor,
    inStatus,
    outTimeStr,
    outDeltaLabel,
    outDeltaColor,
    outStatus,
    workDurationStr,
    workStatusText,
    workStatusColor,
    isComplete,
  };
};

// ─── Tipe data untuk pantau kehadiran per toko (Admin only) ────────────────
type DailyItem = {
  user: { id: string; name: string; photo?: string; division?: { id: string; name: string } | null };
  shift: { name: string; checkInTime: string; checkOutTime: string; isOff: boolean; location?: { id: string; name: string } | null } | null;
  inRecord: { id: string; timestamp: string; outlet?: string | null } | null;
  outRecord: { id: string; timestamp: string; outlet?: string | null } | null;
  isLate: boolean;
  lateSeconds: number;
  status: 'late' | 'on_time' | 'early' | 'off' | 'absent' | 'incomplete';
};

type LocationGroup = {
  locationId: string;
  locationName: string;
  items: DailyItem[];
};

const Dashboard = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [scheduleMap, setScheduleMap] = useState<Record<string, ScheduleEntry>>({});
  const [overtimeMap, setOvertimeMap] = useState<Record<string, { id: string; note: string | null }>>({});
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const checkedDatesRef = useRef<Set<string>>(new Set());

  // State untuk Shift Change Modal
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [availableShifts, setAvailableShifts] = useState<ShiftInfo[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [newShiftId, setNewShiftId] = useState<string>('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // State untuk Pantau Lokasi (Admin only)
  const [locationGroups, setLocationGroups] = useState<LocationGroup[]>([]);
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [locLoaded, setLocLoaded] = useState(false);
  const [selectedLocId, setSelectedLocId] = useState<string | null>(null);
  const isAdmin = user?.role?.toLowerCase() === 'admin';

  // Helper fetch data lokasi
  const fetchLocData = () => {
    if (!isAdmin) return;
    setLoadingLoc(true);
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    fetch(`/api/reports/daily?date=${dateStr}`)
      .then(r => r.json())
      .then(data => {
        if (!data?.success) return;
        const map: Record<string, LocationGroup> = {};
        for (const item of data.items as DailyItem[]) {
          if (!item.shift) continue;
          if (item.shift?.isOff) continue;
          const locId = item.shift?.location?.id ?? '__no_loc';
          const locName = item.shift?.location?.name ?? 'Tanpa Lokasi';
          if (!map[locId]) map[locId] = { locationId: locId, locationName: locName, items: [] };
          map[locId].items.push(item);
        }
        const groups = Object.values(map).sort((a, b) => a.locationName.localeCompare(b.locationName));
        setLocationGroups(groups);
        // Auto-pilih lokasi pertama jika belum ada pilihan
        if (groups.length > 0 && !selectedLocId) setSelectedLocId(groups[0].locationId);
        setLocLoaded(true);
      })
      .catch(() => {})
      .finally(() => setLoadingLoc(false));
  };

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);

  const todayStr = getWibDateKey(today);
  const weeks = buildWeeks(viewYear, viewMonth);
  const todayEntry = scheduleMap[todayStr];
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth() + 1;
  const monthName = new Date(viewYear, viewMonth - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  // Index logs berdasarkan tanggal WIB (YYYY-MM-DD) untuk kalkulasi cepat di kalender
  const logsByDate = useMemo(() => {
    const map: Record<string, AttendanceLog[]> = {};
    for (const log of logs) {
      const key = getWibDateKey(log.timestamp);
      if (!map[key]) map[key] = [];
      map[key].push(log);
    }
    return map;
  }, [logs]);

  const prevMonth = () => { if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1); } else setViewMonth(m => m + 1); };

  // Fetch attendance & shifts — hanya saat pertama mount
  useEffect(() => {
    if (!user?.id || !user?.divisionId) return;
    setLoadingLogs(true);
    setLoadingShifts(true);

    Promise.all([
      fetch(`/api/attendance/${user.id}`).then(r => r.json()).catch(() => null),
      fetch(`/api/shifts?divisionId=${user.divisionId}`).then(r => r.json()).catch(() => null),
    ]).then(([attData, shiftsData]) => {
      if (attData?.success) setLogs(attData.records);
      setLoadingLogs(false);
      if (shiftsData?.success) setAvailableShifts(shiftsData.shifts);
      setLoadingShifts(false);
    });
  }, [user?.id, user?.divisionId]);

  // Fetch jadwal & presensi bulanan — dipanggil saat mount dan saat navigasi bulan
  const fetchMonthLogs = (year: number, month: number) => {
    if (!user?.id) return;
    const mStr = `${year}-${String(month).padStart(2, '0')}`;
    // Ambil riwayat presensi bulan terkait untuk mewarnai tanggal
    fetch(`/api/attendance/${user.id}?month=${mStr}&_=${Date.now()}`)
      .then(r => r.json())
      .then(data => {
        if (data?.success && Array.isArray(data.records)) {
          setLogs(prev => {
            const map = new Map<string, AttendanceLog>();
            prev.forEach(item => map.set(item.id, item));
            data.records.forEach((item: AttendanceLog) => map.set(item.id, item));
            return Array.from(map.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          });
        }
      })
      .catch(() => {});
  };

  const fetchSchedule = (year: number, month: number) => {
    if (!user?.id) return;
    setLoadingSchedule(true);
    const mStr = `${year}-${String(month).padStart(2, '0')}`;
    
    // Fetch jadwal shift
    fetch(`/api/schedules?month=${mStr}&userId=${user.id}`)
      .then(r => r.json())
      .then(data => {
        if (data?.success) {
          const map: Record<string, ScheduleEntry> = {};
          for (const s of data.schedules) map[s.date] = s;
          setScheduleMap(map);
        }
        setLoadingSchedule(false);
      })
      .catch(() => setLoadingSchedule(false));

    // Fetch data penugasan lembur user untuk bulan ini
    fetch(`/api/overtimes?month=${mStr}&userId=${user.id}`)
      .then(r => r.json())
      .then(data => {
        if (data?.success && Array.isArray(data.overtimes)) {
          const otMap: Record<string, { id: string; note: string | null }> = {};
          for (const ot of data.overtimes) {
            otMap[ot.date] = { id: ot.id, note: ot.note };
          }
          setOvertimeMap(otMap);
        }
      })
      .catch(() => {});

    fetchMonthLogs(year, month);
  };

  useEffect(() => {
    fetchSchedule(viewYear, viewMonth);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, viewYear, viewMonth]);

  // Realtime: segarkan warna kalender saat tab kembali aktif & berkala tiap 20 detik
  useEffect(() => {
    if (!user?.id) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') fetchMonthLogs(viewYear, viewMonth);
    };
    const timer = setInterval(refresh, 20000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, viewYear, viewMonth]);

  // Auto-fetch jadwal untuk tanggal-tanggal yang ada di riwayat presensi jika belum ada di scheduleMap
  useEffect(() => {
    if (!user?.id || logs.length === 0) return;
    const missingDates: string[] = [];
    for (const log of logs) {
      const key = getWibDateKey(log.timestamp);
      if (!scheduleMap[key] && !checkedDatesRef.current.has(key) && !missingDates.includes(key)) {
        missingDates.push(key);
      }
    }
    if (missingDates.length === 0) return;

    missingDates.forEach(k => checkedDatesRef.current.add(k));

    fetch(`/api/schedules?userId=${user.id}&dates=${missingDates.join(',')}`)
      .then(r => r.json())
      .then(data => {
        if (data?.success && Array.isArray(data.schedules)) {
          setScheduleMap(prev => {
            const next = { ...prev };
            for (const s of data.schedules) next[s.date] = s;
            return next;
          });
        }
      })
      .catch(() => {});
  }, [user?.id, logs, scheduleMap]);

  // Auto-refresh schedule dihapus — tidak perlu polling tiap 15 detik.
  // Data jadwal sudah di-fetch saat mount dan saat bulan berganti.
  // Jika admin update jadwal, user cukup pull-to-refresh atau reload halaman.
  // Polling 15 detik menyebabkan beban server & app lemot tanpa manfaat nyata.

  // Auto-fetch data lokasi untuk Admin saat pertama mount
  useEffect(() => {
    if (isAdmin) fetchLocData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Handler: Klik tanggal di kalender → buka modal shift change
  const handleDateClick = (dateStr: string) => {
    // Tanggal yang sudah lewat tidak dapat diajukan ganti shift
    if (dateStr < todayStr) return;

    const entry = scheduleMap[dateStr];
    
    // Skip HANYA jika hari libur (OFF), tetap allow jika belum ada jadwal
    if (entry && isOffShift(entry.shift)) return;

    setSelectedDate(dateStr);
    setNewShiftId('');
    setShowShiftModal(true);
    // Shifts sudah di-load saat page mount, tidak perlu fetch lagi!
  };

  // Handler: Submit shift change request
  const handleSubmitShiftChange = async () => {
    if (selectedDate < todayStr) {
      alert('Pengajuan ganti shift tidak dapat dilakukan untuk tanggal yang sudah lewat!');
      return;
    }

    if (!newShiftId) {
      alert('Pilih shift baru!');
      return;
    }

    setSubmittingRequest(true);
    try {
      const currentEntry = scheduleMap[selectedDate];
      const currentShift = currentEntry?.shift;
      
      // Jika belum ada jadwal, gunakan shift pertama available sebagai "current" (placeholder)
      const currentShiftId = currentShift?.id || availableShifts[0]?.id || newShiftId;
      
      const res = await fetch('/api/shift-change-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          currentShiftId: currentShiftId,
          newShiftId: newShiftId,
          requestDate: selectedDate,
          reason: 'Pengajuan ganti shift', // Default reason
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Kirim notifikasi WhatsApp ke grup/tim IT
        try {
          const newShift = availableShifts.find(s => s.id === newShiftId);
          const dateFormatted = new Date(selectedDate).toLocaleDateString('id-ID', { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric' 
          });

          await fetch('/api/notifications/send-shift-change', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userName: user?.name,
              userDivision: user?.division?.name || 'Tidak ada divisi',
              currentShiftName: currentShift?.name || 'Belum Ada Jadwal',
              currentShiftTime: currentShift ? `${currentShift.checkInTime}–${currentShift.checkOutTime}` : '-',
              newShiftName: newShift?.name || 'Unknown',
              newShiftTime: `${newShift?.checkInTime}–${newShift?.checkOutTime}`,
              requestDate: dateFormatted,
              reason: 'Pengajuan ganti shift',
            }),
          });
        } catch (notifErr) {
          console.error('Failed to send notification:', notifErr);
          // Tidak perlu alert error notifikasi, request sudah berhasil
        }

        alert('✅ Pengajuan ganti shift berhasil dikirim!');
        setShowShiftModal(false);
      } else {
        alert('❌ Gagal: ' + (data.message || 'Terjadi kesalahan'));
      }
    } catch (err) {
      console.error('Submit error:', err);
      alert('❌ Gagal mengirim pengajuan');
    }
    setSubmittingRequest(false);
  };

  return (
    <div className="p-4 sm:p-5 max-w-md mx-auto space-y-5">

      {/* Header */}
      <div className="flex justify-between items-center mb-2 px-1">
        <div>
          <p className="text-gray-500 text-xs font-semibold tracking-wide uppercase mb-1">Selamat datang,</p>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">{user?.name}</h2>
        </div>
        <div className="shrink-0">
          {user?.photo ? (
            <img src={user.photo} alt="Profil" className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg border-2 border-white shadow-sm">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* PWA Install Banner */}
      <InstallPwaBanner />

      {/* Info Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex flex-col justify-center">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Clock size={16} strokeWidth={2.5} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Shift Hari Ini</span>
          </div>
          <div className="text-base font-black text-gray-900 tracking-tight leading-tight">
            {!isCurrentMonth ? (
              <span className="text-gray-400 text-sm">-</span>
            ) : loadingSchedule ? (
              <span className="text-gray-400 text-sm">Loading...</span>
            ) : todayEntry ? (
              isOffShift(todayEntry.shift) ? (
                <span className="text-green-600">🏖️ Libur</span>
              ) : (
                <span>{todayEntry.shift.name}</span>
              )
            ) : (
              <span className="text-gray-400 text-sm">Belum dijadwal</span>
            )}
          </div>
          {isCurrentMonth && todayEntry && !isOffShift(todayEntry.shift) && (
            <div className="text-xs text-indigo-600 font-semibold mt-1">
              {todayEntry.shift.checkInTime} – {todayEntry.shift.checkOutTime}
            </div>
          )}
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex flex-col justify-center">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <User size={16} strokeWidth={2.5} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Role Anda</span>
          </div>
          <div className="text-lg font-black text-gray-900 capitalize tracking-tight">{user?.role}</div>
        </div>
      </div>

      {/* Primary Action */}
      <Link
        to="/presensi"
        className="block w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl p-5 shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm">
              <MapPin size={24} className="text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-lg font-bold">Waktunya Presensi</h3>
              <p className="text-indigo-100 text-sm mt-0.5 font-medium">Catat kehadiran Anda sekarang</p>
            </div>
          </div>
          <ArrowRight size={20} className="text-indigo-200" strokeWidth={2.5} />
        </div>
      </Link>

      {/* ── Jadwal Bulanan ── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">

        {/* Header kalender */}
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={14} strokeWidth={2.5} className="text-indigo-500" />
            <h3 className="font-bold text-gray-800 text-xs tracking-widest uppercase">Jadwal Saya</h3>
          </div>
          <div className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
                <ChevronLeft size={14} strokeWidth={2.5} />
              </button>
              <span className="text-xs font-bold text-gray-700 min-w-[100px] text-center">{monthName}</span>
              <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
                <ChevronRight size={14} strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex items-center gap-1">
              {/* Tombol refresh manual jadwal — gantikan polling 15 detik */}
              <button
                onClick={() => fetchSchedule(viewYear, viewMonth)}
                disabled={loadingSchedule}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-indigo-500 disabled:opacity-40"
                title="Refresh jadwal"
              >
                <RefreshCw size={13} strokeWidth={2.5} className={loadingSchedule ? 'animate-spin' : ''} />
              </button>
              {!isCurrentMonth && (
                <button
                  onClick={() => {
                    setViewYear(today.getFullYear());
                    setViewMonth(today.getMonth() + 1);
                  }}
                  className="text-[9px] font-bold bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md hover:bg-indigo-100 transition-colors"
                >
                  Hari Ini
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Label hari */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f9fafb', borderBottom: '1px solid #f3f4f6', padding: '6px 8px 4px' }}>
          {DAY_LABELS.map((d, i) => (
            <div key={d} style={{ textAlign: 'center', fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#9ca3af' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Grid minggu */}
        <div style={{ padding: '4px 8px 8px' }}>
          {loadingSchedule ? (
            <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ height: 40, borderRadius: 10, background: '#f3f4f6' }} />
              ))}
            </div>
          ) : (
            weeks.map((week, wi) => (
              <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 3 }}>
                {week.map((day, di) => {
                  if (!day) return <div key={di} />;
                  const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const entry = scheduleMap[dateStr];
                  const isOvertime = !!overtimeMap[dateStr];
                  const overtimeData = overtimeMap[dateStr];
                  const isToday = dateStr === todayStr;
                  const isPast = dateStr < todayStr;
                  const off = entry && isOffShift(entry.shift);
                  const isClickable = !isPast && !off;
                  const colors = entry ? getShiftColor(entry.shift) : null;
                  const dayLogs = logsByDate[dateStr] || [];
                  const pastStatus = getPastAttendanceStatus(dateStr, todayStr, entry, dayLogs);

                  return (
                    <div
                      key={di}
                      onClick={() => isClickable ? handleDateClick(dateStr) : null}
                      title={
                        (isOvertime ? `⚡ PENUGASAN LEMBUR${overtimeData?.note ? ` (${overtimeData.note})` : ''}\n` : '') +
                        (pastStatus.isPastWorkDay
                          ? `${dateStr} (${entry?.shift.name})\n▲ ${pastStatus.inTitle}\n▼ ${pastStatus.outTitle}${isPast ? '\n(Tanggal telah berlalu - Jadwal tidak dapat diubah)' : '\n(Hari ini - warna diperbarui otomatis)'}`
                          : isClickable
                            ? `${dateStr} (${entry ? entry.shift.name : 'Belum dijadwal'}) · Klik untuk ajukan ganti shift`
                            : off
                              ? `${dateStr} · Libur Kerja`
                              : `${dateStr} · Belum dijadwalkan`)
                      }
                      style={{
                        position: 'relative',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        borderRadius: 10, padding: '4px 2px', minHeight: 50,
                        background: isToday ? '#4f46e5' : isOvertime && !pastStatus.isPastWorkDay ? '#fffbeb' : 'transparent',
                        border: isOvertime && !isToday && !pastStatus.isPastWorkDay ? '1px dashed #f59e0b' : 'none',
                        boxShadow: isToday ? '0 2px 8px rgba(79,70,229,0.3)' : 'none',
                        cursor: isClickable ? 'pointer' : 'default',
                        overflow: 'hidden',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (isClickable) {
                          e.currentTarget.style.background = isToday ? '#5b51e8' : '#f9fafb';
                          e.currentTarget.style.transform = 'scale(1.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (isClickable) {
                          e.currentTarget.style.background = isToday ? '#4f46e5' : isOvertime && !pastStatus.isPastWorkDay ? '#fffbeb' : 'transparent';
                          e.currentTarget.style.transform = 'scale(1)';
                        }
                      }}
                    >
                      {/* Split Background untuk Hari Kerja yang Sudah Lewat (Atas = IN, Bawah = OUT) */}
                      {pastStatus.isPastWorkDay && (
                        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
                          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: pastStatus.topColor }} />
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', background: pastStatus.bottomColor }} />
                        </div>
                      )}

                      <span style={{
                        position: 'relative', zIndex: 1,
                        fontSize: '10px', fontWeight: isToday || pastStatus.isPastWorkDay ? 800 : 600, lineHeight: 1, marginBottom: 3,
                        color: isToday
                          ? '#fff'
                          : pastStatus.isPastWorkDay
                            ? '#ffffff'
                            : di === 0
                              ? '#ef4444'
                              : di === 6
                                ? '#3b82f6'
                                : '#374151',
                        textShadow: pastStatus.isPastWorkDay ? '0 1px 2px rgba(0,0,0,0.6)' : 'none',
                      }}>
                        {day}
                      </span>
                      {entry ? (
                        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, maxWidth: '100%' }}>
                          <span style={{
                            fontSize: '8px', fontWeight: 700, borderRadius: 4, padding: '1px 3px',
                            background: isToday
                              ? 'rgba(255,255,255,0.22)'
                              : pastStatus.isPastWorkDay
                                ? 'rgba(255,255,255,0.92)'
                                : (colors?.bg ?? '#f5f3ff'),
                            color: isToday
                              ? '#fff'
                              : pastStatus.isPastWorkDay
                                ? '#1f2937'
                                : (colors?.text ?? '#6d28d9'),
                            border: `1px solid ${
                              isToday
                                ? 'rgba(255,255,255,0.3)'
                                : pastStatus.isPastWorkDay
                                  ? 'rgba(255,255,255,0.95)'
                                  : (colors?.border ?? '#ddd6fe')
                            }`,
                            boxShadow: pastStatus.isPastWorkDay ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
                            letterSpacing: '0.02em', lineHeight: 1.4, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden',
                          }}>
                            {off ? 'OFF' : entry.shift.name}
                          </span>
                          {isOvertime && (
                            <span style={{
                              fontSize: '7px', fontWeight: 900, borderRadius: 3, padding: '0.5px 2px',
                              background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a',
                              lineHeight: 1.1, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 1
                            }}>
                              ⚡ Lembur
                            </span>
                          )}
                        </div>
                      ) : isOvertime ? (
                        <span style={{
                          position: 'relative', zIndex: 1,
                          fontSize: '7.5px', fontWeight: 900, borderRadius: 3, padding: '1px 3px',
                          background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a',
                          lineHeight: 1.1, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 1
                        }}>
                          ⚡ Lembur
                        </span>
                      ) : (
                        <span style={{ position: 'relative', zIndex: 1, width: 16, height: 2, borderRadius: 2, background: isToday ? 'rgba(255,255,255,0.3)' : '#e5e7eb', display: 'block' }} />
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Notice hari ini */}
        {isCurrentMonth && !loadingSchedule && (
          <div style={{ borderTop: '1px solid #f3f4f6', padding: '10px 16px', background: '#f9fafb', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: todayEntry ? (isOffShift(todayEntry.shift) ? '#22c55e' : '#4f46e5') : '#d1d5db',
              boxShadow: todayEntry ? (isOffShift(todayEntry.shift) ? '0 0 0 3px #dcfce7' : '0 0 0 3px #e0e7ff') : 'none',
            }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Hari Ini — </span>
              {todayEntry ? (
                isOffShift(todayEntry.shift) ? (
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a' }}>🏖️ Libur Kerja · Tidak Perlu Absen</span>
                ) : (
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#4f46e5' }}>
                    {todayEntry.shift.name} · {todayEntry.shift.checkInTime}–{todayEntry.shift.checkOutTime}
                  </span>
                )
              ) : (
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>Jadwal belum diatur</span>
              )}
              {overtimeMap[todayStr] && (
                <span style={{ fontSize: '10px', fontWeight: 800, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', borderRadius: 4, padding: '1px 5px', marginLeft: 6 }}>
                  ⚡ Ada Tugas Lembur{overtimeMap[todayStr]?.note ? `: ${overtimeMap[todayStr].note}` : ''}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Legenda Keterangan Warna Kalender (Split Atas = IN, Bawah = OUT) */}
        <div style={{ borderTop: '1px solid #f1f5f9', padding: '12px 14px', background: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1' }} />
              <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>
                Keterangan Warna Hari Berlalu
              </span>
            </div>
            <span style={{ fontSize: '9px', fontWeight: 600, color: '#94a3b8' }}>Split Atas & Bawah</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {/* Box Kiri: Atas = Presensi Masuk */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 9px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
                <span style={{ fontSize: '9px', fontWeight: 800, color: '#4338ca', background: '#e0e7ff', padding: '1px 4px', borderRadius: 3 }}>▲ ATAS</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#1e293b' }}>Jam Masuk (IN)</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '9.5px', color: '#475569' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                  <span><strong>Hijau:</strong> Tepat waktu</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#eab308', flexShrink: 0 }} />
                  <span><strong>Kuning:</strong> Terlambat</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                  <span><strong>Merah:</strong> Tidak absen masuk</span>
                </div>
              </div>
            </div>

            {/* Box Kanan: Bawah = Presensi Pulang */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 9px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
                <span style={{ fontSize: '9px', fontWeight: 800, color: '#4338ca', background: '#e0e7ff', padding: '1px 4px', borderRadius: 3 }}>▼ BAWAH</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#1e293b' }}>Jam Pulang (OUT)</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '9.5px', color: '#475569' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                  <span><strong>Hijau:</strong> Sesuai/lewat jam</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#eab308', flexShrink: 0 }} />
                  <span><strong>Kuning:</strong> Pulang lebih awal</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                  <span><strong>Merah:</strong> Tidak absen pulang</span>
                </div>
              </div>
            </div>
          </div>

          {/* Baris Keterangan Penugasan Lembur */}
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: '9px', fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '5px 8px', borderRadius: 6, border: '1px solid #fde68a' }}>
            <span style={{ fontSize: '11px' }}>⚡</span>
            <span><strong>Tanda Petir (⚡ Lembur):</strong> Anda memiliki jadwal/penugasan lembur pada tanggal tersebut.</span>
          </div>

          <p style={{ margin: '8px 0 0 0', fontSize: '9px', color: '#94a3b8', textAlign: 'center', lineHeight: 1.3 }}>
            *Hanya berlaku untuk tanggal kerja yang telah terlewati. Hari ini & hari libur (OFF) tetap tampil standar.
          </p>
        </div>
      </div>

      {/* ── Pantau Kehadiran per Lokasi (Admin Only) ── */}
      {isAdmin && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">

          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin size={14} strokeWidth={2.5} className="text-indigo-500" />
              <h3 className="font-bold text-gray-800 text-xs tracking-widest uppercase">Pantau Lokasi Hari Ini</h3>
            </div>
            <button
              onClick={fetchLocData}
              disabled={loadingLoc}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-indigo-500 disabled:opacity-40"
              title="Refresh data lokasi"
            >
              <RefreshCw size={13} strokeWidth={2.5} className={loadingLoc ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Dropdown Pilih Lokasi — compact, tidak melebar berapapun jumlah lokasi */}
          {locationGroups.length > 0 && (
            <div className="px-4 pt-3 pb-0">
              <div className="relative">
                <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" strokeWidth={2.5} />
                <select
                  value={selectedLocId ?? ''}
                  onChange={e => setSelectedLocId(e.target.value)}
                  className="w-full appearance-none bg-indigo-50 border border-indigo-100 text-gray-900 text-xs font-bold rounded-xl pl-8 pr-8 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all cursor-pointer"
                >
                  {locationGroups.map(g => {
                    const belum = g.items.filter(it => !it.inRecord).length;
                    const telat = g.items.filter(it => it.isLate).length;
                    const hadir = g.items.filter(it => it.inRecord).length;
                    const info = belum > 0
                      ? `${belum} belum absen`
                      : telat > 0
                        ? `${telat} telat, ${hadir - telat} tepat waktu`
                        : `${hadir} semua hadir`;
                    return (
                      <option key={g.locationId} value={g.locationId}>
                        {g.locationName} — {info}
                      </option>
                    );
                  })}
                </select>
                <ChevronRight size={13} className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-indigo-400 pointer-events-none" strokeWidth={2.5} />
              </div>
            </div>
          )}

          {/* Konten: Detail kehadiran lokasi yang dipilih */}
          <div className="p-3">
            {loadingLoc && !locLoaded ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : !locLoaded ? (
              <div className="py-6 text-center">
                <p className="text-xs text-gray-400">Memuat data lokasi...</p>
              </div>
            ) : locationGroups.length === 0 ? (
              <div className="py-8 text-center">
                <div className="w-11 h-11 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-2">
                  <MapPin size={20} className="text-gray-300" />
                </div>
                <p className="text-xs font-semibold text-gray-400">Belum ada jadwal dengan lokasi hari ini</p>
                <p className="text-[10px] text-gray-300 mt-1">Pastikan shift sudah dikaitkan dengan lokasi</p>
              </div>
            ) : (() => {
              const activeGroup = locationGroups.find(g => g.locationId === selectedLocId);
              if (!activeGroup) return null;

              const hadir = activeGroup.items.filter(it => it.inRecord).length;
              const total = activeGroup.items.length;
              const telat = activeGroup.items.filter(it => it.isLate).length;
              const belum = activeGroup.items.filter(it => !it.inRecord).length;

              const fmtTime = (ts: string) => {
                const d = new Date(ts);
                return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
              };
              const fmtLate = (secs: number) => {
                const h = Math.floor(secs / 3600);
                const m = Math.floor((secs % 3600) / 60);
                return h > 0 ? `${h}j ${m}m` : `${m}m`;
              };

              return (
                <>
                  {/* Ringkasan lokasi terpilih */}
                  <div className="flex items-center gap-2 mb-3 px-0.5">
                    <div className="flex-1 flex gap-2">
                      <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-xl">
                        <CheckCircle2 size={12} className="text-emerald-500" strokeWidth={2.5} />
                        <span className="text-[11px] font-black text-emerald-700">{hadir}</span>
                        <span className="text-[10px] text-emerald-500 font-medium">hadir</span>
                      </div>
                      {telat > 0 && (
                        <div className="flex items-center gap-1 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-xl">
                          <AlertTriangle size={12} className="text-amber-500" strokeWidth={2.5} />
                          <span className="text-[11px] font-black text-amber-700">{telat}</span>
                          <span className="text-[10px] text-amber-500 font-medium">telat</span>
                        </div>
                      )}
                      {belum > 0 && (
                        <div className="flex items-center gap-1 bg-red-50 border border-red-100 px-2.5 py-1 rounded-xl">
                          <MinusCircle size={12} className="text-red-400" strokeWidth={2.5} />
                          <span className="text-[11px] font-black text-red-600">{belum}</span>
                          <span className="text-[10px] text-red-400 font-medium">belum</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 font-medium">{total} karyawan</span>
                  </div>

                  {/* Daftar karyawan */}
                  <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
                    {activeGroup.items
                      .sort((a, b) => {
                        const order: Record<string, number> = { absent: 0, late: 1, on_time: 2, incomplete: 3, early: 4, off: 5 };
                        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
                      })
                      .map(item => {
                        const hasIn = !!item.inRecord;
                        const hasOut = !!item.outRecord;
                        return (
                          <div key={item.user.id} className="flex items-center gap-3 px-3.5 py-2.5 bg-white">
                            {/* Status icon */}
                            <div className="shrink-0">
                              {!hasIn
                                ? <MinusCircle size={18} className="text-red-400" strokeWidth={2} />
                                : item.isLate
                                  ? <AlertTriangle size={18} className="text-amber-400" strokeWidth={2} />
                                  : <CheckCircle2 size={18} className="text-emerald-400" strokeWidth={2} />}
                            </div>
                            {/* Nama + divisi + shift */}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-gray-900 truncate">{item.user.name}</p>
                              <p className="text-[10px] text-gray-400 truncate">
                                {item.user.division?.name ?? '-'} &middot; {item.shift?.name}
                              </p>
                            </div>
                            {/* Waktu */}
                            <div className="shrink-0 text-right">
                              {hasIn ? (
                                <>
                                  <p className="text-xs font-black text-gray-800">
                                    {fmtTime(item.inRecord!.timestamp)}
                                    {hasOut && <span className="text-gray-400 font-semibold"> &ndash; {fmtTime(item.outRecord!.timestamp)}</span>}
                                  </p>
                                  {item.isLate
                                    ? <p className="text-[10px] font-bold text-amber-600">Telat {fmtLate(item.lateSeconds)}</p>
                                    : <p className="text-[10px] font-semibold text-emerald-600">Tepat waktu</p>
                                  }
                                </>
                              ) : (
                                <>
                                  <p className="text-xs font-black text-red-500">Belum absen</p>
                                  <p className="text-[10px] text-gray-400">{item.shift?.checkInTime} WIB</p>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })
                    }
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Riwayat Terakhir */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="font-bold text-gray-800 text-xs tracking-widest uppercase">Riwayat Terakhir</h3>
        </div>
        <div className="p-0">
          {loadingLogs ? (
            <div className="flex flex-col gap-0">
              {[1, 2, 3].map(i => (
                <div key={i} className="border-b border-gray-50 p-4 flex items-center gap-4">
                  <div className="w-9 h-9 bg-gray-100 rounded-full animate-pulse" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-gray-100 rounded w-1/2 animate-pulse" />
                    <div className="h-3 bg-gray-50 rounded w-1/3 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : (() => {
            // Group logs by day (take top 5 unique days)
            const grouped: Record<string, { date: Date; dateKey: string; inLog?: any; outLog?: any }> = {};
            [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
              .forEach(log => {
                const d = new Date(log.timestamp);
                const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                if (!grouped[key]) grouped[key] = { date: d, dateKey: key };
                if (log.type === 'in' && !grouped[key].inLog) grouped[key].inLog = log;
                if (log.type === 'out' && !grouped[key].outLog) grouped[key].outLog = log;
              });
            const days = Object.values(grouped).sort((a,b) => b.date.getTime()-a.date.getTime()).slice(0,5);
            if (days.length === 0) return (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="bg-gray-50 p-4 rounded-full mb-3">
                  <Calendar size={28} className="text-gray-300" strokeWidth={2} />
                </div>
                <p className="text-sm font-medium text-gray-400">Belum ada riwayat presensi</p>
              </div>
            );
            return (
              <div className="divide-y divide-gray-100">
                {days.map((dayData, idx) => {
                  const sched = scheduleMap[dayData.dateKey];
                  const shift = sched?.shift;
                  const isOff = shift && isOffShift(shift);
                  const colors = shift ? getShiftColor(shift) : null;
                  const summary = getDayAttendanceDetail(dayData, todayStr, sched);

                  return (
                    <div key={idx} className="p-4 bg-white hover:bg-gray-50/70 transition-colors">
                      {/* Header: Hari, Tanggal, dan Shift Badge */}
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                            {dayData.date.toLocaleDateString('id-ID', { weekday: 'long' })}
                          </span>
                          <span className="text-[10px] font-bold text-gray-300"> · </span>
                          <span className="text-xs font-black text-gray-800">
                            {dayData.date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        {shift ? (
                          isOff ? (
                            <span className="text-[10px] font-bold bg-green-50 text-green-700 border border-green-200 rounded-md px-2 py-0.5">
                              🏖️ Libur
                            </span>
                          ) : (
                            <span
                              style={{ background: colors?.bg, color: colors?.text, borderColor: colors?.border }}
                              className="text-[10px] font-extrabold border rounded-md px-2 py-0.5 tracking-wide shadow-xs"
                            >
                              {shift.name} · {shift.checkInTime}–{shift.checkOutTime}
                            </span>
                          )
                        ) : null}
                      </div>

                      {/* Baris Presensi: Kolom IN dan Kolom OUT */}
                      <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                        {/* Kolom IN (Presensi Masuk) */}
                        <div className={`rounded-xl p-2.5 border transition-all ${
                          summary.inStatus === 'missing'
                            ? 'bg-red-50/70 border-red-200'
                            : summary.inStatus === 'late'
                              ? 'bg-amber-50/60 border-amber-200'
                              : 'bg-emerald-50/40 border-emerald-150'
                        }`}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[7.5px] ${
                                summary.inStatus === 'missing'
                                  ? 'bg-red-200 text-red-800'
                                  : summary.inStatus === 'late'
                                    ? 'bg-amber-200 text-amber-800'
                                    : 'bg-emerald-200 text-emerald-800'
                              }`}>
                                IN
                              </div>
                              <span className="text-[9px] font-extrabold text-gray-700 uppercase tracking-wide">
                                Masuk
                              </span>
                            </div>
                            {dayData.inLog?.location && (
                              <span className="text-[8.5px] font-semibold text-gray-400 truncate max-w-[70px]" title={dayData.inLog.location}>
                                📍 {dayData.inLog.location}
                              </span>
                            )}
                          </div>

                          <div className="flex items-baseline gap-1">
                            {summary.inStatus === 'missing' ? (
                              <span className="text-[11px] font-black text-red-600 flex items-center gap-1">
                                <MinusCircle size={12} className="text-red-500 shrink-0" />
                                Tidak Absen
                              </span>
                            ) : summary.inStatus === 'today_pending' ? (
                              <span className="text-[11px] font-bold text-amber-700 flex items-center gap-1">
                                <Clock size={12} className="text-amber-500 shrink-0" />
                                Belum Absen
                              </span>
                            ) : (
                              <>
                                <span className="text-sm font-black text-gray-900 font-mono tracking-tight">
                                  {summary.inTimeStr}
                                </span>
                                <span className="text-[8.5px] font-bold text-gray-400">WIB</span>
                              </>
                            )}
                          </div>

                          {summary.inDeltaLabel && (
                            <div
                              style={{ color: summary.inDeltaColor }}
                              className="text-[9.5px] font-bold mt-1 flex items-center gap-1"
                            >
                              {summary.inStatus === 'late' && <AlertTriangle size={10} className="shrink-0" />}
                              {summary.inStatus === 'on_time' && <CheckCircle2 size={10} className="shrink-0" />}
                              <span className="truncate">{summary.inDeltaLabel}</span>
                            </div>
                          )}
                        </div>

                        {/* Kolom OUT (Presensi Pulang) */}
                        <div className={`rounded-xl p-2.5 border transition-all ${
                          summary.outStatus === 'missing'
                            ? 'bg-red-50/80 border-red-200 shadow-xs'
                            : summary.outStatus === 'early'
                              ? 'bg-amber-50/60 border-amber-200'
                              : summary.outStatus === 'today_pending'
                                ? 'bg-amber-50/40 border-amber-200'
                                : 'bg-emerald-50/40 border-emerald-150'
                        }`}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[7px] ${
                                summary.outStatus === 'missing'
                                  ? 'bg-red-200 text-red-800'
                                  : summary.outStatus === 'early'
                                    ? 'bg-amber-200 text-amber-800'
                                    : summary.outStatus === 'today_pending'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-emerald-200 text-emerald-800'
                              }`}>
                                OUT
                              </div>
                              <span className="text-[9px] font-extrabold text-gray-700 uppercase tracking-wide">
                                Pulang
                              </span>
                            </div>
                            {dayData.outLog?.location && (
                              <span className="text-[8.5px] font-semibold text-gray-400 truncate max-w-[70px]" title={dayData.outLog.location}>
                                📍 {dayData.outLog.location}
                              </span>
                            )}
                          </div>

                          <div className="flex items-baseline gap-1">
                            {summary.outStatus === 'missing' ? (
                              <span className="text-[11px] font-black text-red-600 flex items-center gap-1">
                                <AlertCircle size={12} className="text-red-500 shrink-0" />
                                Tidak Absen Pulang
                              </span>
                            ) : summary.outStatus === 'today_pending' ? (
                              <span className="text-[11px] font-bold text-amber-700 flex items-center gap-1">
                                <Clock size={12} className="text-amber-500 shrink-0" />
                                Belum Absen Pulang
                              </span>
                            ) : (
                              <>
                                <span className="text-sm font-black text-gray-900 font-mono tracking-tight">
                                  {summary.outTimeStr}
                                </span>
                                <span className="text-[8.5px] font-bold text-gray-400">WIB</span>
                              </>
                            )}
                          </div>

                          {summary.outDeltaLabel && (
                            <div
                              style={{ color: summary.outDeltaColor }}
                              className="text-[9.5px] font-bold mt-1 flex items-center gap-1"
                            >
                              {summary.outStatus === 'missing' && <span className="text-[8.5px] text-red-500 font-semibold truncate">{summary.outDeltaLabel}</span>}
                              {summary.outStatus === 'early' && <><AlertTriangle size={10} className="shrink-0" /><span className="truncate">{summary.outDeltaLabel}</span></>}
                              {(summary.outStatus === 'on_time' || summary.outStatus === 'overtime') && <><CheckCircle2 size={10} className="shrink-0" /><span className="truncate">{summary.outDeltaLabel}</span></>}
                              {summary.outStatus === 'today_pending' && <span className="text-[8.5px] text-amber-600 font-medium truncate">{summary.outDeltaLabel}</span>}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Footer Bar: Total Jam Kerja & Status Harian */}
                      <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-[10px] border ${
                        summary.isComplete
                          ? 'bg-gray-50/80 border-gray-200'
                          : summary.outStatus === 'missing'
                            ? 'bg-red-50/60 border-red-150'
                            : 'bg-amber-50/40 border-amber-150'
                      }`}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Timer size={12} className={summary.isComplete ? 'text-indigo-600' : summary.outStatus === 'missing' ? 'text-red-500' : 'text-amber-500'} strokeWidth={2.5} />
                          <span className="font-extrabold text-gray-600 shrink-0">Total Jam Kerja:</span>
                          <span className={`font-black truncate ${
                            summary.isComplete ? 'text-gray-900 font-mono' : summary.outStatus === 'missing' ? 'text-red-600' : 'text-amber-700'
                          }`}>
                            {summary.workDurationStr}
                          </span>
                        </div>

                        <div className="shrink-0 ml-2">
                          <span
                            style={{ color: summary.workStatusColor }}
                            className="font-bold text-[9px] text-right block"
                          >
                            {summary.workStatusText}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Modal: Ajukan Ganti Shift */}
      {showShiftModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setShowShiftModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
                  <RefreshCw size={20} className="text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white tracking-tight">Ajukan Ganti Shift</h3>
                  <p className="text-xs text-indigo-100 font-medium mt-0.5">
                    {new Date(selectedDate).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowShiftModal(false)}
                className="text-white/80 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-all active:scale-95"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            {/* Body Modal */}
            <div className="p-6 space-y-5">
              {/* Shift Saat Ini */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Shift Saat Ini</label>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-black text-gray-900 text-base">
                        {scheduleMap[selectedDate]?.shift.name || 'Belum Ada Jadwal'}
                      </p>
                      <p className="text-sm text-gray-500 font-semibold mt-1">
                        {scheduleMap[selectedDate]?.shift 
                          ? `${scheduleMap[selectedDate].shift.checkInTime} – ${scheduleMap[selectedDate].shift.checkOutTime}`
                          : 'Belum dijadwalkan'
                        }
                      </p>
                    </div>
                    <div className="bg-gray-200 px-3 py-1.5 rounded-lg">
                      <Clock size={16} className="text-gray-600" strokeWidth={2.5} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Pilih Shift Baru */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Shift Baru</label>
                {loadingShifts ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    <span className="text-sm text-gray-500 font-medium">Memuat shift...</span>
                  </div>
                ) : (
                  <select
                    value={newShiftId}
                    onChange={(e) => setNewShiftId(e.target.value)}
                    className="w-full bg-white border-2 border-gray-200 rounded-xl px-4 py-3.5 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  >
                    <option value="">— Pilih Shift Baru —</option>
                    {availableShifts
                      .filter(s => s.id !== scheduleMap[selectedDate]?.shift.id)
                      .map(shift => (
                        <option key={shift.id} value={shift.id}>
                          {shift.name} · {shift.checkInTime}–{shift.checkOutTime}
                          {shift.description ? ` - ${shift.description}` : ''}
                        </option>
                      ))
                    }
                  </select>
                )}
              </div>
            </div>

            {/* Footer Modal */}
            <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-100">
              <button
                onClick={() => setShowShiftModal(false)}
                className="px-5 py-2.5 bg-white border-2 border-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-50 transition-all active:scale-95"
              >
                Batal
              </button>
              <button
                onClick={handleSubmitShiftChange}
                disabled={submittingRequest || !newShiftId}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white rounded-xl font-bold text-sm shadow-md shadow-indigo-200 transition-all active:scale-95 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
              >
                {submittingRequest ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Mengirim...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} strokeWidth={2.5} />
                    <span>Ajukan Ganti Shift</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
