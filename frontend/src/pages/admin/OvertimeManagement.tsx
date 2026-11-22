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
  CheckCircle2,
  Calendar,
  FileCheck2,
} from 'lucide-react';

type OvertimeRecord = {
  id: string;
  userId: string;
  date: string;
  note: string | null;
  status?: string;
  durationMinutes?: number;
  checkOutTime?: string | null;
  shiftCheckOut?: string | null;
  userName?: string;
  divisionName?: string;
  createdAt?: string;
};

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export default function OvertimeManagement() {
  const { user } = useAuth();
  const isAdmin = (user?.role || '').trim().toLowerCase() === 'admin';

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [overtimes, setOvertimes] = useState<OvertimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

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
    fetchOvertimes();
  }, [fetchOvertimes]);

  const handlePrevMonth = () => setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  const handleToday = () => setCurrentDate(new Date());

  const handleUpdateStatus = async (id: string, status: 'approved' | 'rejected') => {
    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/overtimes/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(status === 'approved' ? 'Pengajuan lembur disetujui (ACC)!' : 'Pengajuan lembur ditolak.');
        await fetchOvertimes();
      } else {
        alert(data.error || 'Gagal mengubah status');
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const pendingCount = useMemo(() => {
    return overtimes.filter((o) => (o.status || 'approved') === 'pending').length;
  }, [overtimes]);

  const approvedCount = useMemo(() => {
    return overtimes.filter((o) => (o.status || 'approved') === 'approved').length;
  }, [overtimes]);

  const rejectedCount = useMemo(() => {
    return overtimes.filter((o) => (o.status || 'approved') === 'rejected').length;
  }, [overtimes]);

  const filteredList = useMemo(() => {
    return overtimes.filter((o) => {
      const s = o.status || 'approved';
      if (statusFilter !== 'all' && s !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (o.userName || '').toLowerCase().includes(q);
        const matchDiv = (o.divisionName || '').toLowerCase().includes(q);
        const matchNote = (o.note || '').toLowerCase().includes(q);
        return matchName || matchDiv || matchNote;
      }
      return true;
    });
  }, [overtimes, statusFilter, searchQuery]);

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="pb-24 pt-3 px-3 max-w-md mx-auto space-y-3">
      {/* Toast Notifikasi */}
      {toastMsg && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 size={16} />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header Halaman */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3.5 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
              <FileCheck2 size={18} />
            </div>
            <div>
              <span className="text-[9px] font-black text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded uppercase tracking-wider">
                Menu Admin
              </span>
              <h1 className="text-base font-black text-gray-900 tracking-tight leading-tight mt-0.5">
                Persetujuan Lembur
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleToday}
              className="px-2.5 py-1 text-[11px] font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Bulan Ini
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

        {/* Navigasi Bulan */}
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
            {pendingCount > 0 ? (
              <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md animate-pulse">
                ⏳ {pendingCount} Perlu ACC
              </span>
            ) : (
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                ✓ Semua Bersih
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filter Status Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors ${
            statusFilter === 'all'
              ? 'bg-gray-900 text-white'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Semua ({overtimes.length})
        </button>
        <button
          onClick={() => setStatusFilter('pending')}
          className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors ${
            statusFilter === 'pending'
              ? 'bg-amber-500 text-white shadow-xs'
              : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'
          }`}
        >
          Menunggu ({pendingCount})
        </button>
        <button
          onClick={() => setStatusFilter('approved')}
          className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors ${
            statusFilter === 'approved'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
          }`}
        >
          Disetujui ({approvedCount})
        </button>
        <button
          onClick={() => setStatusFilter('rejected')}
          className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors ${
            statusFilter === 'rejected'
              ? 'bg-red-600 text-white shadow-xs'
              : 'bg-white text-red-700 border border-red-200 hover:bg-red-50'
          }`}
        >
          Ditolak ({rejectedCount})
        </button>
      </div>

      {/* Pencarian Karyawan */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cari nama karyawan / divisi / alasan..."
          className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500 shadow-2xs"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Daftar Pengajuan Lembur */}
      {loading ? (
        <div className="bg-white rounded-2xl p-8 text-center text-xs text-gray-400 border border-gray-100">
          <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-gray-400" />
          Memuat data pengajuan lembur...
        </div>
      ) : filteredList.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-xs text-gray-400 border border-dashed border-gray-200 space-y-1">
          <Clock size={24} className="mx-auto text-gray-300 mb-1" />
          <p className="font-semibold text-gray-600">Tidak ada pengajuan lembur</p>
          <p className="text-[11px] text-gray-400">
            {statusFilter !== 'all'
              ? `Tidak ada data dengan status "${statusFilter}".`
              : 'Belum ada karyawan yang mengajukan lembur pada bulan ini.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredList.map((ot) => {
            const st = ot.status || 'approved';
            const isPending = st === 'pending';
            const isApproved = st === 'approved';

            const durationH = Math.floor((ot.durationMinutes || 0) / 60);
            const durationM = (ot.durationMinutes || 0) % 60;
            const durationLabel =
              ot.durationMinutes && ot.durationMinutes > 0
                ? durationH > 0
                  ? `${durationH} Jam ${durationM} Mnt`
                  : `${durationM} Menit`
                : null;

            return (
              <div
                key={ot.id}
                className="bg-white rounded-2xl border border-gray-100 p-3.5 shadow-xs space-y-2.5 transition-all"
              >
                {/* Header Kartu */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="text-sm font-bold text-gray-900 truncate">
                        {ot.userName || 'Karyawan'}
                      </h3>
                      {ot.divisionName && (
                        <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.2 rounded truncate">
                          {ot.divisionName}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                      <Calendar size={11} className="text-gray-400" />
                      <span>Tanggal: <strong className="text-gray-700">{ot.date}</strong></span>
                    </p>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      isPending
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : isApproved
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-red-100 text-red-800 border border-red-200'
                    }`}
                  >
                    {isPending
                      ? '⏳ Menunggu ACC'
                      : isApproved
                      ? '✅ Disetujui'
                      : '❌ Ditolak'}
                  </span>
                </div>

                {/* Detail Jam Shift vs Checkout Aktual */}
                {(ot.shiftCheckOut || ot.checkOutTime || durationLabel) && (
                  <div className="bg-gray-50 rounded-xl p-2.5 text-xs text-gray-600 space-y-1 border border-gray-100">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Jadwal Shift:</span>
                      <span className="font-semibold">{ot.shiftCheckOut || '—'} WIB</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Checkout Aktual:</span>
                      <span className="font-semibold text-gray-900">{ot.checkOutTime || '—'} WIB</span>
                    </div>
                    {durationLabel && (
                      <div className="flex items-center justify-between pt-1 border-t border-gray-200/60 font-bold">
                        <span className="text-amber-700">Durasi Lembur:</span>
                        <span className="text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded text-[11px]">
                          ⚡ +{durationLabel}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Alasan / Catatan Tugas */}
                {ot.note && (
                  <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-2.5 text-xs">
                    <span className="text-[10px] font-bold text-amber-700 block uppercase tracking-wider mb-0.5">
                      Alasan Lembur:
                    </span>
                    <p className="text-gray-800 italic leading-relaxed">"{ot.note}"</p>
                  </div>
                )}

                {/* Tombol Aksi Persetujuan */}
                <div className="flex items-center gap-2 pt-1 border-t border-gray-50">
                  {isPending ? (
                    <>
                      <button
                        type="button"
                        disabled={actionLoadingId === ot.id}
                        onClick={() => handleUpdateStatus(ot.id, 'approved')}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 flex items-center justify-center gap-1"
                      >
                        <Check size={14} />
                        Terima (ACC)
                      </button>
                      <button
                        type="button"
                        disabled={actionLoadingId === ot.id}
                        onClick={() => handleUpdateStatus(ot.id, 'rejected')}
                        className="flex-1 py-2 bg-white hover:bg-red-50 disabled:opacity-50 text-red-600 border border-red-200 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 flex items-center justify-center gap-1"
                      >
                        <X size={14} />
                        Tolak
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center justify-between w-full text-[11px] text-gray-400">
                      <span>Status: <strong className="capitalize">{st}</strong></span>
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(ot.id, isApproved ? 'rejected' : 'approved')}
                        className="text-indigo-600 hover:underline font-semibold"
                      >
                        Ubah ke {isApproved ? 'Tolak' : 'ACC'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
