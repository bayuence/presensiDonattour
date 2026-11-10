import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Clock, MapPin, Loader2, X, Calendar, Timer, AlertCircle } from 'lucide-react';

const isOffShift = (s: { checkInTime: string; checkOutTime: string }) =>
  s.checkInTime === '00:00' && s.checkOutTime === '00:00';

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
  const checkedDatesRef = useRef<Set<string>>(new Set());
  const todayStr = getWibDateKey(new Date());

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const thisMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    const lastMonth = now.getMonth() === 0
      ? `${now.getFullYear() - 1}-12`
      : `${now.getFullYear()}-${pad(now.getMonth())}`;

    // Fetch semua sekaligus — attendance + 2 bulan jadwal secara PARALEL
    Promise.all([
      fetch(`/api/attendance/${user.id}`).then(r => r.json()).catch(() => null),
      fetch(`/api/schedules?month=${thisMonth}&userId=${user.id}`).then(r => r.json()).catch(() => null),
      fetch(`/api/schedules?month=${lastMonth}&userId=${user.id}`).then(r => r.json()).catch(() => null),
    ]).then(([attData, schedThis, schedLast]) => {
      if (attData?.success) setRecords(attData.records);

      const map: Record<string, any> = {};
      if (schedThis?.success) for (const s of schedThis.schedules) map[s.date] = s;
      if (schedLast?.success) for (const s of schedLast.schedules) map[s.date] = s;
      setScheduleMap(map);
    }).catch(err => {
      console.error('Failed to fetch history', err);
    }).finally(() => {
      setLoading(false);
    });
  }, [user?.id]);

  // Enrich jadwal untuk tanggal yang belum ter-cover
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
  }, [user?.id, records, scheduleMap]);

  const groupedRecords: Record<string, { date: Date; dateKey: string; in?: any; out?: any }> = {};
  records.forEach(record => {
    const dateObj = new Date(record.timestamp);
    const dateKey = getWibDateKey(record.timestamp);
    if (!groupedRecords[dateKey]) groupedRecords[dateKey] = { date: dateObj, dateKey };
    if (record.type === 'in' && !groupedRecords[dateKey].in) groupedRecords[dateKey].in = record;
    else if (record.type === 'out' && !groupedRecords[dateKey].out) groupedRecords[dateKey].out = record;
  });

  const dailyHistory = Object.values(groupedRecords).sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="p-4 max-w-lg mx-auto pb-28">
      <h2 className="text-xl font-bold text-gray-900 mb-5 flex items-center gap-2">
        <Clock className="text-indigo-600" size={22} />
        Riwayat Kehadiran
      </h2>

      {loading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="animate-spin text-indigo-600" size={32} />
        </div>
      ) : dailyHistory.length === 0 ? (
        <div className="bg-gray-50 border border-gray-100 rounded-3xl p-8 text-center">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm mb-4">
            <Clock className="text-gray-400" size={24} />
          </div>
          <p className="text-gray-500 font-medium">Belum ada riwayat kehadiran.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dailyHistory.map((dayData, idx) => {
            const inRecord = dayData.in;
            const outRecord = dayData.out;
            const schedule = scheduleMap[dayData.dateKey];
            const shift = schedule?.shift;
            const isOff = shift && isOffShift(shift);

            const tryParse = (s: string) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
            const locIn = inRecord ? tryParse(inRecord.location) : null;
            const locOut = outRecord ? tryParse(outRecord.location) : null;

            const inTime = inRecord ? new Date(inRecord.timestamp) : null;
            const outTime = outRecord ? new Date(outRecord.timestamp) : null;

            const inDelta = (inTime && shift && !isOff) ? diffSeconds(inTime, shift.checkInTime) : null;
            const outDelta = (outTime && shift && !isOff) ? diffSeconds(outTime, shift.checkOutTime) : null;
            const inDeltaInfo = inDelta !== null ? getDeltaIn(inDelta) : null;
            const outDeltaInfo = outDelta !== null ? getDeltaOut(outDelta) : null;
            const shiftColor = shift ? getShiftColor(shift.name) : '#6b7280';

            return (
              <div key={idx} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                {/* Header: Tanggal + Badge Shift */}
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3" style={{ background: '#f9fafb' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Calendar size={13} className="text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider leading-none mb-0.5">
                        {dayData.date.toLocaleDateString('id-ID', { weekday: 'long' })}
                      </div>
                      <div className="text-sm font-bold text-gray-900 leading-tight truncate">
                        {dayData.date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                    </div>
                  </div>
                  {shift ? (
                    isOff ? (
                      <span style={{ fontSize: '11px', fontWeight: 700, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        🏖️ Libur
                      </span>
                    ) : (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, background: shiftColor + '18', color: shiftColor, border: `1px solid ${shiftColor}33`, borderRadius: 6, padding: '2px 8px', display: 'block', marginBottom: 2 }}>
                          {shift.name}
                        </span>
                        <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600 }}>
                          {shift.checkInTime}–{shift.checkOutTime}
                        </span>
                      </div>
                    )
                  ) : (
                    <span style={{ fontSize: '11px', color: '#e5e7eb', fontWeight: 600, flexShrink: 0 }}>No Shift</span>
                  )}
                </div>

                {/* Body: IN row */}
                <div className="px-4 pt-3 pb-2.5 flex items-center gap-3">
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f0fdf4', border: '1.5px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#16a34a' }}>IN</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {inRecord ? (
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span style={{ fontSize: '19px', fontWeight: 900, color: '#111827', lineHeight: 1.2, letterSpacing: '-0.4px', fontVariantNumeric: 'tabular-nums' }}>
                              {formatAttendanceTime(inTime)}
                            </span>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af' }}>WIB</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
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
                                  lineHeight: 1.2
                                }}
                              >
                                {inDeltaInfo.label}
                              </span>
                            )}
                            {locIn?.outlet && (
                              <span className="flex items-center gap-1 text-gray-500 font-medium" style={{ fontSize: '11px' }}>
                                <MapPin size={10} className="shrink-0 text-gray-400" />
                                <span className="truncate" style={{ maxWidth: 130 }}>{locIn.outlet}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        {inRecord.photo && (
                          <button onClick={() => setSelectedPhoto(inRecord.photo)} className="w-10 h-10 rounded-xl overflow-hidden border-2 border-gray-100 shadow-sm shrink-0 active:scale-95 transition-transform">
                            <img src={inRecord.photo.startsWith('data:') ? inRecord.photo : `data:image/jpeg;base64,${inRecord.photo}`} alt="IN" className="w-full h-full object-cover" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: '13px', color: '#d1d5db', fontWeight: 600, fontStyle: 'italic' }}>Belum absen masuk</span>
                    )}
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: '#f3f4f6', margin: '0 16px' }} />

                {/* Body: OUT row */}
                <div className="px-4 pt-2.5 pb-3 flex items-center gap-3">
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fff7ed', border: '1.5px solid #fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#ea580c' }}>OUT</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {outRecord ? (
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span style={{ fontSize: '19px', fontWeight: 900, color: '#111827', lineHeight: 1.2, letterSpacing: '-0.4px', fontVariantNumeric: 'tabular-nums' }}>
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
                                  lineHeight: 1.2
                                }}
                              >
                                {outDeltaInfo.label}
                              </span>
                            )}
                            {locOut?.outlet && (
                              <span className="flex items-center gap-1 text-gray-500 font-medium" style={{ fontSize: '11px' }}>
                                <MapPin size={10} className="shrink-0 text-gray-400" />
                                <span className="truncate" style={{ maxWidth: 130 }}>{locOut.outlet}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        {outRecord.photo && (
                          <button onClick={() => setSelectedPhoto(outRecord.photo)} className="w-10 h-10 rounded-xl overflow-hidden border-2 border-gray-100 shadow-sm shrink-0 active:scale-95 transition-transform">
                            <img src={outRecord.photo.startsWith('data:') ? outRecord.photo : `data:image/jpeg;base64,${outRecord.photo}`} alt="OUT" className="w-full h-full object-cover" />
                          </button>
                        )}
                      </div>
                    ) : dayData.dateKey < todayStr ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-0.5 flex items-center gap-1">
                          <AlertCircle size={12} className="text-red-500" />
                          Tidak Absen Keluar
                        </span>
                        {shift && !isOff && (
                          <span className="text-[11px] text-gray-400 font-medium">
                            Jadwal pulang: {shift.checkOutTime} WIB
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 flex items-center gap-1">
                          <Clock size={12} className="text-amber-500" />
                          Belum Absen Keluar
                        </span>
                        {shift && !isOff && (
                          <span className="text-[11px] text-gray-400 font-medium">
                            Jadwal pulang: {shift.checkOutTime} WIB
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Total Jam Kerja Footer */}
                <div className={`px-4 py-2.5 border-t flex items-center justify-between text-xs ${
                  inTime && outTime
                    ? 'bg-gray-50/90 border-gray-100'
                    : dayData.dateKey < todayStr
                      ? 'bg-red-50/60 border-red-150 text-red-700'
                      : 'bg-amber-50/40 border-amber-150 text-amber-700'
                }`}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Timer size={14} className={inTime && outTime ? 'text-indigo-600' : dayData.dateKey < todayStr ? 'text-red-500' : 'text-amber-500'} strokeWidth={2.5} />
                    <span className="font-extrabold text-gray-700 shrink-0">Total Jam Kerja:</span>
                    <span className={`font-black font-mono tracking-tight truncate ${
                      inTime && outTime
                        ? 'text-gray-900 text-[13px]'
                        : dayData.dateKey < todayStr
                          ? 'text-red-600 text-xs font-sans'
                          : 'text-amber-700 text-xs font-sans'
                    }`}>
                      {inTime && outTime
                        ? formatDuration(Math.max(0, Math.round((outTime.getTime() - inTime.getTime()) / 1000)))
                        : dayData.dateKey < todayStr
                          ? 'Tidak Lengkap'
                          : 'Sedang Berjalan'}
                    </span>
                  </div>

                  <div className="shrink-0 text-right ml-2">
                    {inTime && outTime ? (
                      shift && !isOff ? (() => {
                        const durSec = Math.max(0, Math.round((outTime.getTime() - inTime.getTime()) / 1000));
                        const [inH, inM] = shift.checkInTime.split(':').map(Number);
                        const [outH, outM] = shift.checkOutTime.split(':').map(Number);
                        const targetSec = Math.max(0, ((outH * 60 + outM) - (inH * 60 + inM)) * 60);
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
                      })() : (
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
            <button onClick={() => setSelectedPhoto(null)} className="absolute -top-12 right-0 text-white bg-black/50 p-2 rounded-full hover:bg-gray-800 transition">
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