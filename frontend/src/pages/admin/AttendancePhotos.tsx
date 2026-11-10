import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Camera,
  Calendar,
  MapPin,
  Clock,
  Search,
  RefreshCw,
  Eye,
  X,
  User,
  ArrowDownRight,
  ArrowUpRight,
  Loader2,
  Navigation,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';
import { formatAttendanceTime } from '../../utils/timeFormat';

type AttendanceRecordDetail = {
  id: string;
  timestamp: string;
  photo: string;
  outlet: string | null;
  latitude: number | null;
  longitude: number | null;
  distance: number | null;
  accuracy: number | null;
};

type GroupedUserAttendance = {
  userId: string;
  userName: string;
  userRole: string;
  userAvatar: string | null;
  divisionName: string;
  inRecord: AttendanceRecordDetail | null;
  outRecord: AttendanceRecordDetail | null;
};

type PreviewModalData = {
  photo: string;
  userName: string;
  type: 'in' | 'out';
  timestamp: string;
  outlet: string | null;
  latitude: number | null;
  longitude: number | null;
  distance: number | null;
  divisionName: string;
};

const AttendancePhotos = () => {
  const { user } = useAuth();
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';

  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_only' | 'complete' | 'out_only'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [divisions, setDivisions] = useState<{ id: string; name: string }[]>([]);

  const [items, setItems] = useState<GroupedUserAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewData, setPreviewData] = useState<PreviewModalData | null>(null);

  // Fetch list of divisions
  useEffect(() => {
    fetch('/api/divisions')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setDivisions(d.divisions || []);
      })
      .catch(console.error);
  }, []);

  // Fetch attendance photos grouped by user
  const fetchPhotos = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedDate) params.append('date', selectedDate);
      if (selectedDivision) params.append('divisionId', selectedDivision);
      if (statusFilter !== 'all') params.append('statusFilter', statusFilter);
      if (searchQuery.trim()) params.append('q', searchQuery.trim());

      const res = await fetch(`/api/attendance/photos?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Error fetching attendance photos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchPhotos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, selectedDate, selectedDivision, statusFilter]);

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPhotos();
  };

  // Hitung jumlah tiap kategori
  const countComplete = items.filter((it) => it.inRecord && it.outRecord).length;
  const countInOnly = items.filter((it) => it.inRecord && !it.outRecord).length;
  const countOutOnly = items.filter((it) => !it.inRecord && it.outRecord).length;

  const formatDateIndo = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 pt-5 pb-28 space-y-4">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-2 bg-indigo-600 w-full" />
        <div className="p-5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Camera size={22} />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-gray-900">Foto Kehadiran Karyawan</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Foto presensi Masuk & Pulang disatukan per karyawan agar terlihat jelas siapa yang belum foto keluar.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchPhotos}
            disabled={loading}
            className="p-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors shrink-0 flex items-center gap-1.5 text-xs font-bold"
            title="Muat ulang foto"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin text-indigo-600' : ''} />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* Ringkasan Status Kehadiran (Kartu Interaktif) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`p-3 rounded-2xl border text-center transition-all ${
            statusFilter === 'all'
              ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-xs'
              : 'bg-white border-gray-100 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Karyawan</span>
          <span className="text-lg font-black">{items.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('in_only')}
          className={`p-3 rounded-2xl border text-center transition-all ${
            statusFilter === 'in_only'
              ? 'bg-amber-100/80 border-amber-400 text-amber-900 shadow-xs'
              : 'bg-amber-50/60 border-amber-200 text-amber-800 hover:bg-amber-100/50'
          }`}
        >
          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block flex items-center justify-center gap-1">
            <AlertTriangle size={12} className="text-amber-600" /> Belum OUT
          </span>
          <span className="text-lg font-black text-amber-900">{countInOnly}</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('complete')}
          className={`p-3 rounded-2xl border text-center transition-all ${
            statusFilter === 'complete'
              ? 'bg-emerald-100/80 border-emerald-400 text-emerald-900 shadow-xs'
              : 'bg-emerald-50/60 border-emerald-200 text-emerald-800 hover:bg-emerald-100/50'
          }`}
        >
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block flex items-center justify-center gap-1">
            <CheckCircle2 size={12} className="text-emerald-600" /> Lengkap IN & OUT
          </span>
          <span className="text-lg font-black text-emerald-900">{countComplete}</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('out_only')}
          className={`p-3 rounded-2xl border text-center transition-all ${
            statusFilter === 'out_only'
              ? 'bg-blue-100/80 border-blue-400 text-blue-900 shadow-xs'
              : 'bg-blue-50/60 border-blue-200 text-blue-800 hover:bg-blue-100/50'
          }`}
        >
          <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block flex items-center justify-center gap-1">
            <ArrowUpRight size={12} className="text-blue-600" /> Hanya OUT
          </span>
          <span className="text-lg font-black text-blue-900">{countOutOnly}</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* 1. Pilih Tanggal */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
              Tanggal Presensi
            </label>
            <div className="relative">
              <Calendar
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* 2. Pilih Divisi */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
              Divisi
            </label>
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="">Semua Divisi</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 3. Pencarian Nama */}
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama karyawan..."
            className="w-full pl-9 pr-20 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors"
          >
            Cari
          </button>
        </form>

        {selectedDate && (
          <p className="text-[11px] text-indigo-600 font-semibold px-1">
            Data Tanggal: <span className="underline">{formatDateIndo(selectedDate)}</span>
          </p>
        )}
      </div>

      {/* Daftar Karyawan: Foto IN dan OUT dijadikan 1 Kartu */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 flex flex-col items-center justify-center gap-2 text-gray-400 shadow-sm">
          <Loader2 size={26} className="animate-spin text-indigo-600" />
          <span className="text-xs font-semibold text-gray-600">Memuat foto kehadiran karyawan...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
            <Camera size={26} className="text-gray-300" />
          </div>
          <p className="text-sm font-bold text-gray-700">Tidak ada data foto presensi</p>
          <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
            Belum ada foto presensi yang terekam pada tanggal atau filter yang dipilih.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const hasIn = !!item.inRecord;
            const hasOut = !!item.outRecord;

            return (
              <div
                key={item.userId}
                className="bg-white rounded-2xl border border-gray-100 shadow-xs hover:shadow-md transition-shadow overflow-hidden"
              >
                {/* Header Kartu Karyawan */}
                <div className="px-4 py-3 bg-gray-50/60 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-indigo-100 border border-indigo-200 overflow-hidden flex items-center justify-center shrink-0 text-indigo-700 font-extrabold text-xs">
                      {item.userAvatar ? (
                        <img src={item.userAvatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        item.userName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-extrabold text-gray-900 truncate">
                          {item.userName}
                        </h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 shrink-0">
                          {item.divisionName}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">
                        {item.userRole}
                      </p>
                    </div>
                  </div>

                  {/* Status Badge Ringkas */}
                  <div>
                    {hasIn && hasOut ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 size={13} /> Lengkap (IN & OUT)
                      </span>
                    ) : hasIn && !hasOut ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-black bg-amber-50 text-amber-800 border border-amber-300 animate-pulse">
                        <AlertTriangle size={13} className="text-amber-600" /> Hanya Masuk (Belum OUT)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                        <ArrowUpRight size={13} /> Hanya Pulang
                      </span>
                    )}
                  </div>
                </div>

                {/* Body Kartu: Dua Kolom (Kiri = IN, Kanan = OUT) */}
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* KOLOM KIRI: PRESENSI MASUK (IN) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-emerald-700 flex items-center gap-1">
                        <ArrowDownRight size={15} /> Foto Masuk (IN)
                      </span>
                      {hasIn && (
                        <span className="text-[11px] font-mono font-extrabold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                          {formatAttendanceTime(item.inRecord!.timestamp)} WIB
                        </span>
                      )}
                    </div>

                    {hasIn ? (
                      <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                        {/* Foto Thumbnail */}
                        <div
                          className="relative aspect-16/10 bg-black cursor-pointer group overflow-hidden"
                          onClick={() =>
                            setPreviewData({
                              photo: item.inRecord!.photo,
                              userName: item.userName,
                              type: 'in',
                              timestamp: item.inRecord!.timestamp,
                              outlet: item.inRecord!.outlet,
                              latitude: item.inRecord!.latitude,
                              longitude: item.inRecord!.longitude,
                              distance: item.inRecord!.distance,
                              divisionName: item.divisionName,
                            })
                          }
                        >
                          <img
                            src={item.inRecord!.photo}
                            alt={`Selfie Masuk ${item.userName}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-bold">
                            <Eye size={16} />
                            <span>Perbesar Foto</span>
                          </div>
                        </div>

                        {/* Detail Lokasi Masuk */}
                        <div className="p-2.5 space-y-1.5 text-xs">
                          <div className="flex items-center gap-1.5 text-gray-800 font-bold truncate">
                            <MapPin size={13} className="text-red-500 shrink-0" />
                            <span className="truncate">{item.inRecord!.outlet || 'Lokasi tidak terdeteksi'}</span>
                          </div>

                          {item.inRecord!.distance !== null && (
                            <div className="flex items-center gap-1 text-[11px] text-gray-500">
                              <Navigation size={11} className="text-gray-400 shrink-0" />
                              <span>Jarak: <strong>{Math.round(item.inRecord!.distance)}m</strong></span>
                              {item.inRecord!.accuracy && (
                                <span className="text-gray-400">(±{Math.round(item.inRecord!.accuracy)}m)</span>
                              )}
                            </div>
                          )}

                          <div className="pt-1 flex items-center gap-2">
                            {item.inRecord!.latitude && item.inRecord!.longitude && (
                              <a
                                href={`https://www.google.com/maps?q=${item.inRecord!.latitude},${item.inRecord!.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline"
                              >
                                <ExternalLink size={11} />
                                <span>Peta Google Maps</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-44 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center p-4 text-center text-gray-400">
                        <AlertCircle size={22} className="text-gray-300 mb-1" />
                        <span className="text-xs font-bold text-gray-500">Belum Ada Presensi Masuk</span>
                        <span className="text-[10px] text-gray-400 mt-0.5">Karyawan belum melakukan clock IN</span>
                      </div>
                    )}
                  </div>

                  {/* KOLOM KANAN: PRESENSI PULANG (OUT) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-blue-700 flex items-center gap-1">
                        <ArrowUpRight size={15} /> Foto Pulang (OUT)
                      </span>
                      {hasOut && (
                        <span className="text-[11px] font-mono font-extrabold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                          {formatAttendanceTime(item.outRecord!.timestamp)} WIB
                        </span>
                      )}
                    </div>

                    {hasOut ? (
                      <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                        {/* Foto Thumbnail */}
                        <div
                          className="relative aspect-16/10 bg-black cursor-pointer group overflow-hidden"
                          onClick={() =>
                            setPreviewData({
                              photo: item.outRecord!.photo,
                              userName: item.userName,
                              type: 'out',
                              timestamp: item.outRecord!.timestamp,
                              outlet: item.outRecord!.outlet,
                              latitude: item.outRecord!.latitude,
                              longitude: item.outRecord!.longitude,
                              distance: item.outRecord!.distance,
                              divisionName: item.divisionName,
                            })
                          }
                        >
                          <img
                            src={item.outRecord!.photo}
                            alt={`Selfie Pulang ${item.userName}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-bold">
                            <Eye size={16} />
                            <span>Perbesar Foto</span>
                          </div>
                        </div>

                        {/* Detail Lokasi Pulang */}
                        <div className="p-2.5 space-y-1.5 text-xs">
                          <div className="flex items-center gap-1.5 text-gray-800 font-bold truncate">
                            <MapPin size={13} className="text-red-500 shrink-0" />
                            <span className="truncate">{item.outRecord!.outlet || 'Lokasi tidak terdeteksi'}</span>
                          </div>

                          {item.outRecord!.distance !== null && (
                            <div className="flex items-center gap-1 text-[11px] text-gray-500">
                              <Navigation size={11} className="text-gray-400 shrink-0" />
                              <span>Jarak: <strong>{Math.round(item.outRecord!.distance)}m</strong></span>
                              {item.outRecord!.accuracy && (
                                <span className="text-gray-400">(±{Math.round(item.outRecord!.accuracy)}m)</span>
                              )}
                            </div>
                          )}

                          <div className="pt-1 flex items-center gap-2">
                            {item.outRecord!.latitude && item.outRecord!.longitude && (
                              <a
                                href={`https://www.google.com/maps?q=${item.outRecord!.latitude},${item.outRecord!.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline"
                              >
                                <ExternalLink size={11} />
                                <span>Peta Google Maps</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* KOTAK PERINGATAN BELUM FOTO PULANG */
                      <div className="h-44 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50 flex flex-col items-center justify-center p-4 text-center">
                        <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mb-1.5">
                          <AlertTriangle size={18} />
                        </div>
                        <span className="text-xs font-black text-amber-900">Belum Ada Foto Pulang</span>
                        <span className="text-[11px] text-amber-700 font-medium mt-0.5 leading-snug">
                          Karyawan ini baru melakukan Clock IN dan belum foto presensi keluar.
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

      {/* Modal Zoom & Detail Lengkap Foto Selfie */}
      {previewData && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewData(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-2 bg-gray-50/50">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0 ${
                    previewData.type === 'in' ? 'bg-emerald-600' : 'bg-blue-600'
                  }`}
                >
                  {previewData.type === 'in' ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold text-gray-900 truncate">
                    {previewData.userName}
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Foto Presensi {previewData.type === 'in' ? 'Masuk (Clock IN)' : 'Pulang (Clock OUT)'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPreviewData(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Image Display */}
            <div className="bg-black flex items-center justify-center overflow-auto max-h-[50vh] p-2">
              <img
                src={previewData.photo}
                alt="Foto Selfie Presensi"
                className="w-full h-auto max-h-[48vh] object-contain rounded-xl"
              />
            </div>

            {/* Modal Detail Info */}
            <div className="p-4 space-y-2.5 overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    Waktu Presensi
                  </span>
                  <span className="font-bold text-gray-900 flex items-center gap-1 mt-0.5">
                    <Clock size={13} className="text-indigo-600" />
                    {new Date(previewData.timestamp).toLocaleString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}{' '}
                    WIB
                  </span>
                </div>

                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    Divisi
                  </span>
                  <span className="font-bold text-gray-900 flex items-center gap-1 mt-0.5">
                    <User size={13} className="text-indigo-600" />
                    {previewData.divisionName}
                  </span>
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Lokasi / Outlet
                  </span>
                  {previewData.distance !== null && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                      Jarak {Math.round(previewData.distance)}m
                    </span>
                  )}
                </div>
                <p className="font-extrabold text-gray-900 flex items-center gap-1.5">
                  <MapPin size={15} className="text-red-500 shrink-0" />
                  {previewData.outlet || 'Lokasi tidak terdaftar'}
                </p>

                {previewData.latitude && previewData.longitude && (
                  <p className="text-[11px] font-mono text-gray-500 pt-1">
                    Koordinat: {previewData.latitude.toFixed(6)}, {previewData.longitude.toFixed(6)}
                  </p>
                )}
              </div>

              {previewData.latitude && previewData.longitude && (
                <a
                  href={`https://www.google.com/maps?q=${previewData.latitude},${previewData.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs"
                >
                  <ExternalLink size={14} />
                  <span>Buka Titik Presensi di Google Maps</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendancePhotos;
