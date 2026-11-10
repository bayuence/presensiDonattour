import { useState, useEffect } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Trash2,
  Camera,
  AlertTriangle,
  Search,
  RefreshCw,
  UserX,
  CheckCircle2,
  HardDrive,
  ArrowRight,
  Clock,
  Loader2,
  X,
  FolderX,
} from 'lucide-react';

type UserPhotoSummary = {
  userId: string;
  name: string;
  userAvatar: string | null;
  role: string;
  isDeleted: boolean;
  divisionName: string;
  divisionId: string | null;
  photoCount: number;
  attendanceCount: number;
  latestDate: string | null;
  earliestDate: string | null;
  approxSizeKb: number;
};

type CleanupSummaryResponse = {
  success: boolean;
  grandTotalPhotos: number;
  grandTotalAttendances: number;
  grandApproxSizeMb: number;
  deletedAccountsWithPhotos: UserPhotoSummary[];
  userSummaries: UserPhotoSummary[];
};

type ConfirmModalState = {
  isOpen: boolean;
  user: UserPhotoSummary | null;
  mode: 'photos_only' | 'purge_all';
  isBulkDeleted?: boolean;
};

const AttendancePhotoCleanup = () => {
  const { user } = useAuth();
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CleanupSummaryResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'deleted_only' | 'active_only'>('all');
  const [divisions, setDivisions] = useState<{ id: string; name: string }[]>([]);

  // Action state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    user: null,
    mode: 'photos_only',
    isBulkDeleted: false,
  });

  // Fetch divisions
  useEffect(() => {
    fetch('/api/divisions')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setDivisions(d.divisions || []);
      })
      .catch(console.error);
  }, []);

  // Fetch summary
  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/attendance/photos/cleanup-summary');
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      console.error('Error fetching cleanup summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchSummary();
    }
  }, [isAdmin]);

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Handle execute delete
  const handleConfirmExecute = async () => {
    if (!confirmModal.isOpen) return;
    setActionLoading(true);
    setActionSuccessMessage(null);

    try {
      if (confirmModal.isBulkDeleted) {
        // Bulk delete all deleted accounts
        const res = await fetch('/api/attendance/photos/purge-all-deleted', {
          method: 'POST',
        });
        const resJson = await res.json();
        if (resJson.success) {
          setActionSuccessMessage(resJson.message);
          await fetchSummary();
        } else {
          alert(resJson.error || 'Gagal membersihkan foto');
        }
      } else if (confirmModal.user) {
        const userId = confirmModal.user.userId;
        const mode = confirmModal.mode;
        const res = await fetch(`/api/attendance/photos/user/${userId}?mode=${mode}`, {
          method: 'DELETE',
        });
        const resJson = await res.json();
        if (resJson.success) {
          setActionSuccessMessage(resJson.message);
          await fetchSummary();
        } else {
          alert(resJson.error || 'Gagal menghapus foto');
        }
      }
    } catch (err) {
      console.error('Error executing delete:', err);
      alert('Terjadi kesalahan saat memproses permintaan.');
    } finally {
      setActionLoading(false);
      setConfirmModal({ isOpen: false, user: null, mode: 'photos_only', isBulkDeleted: false });
    }
  };

  // Filtered users for tracking
  const filteredUsers = (data?.userSummaries || []).filter((u) => {
    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = u.name.toLowerCase().includes(q);
      const matchDiv = u.divisionName.toLowerCase().includes(q);
      if (!matchName && !matchDiv) return false;
    }

    // Division
    if (selectedDivision && u.divisionId !== selectedDivision) {
      return false;
    }

    // Status filter
    if (statusFilter === 'deleted_only' && !u.isDeleted) return false;
    if (statusFilter === 'active_only' && u.isDeleted) return false;

    return true;
  });

  const formatDateShort = (isoStr: string | null) => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return isoStr;
    }
  };

  const formatSize = (kb: number) => {
    if (kb >= 1024) {
      return `${(kb / 1024).toFixed(1)} MB`;
    }
    return `${kb} KB`;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 pt-5 pb-28 space-y-4">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-2 bg-red-600 w-full" />
        <div className="p-5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
              <Trash2 size={22} />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-gray-900">Hapus & Pembersihan Foto Kehadiran</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Tracking foto kehadiran per nama karyawan, deteksi akun terhapus, dan bersihkan file foto agar database Supabase tetap ringan.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/admin/attendance-photos"
              className="p-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors shrink-0 flex items-center gap-1.5 text-xs font-bold"
            >
              <Camera size={15} />
              <span>Buka Galeri Foto</span>
            </Link>

            <button
              type="button"
              onClick={fetchSummary}
              disabled={loading}
              className="p-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors shrink-0 flex items-center gap-1.5 text-xs font-bold"
              title="Segarkan data"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin text-red-600' : ''} />
              <span>Segarkan</span>
            </button>
          </div>
        </div>
      </div>

      {/* Success Notification Alert */}
      {actionSuccessMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
            <span>{actionSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccessMessage(null)}
            className="text-emerald-500 hover:text-emerald-700 p-0.5"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* STATISTIK KARTU PENYIMPANAN */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 bg-white rounded-2xl border border-gray-100 shadow-xs">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
            Total Foto di Database
          </span>
          <span className="text-lg font-black text-gray-900 mt-0.5 block">
            {data?.grandTotalPhotos ?? 0} <span className="text-xs font-bold text-gray-400">foto</span>
          </span>
        </div>

        <div className="p-3 bg-white rounded-2xl border border-gray-100 shadow-xs">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block flex items-center gap-1">
            <HardDrive size={11} className="text-indigo-500" /> Estimasi Kapasitas
          </span>
          <span className="text-lg font-black text-indigo-700 mt-0.5 block">
            ~{data?.grandApproxSizeMb ?? 0} <span className="text-xs font-bold text-gray-400">MB</span>
          </span>
        </div>

        <div className={`p-3 rounded-2xl border shadow-xs ${
          (data?.deletedAccountsWithPhotos?.length || 0) > 0
            ? 'bg-amber-50/70 border-amber-300 text-amber-900'
            : 'bg-white border-gray-100'
        }`}>
          <span className="text-[10px] font-bold uppercase tracking-wider block flex items-center gap-1 text-amber-800">
            <UserX size={11} className="text-amber-600" /> Akun Dihapus Masih Ada Foto
          </span>
          <span className="text-lg font-black text-amber-900 mt-0.5 block">
            {data?.deletedAccountsWithPhotos?.length ?? 0} <span className="text-xs font-bold text-amber-700">akun</span>
          </span>
        </div>

        <div className="p-3 bg-white rounded-2xl border border-gray-100 shadow-xs">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
            Total Karyawan Terdata
          </span>
          <span className="text-lg font-black text-gray-900 mt-0.5 block">
            {data?.userSummaries?.length ?? 0} <span className="text-xs font-bold text-gray-400">orang</span>
          </span>
        </div>
      </div>

      {/* SECTION KHUSUS: DETEKSI AKUN TERHAPUS (PERMINTAAN USER) */}
      {data && data.deletedAccountsWithPhotos && data.deletedAccountsWithPhotos.length > 0 && (
        <div className="bg-amber-50/70 border-2 border-amber-300 rounded-3xl p-5 space-y-4 shadow-sm animate-in fade-in">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-amber-950">
                  Perhatian: Akun Sudah Dihapus, Foto Masih Tersimpan!
                </h2>
                <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                  Sistem mendeteksi karyawan di bawah ini akunnya telah dihapus dari menu <strong>Kontrol Akun</strong>, tetapi file foto kehadirannya masih tersimpan di database. Anda dapat menghapus fotonya untuk mengosongkan kapasitas.
                </p>
              </div>
            </div>

            {data.deletedAccountsWithPhotos.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setConfirmModal({
                    isOpen: true,
                    user: null,
                    mode: 'purge_all',
                    isBulkDeleted: true,
                  })
                }
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold rounded-xl transition-colors shadow-xs flex items-center gap-1.5"
              >
                <FolderX size={15} />
                <span>Hapus Semua Foto dari Seluruh Akun Terhapus ({data.deletedAccountsWithPhotos.length})</span>
              </button>
            )}
          </div>

          {/* List akun terhapus yang masih punya foto */}
          <div className="space-y-2.5">
            {data.deletedAccountsWithPhotos.map((delUser) => (
              <div
                key={delUser.userId}
                className="bg-white rounded-2xl border border-amber-200 p-3.5 flex items-center justify-between gap-3 flex-wrap shadow-2xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 font-black text-sm shrink-0">
                    <UserX size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-extrabold text-gray-900 truncate">
                        {delUser.name}
                      </h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200 shrink-0">
                        Akun Sudah Dihapus
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 shrink-0">
                        {delUser.divisionName}
                      </span>
                    </div>
                    <p className="text-xs text-amber-900 font-semibold mt-1">
                      Atas nama <strong>{delUser.name}</strong>, akunnya sudah dihapus fotonya belum ({delUser.photoCount} foto tersimpan, ~{formatSize(delUser.approxSizeKb)}). Apakah ingin hapus semua fotonya?
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmModal({
                        isOpen: true,
                        user: delUser,
                        mode: 'purge_all',
                      })
                    }
                    className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <Trash2 size={13} />
                    <span>Hapus Semua Foto</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TRACKING NAMA KARYAWAN & TOOLBAR FILTER */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-800">
            <Search size={15} className="text-gray-400" />
            <span>Tracking Foto Berdasarkan Nama Karyawan</span>
          </div>
          <span className="text-[11px] font-bold text-gray-400">
            Menampilkan {filteredUsers.length} dari {data?.userSummaries?.length || 0} karyawan
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* 1. Input Pencarian Nama */}
          <div className="relative sm:col-span-1">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama karyawan..."
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {/* 2. Filter Divisi */}
          <div>
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
            >
              <option value="">Semua Divisi</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Filter Status Akun */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
            >
              <option value="all">Semua Status (Aktif & Dihapus)</option>
              <option value="active_only">Hanya Akun Aktif</option>
              <option value="deleted_only">Hanya Akun yang Sudah Dihapus</option>
            </select>
          </div>
        </div>
      </div>

      {/* DAFTAR KARYAWAN & AKSI BERSIHKAN FOTO */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 flex flex-col items-center justify-center gap-2 text-gray-400 shadow-sm">
          <Loader2 size={26} className="animate-spin text-red-600" />
          <span className="text-xs font-semibold text-gray-600">Memuat data foto seluruh karyawan...</span>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
            <Camera size={26} className="text-gray-300" />
          </div>
          <p className="text-sm font-bold text-gray-700">Karyawan tidak ditemukan</p>
          <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
            Tidak ada nama karyawan yang cocok dengan kata kunci pencarian atau filter yang dipilih.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredUsers.map((item) => {
            const hasPhotos = item.photoCount > 0;

            return (
              <div
                key={item.userId}
                className={`bg-white rounded-2xl border transition-all p-4 space-y-3 shadow-xs hover:shadow-md ${
                  item.isDeleted ? 'border-red-200 bg-red-50/20' : 'border-gray-100'
                }`}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  {/* Info Karyawan */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-11 h-11 rounded-2xl border overflow-hidden flex items-center justify-center font-extrabold text-sm shrink-0 ${
                      item.isDeleted
                        ? 'bg-red-100 border-red-200 text-red-700'
                        : 'bg-indigo-50 border-indigo-100 text-indigo-700'
                    }`}>
                      {item.userAvatar ? (
                        <img src={item.userAvatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        item.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-extrabold text-gray-900 truncate">
                          {item.name}
                        </h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 border border-gray-200 shrink-0">
                          {item.divisionName}
                        </span>
                        {item.isDeleted ? (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200 flex items-center gap-1 shrink-0">
                            <UserX size={11} /> Akun Sudah Dihapus
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                            {item.role}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 font-medium mt-1 flex-wrap">
                        <span className="flex items-center gap-1 font-bold text-gray-800">
                          <Camera size={13} className="text-rose-500" />
                          <span>{item.photoCount} Foto Tersimpan</span>
                        </span>
                        <span>•</span>
                        <span>Estimasi Kapasitas: <strong>~{formatSize(item.approxSizeKb)}</strong></span>
                        {item.latestDate && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1 text-[11px] text-gray-400">
                              <Clock size={11} /> Terakhir: {formatDateShort(item.latestDate)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tombol Aksi */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Link ke Galeri Foto */}
                    <Link
                      to="/admin/attendance-photos"
                      className="px-3 py-1.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-bold transition-colors flex items-center gap-1 border border-gray-200"
                    >
                      <span>Lihat Galeri</span>
                      <ArrowRight size={13} />
                    </Link>

                    {/* Tombol Hapus Foto Saja */}
                    {hasPhotos && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmModal({
                            isOpen: true,
                            user: item,
                            mode: 'photos_only',
                          })
                        }
                        className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition-colors flex items-center gap-1"
                        title="Kosongkan data foto presensi, catatan jam & lokasi tetap aman"
                      >
                        <Trash2 size={13} className="text-amber-600" />
                        <span>Hapus Foto Saja</span>
                      </button>
                    )}

                    {/* Tombol Hapus Seluruh Riwayat / Hapus Permanen */}
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmModal({
                          isOpen: true,
                          user: item,
                          mode: 'purge_all',
                        })
                      }
                      className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold transition-colors flex items-center gap-1"
                      title={item.isDeleted ? 'Hapus permanen seluruh data presensi & akun' : 'Hapus seluruh rekaman presensi'}
                    >
                      <FolderX size={13} className="text-red-600" />
                      <span>{item.isDeleted ? 'Hapus Permanen' : 'Hapus Seluruh Data'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL KONFIRMASI AMAN */}
      {confirmModal.isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => !actionLoading && setConfirmModal({ isOpen: false, user: null, mode: 'photos_only' })}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-extrabold text-gray-900">
                  {confirmModal.isBulkDeleted
                    ? 'Bersihkan Foto Semua Akun Terhapus?'
                    : confirmModal.mode === 'photos_only'
                    ? `Hapus Foto Saja: ${confirmModal.user?.name}`
                    : `Hapus Permanen: ${confirmModal.user?.name}`}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {confirmModal.isBulkDeleted
                    ? 'Tindakan ini akan menghapus semua file foto presensi dari seluruh akun yang sudah dinonaktifkan/dihapus.'
                    : confirmModal.mode === 'photos_only'
                    ? 'File foto selfie presensi akan dikosongkan untuk menghemat database Supabase. Riwayat jam, tanggal, outlet, dan rekap bulanan tetap aman.'
                    : 'Seluruh riwayat presensi, koordinat, dan foto karyawan ini akan dihapus permanen dari sistem.'}
                </p>
              </div>
            </div>

            {/* Kotak Rincian yang akan dihapus */}
            {!confirmModal.isBulkDeleted && confirmModal.user && (
              <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Nama Karyawan:</span>
                  <span className="font-bold text-gray-900">{confirmModal.user.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Divisi:</span>
                  <span className="font-bold text-gray-800">{confirmModal.user.divisionName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Jumlah Foto:</span>
                  <span className="font-bold text-rose-600">{confirmModal.user.photoCount} Foto</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Kapasitas Hemat:</span>
                  <span className="font-bold text-emerald-600">~{formatSize(confirmModal.user.approxSizeKb)}</span>
                </div>
              </div>
            )}

            {/* Tombol Konfirmasi & Batal */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setConfirmModal({ isOpen: false, user: null, mode: 'photos_only' })}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleConfirmExecute}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
              >
                {actionLoading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={15} />
                    <span>Ya, Hapus Sekarang</span>
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

export default AttendancePhotoCleanup;
