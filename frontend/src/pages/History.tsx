import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Clock, MapPin, Loader2, X, Calendar, Timer, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';

const isOffShift = (s: { checkInTime: string; checkOutTime: string }) =>
  s.checkInTime === '00:00' && s.checkOutTime === '00:00';

const isEventShift = (s?: { name?: string; description?: string | null } | null) => {
  if (!s) return false;
  const name = (s.name || '').toUpperCase().trim();
  const desc = (s.description || '').toUpperCase();
  return name.includes('EVENT') || desc.includes('[EVENT]');
};

import { formatAttendanceTime, diffSeconds, getDeltaIn, getDeltaOut, formatDuration } from '../utils/timeFormat';

const getWibDateKey = (timestamp: string | Date): string => {
  const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
};

const getShiftColor = (name: string) => {
  const n = name.toUpperCase();
  if (n.includes('L1')) return '#1d4ed8';
  if (n.includes('L2')) return '#0369a1';
  if (n.includes('K1')) return '#7e22ce';
  if (n.includes('K2')) return '#c2410c';
  if (n.includes('CFD')) return '#a16207';
  if (n.includes('OTR')) return '#475569';
  if (n.includes('OFF')) return '#16a34a';
  return '#6d28d9';
};

const History = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [scheduleMap, setScheduleMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [periodOffset, setPeriodOffset] = useState<number>(0);
  const checkedDatesRef = useRef<Set<string>>(new Set());
  const todayStr = getWibDateKey(new Date());

  // Helper untuk menghitung periode penggajian (11 s.d. 10)
  const getPayrollPeriod = (offset = 0) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();

    // Jika hari >= 11, siklus gajian bulan ini dimulai dari 11 bulan ini s.d. 10 bulan depan
    // Jika hari < 11, siklus gajian dimulai dari 11 bulan lalu s.d. 10 bulan ini
    let baseMonth = day >= 11 ? month : month - 1;
    baseMonth += offset;

    const start = new Date(year, baseMonth, 11);
    const end = new Date(year, baseMonth + 1, 10);

    const pad = (n: number) => String(n).padStart(2, '0');
    const startKey = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-11`;
    const endKey = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-10`;

    const monthsId = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const label = `11 ${monthsId[start.getMonth()]} – 10 ${monthsId[end.getMonth()]} ${end.getFullYear()}`;

    return { start, end, startKey, endKey, label };
  };

  const period = getPayrollPeriod(periodOffset);

  // 1. Fetch attendance records
  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);

    fetch(`/api/attendance/${user.id}`)
      .then((r) => r.json())
      .then((attData) => {
        if (attData?.success && Array.isArray(attData.records)) {
          setRecords(attData.records);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch attendance history', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [user?.id]);

  // 2. Fetch jadwal sesuai bulan periode yang aktif
  useEffect(() => {
    if (!user?.id) return;
    const p = getPayrollPeriod(periodOffset);
    const m1 = p.startKey.slice(0, 7);
    const m2 = p.endKey.slice(0, 7);

    Promise.all([
      fetch(`/api/schedules?month=${m1}&userId=${user.id}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/schedules?month=${m2}&userId=${user.id}`).then((r) => r.json()).catch(() => null),
    ]).then(([s1, s2]) => {
      setScheduleMap((prev) => {
        const next = { ...prev };
        if (s1?.success && Array.isArray(s1.schedules)) {
          for (const s of s1.schedules) next[s.date] = s;
        }
        if (s2?.success && Array.isArray(s2.schedules)) {
          for (const s of s2.schedules) next[s.date] = s;
        }
        return next;
      });
    });
  }, [user?.id, periodOffset]);

  // 3. Enrich jadwal untuk tanggal yang belum ter-cover
  useEffect(() => {
    if (!user?.id || records.length === 0) return;
    const missingDates: string[] = [];
    for (const r of records) {
      const key = getWibDateKey(r.timestamp);
      if (!scheduleMap[key] && !checkedDatesRef.current.has(key) && !missingDates.includes(key)) {
        missingDates.push(key);
      }
    }
    if (missingDates.length === 0) return;
    missingDates.forEach((k) => checkedDatesRef.current.add(k));

    fetch(`/api/schedules?userId=${user.id}&dates=${missingDates.join(',')}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.schedules)) {
          setScheduleMap((prev) => {
            const next = { ...prev };
            for (const s of data.schedules) next[s.date] = s;
            return next;
          });
        }
      })
      .catch(() => {});
  }, [user?.id, records, scheduleMap]);

  // Kelompokkan data presensi per tanggal
  const groupedRecords: Record<string, { date: Date; dateKey: string; in?: any; out?: any }> = {};
  records.forEach((record) => {
    const dateObj = new Date(record.timestamp);
    const dateKey = getWibDateKey(record.timestamp);
    if (!groupedRecords[dateKey]) groupedRecords[dateKey] = { date: dateObj, dateKey };
    if (record.type === 'in' && !groupedRecords[dateKey].in) groupedRecords[dateKey].in = record;
    else if (record.type === 'out' && !groupedRecords[dateKey].out) groupedRecords[dateKey].out = record;
  });

  const allDailyHistory = Object.values(groupedRecords).sort((a, b) => b.date.getTime() - a.date.getTime());

  // Filter riwayat yang masuk ke rentang periode gajian aktif (11 s.d. 10)
  const periodDailyHistory = allDailyHistory.filter(
    (d) => d.dateKey >= period.startKey && d.dateKey <= period.endKey
  );

  // ─── Kalkulasi 4 Metrik untuk 1 Baris Rincian ───
  let totalWorkSec = 0;
  let workCount = 0;
  let totalLateSec = 0;
  let lateCount = 0;
  let totalOvertimeSec = 0;
  let overtimeCount = 0;

  periodDailyHistory.forEach((dayData) => {
    const inRec = dayData.in;
    const outRec = dayData.out;
    const schedule = scheduleMap[dayData.dateKey];
    const shift = schedule?.shift;
    const isOff = shift && isOffShift(shift);

    // 1. Total jam kerja & jumlah hari kerja (wajib check in & check out)
    if (inRec && outRec) {
      workCount++;
      const inT = new Date(inRec.timestamp);
      const outT = new Date(outRec.timestamp);
      const diff = Math.max(0, Math.floor((outT.getTime() - inT.getTime()) / 1000));
      totalWorkSec += diff;
    }

    const isEvent = isEventShift(shift);

    // 2. Total telat masuk (Shift Event tidak ada keterlambatan)
    if (inRec && shift && !isOff && !isEvent) {
      const inDelta = diffSeconds(new Date(inRec.timestamp), shift.checkInTime);
      if (inDelta > 0) {
        lateCount++;
        totalLateSec += inDelta;
      }
    }

    // 3. Total lembur / pulang lebih (Shift Event tidak dihitung lembur kaku)
    if (outRec && shift && !isOff && !isEvent) {
      const outDelta = diffSeconds(new Date(outRec.timestamp), shift.checkOutTime);
      if (outDelta > 0) {
        overtimeCount++;
        totalOvertimeSec += outDelta;
      }
    }
  });

  // 4. Hitung hari tidak masuk (jadwal kerja tanpa presensi masuk sampai hari ini)
  let absentCount = 0;
  const loopDate = new Date(period.start);
  while (loopDate <= period.end) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const dKey = `${loopDate.getFullYear()}-${pad(loopDate.getMonth() + 1)}-${pad(loopDate.getDate())}`;

    // Hanya periksa hari yang sudah terlewati (<= todayStr)
    if (dKey <= todayStr) {
      const sched = scheduleMap[dKey];
      const shift = sched?.shift;
      const isOff = !shift || isOffShift(shift);
      // Jika terjadwal kerja aktif namun tidak ada record absen masuk
      if (shift && !isOff && !groupedRecords[dKey]?.in) {
        absentCount++;
      }
    }
    loopDate.setDate(loopDate.getDate() + 1);
  }

  // Format detail jam, menit, dan detik lengkap (contoh: "168j 20m 15d" atau "0j 20m 21d" atau "0j 0m 0d")
  const formatDetailTime = (sec: number) => {
    const abs = Math.abs(sec);
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const s = abs % 60;

    return `${h}j ${m}m ${s}d`;
  };

  return (
    <div className="p-4 max-w-lg mx-auto pb-28">
      {/* Title */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Clock className="text-indigo-600" size={22} />
          Riwayat Kehadiran
        </h2>
      </div>

      {/* ─── Rincian 1 Baris Kompak Periode Penggajian (11 s.d. 10) ─── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-2.5 shadow-sm mb-4">
        {/* Baris Navigasi Periode (Kecil & Rapi) */}
        <div className="flex items-center justify-between text-xs pb-2 mb-2 border-b border-gray-100 gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Calendar size={13} className="text-indigo-600 shrink-0" />
            <span className="font-bold text-gray-700 text-xs truncate">
              Periode: {period.label}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setPeriodOffset((p) => p - 1)}
              className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 active:scale-90 rounded-lg text-gray-700 font-bold transition-all text-xs"
              title="Periode Sebelumnya"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              onClick={() => setPeriodOffset(0)}
              disabled={periodOffset === 0}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                periodOffset === 0
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
              }`}
            >
              Bulan Ini
            </button>
            <button
              onClick={() => setPeriodOffset((p) => p + 1)}
              className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 active:scale-90 rounded-lg text-gray-700 font-bold transition-all text-xs"
              title="Periode Berikutnya"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* 1 Baris Kompak 4 Kolom: Kerja | Telat | Lebih | Mangkir (Anti-Tabrakan di Layar HP) */}
        <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
          {/* 1. Total Kerja */}
          <div
            className="bg-indigo-50/70 border border-indigo-100/90 rounded-xl py-1.5 px-0.5 text-center flex flex-col justify-center min-w-0 overflow-hidden"
            title={`Total Selesai Kerja: ${workCount}x (${formatDetailTime(totalWorkSec)})`}
          >
            <div className="flex items-center justify-center gap-0.5 text-[9px] sm:text-[10px] font-bold text-indigo-700 leading-none">
              <span className="truncate">Kerja</span>
              <span className="text-[8px] sm:text-[9px] px-1 py-0.5 bg-indigo-100 text-indigo-800 rounded-full font-extrabold shrink-0">
                {workCount}x
              </span>
            </div>
            <span className="text-[9px] sm:text-[11px] font-bold text-gray-900 mt-1 block leading-none tabular-nums tracking-tighter truncate">
              {formatDetailTime(totalWorkSec)}
            </span>
          </div>

          {/* 2. Total Telat */}
          <div
            className="bg-amber-50/70 border border-amber-100/90 rounded-xl py-1.5 px-0.5 text-center flex flex-col justify-center min-w-0 overflow-hidden"
            title={`Total Keterlambatan: ${lateCount}x (${formatDetailTime(totalLateSec)})`}
          >
            <div className="flex items-center justify-center gap-0.5 text-[9px] sm:text-[10px] font-bold text-amber-800 leading-none">
              <span className="truncate">Telat</span>
              <span className="text-[8px] sm:text-[9px] px-1 py-0.5 bg-amber-100 text-amber-900 rounded-full font-extrabold shrink-0">
                {lateCount}x
              </span>
            </div>
            <span className="text-[9px] sm:text-[11px] font-bold text-gray-900 mt-1 block leading-none tabular-nums tracking-tighter truncate">
              {formatDetailTime(totalLateSec)}
            </span>
          </div>

          {/* 3. Total Lebih / Lembur */}
          <div
            className="bg-emerald-50/70 border border-emerald-100/90 rounded-xl py-1.5 px-0.5 text-center flex flex-col justify-center min-w-0 overflow-hidden"
            title={`Total Pulang Lebih / Lembur: ${overtimeCount}x (${formatDetailTime(totalOvertimeSec)})`}
          >
            <div className="flex items-center justify-center gap-0.5 text-[9px] sm:text-[10px] font-bold text-emerald-800 leading-none">
              <span className="truncate">Lebih</span>
              <span className="text-[8px] sm:text-[9px] px-1 py-0.5 bg-emerald-100 text-emerald-900 rounded-full font-extrabold shrink-0">
                {overtimeCount}x
              </span>
            </div>
            <span className="text-[9px] sm:text-[11px] font-bold text-gray-900 mt-1 block leading-none tabular-nums tracking-tighter truncate">
              {formatDetailTime(totalOvertimeSec)}
            </span>
          </div>

          {/* 4. Tidak Masuk */}
          <div
            className="bg-rose-50/70 border border-rose-100/90 rounded-xl py-1.5 px-0.5 text-center flex flex-col justify-center min-w-0 overflow-hidden"
            title={`Total Hari Tidak Masuk: ${absentCount} hari`}
          >
            <div className="flex items-center justify-center gap-0.5 text-[9px] sm:text-[10px] font-bold text-rose-800 leading-none">
              <span className="truncate">Mangkir</span>
              <span className="text-[8px] sm:text-[9px] px-1 py-0.5 bg-rose-100 text-rose-900 rounded-full font-extrabold shrink-0">
                {absentCount}x
              </span>
            </div>
            <span className="text-[9px] sm:text-[11px] font-bold text-gray-900 mt-1 block leading-none tabular-nums tracking-tighter truncate">
              {absentCount} Hari
            </span>
          </div>
        </div>
      </div>

      {/* ─── Daftar Riwayat Kehadiran ─── */}
      {loading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="animate-spin text-indigo-600" size={32} />
        </div>
      ) : periodDailyHistory.length === 0 ? (
        <div className="bg-gray-50 border border-gray-100 rounded-3xl p-8 text-center my-2">
          <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm mb-3">
            <Clock className="text-gray-400" size={22} />
          </div>
          <p className="text-gray-700 font-bold text-sm">Tidak Ada Riwayat</p>
          <p className="text-gray-400 text-xs mt-0.5">
            Belum ada data presensi pada periode {period.label}.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {periodDailyHistory.map((dayData, idx) => {
            const inRecord = dayData.in;
            const outRecord = dayData.out;
            const schedule = scheduleMap[dayData.dateKey];
            const shift = schedule?.shift;
            const isOff = shift && isOffShift(shift);

            const tryParse = (s: string) => {
              try {
                return JSON.parse(s || '{}');
              } catch {
                return {};
              }
            };
            const locIn = inRecord ? tryParse(inRecord.location) : null;
            const locOut = outRecord ? tryParse(outRecord.location) : null;

            const inTime = inRecord ? new Date(inRecord.timestamp) : null;
            const outTime = outRecord ? new Date(outRecord.timestamp) : null;

            const isEvent = isEventShift(shift);
            const inDelta = inTime && shift && !isOff && !isEvent ? diffSeconds(inTime, shift.checkInTime) : null;
            const outDelta = outTime && shift && !isOff && !isEvent ? diffSeconds(outTime, shift.checkOutTime) : null;
            const inDeltaInfo = inDelta !== null ? getDeltaIn(inDelta) : null;
            const outDeltaInfo = outDelta !== null ? getDeltaOut(outDelta) : null;
            const shiftColor = shift ? getShiftColor(shift.name) : '#6b7280';

            return (
              <div key={idx} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Header: Tanggal + Badge Shift */}
                <div
                  className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3"
                  style={{ background: '#f9fafb' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Calendar size={13} className="text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider leading-none mb-0.5">
                        {dayData.date.toLocaleDateString('id-ID', { weekday: 'long' })}
                      </div>
                      <div className="text-sm font-bold text-gray-900 leading-tight truncate">
                        {dayData.date.toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </div>
                    </div>
                  </div>
                  {shift ? (
                    isOff ? (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          background: '#f0fdf4',
                          color: '#16a34a',
                          border: '1px solid #bbf7d0',
                          borderRadius: 6,
                          padding: '3px 8px',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        🏖️ Libur
                      </span>
                    ) : isEvent ? (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            background: '#f3e8ff',
                            color: '#7e22ce',
                            border: '1px solid #d8b4fe',
                            borderRadius: 6,
                            padding: '2px 8px',
                            display: 'block',
                            marginBottom: 2,
                          }}
                        >
                          🎪 EVENT
                        </span>
                        <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600 }}>
                          Fleksibel
                        </span>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            background: shiftColor + '18',
                            color: shiftColor,
                            border: `1px solid ${shiftColor}33`,
                            borderRadius: 6,
                            padding: '2px 8px',
                            display: 'block',
                            marginBottom: 2,
                          }}
                        >
                          {shift.name}
                        </span>
                        <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600 }}>
                          {shift.checkInTime}–{shift.checkOutTime}
                        </span>
                      </div>
                    )
                  ) : (
                    <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600, flexShrink: 0 }}>
                      No Shift
                    </span>
                  )}
                </div>

                {/* Body: IN row */}
                <div className="px-4 pt-3 pb-2.5 flex items-center gap-3">
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: '#f0fdf4',
                      border: '1.5px solid #bbf7d0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#16a34a' }}>IN</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {inRecord ? (
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span
                              style={{
                                fontSize: '19px',
                                fontWeight: 900,
                                color: '#111827',
                                lineHeight: 1.2,
                                letterSpacing: '-0.4px',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {formatAttendanceTime(inTime)}
                            </span>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af' }}>WIB</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {isEvent && (
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: '#7e22ce',
                                  backgroundColor: '#f3e8ff',
                                  border: '1px solid #d8b4fe',
                                  borderRadius: 5,
                                  padding: '1.5px 7px',
                                  lineHeight: 1.2,
                                }}
                              >
                                🎪 Event Fleksibel
                              </span>
                            )}
                            {inDeltaInfo && (
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: inDeltaInfo.color,
                                  backgroundColor: inDeltaInfo.bgColor,
                                  border: `1px solid ${inDeltaInfo.color}25`,
                                  borderRadius: 5,
                                  padding: '1.5px 7px',
                                  lineHeight: 1.2,
                                }}
                              >
                                {inDeltaInfo.label}
                              </span>
                            )}
                            {locIn?.outlet && (
                              <span
                                className="flex items-center gap-1 text-gray-500 font-medium"
                                style={{ fontSize: '11px' }}
                              >
                                <MapPin size={10} className="shrink-0 text-gray-400" />
                                <span className="truncate" style={{ maxWidth: 130 }}>
                                  {locIn.outlet}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                        {inRecord.photo && (
                          <button
                            onClick={() => setSelectedPhoto(inRecord.photo)}
                            className="shrink-0 rounded-xl overflow-hidden border border-gray-200 hover:opacity-90 transition active:scale-95 shadow-sm"
                            title="Lihat Foto Bukti"
                          >
                            <img
                              src={
                                inRecord.photo.startsWith('data:')
                                  ? inRecord.photo
                                  : `data:image/jpeg;base64,${inRecord.photo}`
                              }
                              alt="Bukti IN"
                              className="w-11 h-11 object-cover"
                            />
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Tidak ada catatan</span>
                    )}
                  </div>
                </div>

                <div className="mx-4 border-t border-gray-100" />

                {/* Body: OUT row */}
                <div className="px-4 pt-2.5 pb-3 flex items-center gap-3">
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: '#fff7ed',
                      border: '1.5px solid #fed7aa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#ea580c' }}>OUT</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {outRecord ? (
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span
                              style={{
                                fontSize: '19px',
                                fontWeight: 900,
                                color: '#111827',
                                lineHeight: 1.2,
                                letterSpacing: '-0.4px',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {formatAttendanceTime(outTime)}
                            </span>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af' }}>WIB</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {outDeltaInfo && (
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: outDeltaInfo.color,
                                  backgroundColor: outDeltaInfo.bgColor,
                                  border: `1px solid ${outDeltaInfo.color}25`,
                                  borderRadius: 5,
                                  padding: '1.5px 7px',
                                  lineHeight: 1.2,
                                }}
                              >
                                {outDeltaInfo.label}
                              </span>
                            )}
                            {locOut?.outlet && (
                              <span
                                className="flex items-center gap-1 text-gray-500 font-medium"
                                style={{ fontSize: '11px' }}
                              >
                                <MapPin size={10} className="shrink-0 text-gray-400" />
                                <span className="truncate" style={{ maxWidth: 130 }}>
                                  {locOut.outlet}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                        {outRecord.photo && (
                          <button
                            onClick={() => setSelectedPhoto(outRecord.photo)}
                            className="shrink-0 rounded-xl overflow-hidden border border-gray-200 hover:opacity-90 transition active:scale-95 shadow-sm"
                            title="Lihat Foto Bukti"
                          >
                            <img
                              src={
                                outRecord.photo.startsWith('data:')
                                  ? outRecord.photo
                                  : `data:image/jpeg;base64,${outRecord.photo}`
                              }
                              alt="Bukti OUT"
                              className="w-11 h-11 object-cover"
                            />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1">
                          <AlertCircle size={12} className="shrink-0" />
                          <span className="font-semibold">Tidak Absen Keluar</span>
                        </div>
                        {shift?.checkOutTime && (
                          <span className="text-[11px] text-gray-400 font-medium">
                            Jadwal pulang: {shift.checkOutTime} WIB
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer: Durasi Jam Kerja Hari Tersebut */}
                <div
                  className="px-4 py-2 border-t border-gray-100 flex items-center justify-between text-xs"
                  style={{ background: '#fafafa' }}
                >
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <Timer size={13} className="text-red-500 shrink-0" />
                    <span className="font-semibold text-gray-600">Total Jam Kerja:</span>
                    {inTime && outTime ? (
                      <span className="font-bold text-gray-900 font-mono">
                        {(() => {
                          const sec = Math.max(0, Math.floor((outTime.getTime() - inTime.getTime()) / 1000));
                          const h = Math.floor(sec / 3600);
                          const m = Math.floor((sec % 3600) / 60);
                          const s = sec % 60;
                          return `${h} jam ${m} mnt ${s} dtk`;
                        })()}
                      </span>
                    ) : (
                      <span className="font-bold text-red-600">Tidak Lengkap</span>
                    )}
                  </div>
                  <div>
                    {inTime && outTime ? (
                      shift?.checkInTime && shift?.checkOutTime && !isOff ? (
                        (() => {
                          const [sInH, sInM] = shift.checkInTime.split(':').map(Number);
                          const [sOutH, sOutM] = shift.checkOutTime.split(':').map(Number);
                          const targetSec = (sOutH * 3600 + sOutM * 60) - (sInH * 3600 + sInM * 60);
                          const durSec = Math.max(0, Math.floor((outTime.getTime() - inTime.getTime()) / 1000));
                          if (durSec >= targetSec) {
                            return (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5">
                                ✓ Target Tercapai
                              </span>
                            );
                          } else {
                            return (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">
                                Kurang {formatDuration(targetSec - durSec)}
                              </span>
                            );
                          }
                        })()
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5">
                          ✓ Selesai
                        </span>
                      )
                    ) : dayData.dateKey < todayStr ? (
                      <span className="text-[10px] font-bold text-red-600 bg-red-100/70 border border-red-200 rounded-md px-2 py-0.5">
                        Tidak Absen Keluar
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100/70 border border-amber-200 rounded-md px-2 py-0.5">
                        Sedang Bekerja
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Photo Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-sm relative">
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute -top-12 right-0 text-white bg-black/50 p-2 rounded-full hover:bg-gray-800 transition"
            >
              <X size={24} />
            </button>
            <img
              src={selectedPhoto.startsWith('data:') ? selectedPhoto : `data:image/jpeg;base64,${selectedPhoto}`}
              alt="Bukti Kehadiran"
              className="w-full rounded-2xl shadow-2xl object-contain max-h-[80vh]"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default History;
