import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Clock, Calendar, MapPin, ArrowRight, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

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


import { formatAttendanceTime, diffSeconds, getDeltaIn, getDeltaOut } from '../utils/timeFormat';

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

const Dashboard = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [scheduleMap, setScheduleMap] = useState<Record<string, ScheduleEntry>>({});
  const [loadingSchedule, setLoadingSchedule] = useState(true);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const monthStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}`;
  const weeks = buildWeeks(viewYear, viewMonth);
  const todayEntry = scheduleMap[todayStr];
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth() + 1;
  const monthName = new Date(viewYear, viewMonth - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  const prevMonth = () => { if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1); } else setViewMonth(m => m + 1); };

  // Fetch attendance & jadwal bulan ini secara PARALEL — tidak saling tunggu
  useEffect(() => {
    if (!user?.id) return;
    setLoadingLogs(true);
    setLoadingSchedule(true);

    Promise.all([
      fetch(`/api/attendance/${user.id}`).then(r => r.json()).catch(() => null),
      fetch(`/api/schedules?month=${monthStr}&userId=${user.id}`).then(r => r.json()).catch(() => null),
    ]).then(([attData, schedData]) => {
      if (attData?.success) setLogs(attData.records);
      setLoadingLogs(false);

      if (schedData?.success) {
        const map: Record<string, ScheduleEntry> = {};
        for (const s of schedData.schedules) map[s.date] = s;
        setScheduleMap(map);
      }
      setLoadingSchedule(false);
    });
  }, [user?.id, monthStr]);

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
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
              <ChevronLeft size={14} strokeWidth={2.5} />
            </button>
            <span className="text-xs font-bold text-gray-700 min-w-[100px] text-center">{monthName}</span>
            <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
              <ChevronRight size={14} strokeWidth={2.5} />
            </button>
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
                  const isToday = dateStr === todayStr;
                  const off = entry && isOffShift(entry.shift);
                  const colors = entry ? getShiftColor(entry.shift) : null;

                  return (
                    <div
                      key={di}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        borderRadius: 10, padding: '4px 2px', minHeight: 50,
                        background: isToday ? '#4f46e5' : 'transparent',
                        boxShadow: isToday ? '0 2px 8px rgba(79,70,229,0.3)' : 'none',
                      }}
                    >
                      <span style={{
                        fontSize: '10px', fontWeight: isToday ? 800 : 600, lineHeight: 1, marginBottom: 3,
                        color: isToday ? '#fff' : di === 0 ? '#ef4444' : di === 6 ? '#3b82f6' : '#374151',
                      }}>
                        {day}
                      </span>
                      {entry ? (
                        <span style={{
                          fontSize: '8px', fontWeight: 700, borderRadius: 4, padding: '1px 3px',
                          background: isToday ? 'rgba(255,255,255,0.22)' : (colors?.bg ?? '#f5f3ff'),
                          color: isToday ? '#fff' : (colors?.text ?? '#6d28d9'),
                          border: `1px solid ${isToday ? 'rgba(255,255,255,0.3)' : (colors?.border ?? '#ddd6fe')}`,
                          letterSpacing: '0.02em', lineHeight: 1.4, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden',
                        }}>
                          {off ? 'OFF' : entry.shift.name}
                        </span>
                      ) : (
                        <span style={{ width: 16, height: 2, borderRadius: 2, background: isToday ? 'rgba(255,255,255,0.3)' : '#e5e7eb', display: 'block' }} />
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
            </div>
          </div>
        )}
      </div>

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
                  const inT = dayData.inLog ? new Date(dayData.inLog.timestamp) : null;
                  const outT = dayData.outLog ? new Date(dayData.outLog.timestamp) : null;
                  const inD = (inT && shift && !isOff) ? getDeltaIn(diffSeconds(inT, shift.checkInTime)) : null;
                  const outD = (outT && shift && !isOff) ? getDeltaOut(diffSeconds(outT, shift.checkOutTime)) : null;

                  return (
                    <div key={idx} className="px-4 py-3 bg-white hover:bg-gray-50/60 transition-colors">
                      {/* Date + shift badge */}
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            {dayData.date.toLocaleDateString('id-ID', { weekday: 'long' })}
                          </span>
                          <span className="text-[10px] font-bold text-gray-400"> · </span>
                          <span className="text-[11px] font-bold text-gray-700">
                            {dayData.date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        {shift ? (
                          isOff ? (
                            <span style={{ fontSize: '10px', fontWeight: 700, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 5, padding: '2px 6px' }}>🏖️ Libur</span>
                          ) : (
                            <span style={{ fontSize: '10px', fontWeight: 700, background: colors!.bg, color: colors!.text, border: `1px solid ${colors!.border}`, borderRadius: 5, padding: '2px 6px' }}>
                              {shift.name} · {shift.checkInTime}–{shift.checkOutTime}
                            </span>
                          )
                        ) : null}
                      </div>
                      {/* IN + OUT inline */}
                      <div className="flex gap-3">
                        {/* IN */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#f0fdf4', border: '1.5px solid #bbf7d0', display:'flex', alignItems:'center', justifyContent:'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '8px', fontWeight: 800, color: '#16a34a' }}>IN</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            {inT ? (
                              <div>
                                <div className="flex items-baseline gap-1">
                                  <span style={{ fontSize: '14px', fontWeight: 900, color: '#111827', lineHeight: 1.2, letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums' }}>
                                    {formatAttendanceTime(inT)}
                                  </span>
                                  <span style={{ fontSize: '9px', fontWeight: 700, color: '#9ca3af' }}>WIB</span>
                                </div>
                                {inD && (
                                  <div style={{ fontSize: '9.5px', fontWeight: 700, color: inD.color, marginTop: '2px', lineHeight: 1.25 }}>
                                    {inD.label}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ fontSize: '11px', color: '#d1d5db', fontStyle: 'italic' }}>—</span>
                            )}
                          </div>
                        </div>
                        {/* OUT */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#fff7ed', border: '1.5px solid #fed7aa', display:'flex', alignItems:'center', justifyContent:'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '7px', fontWeight: 800, color: '#ea580c' }}>OUT</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            {outT ? (
                              <div>
                                <div className="flex items-baseline gap-1">
                                  <span style={{ fontSize: '14px', fontWeight: 900, color: '#111827', lineHeight: 1.2, letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums' }}>
                                    {formatAttendanceTime(outT)}
                                  </span>
                                  <span style={{ fontSize: '9px', fontWeight: 700, color: '#9ca3af' }}>WIB</span>
                                </div>
                                {outD && (
                                  <div style={{ fontSize: '9.5px', fontWeight: 700, color: outD.color, marginTop: '2px', lineHeight: 1.25 }}>
                                    {outD.label}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ fontSize: '11px', color: '#d1d5db', fontStyle: 'italic' }}>—</span>
                            )}
                          </div>
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
    </div>
  );
};

export default Dashboard;
