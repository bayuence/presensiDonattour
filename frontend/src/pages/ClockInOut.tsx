import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useAuth } from '../context/AuthContext';
import { Camera, MapPin, CheckCircle, AlertCircle, RefreshCw, Loader2, X, Clock, SwitchCamera } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatAttendanceTime } from '../utils/timeFormat';

// Leaflet di-lazy load — TIDAK masuk bundle utama
const PresensiMap = lazy(() => import('../components/PresensiMap'));

type Location = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
};

const ClockInOut = () => {
  const { user, updateUser } = useAuth();
  const [currentUser, setCurrentUser] = useState<any>(user);
  const navigate = useNavigate();
  const [locations, setLocations] = useState<Location[]>([]);
  const [closestLocation, setClosestLocation] = useState<Location | null>(null);
  const [isAssignedOutlet, setIsAssignedOutlet] = useState(false);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [isWithinRadius, setIsWithinRadius] = useState(false);

  const [loadingLoc, setLoadingLoc] = useState(false);
  const [fetchingOutlets, setFetchingOutlets] = useState(true);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsStarted, setGpsStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const watchIdRef = useRef<number | null>(null);

  const [showCameraModal, setShowCameraModal] = useState<false | 'in' | 'out'>(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoSizeKb, setPhotoSizeKb] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [todaySchedule, setTodaySchedule] = useState<string | null>(null);
  const [isOffToday, setIsOffToday] = useState(false);
  const [requiredLocationId, setRequiredLocationId] = useState<string | null>(null);
  const [todayStatus, setTodayStatus] = useState<'none' | 'in' | 'out' | 'loading'>('loading');

  // Clock tick — ringan, hanya update state time
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Cleanup GPS watcher saat unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Sync video stream ke element
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const getDistance = (p1: { lat: number; lng: number }, p2: { lat: number; lng: number }) => {
    const R = 6371e3;
    const φ1 = (p1.lat * Math.PI) / 180;
    const φ2 = (p2.lat * Math.PI) / 180;
    const Δφ = ((p2.lat - p1.lat) * Math.PI) / 180;
    const Δλ = ((p2.lng - p1.lng) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Fetch semua data awal secara paralel
  useEffect(() => {
    // Fetch outlets
    fetch('/api/locations')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.locations.length > 0) setLocations(data.locations);
      })
      .catch(console.error)
      .finally(() => setFetchingOutlets(false));

    if (!user?.id) return;

    const now = new Date();
    const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Fetch user profile + jadwal + status presensi sekaligus
    Promise.all([
      fetch(`/api/users/${user.id}`).catch(() => null),
      fetch(`/api/schedules?date=${todayDateStr}&userId=${user.id}`).catch(() => null),
      fetch(`/api/attendance/${user.id}`).catch(() => null),
    ]).then(async ([userRes, schedRes, attRes]) => {
      // Update user profile
      if (userRes?.ok) {
        const ud = await userRes.json();
        if (ud.success && ud.user) { setCurrentUser(ud.user); updateUser(ud.user); }
      }

      // Update jadwal
      if (schedRes?.ok) {
        const sd = await schedRes.json();
        if (sd.success && sd.schedules?.length > 0 && sd.schedules[0]?.shift) {
          const shift = sd.schedules[0].shift;
          const isOff = (shift.checkInTime === '00:00' && shift.checkOutTime === '00:00') || shift.name.toUpperCase() === 'OFF';
          if (isOff) {
            setTodaySchedule('🏖️ Libur (OFF)');
            setIsOffToday(true);
            setRequiredLocationId(null);
          } else {
            setTodaySchedule(`${shift.name} · ${shift.checkInTime}–${shift.checkOutTime}`);
            setIsOffToday(false);
            setRequiredLocationId(shift.locationId || null);
          }
        } else {
          setTodaySchedule('Belum ada jadwal');
        }
      } else {
        setTodaySchedule('Belum ada jadwal');
      }

      // Update status presensi hari ini
      if (attRes?.ok) {
        const ad = await attRes.json();
        if (ad.success && ad.records) {
          const todayStr = new Date().toDateString();
          const todays = ad.records.filter((r: any) => new Date(r.timestamp).toDateString() === todayStr);
          setTodayStatus(todays.length === 0 ? 'none' : todays[0].type);
        } else {
          setTodayStatus('none');
        }
      } else {
        setTodayStatus('none');
      }
    }).catch(() => {
      setTodaySchedule('Belum ada jadwal');
      setTodayStatus('none');
    });
  }, [user?.id]);

  // Evaluasi jarak ke outlet target
  useEffect(() => {
    if (!position || locations.length === 0) return;

    let target: Location | null = null;
    let isAssigned = false;

    if (requiredLocationId) {
      const found = locations.find((l) => l.id === requiredLocationId);
      if (found) { target = found; isAssigned = true; }
    }

    if (!target) {
      let minD = Infinity;
      locations.forEach((loc) => {
        const d = getDistance(position, { lat: loc.latitude, lng: loc.longitude });
        if (d < minD) { minD = d; target = loc; }
      });
    }

    if (target) {
      const dist = getDistance(position, { lat: target.latitude, lng: target.longitude });
      setClosestLocation(target);
      setDistance(dist);
      setIsAssignedOutlet(isAssigned);
      setIsWithinRadius(dist <= target.radius);
    }
  }, [position, locations, requiredLocationId]);

  // Auto-start GPS setelah outlets loaded
  useEffect(() => {
    if (locations.length > 0 && !gpsStarted && !gpsError) locateUser();
  }, [locations]);

  const locateUser = () => {
    if (locations.length === 0) return;
    setGpsStarted(true);
    setLoadingLoc(true);
    setGpsError(null);

    if (!('geolocation' in navigator)) {
      setGpsError('Browser ini tidak mendukung GPS.');
      setLoadingLoc(false);
      return;
    }

    const processPosition = (pos: GeolocationPosition) => {
      setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setGpsError(null);
      setLoadingLoc(false);
    };

    const handleError = (err: GeolocationPositionError) => {
      // Fallback mock untuk localhost/dev
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        processPosition({
          coords: { latitude: locations[0]?.latitude || -6.2, longitude: locations[0]?.longitude || 106.816666, accuracy: 10 },
          timestamp: Date.now(),
        } as GeolocationPosition);
        return;
      }
      setLoadingLoc(false);
      const msgs: Record<number, string> = {
        1: 'Izin lokasi ditolak. Buka pengaturan browser → Lokasi → Izinkan.',
        2: 'Sinyal GPS lemah. Pastikan fitur Lokasi aktif.',
        3: 'Waktu GPS habis. Ketuk "Coba Lagi".',
      };
      setGpsError(msgs[err.code] || 'Gagal mendapatkan lokasi GPS.');
    };

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    // watchPosition untuk update realtime
    watchIdRef.current = navigator.geolocation.watchPosition(
      processPosition,
      (err) => { if (!(err.code === 3 && position)) handleError(err); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
    );

    // getCurrentPosition untuk posisi pertama yang cepat
    navigator.geolocation.getCurrentPosition(
      processPosition,
      (err) => { if (!position) handleError(err); },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 5000 }
    );
  };

  // Camera
  const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
    try {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      setStream(mediaStream);
      setFacingMode(mode);
    } catch {
      alert('Gagal mengakses kamera. Berikan izin kamera untuk melanjutkan.');
    }
  };

  const switchCamera = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    startCamera(nextMode);
  };

  const takePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');

    // Batasi dimensi maksimum (500px) agar wajah tetap jernih dan ukuran pas di 50KB - 100KB
    const MAX_DIMENSION = 500;
    let width = video.videoWidth || 640;
    let height = video.videoHeight || 480;

    if (width > height) {
      if (width > MAX_DIMENSION) {
        height = Math.round((height * MAX_DIMENSION) / width);
        width = MAX_DIMENSION;
      }
    } else {
      if (height > MAX_DIMENSION) {
        width = Math.round((width * MAX_DIMENSION) / height);
        height = MAX_DIMENSION;
      }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // OTOMATIS CERDAS:
      // Jika kamera depan (selfie), preview dicerminkan maka canvas otomatis dicerminkan
      // sehingga hasil foto 100% PERSIS sama dengan apa yang dilihat user (tanpa flip/terbalik).
      if (facingMode === 'user') {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, width, height);

      // Mulai dengan kualitas tinggi 0.75, lalu turunkan bertahap jika melebihi 100 KB
      let quality = 0.75;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      let sizeInKb = (dataUrl.length * 0.75) / 1024;

      while (sizeInKb > 100 && quality > 0.25) {
        quality -= 0.06;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
        sizeInKb = (dataUrl.length * 0.75) / 1024;
      }

      setPhotoSizeKb(Math.round(sizeInKb));
      setPhoto(dataUrl);
      stream?.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  };

  const retakePhoto = () => {
    setPhoto(null);
    setPhotoSizeKb(null);
    startCamera(facingMode);
  };

  const closeCameraModal = () => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setPhoto(null);
    setPhotoSizeKb(null);
    setShowCameraModal(false);
  };

  const onClockClick = (type: 'in' | 'out') => {
    if (!isWithinRadius) {
      alert(`Anda berada di luar radius presensi! Mendekatlah ke ${closestLocation?.name || 'outlet'}.`);
      return;
    }
    setShowCameraModal(type);
    setPhoto(null);
    startCamera(facingMode);
  };

  const handlePresensi = async () => {
    if (!position || !user || !closestLocation || !showCameraModal || !photo || !isWithinRadius) return;
    const type = showCameraModal;
    setSubmitting(true);
    setSubmitError('');

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          type,
          location: JSON.stringify({ ...position, outlet: closestLocation.name, distance: Math.round(distance || 0) }),
          photo,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (type === 'in' && data.lateInfo?.isLate) {
          setSuccessMsg(`⚠️ Presensi Masuk berhasil di ${closestLocation.name}! (Terlambat ${data.lateInfo.durationText} dari Jadwal ${data.lateInfo.shiftCheckIn} WIB)`);
        } else {
          setSuccessMsg(`Presensi ${type === 'in' ? 'Masuk' : 'Keluar'} berhasil pukul ${formatAttendanceTime(new Date())} WIB di ${closestLocation.name}!`);
        }
        setTimeout(() => { closeCameraModal(); navigate('/history'); }, 2500);
      } else {
        setSubmitError(data.error || 'Gagal mencatat presensi.');
      }
    } catch {
      setSubmitError('Tidak dapat terhubung ke server.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Loading awal (sangat singkat karena hanya fetch outlets) ───
  if (fetchingOutlets) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 size={28} className="text-red-500 animate-spin mb-3" />
        <p className="text-gray-500 text-sm font-medium">Memuat...</p>
      </div>
    );
  }

  return (
    <div className="p-3 max-w-lg mx-auto space-y-3 pb-20">

      {/* Header: Divisi + Shift + Jam — satu baris compact */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
            {currentUser?.division?.name || user?.division?.name || 'Divisi'}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            {todaySchedule === null ? (
              <Loader2 size={12} className="animate-spin text-gray-400" />
            ) : isOffToday ? (
              <span className="text-xs font-bold text-emerald-700">🏖️ Libur (OFF)</span>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="text-xs font-semibold text-indigo-700 truncate">{todaySchedule}</span>
              </>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-black font-mono tracking-tight text-gray-900">
            {formatAttendanceTime(currentTime)}
            <span className="text-[10px] font-bold text-indigo-400 ml-1">WIB</span>
          </div>
          <div className="text-[10px] text-gray-400">
            {currentTime.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
        </div>
      </div>

      {locations.length === 0 ? (
        <div className="bg-red-50 text-red-600 p-5 rounded-2xl border border-red-100 text-center">
          <AlertCircle size={32} className="mx-auto mb-2 opacity-80" />
          <h2 className="text-base font-bold mb-1">Belum Ada Titik Presensi</h2>
          <p className="text-xs opacity-80">Admin belum mendaftarkan outlet. Tambahkan lokasi di database terlebih dahulu.</p>
        </div>
      ) : (
        <>
          {/* Map + Location Status */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Header peta */}
            <div className="px-4 py-2.5 border-b border-gray-50 flex justify-between items-center">
              <div className="flex items-center gap-2 min-w-0">
                <MapPin size={15} className="text-red-600 shrink-0" />
                <span className="text-sm font-bold text-gray-900 truncate">
                  {closestLocation ? closestLocation.name : (isAssignedOutlet ? 'Outlet Penugasan' : 'Outlet Terdekat')}
                </span>
                {closestLocation && (
                  <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
                    r={closestLocation.radius}m
                  </span>
                )}
              </div>
              <button
                onClick={locateUser}
                className="p-1.5 text-gray-400 hover:text-red-600 rounded-full hover:bg-red-50 transition-colors shrink-0"
                title="Perbarui GPS"
              >
                <RefreshCw size={14} className={loadingLoc ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* Peta — di-lazy load, hanya render saat GPS sudah ada */}
            <div className="h-44 relative bg-gray-100">
              {position && closestLocation ? (
                <Suspense fallback={
                  <div className="flex flex-col items-center justify-center h-full gap-2">
                    <Loader2 size={22} className="animate-spin text-red-500" />
                    <p className="text-xs text-gray-400">Memuat peta...</p>
                  </div>
                }>
                  <PresensiMap
                    position={position}
                    outlet={closestLocation}
                    distance={distance ?? 0}
                    isWithinRadius={isWithinRadius}
                  />
                </Suspense>
              ) : gpsError ? (
                <div className="flex flex-col items-center justify-center h-full px-5 text-center gap-2">
                  <AlertCircle size={26} className="text-orange-400" />
                  <p className="text-xs text-orange-700 font-medium leading-relaxed">{gpsError}</p>
                  <button
                    onClick={locateUser}
                    className="text-xs font-bold text-red-600 bg-red-50 px-4 py-1.5 rounded-full border border-red-100 hover:bg-red-100 transition-colors"
                  >
                    Coba Lagi
                  </button>
                </div>
              ) : loadingLoc ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <Loader2 size={24} className="animate-spin text-red-500" />
                  <p className="text-xs text-gray-500 font-medium">Mencari GPS...</p>
                </div>
              ) : !gpsStarted ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <button
                    onClick={locateUser}
                    className="bg-gray-900 text-white text-sm font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 active:scale-95 transition-transform shadow-md"
                  >
                    <MapPin size={15} />
                    Deteksi Lokasi
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  Lokasi tidak ditemukan
                </div>
              )}
            </div>

            {/* Status bar jarak — ringkas 1 baris */}
            {closestLocation && distance !== null ? (
              isWithinRadius ? (
                <div className="px-4 py-2.5 bg-emerald-50 border-t border-emerald-100 flex items-center gap-2">
                  <CheckCircle size={15} className="text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-emerald-800">
                    Dalam radius · {Math.round(distance)}m dari {closestLocation.name.trim()}
                  </span>
                </div>
              ) : (
                <div className="px-4 py-2.5 bg-red-50 border-t border-red-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle size={15} className="text-red-500 shrink-0" />
                    <span className="text-xs font-bold text-red-800 truncate">
                      Di luar radius · {Math.round(distance)}m (maks. {closestLocation.radius}m)
                    </span>
                  </div>
                  <span className="text-[11px] font-black text-red-600 bg-red-100 px-2 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                    -{Math.max(1, Math.round(distance - closestLocation.radius))}m lagi
                  </span>
                </div>
              )
            ) : position === null && gpsStarted && !gpsError ? (
              <div className="px-4 py-2.5 border-t border-gray-50 flex items-center gap-2 text-xs text-gray-400">
                <Loader2 size={12} className="animate-spin text-red-400" />
                Menghitung jarak...
              </div>
            ) : null}
          </div>

          {/* Banner info */}
          {isOffToday && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2">
              🏖️ Hari ini jadwal Libur Kerja (OFF).
            </div>
          )}
          {todayStatus === 'out' && (
            <div className="bg-blue-50 border border-blue-100 text-blue-700 px-3 py-2 rounded-xl text-xs font-bold">
              ✅ Presensi hari ini sudah selesai.
            </div>
          )}
          {submitError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-medium px-3 py-2 rounded-xl">
              {submitError}
            </div>
          )}

          {/* Tombol Clock IN / OUT */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onClockClick('in')}
              disabled={!position || submitting || !isWithinRadius || todayStatus !== 'none' || isOffToday}
              className={`py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2
                ${todayStatus !== 'none' || !position || !isWithinRadius || isOffToday
                  ? 'bg-gray-100 text-gray-400 border-2 border-gray-200 cursor-not-allowed opacity-60'
                  : 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-200'
                }`}
            >
              <Clock size={16} />
              Clock IN
            </button>
            <button
              onClick={() => onClockClick('out')}
              disabled={!position || submitting || !isWithinRadius || todayStatus !== 'in'}
              className={`py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2
                ${todayStatus !== 'in' || !position || !isWithinRadius
                  ? 'bg-gray-100 text-gray-400 border-2 border-gray-200 cursor-not-allowed opacity-60'
                  : 'bg-white border-2 border-red-600 text-red-600 hover:bg-red-50 shadow-sm'
                }`}
            >
              <Clock size={16} />
              Clock OUT
            </button>
          </div>

          {todayStatus === 'loading' && (
            <div className="flex justify-center py-2">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          )}
        </>
      )}

      {/* Camera Modal */}
      {showCameraModal && (
        <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
          <div className="p-4 flex justify-between items-center bg-black/50 backdrop-blur-sm absolute top-0 left-0 right-0 z-10">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm sm:text-base">
                <Camera size={18} />
                {facingMode === 'user' ? 'Ambil Selfie' : 'Kamera Belakang'}
              </h3>
              <span className="bg-black/60 border border-white/20 text-white font-mono text-[11px] px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Clock size={11} className="text-emerald-400" />
                {formatAttendanceTime(currentTime)} WIB
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              {!photo && (
                <button
                  type="button"
                  onClick={switchCamera}
                  className="text-white bg-black/50 hover:bg-black/75 rounded-full p-2.5 transition-colors"
                  title="Ganti Kamera Depan/Belakang"
                >
                  <SwitchCamera size={18} />
                </button>
              )}
              <button onClick={closeCameraModal} className="text-white bg-black/50 hover:bg-black/75 rounded-full p-2.5">
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="flex-1 relative flex flex-col justify-center bg-black">
            {!stream && !photo ? (
              <div className="flex flex-col items-center justify-center gap-2">
                <Loader2 size={32} className="animate-spin text-red-500" />
                <p className="text-white font-medium">Membuka kamera...</p>
              </div>
            ) : photo ? (
              <>
                <img src={photo} alt="Selfie" className="w-full h-full object-contain" />
                {photoSizeKb !== null && (
                  <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md border border-white/20 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1.5 shadow-lg z-20">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-semibold">Ukuran: {photoSizeKb} KB</span>
                    <span className="text-emerald-300 text-[10px] font-bold uppercase tracking-wider bg-emerald-950/60 px-1.5 py-0.5 rounded">Optimal</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={retakePhoto}
                  className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-white/95 hover:bg-white backdrop-blur-sm px-6 py-3 rounded-full font-bold text-gray-900 shadow-xl flex items-center gap-2 active:scale-95 transition-transform text-sm z-20"
                >
                  <RefreshCw size={16} />
                  Foto Ulang
                </button>
              </>
            ) : (
              <>
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-contain" 
                  style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }} 
                />
                <button
                  onClick={takePhoto}
                  className="absolute bottom-16 left-1/2 -translate-x-1/2 w-20 h-20 bg-white/30 backdrop-blur-md rounded-full border-4 border-white flex items-center justify-center shadow-xl active:scale-95 transition-transform"
                >
                  <div className="w-16 h-16 bg-white rounded-full" />
                </button>
              </>
            )}
          </div>

          {photo && (
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
              <button
                onClick={handlePresensi}
                disabled={submitting}
                className="w-full py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-xl font-bold shadow-lg transition-all active:scale-95 flex items-center justify-center text-lg"
              >
                {submitting ? <Loader2 size={24} className="animate-spin" /> : 'Kirim Presensi'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Success Modal */}
      {successMsg && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white rounded-3xl p-8 flex flex-col items-center max-w-xs w-full shadow-2xl">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
              <CheckCircle size={32} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Berhasil!</h3>
            <p className="text-gray-500 text-sm text-center font-medium leading-relaxed">{successMsg}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClockInOut;
