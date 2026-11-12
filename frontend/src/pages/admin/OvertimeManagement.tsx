import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Search,
  Check,
  X,
  RefreshCw,
  Calendar as CalendarIcon,
  CheckCircle2,
  UserCheck,
} from 'lucide-react';

type UserItem = {
  id: string;
  name: string;
  role: string;
  divisionId: string | null;
  division?: { id: string; name: string } | null;
};

type OvertimeRecord = {
  id: string;
  userId: string;
  date: string;
  note: string | null;
  userName?: string;
  divisionName?: string;
};

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export default function OvertimeManagement() {
  const { user } = useAuth();
  const isAdmin = (user?.role || '').trim().toLowerCase() === 'admin';

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [users, setUsers] = useState<UserItem[]>([]);
  const [divisions, setDivisions] = useState<{ id: string; name: string }[]>([]);
  const [overtimes, setOvertimes] = useState<OvertimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Modal State
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [modalUserIds, setModalUserIds] = useState<Set<string>>(new Set());
  const [modalNote, setModalNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDivision, setFilterDivision] = useState<string>('all');

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth(); // 0-based
  const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const fetchUsersAndDivisions = useCallback(async () => {
    try {
      const [userRes, divRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/divisions'),
      ]);
      const userData = await userRes.json();
      const divData = await divRes.json();

      if (userData.success && Array.isArray(userData.users)) {
        setUsers(userData.users);
      }
      if (divData.success && Array.isArray(divData.divisions)) {
        setDivisions(divData.divisions);
      }
    } catch (err) {
      console.error('Error loading users/divisions:', err);
    }
  }, []);

  const fetchOvertimes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/overtimes?month=${monthStr}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.overtimes)) {
        setOvertimes(data.overtimes);
      } else {
        setOvertimes([]);
      }
    } catch (err) {
      console.error('Error fetching overtimes:', err);
    } finally {
      setLoading(false);
    }
  }, [monthStr]);

  useEffect(() => {
    fetchUsersAndDivisions();
  }, [fetchUsersAndDivisions]);

  useEffect(() => {
    fetchOvertimes();
  }, [fetchOvertimes]);

  const overtimesByDate = useMemo(() => {
    const map: Record<string, OvertimeRecord[]> = {};
    for (const ot of overtimes) {
      if (!map[ot.date]) map[ot.date] = [];
      map[ot.date].push(ot);
    }
    return map;
  }, [overtimes]);

  const calendarCells = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();

    const cells: {
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
    }[] = [];

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const prevM = currentMonth === 0 ? 12 : currentMonth;
      const prevY = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      cells.push({ dateStr: dStr, dayNumber: dayNum, isCurrentMonth: false, isToday: dStr === todayStr });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dateStr: dStr, dayNumber: d, isCurrentMonth: true, isToday: dStr === todayStr });
    }

    const remaining = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextM = currentMonth === 11 ? 1 : currentMonth + 2;
      const nextY = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dateStr: dStr, dayNumber: d, isCurrentMonth: false, isToday: dStr === todayStr });
    }

    return cells;
  }, [currentYear, currentMonth]);

  const handlePrevMonth = () => setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  const handleToday = () => setCurrentDate(new Date());

  const handleOpenModal = (dateStr: string) => {
    setSelectedDateStr(dateStr);
    const existing = overtimesByDate[dateStr] || [];
    const ids = new Set(existing.map((e) => e.userId));
    setModalUserIds(ids);
    setModalNote(existing[0]?.note || '');
    setSearchQuery('');
    setFilterDivision('all');
  };

  const handleSaveOvertime = async () => {
    if (!selectedDateStr) return;
    setSaving(true);
    try {
      const userIdsArray = Array.from(modalUserIds);
      const res = await fetch('/api/overtimes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDateStr,
          userIds: userIdsArray,
          note: modalNote.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(
          userIdsArray.length > 0
            ? `Berhasil simpan ${userIdsArray.length} karyawan lembur pada tanggal ${selectedDateStr}.`
            : `Data lembur tanggal ${selectedDateStr} telah dibersihkan.`
        );
        setSelectedDateStr(null);
        await fetchOvertimes();
      } else {
        alert(data.error || 'Gagal menyimpan data lembur');
      }
    } catch (err) {
      console.error('Error saving overtime:', err);
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleUser = (uid: string) => {
    setModalUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.division?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchDiv = filterDivision === 'all' || u.divisionId === filterDivision;
      return matchSearch && matchDiv;
    });
  }, [users, searchQuery, filterDivision]);

  const handleSelectAll = () => {
    setModalUserIds((prev) => {
      const next = new Set(prev);
      filteredUsers.forEach((u) => next.add(u.id));
      return next;
    });
  };

  const handleDeselectAll = () => {
    setModalUserIds((prev) => {
      const next = new Set(prev);
      filteredUsers.forEach((u) => next.delete(u.id));
      return next;
    });
  };

  const formatDateHeader = (dStr: string) => {
    const parts = dStr.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const totalDaysWithOvertime = Object.keys(overtimesByDate).length;
  const totalOvertimeAssignments = overtimes.length;

  return (
    <div className="pb-24 pt-3 px-3 max-w-md mx-auto space-y-3">
      {/* Toast Notifikasi */}
      {toastMsg && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 size={16} />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header Halaman Rapi & Kompak */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3.5 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
              <Clock size={18} />
            </div>
            <div>
              <span className="text-[9px] font-black text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded uppercase tracking-wider">
                Menu Admin
              </span>
              <h1 className="text-base font-black text-gray-900 tracking-tight leading-tight mt-0.5">
                Atur Lembur Karyawan
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleToday}
              className="px-2.5 py-1 text-[11px] font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Hari Ini
            </button>
            <button
              onClick={() => fetchOvertimes()}
              disabled={loading}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Segarkan data"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Bar Navigasi Bulan & Ringkasan */}
        <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            <div className="text-xs font-black text-gray-800 min-w-[110px] text-center">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </div>
            <button
              onClick={handleNextMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
              ⚡ {totalDaysWithOvertime} Hari
            </span>
            <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
              👥 {totalOvertimeAssignments} Orang
            </span>
          </div>
        </div>
      </div>

      {/* Grid Kalender Simetris & Rapi */}
      <div className="bg-white rounded-2xl border border-gray-100 p-2.5 shadow-xs">
        {/* Label Hari */}
        <div className="grid grid-cols-7 gap-1 mb-1.5 text-center">
          {DAY_NAMES.map((name, idx) => (
            <div
              key={name}
              className={`text-[10px] font-bold uppercase py-0.5 ${
                idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-gray-400'
              }`}
            >
              {name}
            </div>
          ))}
        </div>

        {/* Kotak-kotak Tanggal Proporsional */}
        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((cell) => {
            const list = overtimesByDate[cell.dateStr] || [];
            const hasOvertime = list.length > 0;

            return (
              <button
                key={cell.dateStr}
                onClick={() => handleOpenModal(cell.dateStr)}
                className={`h-[52px] p-1 rounded-xl text-center flex flex-col items-center justify-between transition-all relative ${
                  cell.isCurrentMonth
                    ? 'bg-white hover:bg-amber-50/40 active:scale-95'
                    : 'bg-gray-50/50 opacity-30 cursor-default'
                } ${
                  hasOvertime
                    ? 'border-2 border-orange-500 bg-amber-50/40 shadow-xs'
                    : cell.isToday
                    ? 'border border-indigo-500 bg-indigo-50/30'
                    : 'border border-gray-100'
                }`}
              >
                {/* Angka Tanggal */}
                <span
                  className={`text-[11px] font-bold inline-flex items-center justify-center w-5 h-5 rounded-full ${
                    cell.isToday
                      ? 'bg-indigo-600 text-white'
                      : hasOvertime
                      ? 'text-orange-950 font-black'
                      : cell.isCurrentMonth
                      ? 'text-gray-800'
                      : 'text-gray-400'
                  }`}
                >
                  {cell.dayNumber}
                </span>

                {/* Badge Lembur Kompak: Pas dalam 1 baris */}
                {hasOvertime ? (
                  <span className="w-full text-center text-[9px] font-black text-amber-900 bg-amber-200/90 border border-amber-300 rounded px-0.5 py-0.2 leading-tight truncate">
                    ⚡ {list.length} Org
                  </span>
                ) : (
                  <span className="w-3 h-0.5 rounded-full bg-gray-100 block mb-1" />
                )}
              </button>
            );
          })}
        </div>

        {/* Petunjuk Bawah Kalender */}
        <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs border-2 border-orange-500 bg-amber-100" />
            <span>Frame Orange: Ada Jadwal Lembur</span>
          </div>
          <span className="text-gray-400">Klik tanggal untuk atur</span>
        </div>
      </div>

      {/* ─── MODAL ATUR KARYAWAN LEMBUR ─── */}
      {selectedDateStr && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[88vh]">
            {/* Header Modal */}
            <div className="p-3.5 bg-gradient-to-r from-amber-600 to-amber-700 text-white flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-amber-100 text-[10px] font-bold uppercase tracking-wider">
                  <CalendarIcon size={12} />
                  <span>Atur Karyawan Lembur</span>
                </div>
                <h3 className="text-sm font-black text-white mt-0.5">
                  {formatDateHeader(selectedDateStr)}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDateStr(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Kontrol Pencarian, Filter & Quick Select */}
            <div className="p-2.5 bg-gray-50 border-b border-gray-100 space-y-2">
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama karyawan..."
                    className="w-full pl-7 pr-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:border-amber-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <select
                  value={filterDivision}
                  onChange={(e) => setFilterDivision(e.target.value)}
                  className="bg-white border border-gray-200 rounded-xl px-2 py-1.5 text-xs text-gray-700 font-medium focus:outline-none focus:border-amber-500"
                >
                  <option value="all">Semua Divisi</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick Select Buttons */}
              <div className="flex items-center justify-between text-xs pt-0.5">
                <span className="font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md text-[10px]">
                  ⚡ {modalUserIds.size} Dipilih
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleSelectAll}
                    type="button"
                    className="px-2 py-1 text-[10px] font-bold text-amber-700 bg-white border border-amber-200 hover:bg-amber-50 rounded-lg transition-colors"
                  >
                    Pilih Semua
                  </button>
                  <button
                    onClick={handleDeselectAll}
                    type="button"
                    className="px-2 py-1 text-[10px] font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Batal Semua
                  </button>
                </div>
              </div>
            </div>

            {/* List Karyawan */}
            <div className="p-2.5 overflow-y-auto max-h-[260px] space-y-1.5">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-xs">
                  Tidak ada karyawan yang cocok.
                </div>
              ) : (
                filteredUsers.map((u) => {
                  const isChecked = modalUserIds.has(u.id);

                  return (
                    <div
                      key={u.id}
                      onClick={() => handleToggleUser(u.id)}
                      className={`flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer ${
                        isChecked
                          ? 'border-amber-400 bg-amber-50/60'
                          : 'border-gray-100 hover:border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[11px] shrink-0 ${
                            isChecked
                              ? 'bg-amber-600 text-white'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {u.name.charAt(0).toUpperCase()}
                        </div>

                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-gray-900 truncate">
                            {u.name}
                          </h4>
                          <span className="text-[10px] text-gray-400 block truncate">
                            {u.division?.name || 'Semua Divisi'}
                          </span>
                        </div>
                      </div>

                      <div
                        className={`w-4 h-4 rounded-md flex items-center justify-center border transition-all shrink-0 ${
                          isChecked
                            ? 'bg-amber-600 border-amber-600 text-white'
                            : 'border-gray-300 bg-white'
                        }`}
                      >
                        {isChecked && <Check size={11} strokeWidth={3} />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Catatan Lembur */}
            <div className="p-2.5 bg-gray-50 border-t border-gray-100">
              <input
                type="text"
                value={modalNote}
                onChange={(e) => setModalNote(e.target.value)}
                placeholder="Catatan / keterangan lembur (opsional)..."
                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Footer Modal Actions */}
            <div className="p-2.5 bg-white border-t border-gray-100 flex items-center justify-end gap-1.5">
              <button
                onClick={() => setSelectedDateStr(null)}
                disabled={saving}
                type="button"
                className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSaveOvertime}
                disabled={saving}
                type="button"
                className="px-3.5 py-1.5 text-xs font-black text-white bg-amber-600 hover:bg-amber-700 active:scale-95 rounded-xl shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <UserCheck size={13} />
                    <span>Simpan Lembur</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
