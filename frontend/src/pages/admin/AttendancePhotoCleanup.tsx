import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
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
  Users,
  ArrowLeft,
  Clock,
  Loader2,
  X,
  FolderX,
  MapPin,
  ExternalLink,
  Eye,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Layers,
  ShieldCheck,
  ShieldAlert,
  Info
} from 'lucide-react';
import { formatAttendanceTime } from '../../utils/timeFormat';

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

type AttendanceRecordDetail = {
  id: string;
  type: string;
  timestamp: string;
  photo: string;
  outlet: string | null;
  latitude: number | null;
  longitude: number | null;
  distance: number | null;
  accuracy: number | null;
};

type DailyAttendanceRecord = {
  dateStr: string;
  inRecord: AttendanceRecordDetail | null;
  outRecord: AttendanceRecordDetail | null;
  status: 'complete' | 'in_only' | 'out_only';
};

type UserGalleryData = {
  user: {
    id: string;
    name: string;
    role: string;
    isDeleted: boolean;
    userAvatar: string | null;
    divisionName: string;
  };
  availableMonths: string[];
  selectedMonth: string | null;
  totalPhotos: number;
  filteredPhotos: number;
  dailyRecords: DailyAttendanceRecord[];
};

type ConfirmModalState = {
  isOpen: boolean;
  user: UserPhotoSummary | null;
  mode: 'photos_only' | 'purge_all' | 'single_photo';
  singlePhotoId?: string;
  singlePhotoDate?: string;
  singlePhotoType?: string;
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

  // Sub-halaman Galeri Foto Karyawan
  const [activeGalleryUser, setActiveGalleryUser] = useState<UserPhotoSummary | null>(null);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryData, setGalleryData] = useState<UserGalleryData | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [viewAllDaysOfMonth, setViewAllDaysOfMonth] = useState<boolean>(false);
  const [zoomPhoto, setZoomPhoto] = useState<AttendanceRecordDetail | null>(null);

  // Modal konfirmasi aksi & pengaman anti salah klik
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [confirmAcknowledge, setConfirmAcknowledge] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    user: null,
    mode: 'photos_only',
    isBulkDeleted: false,
  });

  const openConfirmModal = (modalState: Omit<ConfirmModalState, 'isOpen'>) => {
    setConfirmAcknowledge(false);
    setConfirmModal({
      ...modalState,
      isOpen: true,
    });
  };

  const closeConfirmModal = () => {
    if (actionLoading) return;
    setConfirmAcknowledge(false);
    setConfirmModal({
      isOpen: false,
      user: null,
      mode: 'photos_only',
      isBulkDeleted: false,
    });
  };

  // Fetch list divisi
  useEffect(() => {
    fetch('/api/divisions')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setDivisions(d.divisions || []);
      })
      .catch(console.error);
  }, []);

  // Fetch ringkasan tracking foto
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

  // Fetch galeri foto karyawan (bisa filter bulan)
  const openUserGallery = async (targetUser: UserPhotoSummary, month?: string) => {
    setActiveGalleryUser(targetUser);
    setGalleryLoading(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const queryMonth = month !== undefined ? month : selectedMonth;
      const url = queryMonth && queryMonth !== 'all'
        ? `/api/attendance/photos/user/${targetUser.userId}?month=${queryMonth}`
        : `/api/attendance/photos/user/${targetUser.userId}`;

      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setGalleryData(json);
        if (month !== undefined) {
          setSelectedMonth(month);
        } else if (!selectedMonth && json.availableMonths && json.availableMonths.length > 0) {
          setSelectedMonth(json.availableMonths[0]);
        }
      } else {
        alert(json.error || 'Gagal memuat foto karyawan');
      }
    } catch (err) {
      console.error('Error loading user gallery:', err);
      alert('Terjadi kesalahan koneksi saat memuat foto');
    } finally {
      setGalleryLoading(false);
    }
  };

  const handleMonthChange = (newMonth: string) => {
    setSelectedMonth(newMonth);
    if (activeGalleryUser) {
      openUserGallery(activeGalleryUser, newMonth);
    }
  };

  const handleMonthPrevNext = (delta: number) => {
    if (!selectedMonth || selectedMonth === 'all' || !/^\d{4}-\d{2}$/.test(selectedMonth)) return;
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    const targetMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    handleMonthChange(targetMonth);
  };

  const closeUserGallery = () => {
    setActiveGalleryUser(null);
    setGalleryData(null);
    setZoomPhoto(null);
    setSelectedMonth('');
    setViewAllDaysOfMonth(false);
    fetchSummary();
  };

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Eksekusi aksi hapus foto
  const handleConfirmExecute = async () => {
    if (!confirmModal.isOpen) return;
    setActionLoading(true);
    setActionSuccessMessage(null);

    try {
      if (confirmModal.mode === 'single_photo' && confirmModal.singlePhotoId) {
        const res = await fetch(`/api/attendance/record/${confirmModal.singlePhotoId}/photo`, {
          method: 'DELETE',
        });
        const resJson = await res.json();
        if (resJson.success) {
          setActionSuccessMessage('File foto selfie berhasil dihapus. Catatan jam dan tanggal presensi tetap aman.');
          if (activeGalleryUser) {
            openUserGallery(activeGalleryUser);
          }
        } else {
          alert(resJson.error || 'Gagal menghapus foto.');
        }
      } else if (confirmModal.isBulkDeleted) {
        const res = await fetch('/api/attendance/photos/purge-all-deleted', {
          method: 'POST',
        });
        const resJson = await res.json();
        if (resJson.success) {
          setActionSuccessMessage(resJson.message);
          if (activeGalleryUser) closeUserGallery();
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
          if (activeGalleryUser) closeUserGallery();
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
      closeConfirmModal();
    }
  };

  // Filter daftar karyawan di halaman utama
  const filteredUsers = (data?.userSummaries || []).filter((u) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = u.name.toLowerCase().includes(q);
      const matchDiv = u.divisionName.toLowerCase().includes(q);
      if (!matchName && !matchDiv) return false;
    }
    if (selectedDivision && u.divisionId !== selectedDivision) return false;
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

  const formatDateIndoFull = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      return date.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatMonthIndo = (monthStr: string) => {
    try {
      const [y, m] = monthStr.split('-').map(Number);
      const date = new Date(y, m - 1, 1);
      return date.toLocaleDateString('id-ID', {
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return monthStr;
    }
  };

  const formatSize = (kb: number) => {
    if (kb >= 1024) {
      return `${(kb / 1024).toFixed(1)} MB`;
    }
    return `${kb} KB`;
  };

  // Hitung jumlah hari di bulan terpilih (28, 29, 30, atau 31 hari)
  const getDaysInMonth = (monthStr: string) => {
    if (!monthStr || monthStr === 'all' || !/^\d{4}-\d{2}$/.test(monthStr)) return 0;
    const [y, m] = monthStr.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  };

  // Buat daftar tanggal lengkap (1 s/d 28/30/31) jika opsi "Semua Tanggal Bulan Ini" aktif
  const buildFullMonthDates = () => {
    if (!galleryData || !selectedMonth || selectedMonth === 'all') return galleryData?.dailyRecords || [];
    const totalDays = getDaysInMonth(selectedMonth);
    if (totalDays === 0) return galleryData.dailyRecords;

    const pad = (n: number) => String(n).padStart(2, '0');
    const existingMap = new Map<string, DailyAttendanceRecord>();
    for (const rec of galleryData.dailyRecords) {
      existingMap.set(rec.dateStr, rec);
    }

    const fullList: (DailyAttendanceRecord & { isOffDay?: boolean })[] = [];
    for (let day = totalDays; day >= 1; day--) {
      const dateStr = `${selectedMonth}-${pad(day)}`;
      if (existingMap.has(dateStr)) {
        fullList.push(existingMap.get(dateStr)!);
      } else {
        fullList.push({
          dateStr,
          inRecord: null,
          outRecord: null,
          status: 'in_only',
          isOffDay: true,
        });
      }
    }
    return fullList;
  };

  const countComplete = (galleryData?.dailyRecords || []).filter((r) => r.status === 'complete').length;
  const countInOnly = (galleryData?.dailyRecords || []).filter((r) => r.status === 'in_only').length;
  const countOutOnly = (galleryData?.dailyRecords || []).filter((r) => r.status === 'out_only').length;

  return (
    <div className="max-w-4xl mx-auto px-4 pt-5 pb-28 space-y-4">
      {/* ======================================================== */}
      {/* SUB-HALAMAN: GALERI FOTO MILIK KARYAWAN (IN & OUT SATU TANGGAL) */}
      {/* ======================================================== */}
      {activeGalleryUser ? (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Header Sub-Halaman dengan Profil Karyawan & Tombol Kembali */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button
                type="button"
                onClick={closeUserGallery}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-colors"
              >
                <ArrowLeft size={16} />
                <span>Kembali ke Daftar Tracking</span>
              </button>

              <button
                type="button"
                onClick={() => openUserGallery(activeGalleryUser)}
                disabled={galleryLoading}
                className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors shrink-0 flex items-center gap-1.5 text-xs font-bold"
                title="Segarkan galeri"
              >
                <RefreshCw size={14} className={galleryLoading ? 'animate-spin text-red-600' : ''} />
                <span>Segarkan</span>
              </button>
            </div>

            {/* Profil Karyawan */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-gray-100">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className={`w-12 h-12 rounded-2xl border overflow-hidden flex items-center justify-center font-black text-base shrink-0 shadow-xs ${
                  activeGalleryUser.isDeleted
                    ? 'bg-red-100 border-red-300 text-red-700'
                    : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                }`}>
                  {activeGalleryUser.userAvatar ? (
                    <img src={activeGalleryUser.userAvatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    activeGalleryUser.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-base font-extrabold text-gray-900 truncate">
                      {activeGalleryUser.name}
                    </h1>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 border border-gray-200">
                      {activeGalleryUser.divisionName}
                    </span>
                    {activeGalleryUser.isDeleted ? (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                        <UserX size={11} /> Akun Sudah Dihapus
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {activeGalleryUser.role}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 font-medium mt-1">
                    Total tersimpan: <strong className="text-gray-900">{galleryData?.totalPhotos ?? activeGalleryUser.photoCount} foto</strong> (~{formatSize(activeGalleryUser.approxSizeKb)})
                  </p>
                </div>
              </div>

              {/* Tombol Hapus Semua Foto Karyawan Ini */}
              {(galleryData?.totalPhotos ?? activeGalleryUser.photoCount) > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    openConfirmModal({
                      user: activeGalleryUser,
                      mode: 'photos_only',
                    })
                  }
                  className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <Trash2 size={14} className="text-amber-600" />
                  <span>Hapus Semua Foto</span>
                </button>
              )}
            </div>
          </div>

          {/* Notifikasi Sukses */}
          {actionSuccessMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
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

          {/* TOOLBAR FILTER BULAN & MODE TAMPILAN */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-800">
                <Calendar size={15} className="text-indigo-600" />
                <span>Filter Bulan Presensi:</span>
              </div>

              {selectedMonth && selectedMonth !== 'all' && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleMonthPrevNext(-1)}
                    className="p-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600"
                    title="Bulan sebelumnya"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span className="text-xs font-bold text-indigo-700 px-2">
                    {formatMonthIndo(selectedMonth)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleMonthPrevNext(1)}
                    className="p-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600"
                    title="Bulan berikutnya"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              )}
            </div>

            {/* Kontrol Pilihan Bulan & Toggle Mode */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="relative">
                <select
                  value={selectedMonth}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="all">Semua Bulan (Tampilkan Keseluruhan)</option>
                  {(galleryData?.availableMonths || []).map((mStr) => (
                    <option key={mStr} value={mStr}>
                      Bulan {formatMonthIndo(mStr)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedMonth && selectedMonth !== 'all' && (
                <button
                  type="button"
                  onClick={() => setViewAllDaysOfMonth(!viewAllDaysOfMonth)}
                  className={`w-full px-3 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    viewAllDaysOfMonth
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-xs'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Layers size={14} className={viewAllDaysOfMonth ? 'text-indigo-600' : 'text-gray-400'} />
                  <span>
                    {viewAllDaysOfMonth
                      ? `Tampilkan Semua ${getDaysInMonth(selectedMonth)} Hari Kalender`
                      : 'Hanya Tanggal Berpresensi'}
                  </span>
                </button>
              )}
            </div>

            {/* Ringkasan Status Presensi di Bulan Ini */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-gray-100">
              <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100 text-center">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Hari Hadir</span>
                <span className="text-base font-black text-gray-900">{galleryData?.dailyRecords.length ?? 0}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-center">
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Lengkap (IN & OUT)</span>
                <span className="text-base font-black text-emerald-900">{countComplete}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-300 text-center">
                <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Belum OUT</span>
                <span className="text-base font-black text-amber-900">{countInOnly}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200 text-center">
                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">Hanya OUT</span>
                <span className="text-base font-black text-blue-900">{countOutOnly}</span>
              </div>
            </div>
          </div>

          {/* DAFTAR PRESENSI PER TANGGAL (IN & OUT DIJADIKAN SATU) */}
          {galleryLoading ? (
            <div className="bg-white rounded-3xl border border-gray-100 p-12 flex flex-col items-center justify-center gap-2.5 text-gray-400 shadow-sm">
              <Loader2 size={26} className="animate-spin text-red-600" />
              <span className="text-xs font-semibold text-gray-600">Memuat foto kehadiran...</span>
            </div>
          ) : !galleryData || galleryData.dailyRecords.length === 0 ? (
            <div className="bg-white rounded-3xl border border-gray-100 p-12 text-center shadow-sm">
              <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
                <Camera size={26} className="text-gray-300" />
              </div>
              <p className="text-sm font-bold text-gray-700">Tidak ada foto di periode ini</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                Karyawan ini tidak memiliki foto kehadiran pada bulan yang dipilih.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {(viewAllDaysOfMonth ? buildFullMonthDates() : galleryData.dailyRecords).map((dayItem: any) => {
                if (dayItem.isOffDay) {
                  return (
                    <div
                      key={dayItem.dateStr}
                      className="bg-gray-50/70 rounded-2xl border border-dashed border-gray-200 p-3 flex items-center justify-between text-xs text-gray-400"
                    >
                      <span className="font-semibold">{formatDateIndoFull(dayItem.dateStr)}</span>
                      <span className="text-[11px] font-bold text-gray-400">Tidak Ada Presensi / Libur</span>
                    </div>
                  );
                }

                const hasIn = !!dayItem.inRecord;
                const hasOut = !!dayItem.outRecord;

                return (
                  <div
                    key={dayItem.dateStr}
                    className="bg-white rounded-2xl border border-gray-100 shadow-xs hover:shadow-md transition-shadow overflow-hidden"
                  >
                    {/* Header Tanggal & Status Badge */}
                    <div className="px-4 py-3 bg-gray-50/70 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Calendar size={15} className="text-indigo-600 shrink-0" />
                        <h2 className="text-xs font-black text-gray-900">
                          {formatDateIndoFull(dayItem.dateStr)}
                        </h2>
                      </div>

                      <div>
                        {hasIn && hasOut ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={12} /> Lengkap (IN & OUT)
                          </span>
                        ) : hasIn && !hasOut ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-300">
                            <AlertTriangle size={12} className="text-amber-600" /> Hanya Masuk (Belum OUT)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                            <ArrowUpRight size={12} /> Hanya Pulang
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Body Dua Kolom (Kiri = IN, Kanan = OUT) */}
                    <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      {/* KOLOM KIRI: PRESENSI MASUK (IN) */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-emerald-700 flex items-center gap-1">
                            <ArrowDownRight size={13} /> Foto Masuk (IN)
                          </span>
                          {hasIn && (
                            <span className="text-[10px] font-mono font-extrabold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                              {formatAttendanceTime(dayItem.inRecord.timestamp)} WIB
                            </span>
                          )}
                        </div>

                        {hasIn ? (
                          <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                            <div
                              className="relative aspect-16/10 bg-black cursor-pointer group overflow-hidden"
                              onClick={() => setZoomPhoto(dayItem.inRecord)}
                            >
                              <img
                                src={dayItem.inRecord.photo}
                                alt="Selfie Masuk"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-white text-xs font-bold">
                                <Eye size={14} />
                                <span>Perbesar</span>
                              </div>
                            </div>

                            <div className="p-2 space-y-1 text-xs">
                              <div className="flex items-center gap-1 text-gray-800 font-bold truncate">
                                <MapPin size={12} className="text-red-500 shrink-0" />
                                <span className="truncate">{dayItem.inRecord.outlet || 'Lokasi tidak terdeteksi'}</span>
                              </div>
                              {dayItem.inRecord.distance !== null && (
                                <div className="text-[10px] text-gray-400">
                                  Jarak: {Math.round(dayItem.inRecord.distance)}m
                                </div>
                              )}
                              <div className="pt-1 flex items-center justify-between border-t border-gray-200">
                                {dayItem.inRecord.latitude && dayItem.inRecord.longitude ? (
                                  <a
                                    href={`https://www.google.com/maps?q=${dayItem.inRecord.latitude},${dayItem.inRecord.longitude}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline"
                                  >
                                    <ExternalLink size={11} />
                                    <span>Peta</span>
                                  </a>
                                ) : (
                                  <span className="text-[10px] text-gray-400">-</span>
                                )}

                                <button
                                  type="button"
                                  onClick={() =>
                                    openConfirmModal({
                                      user: activeGalleryUser,
                                      mode: 'single_photo',
                                      singlePhotoId: dayItem.inRecord.id,
                                      singlePhotoDate: dayItem.dateStr,
                                      singlePhotoType: 'Masuk (IN)',
                                    })
                                  }
                                  className="text-[11px] font-bold text-red-600 hover:underline flex items-center gap-1"
                                >
                                  <Trash2 size={11} />
                                  <span>Hapus Foto Ini</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="h-36 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center p-3 text-center text-gray-400">
                            <span className="text-xs font-bold text-gray-500">Tidak Ada Foto Masuk</span>
                            <span className="text-[10px] text-gray-400 mt-0.5">Karyawan tidak foto Clock IN</span>
                          </div>
                        )}
                      </div>

                      {/* KOLOM KANAN: PRESENSI PULANG (OUT) */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-blue-700 flex items-center gap-1">
                            <ArrowUpRight size={13} /> Foto Pulang (OUT)
                          </span>
                          {hasOut && (
                            <span className="text-[10px] font-mono font-extrabold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                              {formatAttendanceTime(dayItem.outRecord.timestamp)} WIB
                            </span>
                          )}
                        </div>

                        {hasOut ? (
                          <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                            <div
                              className="relative aspect-16/10 bg-black cursor-pointer group overflow-hidden"
                              onClick={() => setZoomPhoto(dayItem.outRecord)}
                            >
                              <img
                                src={dayItem.outRecord.photo}
                                alt="Selfie Pulang"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-white text-xs font-bold">
                                <Eye size={14} />
                                <span>Perbesar</span>
                              </div>
                            </div>

                            <div className="p-2 space-y-1 text-xs">
                              <div className="flex items-center gap-1 text-gray-800 font-bold truncate">
                                <MapPin size={12} className="text-red-500 shrink-0" />
                                <span className="truncate">{dayItem.outRecord.outlet || 'Lokasi tidak terdeteksi'}</span>
                              </div>
                              {dayItem.outRecord.distance !== null && (
                                <div className="text-[10px] text-gray-400">
                                  Jarak: {Math.round(dayItem.outRecord.distance)}m
                                </div>
                              )}
                              <div className="pt-1 flex items-center justify-between border-t border-gray-200">
                                {dayItem.outRecord.latitude && dayItem.outRecord.longitude ? (
                                  <a
                                    href={`https://www.google.com/maps?q=${dayItem.outRecord.latitude},${dayItem.outRecord.longitude}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline"
                                  >
                                    <ExternalLink size={11} />
                                    <span>Peta</span>
                                  </a>
                                ) : (
                                  <span className="text-[10px] text-gray-400">-</span>
                                )}

                                <button
                                  type="button"
                                  onClick={() =>
                                    openConfirmModal({
                                      user: activeGalleryUser,
                                      mode: 'single_photo',
                                      singlePhotoId: dayItem.outRecord.id,
                                      singlePhotoDate: dayItem.dateStr,
                                      singlePhotoType: 'Pulang (OUT)',
                                    })
                                  }
                                  className="text-[11px] font-bold text-red-600 hover:underline flex items-center gap-1"
                                >
                                  <Trash2 size={11} />
                                  <span>Hapus Foto Ini</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="h-36 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50 flex flex-col items-center justify-center p-3 text-center">
                            <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mb-1">
                              <AlertTriangle size={15} />
                            </div>
                            <span className="text-xs font-black text-amber-900">Belum Ada Foto Pulang</span>
                            <span className="text-[10px] text-amber-700 font-medium mt-0.5">
                              Hanya melakukan presensi Masuk
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tombol Kembali di Bawah */}
          <div className="pt-3 text-center">
            <button
              type="button"
              onClick={closeUserGallery}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-bold transition-colors shadow-xs"
            >
              <ArrowLeft size={16} />
              <span>Kembali ke Daftar Tracking Karyawan</span>
            </button>
          </div>
        </div>
      ) : (
        /* ======================================================== */
        /* HALAMAN UTAMA: TRACKING & PEMBERSIHAN FOTO KEHADIRAN */
        /* ======================================================== */
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Header Banner Utama */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="h-2 bg-red-600 w-full" />
            <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                  <Trash2 size={22} />
                </div>
                <div className="min-w-0">
                  <h1 className="text-base font-extrabold text-gray-900 leading-tight">
                    Hapus & Pembersihan Foto
                  </h1>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                    Tracking foto kehadiran per nama karyawan dan deteksi akun terhapus.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={fetchSummary}
                disabled={loading}
                className="p-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors shrink-0 flex items-center gap-1.5 text-xs font-bold"
                title="Segarkan data"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin text-red-600' : ''} />
                <span className="hidden sm:inline">Segarkan</span>
              </button>
            </div>
          </div>

          {/* Notifikasi Aksi Berhasil */}
          {actionSuccessMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
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

          {/* 4 KARTU STATISTIK PENYIMPANAN — Simetris Grid 2x2 di Mobile, 4 Kolom di Layar Lebar */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="bg-white rounded-2xl border border-gray-100 p-3.5 shadow-xs flex flex-col justify-between min-h-[82px]">
              <div className="flex items-center justify-between text-gray-400">
                <span className="text-[10px] font-bold uppercase tracking-wider">Total Foto</span>
                <Camera size={14} className="text-rose-500" />
              </div>
              <div className="mt-1">
                <span className="text-xl font-black text-gray-900">{data?.grandTotalPhotos ?? 0}</span>
                <span className="text-xs font-bold text-gray-400 ml-1">foto</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-3.5 shadow-xs flex flex-col justify-between min-h-[82px]">
              <div className="flex items-center justify-between text-gray-400">
                <span className="text-[10px] font-bold uppercase tracking-wider">Kapasitas</span>
                <HardDrive size={14} className="text-indigo-500" />
              </div>
              <div className="mt-1">
                <span className="text-xl font-black text-indigo-700">~{data?.grandApproxSizeMb ?? 0}</span>
                <span className="text-xs font-bold text-gray-400 ml-1">MB</span>
              </div>
            </div>

            <div className={`rounded-2xl border p-3.5 shadow-xs flex flex-col justify-between min-h-[82px] transition-colors ${
              (data?.deletedAccountsWithPhotos?.length || 0) > 0
                ? 'bg-amber-50/80 border-amber-300'
                : 'bg-white border-gray-100'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 truncate">
                  Akun Dihapus
                </span>
                <UserX size={14} className="text-amber-600 shrink-0" />
              </div>
              <div className="mt-1">
                <span className="text-xl font-black text-amber-900">
                  {data?.deletedAccountsWithPhotos?.length ?? 0}
                </span>
                <span className="text-xs font-bold text-amber-700 ml-1">akun</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-3.5 shadow-xs flex flex-col justify-between min-h-[82px]">
              <div className="flex items-center justify-between text-gray-400">
                <span className="text-[10px] font-bold uppercase tracking-wider">Karyawan</span>
                <Users size={14} className="text-blue-500" />
              </div>
              <div className="mt-1">
                <span className="text-xl font-black text-gray-900">{data?.userSummaries?.length ?? 0}</span>
                <span className="text-xs font-bold text-gray-400 ml-1">orang</span>
              </div>
            </div>
          </div>

          {/* PERINGATAN KHUSUS: DETEKSI AKUN TERHAPUS */}
          {data && data.deletedAccountsWithPhotos && data.deletedAccountsWithPhotos.length > 0 && (
            <div className="bg-amber-50/80 border-2 border-amber-300 rounded-3xl p-4 sm:p-5 space-y-3.5 shadow-sm">
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
                      Sistem mendeteksi ada akun yang telah dihapus dari <strong>Kontrol Akun</strong>, tetapi file fotonya belum dibersihkan dari database.
                    </p>
                  </div>
                </div>

                {data.deletedAccountsWithPhotos.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      openConfirmModal({
                        user: null,
                        mode: 'purge_all',
                        isBulkDeleted: true,
                      })
                    }
                    className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold rounded-xl transition-colors shadow-xs flex items-center gap-1.5"
                  >
                    <FolderX size={14} />
                    <span>Hapus Semua Foto ({data.deletedAccountsWithPhotos.length} Akun)</span>
                  </button>
                )}
              </div>

              {/* Rincian Akun Terhapus */}
              <div className="space-y-2">
                {data.deletedAccountsWithPhotos.map((delUser) => (
                  <div
                    key={delUser.userId}
                    className="bg-white rounded-2xl border border-amber-200 p-3 flex items-center justify-between gap-3 flex-wrap shadow-2xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 font-black text-xs shrink-0">
                        <UserX size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-extrabold text-gray-900 truncate">
                            {delUser.name}
                          </h3>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200">
                            Akun Sudah Dihapus
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">
                            {delUser.divisionName}
                          </span>
                        </div>
                        <p className="text-xs text-amber-900 font-semibold mt-0.5">
                          Atas nama <strong>{delUser.name}</strong>, akunnya sudah dihapus fotonya belum ({delUser.photoCount} foto, ~{formatSize(delUser.approxSizeKb)}). Apakah ingin hapus semua fotonya?
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openUserGallery(delUser)}
                        className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-colors flex items-center gap-1"
                      >
                        <Eye size={13} />
                        <span>Lihat Foto</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          openConfirmModal({
                            user: delUser,
                            mode: 'purge_all',
                          })
                        }
                        className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors flex items-center gap-1 shadow-xs"
                      >
                        <Trash2 size={13} />
                        <span>Hapus Semua</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TOOLBAR PENCARIAN & FILTER — Tata Letak Rapi & Simetris */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-gray-800">
              <span className="flex items-center gap-1.5">
                <Search size={14} className="text-gray-400" />
                <span>Tracking Foto Berdasarkan Nama Karyawan</span>
              </span>
              <span className="text-[11px] font-bold text-gray-400">
                {filteredUsers.length} dari {data?.userSummaries?.length || 0}
              </span>
            </div>

            {/* Input Pencarian Full-Width */}
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ketik nama karyawan untuk tracking foto..."
                className="w-full pl-9 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* 2 Dropdown Simetris Sejajar (50% - 50%) */}
            <div className="grid grid-cols-2 gap-2.5">
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

              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
                >
                  <option value="all">Semua Status</option>
                  <option value="active_only">Hanya Akun Aktif</option>
                  <option value="deleted_only">Hanya Akun Dihapus</option>
                </select>
              </div>
            </div>
          </div>

          {/* DAFTAR KARYAWAN — Kartu Simetris dan Rapi */}
          {loading ? (
            <div className="bg-white rounded-3xl border border-gray-100 p-12 flex flex-col items-center justify-center gap-2.5 text-gray-400 shadow-sm">
              <Loader2 size={26} className="animate-spin text-red-600" />
              <span className="text-xs font-semibold text-gray-600">Memuat data foto seluruh karyawan...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="bg-white rounded-3xl border border-gray-100 p-12 text-center shadow-sm">
              <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
                <Camera size={26} className="text-gray-300" />
              </div>
              <p className="text-sm font-bold text-gray-700">Karyawan tidak ditemukan</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                Tidak ada nama karyawan yang cocok dengan pencarian atau filter yang dipilih.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((item) => {
                const hasPhotos = item.photoCount > 0;

                return (
                  <div
                    key={item.userId}
                    className={`bg-white rounded-2xl border p-4 space-y-3 shadow-xs hover:shadow-md transition-all ${
                      item.isDeleted ? 'border-red-200 bg-red-50/15' : 'border-gray-100'
                    }`}
                  >
                    {/* Header Kartu: Profil & Badge */}
                    <div className="flex items-start gap-3">
                      <div className={`w-11 h-11 rounded-2xl border overflow-hidden flex items-center justify-center font-black text-sm shrink-0 ${
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

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-extrabold text-gray-900 truncate">
                            {item.name}
                          </h3>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 border border-gray-200">
                            {item.divisionName}
                          </span>
                          {item.isDeleted ? (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                              <UserX size={11} /> Akun Dihapus
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {item.role}
                            </span>
                          )}
                        </div>

                        {/* Baris Badge Info Rapi & Tidak Berantakan */}
                        <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 mt-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-bold border border-rose-100 text-[11px]">
                            <Camera size={12} />
                            <span>{item.photoCount} Foto</span>
                          </span>

                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 text-[11px]">
                            <HardDrive size={12} />
                            <span>~{formatSize(item.approxSizeKb)}</span>
                          </span>

                          {item.latestDate && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-[11px]">
                              <Clock size={11} />
                              <span>{formatDateShort(item.latestDate)}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Tombol Aksi Simetris */}
                    <div className="pt-2 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => openUserGallery(item)}
                        className="col-span-2 sm:col-span-1 py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border border-indigo-100"
                      >
                        <Eye size={14} />
                        <span>Lihat Galeri Foto</span>
                      </button>

                      <button
                        type="button"
                        disabled={!hasPhotos}
                        onClick={() =>
                          openConfirmModal({
                            user: item,
                            mode: 'photos_only',
                          })
                        }
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border ${
                          hasPhotos
                            ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                            : 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                        }`}
                      >
                        <Trash2 size={13} className={hasPhotos ? 'text-amber-600' : 'text-gray-300'} />
                        <span>Hapus Foto Saja</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          openConfirmModal({
                            user: item,
                            mode: 'purge_all',
                          })
                        }
                        className="py-2 px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                      >
                        <FolderX size={13} className="text-red-600" />
                        <span>{item.isDeleted ? 'Hapus Permanen' : 'Hapus Data'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL ZOOM PREVIEW FOTO RESOLUSI PENUH */}
      {/* ======================================================== */}
      {zoomPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setZoomPhoto(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-2 bg-gray-50/50">
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-gray-900 truncate">
                  Presensi {zoomPhoto.type === 'in' ? 'Masuk (Clock IN)' : 'Pulang (Clock OUT)'}
                </h3>
                <p className="text-[11px] text-gray-500">
                  {formatAttendanceTime(zoomPhoto.timestamp)} WIB
                </p>
              </div>

              <button
                type="button"
                onClick={() => setZoomPhoto(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-200 text-gray-600 flex items-center justify-center transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-black flex items-center justify-center overflow-auto max-h-[55vh] p-2">
              <img
                src={zoomPhoto.photo}
                alt="Foto Selfie Presensi"
                className="max-h-full max-w-full object-contain rounded-lg"
              />
            </div>

            <div className="p-4 bg-gray-50/80 border-t border-gray-100 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-gray-800 font-bold">
                <MapPin size={14} className="text-red-500 shrink-0" />
                <span>{zoomPhoto.outlet || 'Lokasi tidak terdeteksi'}</span>
              </div>
              {zoomPhoto.latitude && zoomPhoto.longitude && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-gray-500 font-mono">
                    {zoomPhoto.latitude.toFixed(6)}, {zoomPhoto.longitude.toFixed(6)}
                  </span>
                  <a
                    href={`https://www.google.com/maps?q=${zoomPhoto.latitude},${zoomPhoto.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline"
                  >
                    <ExternalLink size={12} />
                    <span>Buka Google Maps</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* POPUP WARNING EDUKATIF: RINCIAN DAMPAK & PENGAMAN ANTI SALAH KLIK */}
      {/* ========================================================================= */}
      {confirmModal.isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={closeConfirmModal}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal Berdasarkan Tipe Aksi */}
            {confirmModal.mode === 'photos_only' ? (
              /* KASUS 1: HAPUS FOTO SAJA (AMBER/WARNING AMAN) */
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 shadow-xs">
                  <Camera size={24} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md inline-block mb-1">
                    Mode Hemat Memori
                  </span>
                  <h3 className="text-base font-extrabold text-gray-900 leading-tight">
                    Konfirmasi: Hapus File Foto Saja
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Tindakan ini hanya membersihkan file foto selfie untuk mengosongkan ruang database.
                  </p>
                </div>
              </div>
            ) : confirmModal.mode === 'single_photo' ? (
              /* KASUS 2: HAPUS 1 FOTO TERTENTU */
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 shadow-xs">
                  <Trash2 size={24} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md inline-block mb-1">
                    Hapus 1 Foto Presensi
                  </span>
                  <h3 className="text-base font-extrabold text-gray-900 leading-tight">
                    Hapus Foto {confirmModal.singlePhotoType || ''}?
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    File foto selfie tanggal {confirmModal.singlePhotoDate ? formatDateIndoFull(confirmModal.singlePhotoDate) : ''} akan dikosongkan.
                  </p>
                </div>
              </div>
            ) : (
              /* KASUS 3: HAPUS DATA / PERMANEN (MERAH / BAHAYA KRITIS) */
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 ring-4 ring-red-50 animate-pulse">
                  <ShieldAlert size={26} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-red-700 bg-red-100 px-2 py-0.5 rounded-md inline-block mb-1">
                    Peringatan Kritis
                  </span>
                  <h3 className="text-base font-extrabold text-red-700 leading-tight">
                    🚨 PERINGATAN: Hapus Seluruh Data Presensi!
                  </h3>
                  <p className="text-xs text-gray-600 mt-1">
                    Tindakan ini bersifat permanen dan <strong className="text-red-700 underline">TIDAK DAPAT DIBATALKAN</strong>.
                  </p>
                </div>
              </div>
            )}

            {/* Kotak Identitas Target Karyawan */}
            {confirmModal.user && (
              <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100 text-xs space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-medium">Nama Karyawan:</span>
                  <span className="font-extrabold text-gray-900">{confirmModal.user.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-medium">Divisi:</span>
                  <span className="font-bold text-gray-800">{confirmModal.user.divisionName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-medium">Status Akun:</span>
                  <span className={`font-bold ${confirmModal.user.isDeleted ? 'text-red-600' : 'text-emerald-700'}`}>
                    {confirmModal.user.isDeleted ? 'Akun Sudah Dihapus' : 'Akun Aktif'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-medium">Jumlah Foto Terkait:</span>
                  <span className="font-extrabold text-rose-600">{confirmModal.user.photoCount} Foto (~{formatSize(confirmModal.user.approxSizeKb)})</span>
                </div>
              </div>
            )}

            {/* RINCIAN DAMPAK: APA YANG DIHAPUS vs APA YANG TETAP AMAN */}
            {confirmModal.mode === 'photos_only' ? (
              <div className="space-y-2.5">
                {/* Yang Dihapus */}
                <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs space-y-1">
                  <div className="font-extrabold text-amber-900 flex items-center gap-1.5">
                    <Trash2 size={13} className="text-amber-700" />
                    <span>Yang Akan Dihapus:</span>
                  </div>
                  <p className="text-amber-800 leading-relaxed text-[11px]">
                    Semua file foto selfie presensi ({confirmModal.user?.photoCount} foto) akan dikosongkan dari database Supabase.
                  </p>
                </div>

                {/* Yang Tetap Aman */}
                <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-xs space-y-1.5">
                  <div className="font-extrabold text-emerald-900 flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-emerald-700" />
                    <span>Yang Tetap Aman (Tidak Terhapus):</span>
                  </div>
                  <ul className="text-emerald-800 text-[11px] space-y-0.5 list-disc list-inside">
                    <li>Catatan jam masuk (Clock IN) & jam pulang (Clock OUT) tetap utuh.</li>
                    <li>Tanggal kehadiran, nama outlet, dan koordinat GPS tetap tercatat.</li>
                    <li>Laporan Rekap Telat, Rekap Harian & Rekap Bulanan <strong>100% AMAN</strong>.</li>
                  </ul>
                </div>

                {/* Hasil Positif */}
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-100 text-[11px] text-indigo-900 font-semibold">
                  <Info size={14} className="text-indigo-600 shrink-0" />
                  <span>Hasil: Kapasitas database Supabase langsung lega tanpa mengorbankan riwayat absensi.</span>
                </div>
              </div>
            ) : confirmModal.mode === 'single_photo' ? (
              <div className="space-y-2 text-xs">
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1">
                  <div className="font-extrabold text-emerald-900 flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-emerald-700" />
                    <span>Catatan Absensi Tetap Aman:</span>
                  </div>
                  <p className="text-emerald-800 text-[11px] leading-relaxed">
                    Hanya file gambar/foto selfie ini yang dikosongkan. Jam presensi, lokasi outlet, dan tanggal kehadiran tetap tersimpan di riwayat.
                  </p>
                </div>
              </div>
            ) : (
              /* DAMPAK FATAL UNTUK PURGE ALL (HAPUS DATA) */
              <div className="space-y-2.5">
                <div className="p-3.5 rounded-2xl bg-red-50 border-2 border-red-300 text-xs space-y-2">
                  <div className="font-black text-red-900 flex items-center gap-1.5 uppercase tracking-wide">
                    <AlertTriangle size={15} className="text-red-600" />
                    <span>Dampak Fatal Penghapusan Data:</span>
                  </div>
                  <ul className="text-red-800 text-[11px] space-y-1 list-disc list-inside leading-relaxed">
                    <li>Seluruh catatan absensi (jam masuk, jam pulang, tanggal, outlet, koordinat GPS) akan <strong>DIHAPUS PERMANEN</strong>.</li>
                    <li>Seluruh file foto presensi akan terhapus.</li>
                    <li>Karyawan ini <strong>TIDAK AKAN MUNCUL LAGI</strong> pada laporan presensi maupun riwayat apapun di sistem.</li>
                    {confirmModal.user?.isDeleted ? (
                      <li>Sisa data akun juga akan dibersihkan tuntas dari database.</li>
                    ) : (
                      <li className="font-bold">Tips: Jika hanya ingin menghemat memori, batalkan dan pilih "Hapus Foto Saja".</li>
                    )}
                  </ul>
                </div>

                {/* Checkbox Konfirmasi Anti Salah Klik */}
                <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-gray-50 hover:bg-gray-100 border border-gray-200 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={confirmAcknowledge}
                    onChange={(e) => setConfirmAcknowledge(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-red-600 focus:ring-red-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-gray-800 select-none">
                    Saya paham dampaknya dan sadar bahwa data kehadiran ini akan hilang selamanya.
                  </span>
                </label>
              </div>
            )}

            {/* Tombol Aksi Konfirmasi & Batal */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={actionLoading}
                onClick={closeConfirmModal}
                className="flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-colors"
              >
                Batal (Jangan Hapus)
              </button>

              <button
                type="button"
                disabled={actionLoading || (confirmModal.mode === 'purge_all' && !confirmAcknowledge)}
                onClick={handleConfirmExecute}
                className={`flex-1 py-3 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-sm ${
                  confirmModal.mode === 'photos_only'
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : confirmModal.mode === 'single_photo'
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-red-600 hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white'
                }`}
              >
                {actionLoading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : confirmModal.mode === 'photos_only' ? (
                  <>
                    <Camera size={14} />
                    <span>Ya, Hapus File Foto Saja</span>
                  </>
                ) : confirmModal.mode === 'single_photo' ? (
                  <>
                    <Trash2 size={14} />
                    <span>Ya, Hapus Foto Ini</span>
                  </>
                ) : (
                  <>
                    <FolderX size={14} />
                    <span>Hapus Seluruh Data</span>
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
