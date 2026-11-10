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
  Navigation,
  ArrowDownRight,
  ArrowUpRight
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

type UserSinglePhoto = {
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

type UserGalleryData = {
  user: {
    id: string;
    name: string;
    role: string;
    isDeleted: boolean;
    userAvatar: string | null;
    divisionName: string;
  };
  totalPhotos: number;
  items: UserSinglePhoto[];
};

type ConfirmModalState = {
  isOpen: boolean;
  user: UserPhotoSummary | null;
  mode: 'photos_only' | 'purge_all' | 'single_photo';
  singlePhotoId?: string;
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

  // Sub-halaman: Galeri foto milik 1 karyawan tertentu
  const [activeGalleryUser, setActiveGalleryUser] = useState<UserPhotoSummary | null>(null);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryData, setGalleryData] = useState<UserGalleryData | null>(null);
  const [zoomPhoto, setZoomPhoto] = useState<UserSinglePhoto | null>(null);

  // Modal konfirmasi aksi
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    user: null,
    mode: 'photos_only',
    isBulkDeleted: false,
  });

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

  // Fetch foto seluruhnya milik 1 karyawan saat sub-halaman dibuka
  const openUserGallery = async (targetUser: UserPhotoSummary) => {
    setActiveGalleryUser(targetUser);
    setGalleryLoading(true);
    setGalleryData(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const res = await fetch(`/api/attendance/photos/user/${targetUser.userId}`);
      const json = await res.json();
      if (json.success) {
        setGalleryData(json);
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

  const closeUserGallery = () => {
    setActiveGalleryUser(null);
    setGalleryData(null);
    setZoomPhoto(null);
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
        // Hapus 1 foto tertentu
        const res = await fetch(`/api/attendance/record/${confirmModal.singlePhotoId}/photo`, {
          method: 'DELETE',
        });
        const resJson = await res.json();
        if (resJson.success) {
          setActionSuccessMessage('Foto presensi berhasil dihapus.');
          if (activeGalleryUser) {
            // refresh data galeri sub-halaman
            openUserGallery(activeGalleryUser);
          }
        } else {
          alert(resJson.error || 'Gagal menghapus foto.');
        }
      } else if (confirmModal.isBulkDeleted) {
        // Bulk delete seluruh akun terhapus
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
        // Hapus foto 1 karyawan (photos_only atau purge_all)
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
      setConfirmModal({ isOpen: false, user: null, mode: 'photos_only', isBulkDeleted: false });
    }
  };

  // Filter daftar karyawan
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

  const formatDateIndoFull = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
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
      {/* ======================================================== */}
      {/* JIKA SUB-HALAMAN GALERI FOTO KARYAWAN AKTIF */}
      {/* ======================================================== */}
      {activeGalleryUser ? (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Header Sub-Halaman dengan Tombol Kembali */}
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

            {/* Profil Karyawan Terpilih */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-gray-100">
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

              {/* Tombol Cepat Hapus Semua Foto Karyawan Ini */}
              {(galleryData?.totalPhotos ?? activeGalleryUser.photoCount) > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmModal({
                        isOpen: true,
                        user: activeGalleryUser,
                        mode: 'photos_only',
                      })
                    }
                    className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <Trash2 size={14} className="text-amber-600" />
                    <span>Hapus Semua Foto</span>
                  </button>
                </div>
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

          {/* Galeri Grid Foto Karyawan */}
          {galleryLoading ? (
            <div className="bg-white rounded-3xl border border-gray-100 p-12 flex flex-col items-center justify-center gap-2.5 text-gray-400 shadow-sm">
              <Loader2 size={26} className="animate-spin text-red-600" />
              <span className="text-xs font-semibold text-gray-600">Memuat seluruh foto kehadiran...</span>
            </div>
          ) : !galleryData || galleryData.items.length === 0 ? (
            <div className="bg-white rounded-3xl border border-gray-100 p-12 text-center shadow-sm">
              <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
                <Camera size={26} className="text-gray-300" />
              </div>
              <p className="text-sm font-bold text-gray-700">Tidak ada foto presensi tersimpan</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                Karyawan ini belum memiliki foto kehadiran atau fotonya sudah dibersihkan.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {galleryData.items.map((photoItem) => {
                const isIn = photoItem.type === 'in';

                return (
                  <div
                    key={photoItem.id}
                    className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-xs hover:shadow-md transition-shadow flex flex-col"
                  >
                    {/* Thumbnail Foto */}
                    <div
                      className="relative aspect-4/3 bg-black cursor-pointer group overflow-hidden"
                      onClick={() => setZoomPhoto(photoItem)}
                    >
                      <img
                        src={photoItem.photo}
                        alt={`Presensi ${activeGalleryUser.name}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-bold">
                        <Eye size={16} />
                        <span>Perbesar Foto</span>
                      </div>

                      {/* Badge Tipe Masuk / Pulang di atas foto */}
                      <div className="absolute top-2.5 left-2.5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black shadow-xs ${
                          isIn
                            ? 'bg-emerald-600 text-white'
                            : 'bg-blue-600 text-white'
                        }`}>
                          {isIn ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                          <span>{isIn ? 'Masuk (IN)' : 'Pulang (OUT)'}</span>
                        </span>
                      </div>

                      {/* Jam WIB */}
                      <div className="absolute top-2.5 right-2.5">
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-extrabold bg-black/70 text-white backdrop-blur-xs">
                          {formatAttendanceTime(photoItem.timestamp)} WIB
                        </span>
                      </div>
                    </div>

                    {/* Detail & Tombol Hapus */}
                    <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
                      <div className="space-y-1">
                        <p className="text-xs font-extrabold text-gray-900 truncate">
                          {formatDateIndoFull(photoItem.timestamp)}
                        </p>
                        <div className="flex items-center gap-1 text-[11px] text-gray-600 truncate">
                          <MapPin size={12} className="text-red-500 shrink-0" />
                          <span className="truncate">{photoItem.outlet || 'Lokasi tidak terdeteksi'}</span>
                        </div>
                        {photoItem.distance !== null && (
                          <div className="flex items-center gap-1 text-[10px] text-gray-400">
                            <Navigation size={10} className="shrink-0" />
                            <span>Jarak: {Math.round(photoItem.distance)}m</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
                        {photoItem.latitude && photoItem.longitude ? (
                          <a
                            href={`https://www.google.com/maps?q=${photoItem.latitude},${photoItem.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline"
                          >
                            <ExternalLink size={11} />
                            <span>Peta</span>
                          </a>
                        ) : (
                          <span className="text-[10px] text-gray-400">Peta tidak tersedia</span>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            setConfirmModal({
                              isOpen: true,
                              user: activeGalleryUser,
                              mode: 'single_photo',
                              singlePhotoId: photoItem.id,
                            })
                          }
                          className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-[11px] font-bold transition-colors flex items-center gap-1"
                          title="Hapus foto ini saja"
                        >
                          <Trash2 size={12} />
                          <span>Hapus</span>
                        </button>
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
            {/* Kartu 1: Total Foto */}
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

            {/* Kartu 2: Estimasi Kapasitas */}
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

            {/* Kartu 3: Akun Dihapus Masih Ada Foto */}
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

            {/* Kartu 4: Total Karyawan */}
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
                      setConfirmModal({
                        isOpen: true,
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
                          setConfirmModal({
                            isOpen: true,
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
                      {/* Tombol 1: Buka Galeri Sub-Halaman */}
                      <button
                        type="button"
                        onClick={() => openUserGallery(item)}
                        className="col-span-2 sm:col-span-1 py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border border-indigo-100"
                      >
                        <Eye size={14} />
                        <span>Lihat Galeri Foto</span>
                      </button>

                      {/* Tombol 2: Hapus Foto Saja */}
                      <button
                        type="button"
                        disabled={!hasPhotos}
                        onClick={() =>
                          setConfirmModal({
                            isOpen: true,
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

                      {/* Tombol 3: Hapus Seluruh Data */}
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmModal({
                            isOpen: true,
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
                  {formatDateIndoFull(zoomPhoto.timestamp)}
                </h3>
                <p className="text-[11px] text-gray-500">
                  Presensi {zoomPhoto.type === 'in' ? 'Masuk (Clock IN)' : 'Pulang (Clock OUT)'} • {formatAttendanceTime(zoomPhoto.timestamp)} WIB
                </p>
              </div>

              <button
                type="button"
                onClick={() => setZoomPhoto(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors shrink-0"
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

      {/* ======================================================== */}
      {/* MODAL KONFIRMASI AMAN UNTUK PENGHAPUSAN */}
      {/* ======================================================== */}
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
                  {confirmModal.mode === 'single_photo'
                    ? 'Hapus Foto Presensi Ini?'
                    : confirmModal.isBulkDeleted
                    ? 'Bersihkan Semua Akun Terhapus?'
                    : confirmModal.mode === 'photos_only'
                    ? `Hapus Foto Saja: ${confirmModal.user?.name}`
                    : `Hapus Permanen: ${confirmModal.user?.name}`}
                </h3>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  {confirmModal.mode === 'single_photo'
                    ? 'File foto selfie ini akan dikosongkan. Catatan jam, tanggal, dan koordinat presensi tetap tersimpan aman.'
                    : confirmModal.isBulkDeleted
                    ? 'Tindakan ini akan menghapus semua file foto presensi dari seluruh akun yang sudah dinonaktifkan/dihapus.'
                    : confirmModal.mode === 'photos_only'
                    ? 'File foto selfie presensi akan dikosongkan untuk menghemat database Supabase. Riwayat jam, tanggal, outlet, dan rekap bulanan tetap aman.'
                    : 'Seluruh riwayat presensi, koordinat, dan foto karyawan ini akan dihapus permanen dari sistem.'}
                </p>
              </div>
            </div>

            {/* Rincian yang akan dihapus */}
            {!confirmModal.isBulkDeleted && confirmModal.user && confirmModal.mode !== 'single_photo' && (
              <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100 text-xs space-y-1.5">
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

            {/* Tombol Konfirmasi */}
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
