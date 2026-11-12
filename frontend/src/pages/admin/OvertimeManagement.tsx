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
  Sparkles,
  CheckCircle2,
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

  // Tampilkan notifikasi sesaat
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Muat data Users & Divisi
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

  // Muat data Overtimes untuk bulan berjalan
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

  // Petakan overtimes per tanggal: Record<dateStr, OvertimeRecord[]>
  const overtimesByDate = useMemo(() => {
    const map: Record<string, OvertimeRecord[]> = {};
    for (const ot of overtimes) {
      if (!map[ot.date]) map[ot.date] = [];
      map[ot.date].push(ot);
    }
    return map;
  }, [overtimes]);

  // Kalender Grid Generator
  const calendarCells = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Minggu
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

    // Hari dari bulan sebelumnya
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const prevM = currentMonth === 0 ? 12 : currentMonth;
      const prevY = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      cells.push({
        dateStr: dStr,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: dStr === todayStr,
      });
    }

    // Hari dari bulan berjalan
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dateStr: dStr,
        dayNumber: d,
        isCurrentMonth: true,
        isToday: dStr === todayStr,
      });
    }

    // Hari dari bulan berikutnya untuk melengkapi baris 7 kolom (kelipatan 7)
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextM = currentMonth === 11 ? 1 : currentMonth + 2;
      const nextY = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dateStr: dStr,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: dStr === todayStr,
      });
    }

    return cells;
  }, [currentYear, currentMonth]);

  // Navigasi Bulan
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };
  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };
  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Buka Modal Pengaturan Lembur
  const handleOpenModal = (dateStr: string) => {
    setSelectedDateStr(dateStr);
    const existing = overtimesByDate[dateStr] || [];
    const ids = new Set(existing.map((e) => e.userId));
    setModalUserIds(ids);
    setModalNote(existing[0]?.note || '');
    setSearchQuery('');
    setFilterDivision('all');
  };

  // Simpan Batch Overtime
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
            ? `Berhasil menetapkan ${userIdsArray.length} karyawan lembur pada tanggal ${selectedDateStr}.`
            : `Semua data lembur pada tanggal ${selectedDateStr} telah dihapus.`
        );
        setSelectedDateStr(null);
        await fetchOvertimes();
      } else {
        alert(data.error || 'Gagal menyimpan pengaturan lembur');
      }
    } catch (err) {
      console.error('Error saving overtime:', err);
      alert('Terjadi kesalahan jaringan saat menyimpan data lembur.');
    } finally {
      setSaving(false);
    }
  };

  // Toggle user selection
  const handleToggleUser = (uid: string) => {
    setModalUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  };

  // Filtered users di dalam modal
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.division?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchDiv = filterDivision === 'all' || u.divisionId === filterDivision;
      return matchSearch && matchDiv;
    });
  }, [users, searchQuery, filterDivision]);

  // Pilih Semua Filtered Users
  const handleSelectAll = () => {
    setModalUserIds((prev) => {
      const next = new Set(prev);
      filteredUsers.forEach((u) => next.add(u.id));
      return next;
    });
  };

  // Batal Semua Filtered Users
  const handleDeselectAll = () => {
    setModalUserIds((prev) => {
      const next = new Set(prev);
      filteredUsers.forEach((u) => next.delete(u.id));
      return next;
    });
  };

  // Format tanggal rapi bahasa Indonesia
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

  // Statistik Ringkas
  const totalDaysWithOvertime = Object.keys(overtimesByDate).length;
  const totalOvertimeAssignments = overtimes.length;

  return (
    <div className="pb-24 pt-4 px-3 max-w-4xl mx-auto space-y-4">
      {/* Toast Alert */}
      {toastMsg && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 size={16} />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header Halaman */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
              <Clock size={20} />
            </div>
            <div>
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md uppercase tracking-wider">
                Menu Admin
              </span>
              <h1 className="text-lg font-black text-gray-900 tracking-tight mt-0.5">
                Atur Lembur Karyawan
              </h1>
              <p className="text-xs text-gray-500 font-medium">
                Pilih tanggal pada kalender untuk menetapkan nama karyawan yang lembur
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={handleToday}
              className="px-2.5 py-1.5 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Hari Ini
            </button>
            <button
              onClick={() => fetchOvertimes()}
              disabled={loading}
              className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              title="Segarkan data"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Ringkasan & Navigasi Bulan */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="text-sm font-black text-gray-900 min-w-[140px] text-center">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </div>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-gray-600">
            <div className="bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-lg">
              ⚡ {totalDaysWithOvertime} Hari Ada Lembur
            </div>
            <div className="bg-indigo-50 text-indigo-800 border border-indigo-200 px-2.5 py-1 rounded-lg">
              👥 {totalOvertimeAssignments} Total Penugasan
            </div>
          </div>
        </div>
      </div>

      {/* Grid Kalender */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 sm:p-4 shadow-xs">
        {/* Nama Hari */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center">
          {DAY_NAMES.map((name, idx) => (
            <div
              key={name}
              className={`text-[11px] font-black uppercase py-1 ${
                idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-gray-500'
              }`}
            >
              {name}
            </div>
          ))}
        </div>

        {/* Kotak Tanggal */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {calendarCells.map((cell) => {
            const list = overtimesByDate[cell.dateStr] || [];
            const hasOvertime = list.length > 0;

            return (
              <button
                key={cell.dateStr}
                onClick={() => handleOpenModal(cell.dateStr)}
                className={`min-h-[72px] sm:min-h-[88px] p-1.5 sm:p-2 rounded-xl text-left border flex flex-col justify-between transition-all relative group ${
                  cell.isCurrentMonth ? 'bg-white hover:border-amber-400' : 'bg-gray-50/70 border-gray-100 opacity-60'
                } ${
                  cell.isToday
                    ? 'border-indigo-500 ring-2 ring-indigo-200'
                    : hasOvertime
                    ? 'border-amber-300 bg-amber-50/30'
                    : 'border-gray-100'
                }`}
              >
                {/* Bagian Atas: Angka Tanggal */}
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`text-xs font-black inline-flex items-center justify-center w-6 h-6 rounded-full ${
                      cell.isToday
                        ? 'bg-indigo-600 text-white'
                        : cell.isCurrentMonth
                        ? 'text-gray-800'
                        : 'text-gray-400'
                    }`}
                  >
                    {cell.dayNumber}
                  </span>

                  {cell.isToday && (
                    <span className="hidden sm:inline text-[9px] font-bold text-indigo-600 uppercase">
                      Hari ini
                    </span>
                  )}
                </div>

                {/* Bagian Tengah/Bawah: Indikator Lembur */}
                <div className="w-full mt-1">
                  {hasOvertime ? (
                    <div className="bg-amber-100 border border-amber-300 rounded-md p-1 text-[10px] text-amber-900 font-bold leading-tight">
                      <div className="flex items-center gap-1 text-[10px] font-black text-amber-800">
                        <span>⚡</span>
                        <span>{list.length} Lembur</span>
                      </div>
                      <div className="hidden sm:block text-[9px] font-normal text-amber-700 truncate mt-0.5">
                        {list.map((o) => o.userName || 'Karyawan').join(', ')}
                      </div>
                    </div>
                  ) : (
                    <div className="hidden group-hover:flex items-center justify-center py-1 text-[9px] text-gray-400 font-medium">
                      + Atur
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Info Petunjuk */}
      <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
        <Sparkles size={16} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">Informasi Penugasan Lembur:</p>
          <p className="text-amber-800 text-[11px] leading-relaxed">
            Karyawan yang dipilih pada menu ini akan otomatis ditandai <strong>"LEMBUR"</strong> pada{' '}
            <strong>Laporan Rekap Bulanan</strong>, file ekspor Excel (.xlsx), dokumen PDF, serta{' '}
            <strong>Rekap Harian</strong> untuk tanggal yang bersangkutan.
          </p>
        </div>
      </div>

      {/* ─── MODAL ATUR KARYAWAN LEMBUR ─── */}
      {selectedDateStr && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header Modal */}
            <div className="p-4 bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 text-white flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-amber-200 text-[10px] font-bold uppercase tracking-wider">
                  <CalendarIcon size={12} />
                  <span>Pengaturan Lembur Tanggal</span>
                </div>
                <h3 className="text-base font-black text-white mt-0.5">
                  {formatDateHeader(selectedDateStr)}
                </h3>
                <p className="text-xs text-amber-100 font-medium mt-0.5">
                  Centang nama karyawan yang ditugaskan lembur pada tanggal ini
                </p>
              </div>
              <button
                onClick={() => setSelectedDateStr(null)}
                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Kontrol Pencarian, Filter & Quick Select */}
            <div className="p-3 bg-gray-50 border-b border-gray-100 space-y-2">
              <div className="flex gap-2">
                {/* Input Cari */}
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama karyawan..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:border-amber-500"
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

                {/* Filter Divisi */}
                <select
                  value={filterDivision}
                  onChange={(e) => setFilterDivision(e.target.value)}
                  className="bg-white border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs text-gray-700 font-medium focus:outline-none focus:border-amber-500"
                >
                  <option value="all">Semua Divisi</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Buttons: Pilih Semua / Batal Semua */}
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="font-bold text-amber-800 bg-amber-100/70 border border-amber-300 px-2 py-0.5 rounded-md text-[11px]">
                  ⚡ {modalUserIds.size} Karyawan Dipilih
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleSelectAll}
                    type="button"
                    className="px-2 py-1 text-[11px] font-bold text-amber-700 bg-white border border-amber-200 hover:bg-amber-50 rounded-lg transition-colors"
                  >
                    Pilih Semua
                  </button>
                  <button
                    onClick={handleDeselectAll}
                    type="button"
                    className="px-2 py-1 text-[11px] font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Batal Semua
                  </button>
                </div>
              </div>
            </div>

            {/* Daftar Karyawan Checklist */}
            <div className="p-3 overflow-y-auto max-h-[320px] space-y-1.5">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs">
                  Tidak ada karyawan yang cocok dengan pencarian.
                </div>
              ) : (
                filteredUsers.map((u) => {
                  const isChecked = modalUserIds.has(u.id);

                  return (
                    <div
                      key={u.id}
                      onClick={() => handleToggleUser(u.id)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isChecked
                          ? 'border-amber-400 bg-amber-50/60 shadow-xs'
                          : 'border-gray-100 hover:border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Avatar */}
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
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
                            {u.division?.name || 'Semua Divisi'} · {u.role || 'Karyawan'}
                          </span>
                        </div>
                      </div>

                      {/* Checkbox Icon */}
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0 ${
                          isChecked
                            ? 'bg-amber-600 border-amber-600 text-white'
                            : 'border-gray-300 bg-white'
                        }`}
                      >
                        {isChecked && <Check size={13} strokeWidth={3} />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Input Keterangan Lembur */}
            <div className="p-3 bg-gray-50 border-t border-gray-100">
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                Catatan / Keterangan Lembur (Opsional)
              </label>
              <input
                type="text"
                value={modalNote}
                onChange={(e) => setModalNote(e.target.value)}
                placeholder="Contoh: Lembur penutupan toko / event bazar..."
                className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Footer Modal Actions */}
            <div className="p-3 bg-white border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setSelectedDateStr(null)}
                disabled={saving}
                type="button"
                className="px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSaveOvertime}
                disabled={saving}
                type="button"
                className="px-4 py-2 text-xs font-black text-white bg-amber-600 hover:bg-amber-700 active:scale-98 rounded-xl shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} strokeWidth={3} />
                    <span>Simpan Pengaturan Lembur</span>
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
