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
} from 'lucide-react';
import { formatAttendanceTime } from '../../utils/timeFormat';

type PhotoAttendanceItem = {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  userAvatar: string | null;
  divisionName: string;
  type: 'in' | 'out';
  timestamp: string;
  photo: string;
  outlet: string | null;
  latitude: number | null;
  longitude: number | null;
  distance: number | null;
  accuracy: number | null;
};

const AttendancePhotos = () => {
  const { user } = useAuth();
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';

  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [selectedType, setSelectedType] = useState<'all' | 'in' | 'out'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [divisions, setDivisions] = useState<{ id: string; name: string }[]>([]);

  const [items, setItems] = useState<PhotoAttendanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewItem, setPreviewItem] = useState<PhotoAttendanceItem | null>(null);

  // Fetch list of divisions
  useEffect(() => {
    fetch('/api/divisions')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setDivisions(d.divisions || []);
      })
      .catch(console.error);
  }, []);

  // Fetch attendance photos
  const fetchPhotos = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedDate) params.append('date', selectedDate);
      if (selectedDivision) params.append('divisionId', selectedDivision);
      if (selectedType !== 'all') params.append('type', selectedType);
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
  }, [isAdmin, selectedDate, selectedDivision, selectedType]);

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPhotos();
  };

  const countIn = items.filter((it) => it.type === 'in').length;
  const countOut = items.filter((it) => it.type === 'out').length;

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
              <h1 className="text-base font-extrabold text-gray-900">Foto Kehadiran</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Galeri foto selfie presensi masuk & pulang karyawan lengkap dengan outlet dan titik lokasi GPS.
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

      {/* Ringkasan Cepat */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-white rounded-2xl border border-gray-100 p-3.5 text-center shadow-xs">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Foto</span>
          <span className="text-lg font-black text-gray-900">{items.length}</span>
        </div>
        <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-3.5 text-center shadow-xs">
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block flex items-center justify-center gap-1">
            <ArrowDownRight size={13} /> Masuk (IN)
          </span>
          <span className="text-lg font-black text-emerald-800">{countIn}</span>
        </div>
        <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-3.5 text-center shadow-xs">
          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block flex items-center justify-center gap-1">
            <ArrowUpRight size={13} /> Pulang (OUT)
          </span>
          <span className="text-lg font-black text-blue-800">{countOut}</span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

          {/* 3. Filter Jenis (IN / OUT / SEMUA) */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
              Jenis Presensi
            </label>
            <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setSelectedType('all')}
                className={`flex-1 py-1 rounded-lg transition-all ${
                  selectedType === 'all'
                    ? 'bg-white text-indigo-600 shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setSelectedType('in')}
                className={`flex-1 py-1 rounded-lg transition-all ${
                  selectedType === 'in'
                    ? 'bg-white text-emerald-600 shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                Masuk
              </button>
              <button
                type="button"
                onClick={() => setSelectedType('out')}
                className={`flex-1 py-1 rounded-lg transition-all ${
                  selectedType === 'out'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                Pulang
              </button>
            </div>
          </div>
        </div>

        {/* 4. Pencarian Nama */}
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama karyawan atau outlet..."
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
            Menampilkan data tanggal: <span className="underline">{formatDateIndo(selectedDate)}</span>
          </p>
        )}
      </div>

      {/* Grid Galeri Foto Kehadiran */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 flex flex-col items-center justify-center gap-2 text-gray-400 shadow-sm">
          <Loader2 size={26} className="animate-spin text-indigo-600" />
          <span className="text-xs font-semibold text-gray-600">Memuat foto kehadiran...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
            <Camera size={26} className="text-gray-300" />
          </div>
          <p className="text-sm font-bold text-gray-700">Tidak ada foto presensi</p>
          <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
            Belum ada foto presensi yang terekam pada tanggal dan filter yang dipilih.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {items.map((item) => {
            const isEntry = item.type === 'in';
            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-xs hover:shadow-md transition-shadow overflow-hidden flex flex-col"
              >
                {/* Image Container with Badge */}
                <div
                  className="relative aspect-4/3 bg-black cursor-pointer group overflow-hidden"
                  onClick={() => setPreviewItem(item)}
                >
                  <img
                    src={item.photo}
                    alt={`Selfie ${item.userName}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-bold">
                    <Eye size={18} />
                    <span>Lihat Penuh</span>
                  </div>

                  {/* Badge IN / OUT */}
                  <div className="absolute top-2.5 left-2.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider text-white shadow-md ${
                        isEntry ? 'bg-emerald-600' : 'bg-blue-600'
                      }`}
                    >
                      {isEntry ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                      {isEntry ? 'MASUK (IN)' : 'PULANG (OUT)'}
                    </span>
                  </div>

                  {/* Timestamp Tag */}
                  <div className="absolute bottom-2.5 right-2.5 bg-black/70 backdrop-blur-xs text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded-md">
                    {formatAttendanceTime(item.timestamp)} WIB
                  </div>
                </div>

                {/* Info Card Content */}
                <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                  <div>
                    {/* User Name & Division */}
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0 text-gray-500 font-bold text-xs">
                          {item.userAvatar ? (
                            <img src={item.userAvatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <User size={13} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs font-extrabold text-gray-900 truncate leading-snug">
                            {item.userName}
                          </h3>
                          <p className="text-[10px] text-gray-400 truncate">
                            {item.userRole}
                          </p>
                        </div>
                      </div>

                      <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {item.divisionName}
                      </span>
                    </div>

                    {/* Outlet / Location Info */}
                    <div className="mt-2.5 pt-2 border-t border-gray-100 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-gray-700">
                        <MapPin size={13} className="text-red-500 shrink-0" />
                        <span className="font-bold truncate">
                          {item.outlet || 'Lokasi tidak terdeteksi'}
                        </span>
                      </div>

                      {item.distance !== null && (
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                          <Navigation size={12} className="text-gray-400 shrink-0" />
                          <span>
                            Jarak GPS: <strong className="text-gray-800">{Math.round(item.distance)} m</strong>
                            {item.accuracy && ` (akurasi ±${Math.round(item.accuracy)}m)`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions: Maps & Zoom */}
                  <div className="pt-2 flex items-center gap-1.5">
                    {item.latitude && item.longitude ? (
                      <a
                        href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-1.5 px-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 text-[11px] font-bold flex items-center justify-center gap-1 border border-gray-200 transition-colors"
                      >
                        <ExternalLink size={12} />
                        <span>Google Maps</span>
                      </a>
                    ) : (
                      <span className="flex-1 text-[10px] text-gray-400 text-center py-1.5">
                        Titik GPS -
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setPreviewItem(item)}
                      className="py-1.5 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
                    >
                      <Eye size={12} />
                      <span>Detail</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Zoom & Detail Lengkap Foto Kehadiran */}
      {previewItem && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewItem(null)}
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
                    previewItem.type === 'in' ? 'bg-emerald-600' : 'bg-blue-600'
                  }`}
                >
                  {previewItem.type === 'in' ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold text-gray-900 truncate">
                    {previewItem.userName}
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Presensi {previewItem.type === 'in' ? 'Masuk (Clock IN)' : 'Pulang (Clock OUT)'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Image Display */}
            <div className="bg-black flex items-center justify-center overflow-auto max-h-[50vh] p-2">
              <img
                src={previewItem.photo}
                alt="Foto Selfie Presensi"
                className="w-full h-auto max-h-[48vh] object-contain rounded-xl"
              />
            </div>

            {/* Modal Detail Info */}
            <div className="p-4 space-y-2.5 overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    Waktu Scan
                  </span>
                  <span className="font-bold text-gray-900 flex items-center gap-1 mt-0.5">
                    <Clock size={13} className="text-indigo-600" />
                    {new Date(previewItem.timestamp).toLocaleString('id-ID', {
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
                    Divisi Karyawan
                  </span>
                  <span className="font-bold text-gray-900 flex items-center gap-1 mt-0.5">
                    <User size={13} className="text-indigo-600" />
                    {previewItem.divisionName}
                  </span>
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Lokasi / Outlet
                  </span>
                  {previewItem.distance !== null && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                      Jarak {Math.round(previewItem.distance)}m
                    </span>
                  )}
                </div>
                <p className="font-extrabold text-gray-900 flex items-center gap-1.5">
                  <MapPin size={15} className="text-red-500 shrink-0" />
                  {previewItem.outlet || 'Lokasi tidak terdaftar'}
                </p>

                {previewItem.latitude && previewItem.longitude && (
                  <p className="text-[11px] font-mono text-gray-500 pt-1">
                    Koordinat: {previewItem.latitude.toFixed(6)}, {previewItem.longitude.toFixed(6)}
                  </p>
                )}
              </div>

              {previewItem.latitude && previewItem.longitude && (
                <a
                  href={`https://www.google.com/maps?q=${previewItem.latitude},${previewItem.longitude}`}
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
