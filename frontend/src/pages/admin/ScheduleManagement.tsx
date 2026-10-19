import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';
import {
  Calendar, ChevronLeft, ChevronRight, X, Zap,
  Users, RefreshCw, Trash2, CheckCircle, Clock, Info
} from 'lucide-react';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type Shift = {
  id: string;
  name: string;
  description: string | null;
  checkInTime: string;
  checkOutTime: string;
  divisionId: string;
};
type Division = { id: string; name: string; shifts: Shift[] };
type UserItem = {
  id: string;
  name: string;
  divisionId: string | null;
  division: { id: string; name: string } | null;
};
type Schedule = {
  id: string;
  userId: string;
  shiftId: string;
  date: string;
  user: UserItem;
  shift: Shift;
};

// â”€â”€â”€ Color palette â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Warna unik per shift berdasarkan index global dalam divisi yang dipilih
const PALETTE = [
  { bg: 'bg-blue-500',   light: 'bg-blue-100 text-blue-700 border-blue-200',   dot: 'bg-blue-400' },
  { bg: 'bg-emerald-500',light: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-400' },
  { bg: 'bg-amber-500',  light: 'bg-amber-100 text-amber-700 border-amber-200',  dot: 'bg-amber-400' },
  { bg: 'bg-rose-500',   light: 'bg-rose-100 text-rose-700 border-rose-200',   dot: 'bg-rose-400' },
  { bg: 'bg-purple-500', light: 'bg-purple-100 text-purple-700 border-purple-200', dot: 'bg-purple-400' },
  { bg: 'bg-sky-500',    light: 'bg-sky-100 text-sky-700 border-sky-200',    dot: 'bg-sky-400' },
  { bg: 'bg-orange-500', light: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-400' },
  { bg: 'bg-teal-500',   light: 'bg-teal-100 text-teal-700 border-teal-200',   dot: 'bg-teal-400' },
];
const OFF_STYLE = { light: 'bg-gray-100 text-gray-400 border-gray-200', dot: 'bg-gray-300' };

// Build shiftâ†’color map dari satu divisi (agar konsisten)
const buildColorMap = (shifts: Shift[]): Record<string, typeof PALETTE[0] | typeof OFF_STYLE> => {
  const map: Record<string, typeof PALETTE[0] | typeof OFF_STYLE> = {};
  let colorIdx = 0;
  for (const s of shifts) {
    if (s.checkInTime === '00:00' && s.checkOutTime === '00:00') {
      map[s.id] = OFF_STYLE as any;
    } else {
      map[s.id] = PALETTE[colorIdx % PALETTE.length];
      colorIdx++;
    }
  }
  return map;
};

const isOff = (s: Shift) => s.checkInTime === '00:00' && s.checkOutTime === '00:00';

const toYM = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const toYMD = (date: Date, day: number) =>
  `${toYM(date)}-${String(day).padStart(2, '0')}`;

const formatMonth = (date: Date) =>
  date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ScheduleManagement = () => {
  const { user: currentUser } = useAuth();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dayPopup, setDayPopup] = useState<{ date: string; day: number } | null>(null);
  const [autoModal, setAutoModal] = useState(false);
  const [autoOff, setAutoOff] = useState('4');
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoMsg, setAutoMsg] = useState('');
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  if ((currentUser?.role || '').toLowerCase() !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  // â”€â”€ Derived values â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const monthKey = toYM(currentDate);
  const todayStr = new Date().toISOString().slice(0, 10);

  // Divisi yang dipilih
  const selectedDivision = divisions.find(d => d.id === selectedDivisionId) ?? null;

  // Karyawan di divisi terpilih
  const divisionUsers = selectedDivisionId
    ? users.filter(u => u.divisionId === selectedDivisionId)
    : [];

  // Shift divisi terpilih
  const divisionShifts = selectedDivision?.shifts ?? [];

  // Color map untuk divisi terpilih (konsisten, tidak double)
  const colorMap = buildColorMap(divisionShifts);

  // Jadwal hanya untuk divisi terpilih
  const divisionSchedules = schedules.filter(s => s.user.divisionId === selectedDivisionId);

  // scheduleMap: date â†’ userId â†’ Schedule
  const scheduleMap: Record<string, Record<string, Schedule>> = {};
  for (const s of divisionSchedules) {
    if (!scheduleMap[s.date]) scheduleMap[s.date] = {};
    scheduleMap[s.date][s.userId] = s;
  }

  // Berapa karyawan sudah dijadwal per hari (untuk progress)
  const totalUsers = divisionUsers.length;

  // â”€â”€ Fetch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [divRes, userRes, schRes] = await Promise.all([
        fetch('/api/divisions').then(r => r.json()),
        fetch('/api/users').then(r => r.json()),
        fetch(`/api/schedules?month=${monthKey}${selectedDivisionId ? `&divisionId=${selectedDivisionId}` : ''}`).then(r => r.json()),
      ]);
      setDivisions(divRes.success ? divRes.divisions : []);
      setUsers(userRes.success ? userRes.users : []);
      setSchedules(schRes.success ? schRes.schedules : []);
    } finally {
      setLoading(false);
    }
  }, [monthKey, selectedDivisionId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Set divisi default ke yang pertama setelah load
  useEffect(() => {
    if (divisions.length > 0 && !selectedDivisionId) {
      setSelectedDivisionId(divisions[0].id);
    }
  }, [divisions, selectedDivisionId]);

  // â”€â”€ Actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const assignShift = async (userId: string, shiftId: string, date: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, shiftId, date }),
      });
      const data = await res.json();
      if (data.success) {
        setSchedules(prev => {
          const exists = prev.findIndex(s => s.userId === userId && s.date === date);
          if (exists >= 0) { const c = [...prev]; c[exists] = data.schedule; return c; }
          return [...prev, data.schedule];
        });
        showToast('âœ“ Jadwal disimpan');
      }
    } finally { setSaving(false); }
  };

  const removeShift = async (scheduleId: string, userId: string, date: string) => {
    setSaving(true);
    try {
      await fetch(`/api/schedules/${scheduleId}`, { method: 'DELETE' });
      setSchedules(prev => prev.filter(s => !(s.userId === userId && s.date === date)));
      showToast('Jadwal dihapus');
    } finally { setSaving(false); }
  };

  const autoGenerate = async () => {
    if (!selectedDivisionId) return;
    setAutoLoading(true); setAutoMsg('');
    try {
      const res = await fetch('/api/schedules/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: monthKey, divisionId: selectedDivisionId, offPerPerson: parseInt(autoOff) || 4 }),
      });
      const data = await res.json();
      if (data.success) {
        setAutoMsg(`âœ… ${data.generated} jadwal berhasil dibuat!`);
        await fetchAll();
        setTimeout(() => { setAutoModal(false); setAutoMsg(''); }, 1500);
      } else {
        setAutoMsg(`âŒ ${data.error}`);
      }
    } finally { setAutoLoading(false); }
  };

  // â”€â”€ Calendar grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  // Day popup
  const popupDate = dayPopup?.date ?? '';
  const popupDaySchedules = scheduleMap[popupDate] ?? {};

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="px-4 pt-6 pb-28 max-w-lg mx-auto">

      {/* â”€â”€ Header â”€â”€ */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jadwal Shift</h1>
          <p className="text-sm text-gray-500 mt-0.5">Atur jadwal karyawan per bulan</p>
        </div>
        <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-md">
          <Calendar size={20} className="text-white" />
        </div>
      </div>

      {/* â”€â”€ STEP 1: Pilih Divisi â”€â”€ */}
      <div className="mb-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
          <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px] font-black">1</span>
          Pilih Divisi
        </p>
        <div className="flex gap-2 flex-wrap">
          {divisions.map(d => (
            <button
              key={d.id}
              onClick={() => setSelectedDivisionId(d.id)}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                selectedDivisionId === d.id
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
              }`}
            >
              {d.name}
            </button>
          ))}
          {divisions.length === 0 && (
            <p className="text-sm text-gray-400 italic">Belum ada divisi â€” buat dulu di Manajemen Divisi</p>
          )}
        </div>
      </div>

      {selectedDivisionId && (
        <>
          {/* â”€â”€ STEP 2: Shift yang tersedia â”€â”€ */}
          <div className="mb-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1">
              <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px] font-black">2</span>
              Shift di Divisi <span className="text-indigo-600 normal-case font-bold">{selectedDivision?.name}</span>
            </p>
            {divisionShifts.length === 0 ? (
              <div className="flex items-center gap-2 bg-amber-50 rounded-xl px-4 py-3">
                <Info size={16} className="text-amber-500 shrink-0" />
                <p className="text-sm text-amber-700 font-medium">
                  Belum ada shift untuk divisi ini. Tambahkan di <strong>Manajemen Divisi</strong>.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {divisionShifts.map(s => {
                  const color = colorMap[s.id];
                  return (
                    <div key={s.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${color.light}`}>
                      <div className={`w-3 h-3 rounded-full shrink-0 ${(color as any).dot ?? 'bg-gray-300'}`} />
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-sm">{s.name}</span>
                        {s.description && <span className="text-xs opacity-70 ml-1.5">({s.description})</span>}
                      </div>
                      <div className="flex items-center gap-1 text-xs font-medium shrink-0">
                        <Clock size={11} />
                        {isOff(s) ? 'OFF / Libur' : `${s.checkInTime} â€“ ${s.checkOutTime}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* â”€â”€ STEP 3: Kalender â”€â”€ */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px] font-black">3</span>
                Pilih Hari
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                  className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-bold text-gray-800 px-2">{formatMonth(currentDate)}</span>
                <button
                  onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                  className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500"
                >
                  <ChevronRight size={16} />
                </button>
                <button onClick={fetchAll} className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 ml-1">
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Progress bar */}
            {totalUsers > 0 && (
              <div className="mb-2 bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2.5 flex items-center gap-3">
                <Users size={14} className="text-indigo-500 shrink-0" />
                <div className="flex-1">
                  <div className="flex justify-between text-xs font-medium text-gray-500 mb-1">
                    <span>{totalUsers} karyawan</span>
                    <span>
                      {divisionSchedules.length} jadwal bulan ini
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (divisionSchedules.length / (totalUsers * daysInMonth)) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-gray-100">
                {DAY_NAMES.map(d => (
                  <div key={d} className={`py-2 text-center text-[11px] font-bold uppercase ${d === 'Min' ? 'text-rose-400' : 'text-gray-400'}`}>
                    {d}
                  </div>
                ))}
              </div>

              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center">
                  <div className="w-7 h-7 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                  <p className="text-gray-400 text-sm mt-3">Memuat...</p>
                </div>
              ) : (
                <div className="grid grid-cols-7">
                  {calendarCells.map((day, idx) => {
                    if (day === null) return (
                      <div key={`e-${idx}`} className={`aspect-square border-b border-gray-50 ${idx % 7 !== 6 ? 'border-r' : ''}`} />
                    );

                    const dateStr = toYMD(currentDate, day);
                    const dayScheds = scheduleMap[dateStr] ?? {};
                    const count = Object.keys(dayScheds).length;
                    const allDone = count >= totalUsers && totalUsers > 0;
                    const isToday = dateStr === todayStr;
                    const isSun = new Date(year, month, day).getDay() === 0;
                    const isLastCol = idx % 7 === 6;

                    // Ambil max 3 warna dot untuk preview
                    const dotColors = Object.values(dayScheds).slice(0, 3).map(s => {
                      const c = colorMap[s.shiftId];
                      return c ? (c as any).dot : 'bg-gray-300';
                    });

                    return (
                      <button
                        key={day}
                        onClick={() => setDayPopup({ date: dateStr, day })}
                        className={`
                          relative aspect-square flex flex-col items-center justify-start pt-1.5 pb-1 px-0.5
                          border-b border-gray-50 transition-all active:scale-95
                          ${!isLastCol ? 'border-r' : ''}
                          ${isToday ? 'bg-indigo-50' : isSun ? 'bg-rose-50/40' : 'hover:bg-gray-50'}
                        `}
                      >
                        <span className={`
                          w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold mb-0.5
                          ${isToday ? 'bg-indigo-600 text-white' : isSun ? 'text-rose-400' : 'text-gray-700'}
                        `}>
                          {day}
                        </span>

                        {/* Shift dots */}
                        {count > 0 && (
                          <div className="flex justify-center gap-0.5 flex-wrap px-0.5 w-full">
                            {dotColors.map((dotCls, i) => (
                              <div key={i} className={`h-1.5 w-1.5 rounded-full ${dotCls}`} />
                            ))}
                            {count > 3 && (
                              <span className="text-[8px] text-gray-400 font-bold leading-none mt-0.5">+{count - 3}</span>
                            )}
                          </div>
                        )}

                        {/* Semua sudah dijadwal */}
                        {allDone && (
                          <CheckCircle size={8} className="absolute top-0.5 right-0.5 text-emerald-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* â”€â”€ FAB: Auto Generate â”€â”€ */}
          <button
            onClick={() => { setAutoModal(true); setAutoMsg(''); }}
            className="fixed bottom-24 right-5 flex items-center gap-2 px-4 h-14 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl shadow-xl font-bold text-sm transition-all active:scale-90 z-40"
          >
            <Zap size={18} />
            Auto Generate
          </button>
        </>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          DAY POPUP
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {dayPopup && selectedDivision && (
        <div className="fixed inset-0 z-50 flex justify-center items-end sm:items-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDayPopup(null)} />
          <div className="relative z-10 bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[88vh] flex flex-col">

            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    {new Date(year, month, dayPopup.day).toLocaleDateString('id-ID', {
                      weekday: 'long', day: 'numeric', month: 'long'
                    })}
                  </h3>
                  <p className="text-xs text-indigo-500 font-semibold mt-0.5">{selectedDivision.name}</p>
                </div>
                <button onClick={() => setDayPopup(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Shift reference bar */}
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 shrink-0">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Shift Tersedia</p>
              <div className="flex flex-wrap gap-1.5">
                {divisionShifts.map(s => {
                  const color = colorMap[s.id];
                  return (
                    <span key={s.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${color.light}`}>
                      <div className={`w-2 h-2 rounded-full ${(color as any).dot}`} />
                      {s.name}
                      <span className="font-normal opacity-70">{isOff(s) ? 'OFF' : `${s.checkInTime}`}</span>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Karyawan list */}
            <div className="overflow-y-auto flex-1">
              {divisionUsers.length === 0 ? (
                <div className="py-12 text-center">
                  <Users size={32} className="text-gray-200 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">Tidak ada karyawan di divisi ini</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {divisionUsers.map(u => {
                    const existing = popupDaySchedules[u.id];
                    const existingColor = existing ? colorMap[existing.shiftId] : null;

                    return (
                      <div key={u.id} className="px-5 py-3.5">
                        {/* Nama + badge shift sekarang */}
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-700 font-black text-sm shrink-0">
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-800">{u.name}</p>
                              {existing ? (
                                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg border ${existingColor?.light}`}>
                                  <div className={`w-1.5 h-1.5 rounded-full ${(existingColor as any)?.dot}`} />
                                  {existing.shift.name} â€” {isOff(existing.shift) ? 'OFF' : `${existing.shift.checkInTime}â€“${existing.shift.checkOutTime}`}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">Belum ada jadwal</span>
                              )}
                            </div>
                          </div>
                          {existing && (
                            <button
                              onClick={() => removeShift(existing.id, u.id, popupDate)}
                              disabled={saving}
                              className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                              title="Hapus jadwal"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>

                        {/* Tombol pilih shift */}
                        <div className="flex flex-wrap gap-1.5">
                          {divisionShifts.map(s => {
                            const color = colorMap[s.id];
                            const isActive = existing?.shiftId === s.id;
                            return (
                              <button
                                key={s.id}
                                onClick={() => !isActive && assignShift(u.id, s.id, popupDate)}
                                disabled={saving || isActive}
                                className={`
                                  flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95
                                  ${isActive
                                    ? `${color.light} ring-2 ring-offset-1 ring-indigo-400`
                                    : `${color.light} opacity-50 hover:opacity-100`
                                  }
                                `}
                              >
                                <div className={`w-2 h-2 rounded-full ${(color as any).dot}`} />
                                {s.name}
                                {isActive && <CheckCircle size={11} />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          AUTO-GENERATE MODAL
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {autoModal && selectedDivision && (
        <div className="fixed inset-0 z-50 flex justify-center items-end sm:items-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !autoLoading && setAutoModal(false)} />
          <div className="relative z-10 bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow">
                  <Zap size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Auto-Generate Jadwal</h3>
                  <p className="text-xs text-indigo-500 font-semibold">{selectedDivision.name} Â· {formatMonth(currentDate)}</p>
                </div>
              </div>
              <button onClick={() => !autoLoading && setAutoModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Info divisi */}
              <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 font-medium">Divisi</span>
                  <span className="font-bold text-gray-900">{selectedDivision.name}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 font-medium">Karyawan</span>
                  <span className="font-bold text-gray-900">{divisionUsers.length} orang</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 font-medium">Shift tersedia</span>
                  <span className="font-bold text-gray-900">{divisionShifts.length} shift</span>
                </div>
              </div>

              {/* Input hari OFF */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Berapa hari OFF per karyawan dalam sebulan?
                </label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setAutoOff(v => String(Math.max(0, parseInt(v) - 1)))}
                    className="w-10 h-10 rounded-xl bg-gray-100 font-black text-gray-700 text-lg hover:bg-gray-200 transition-colors">âˆ’</button>
                  <div className="flex-1 text-center">
                    <span className="text-3xl font-black text-indigo-600">{autoOff}</span>
                    <p className="text-xs text-gray-400">hari libur</p>
                  </div>
                  <button onClick={() => setAutoOff(v => String(Math.min(20, parseInt(v) + 1)))}
                    className="w-10 h-10 rounded-xl bg-gray-100 font-black text-gray-700 text-lg hover:bg-gray-200 transition-colors">+</button>
                </div>
              </div>

              <div className="bg-indigo-50 rounded-xl p-3 text-xs text-indigo-700 font-medium leading-relaxed">
                âš¡ Sistem akan membuat jadwal <strong>acak tapi adil</strong> â€” semua orang dapat porsi shift yang sama.
                <br />âš ï¸ Jadwal bulan ini untuk divisi <strong>{selectedDivision.name}</strong> akan <strong>diganti semua</strong>.
              </div>

              {autoMsg && (
                <div className={`rounded-xl px-4 py-3 text-sm font-medium text-center ${autoMsg.startsWith('âœ…') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                  {autoMsg}
                </div>
              )}

              <button
                onClick={autoGenerate}
                disabled={autoLoading || divisionShifts.length === 0 || divisionUsers.length === 0}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 disabled:from-gray-300 disabled:to-gray-300 text-white font-bold py-4 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {autoLoading
                  ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Zap size={16} /> Buat Jadwal Otomatis</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm font-bold px-5 py-3 rounded-xl shadow-2xl z-50 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  );
};

export default ScheduleManagement;
