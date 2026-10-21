import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { MapContainer, TileLayer, Marker, Circle, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Camera, MapPin, CheckCircle, AlertCircle, RefreshCw, Loader2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

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
  const [position, setPosition] = useState<{lat: number, lng: number} | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [isWithinRadius, setIsWithinRadius] = useState(false);
  
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [fetchingOutlets, setFetchingOutlets] = useState(true);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsStarted, setGpsStarted] = useState(false);

  const watchIdRef = useRef<number | null>(null);

  // Camera Modal States
  const [showCameraModal, setShowCameraModal] = useState<false | 'in' | 'out'>(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' }
      });
      setStream(mediaStream);
    } catch (err) {
      console.error('Error accessing camera:', err);
      alert('Gagal mengakses kamera. Berikan izin kamera untuk melanjutkan.');
    }
  };

  useEffect(() => {
    if (stream && videoRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const takePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      setPhoto(canvas.toDataURL('image/jpeg', 0.5)); // Kompres 50% supaya kode base64 sangat ringan
      stream?.getTracks().forEach(t => t.stop());
      setStream(null);
    }
  };

  const retakePhoto = () => {
    setPhoto(null);
    startCamera();
  };

  const closeCameraModal = () => {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
    setPhoto(null);
    setShowCameraModal(false);
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [todaySchedule, setTodaySchedule] = useState<string | null>(null);
  const [isOffToday, setIsOffToday] = useState(false);
  const [requiredLocationId, setRequiredLocationId] = useState<string | null>(null);
  const [todayStatus, setTodayStatus] = useState<'none' | 'in' | 'out' | 'loading'>('loading');

  const getDistance = (p1: {lat: number, lng: number}, p2: {lat: number, lng: number}) => {
    const R = 6371e3;
    const φ1 = p1.lat * Math.PI / 180;
    const φ2 = p2.lat * Math.PI / 180;
    const Δφ = (p2.lat - p1.lat) * Math.PI / 180;
    const Δλ = (p2.lng - p1.lng) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // 1. Ambil data outlet, user & jadwal hari ini secara paralel dan instan
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const res = await fetch('/api/locations');
        const data = await res.json();
        if (data.success && data.locations.length > 0) {
          setLocations(data.locations);
        }
      } catch (err) {
        console.error('Failed to fetch locations', err);
      } finally {
        setFetchingOutlets(false);
      }
    };
    fetchLocations();

    const fetchUserAndSchedule = async () => {
      if (!user?.id) return;
      try {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const todayDateStr = `${y}-${m}-${d}`;

        // Fetch User profile (agar divisi terupdate) & Schedule hari ini secara paralel
        const [userRes, schedRes] = await Promise.all([
          fetch(`/api/users/${user.id}`).catch(() => null),
          fetch(`/api/schedules?date=${todayDateStr}&userId=${user.id}`).catch(() => null)
        ]);

        if (userRes && userRes.ok) {
          const userData = await userRes.json();
          if (userData.success && userData.user) {
            setCurrentUser(userData.user);
            updateUser(userData.user);
          }
        }

        if (schedRes && schedRes.ok) {
          const schedData = await schedRes.json();
          if (schedData.success && schedData.schedules && schedData.schedules.length > 0) {
            const entry = schedData.schedules[0];
            if (entry?.shift) {
              const shift = entry.shift;
              const isOff = (shift.checkInTime === '00:00' && shift.checkOutTime === '00:00') || shift.name.toUpperCase() === 'OFF';
              if (isOff) {
                setTodaySchedule('🏖️ Libur Kerja (OFF)');
                setIsOffToday(true);
                setRequiredLocationId(null);
              } else {
                setTodaySchedule(`${shift.name} (${shift.checkInTime}–${shift.checkOutTime})`);
                setIsOffToday(false);
                if (shift.locationId) {
                  setRequiredLocationId(shift.locationId);
                } else {
                  setRequiredLocationId(null);
                }
              }
            } else {
              setTodaySchedule('Belum ada jadwal');
              setIsOffToday(false);
              setRequiredLocationId(null);
            }
          } else {
            setTodaySchedule('Belum ada jadwal');
            setIsOffToday(false);
            setRequiredLocationId(null);
          }
        } else {
          setTodaySchedule('Belum ada jadwal');
        }
      } catch (err) {
        console.error('Failed to fetch schedule from DB', err);
        setTodaySchedule('Belum ada jadwal');
      }
    };
    fetchUserAndSchedule();

    const fetchAttendanceStatus = async () => {
      if (!user?.id) return;
      try {
        const res = await fetch(`/api/attendance/${user.id}`);
        const data = await res.json();
        if (data.success && data.records) {
          const todayStr = new Date().toDateString();
          const todaysRecords = data.records.filter((r: any) => new Date(r.timestamp).toDateString() === todayStr);
          if (todaysRecords.length === 0) {
            setTodayStatus('none');
          } else {
            setTodayStatus(todaysRecords[0].type); // 'in' or 'out'
          }
        }
      } catch (err) {
        console.error('Failed to fetch status', err);
        setTodayStatus('none');
      }
    };
    fetchAttendanceStatus();
  }, [user]);

  // 2. Evaluasi Target Outlet & Jarak Radius secara REALTIME setiap posisi atau jadwal berubah
  useEffect(() => {
    if (!position || locations.length === 0) return;

    let target: Location | null = null;
    let isAssigned = false;

    // Jika shift menentukan lokasi spesifik
    if (requiredLocationId) {
      const found = locations.find(l => l.id === requiredLocationId);
      if (found) {
        target = found;
        isAssigned = true;
      }
    }

    // Jika shift tidak menentukan lokasi (Bebas / null), cari toko / outlet terdekat
    if (!target) {
      let minD = Infinity;
      locations.forEach(loc => {
        const d = getDistance(position, { lat: loc.latitude, lng: loc.longitude });
        if (d < minD) {
          minD = d;
          target = loc;
        }
      });
      isAssigned = false;
    }

    if (target) {
      const dist = getDistance(position, { lat: target.latitude, lng: target.longitude });
      setClosestLocation(target);
      setDistance(dist);
      setIsAssignedOutlet(isAssigned);
      
      // WAJIB berada dalam radius titik yang ditentukan (contoh: 50m)
      const inside = dist <= target.radius;
      setIsWithinRadius(inside);
    }
  }, [position, locations, requiredLocationId]);

  // 3. Pelacakan GPS Realtime & Cepat
  const locateUser = () => {
    if (locations.length === 0) {
      setLoadingLoc(false);
      return;
    }
    
    setGpsStarted(true);
    setLoadingLoc(true);
    setGpsError(null);

    if (!('geolocation' in navigator)) {
      setGpsError('Browser ini tidak mendukung GPS.');
      setLoadingLoc(false);
      return;
    }

    const processPosition = (pos: GeolocationPosition) => {
      const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setPosition(newPos);
      setGpsError(null);
      setLoadingLoc(false);
    };

    const handleError = (err: GeolocationPositionError) => {
      console.warn('GPS notice/error:', err.code, err.message);
      
      // --- FALLBACK KHUSUS LOCALHOST & TESTING ---
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        const mockPos = {
          coords: {
            latitude: locations[0]?.latitude || -6.200000,
            longitude: locations[0]?.longitude || 106.816666,
            accuracy: 10
          },
          timestamp: Date.now()
        } as GeolocationPosition;
        processPosition(mockPos);
        return;
      }

      setLoadingLoc(false);
      if (err.code === 1) {
        setGpsError('Izin lokasi ditolak. Buka pengaturan browser → Izin Situs → Lokasi → Izinkan, lalu refresh halaman.');
      } else if (err.code === 2) {
        setGpsError('Sinyal GPS lemah / tidak tersedia. Pastikan fitur Lokasi aktif di HP Anda.');
      } else if (err.code === 3) {
        setGpsError('Waktu pencarian GPS habis. Ketuk "Coba Lagi" untuk memperbarui.');
      } else {
        setGpsError('Gagal mendapatkan lokasi GPS.');
      }
    };

    // Bersihkan watcher sebelumnya jika ada
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    // Mulai streaming posisi realtime dengan watchPosition
    watchIdRef.current = navigator.geolocation.watchPosition(
      processPosition,
      (err) => {
        // jika sudah punya posisi, abaikan timeout sesaat
        if (err.code === 3 && position) return;
        handleError(err);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
    );

    // Dapatkan posisi pertama secepatnya
    navigator.geolocation.getCurrentPosition(
      processPosition,
      (err) => {
        if (!position) handleError(err);
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 5000 }
    );
  };

  useEffect(() => {
    if (locations.length > 0 && !gpsStarted && !gpsError) {
      locateUser();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations]);

  const onClockClick = (type: 'in' | 'out') => {
    if (!isWithinRadius) {
      alert(`Anda berada di luar radius presensi! Mendekatlah ke area ${closestLocation?.name || 'outlet'} terlebih dahulu.`);
      return;
    }
    setShowCameraModal(type);
    setPhoto(null);
    startCamera();
  };

  const handlePresensi = async () => {
    if (!position || !user || !closestLocation || !showCameraModal || !photo) return;
    const type = showCameraModal;
    
    // Strict guard: blokir presensi jika di luar radius
    if (!isWithinRadius) {
      alert(`Gagal: Anda berada di luar radius lokasi presensi (${Math.round(distance || 0)}m dari ${closestLocation.name}). Maksimal ${closestLocation.radius}m.`);
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          type,
          location: JSON.stringify({
            ...position,
            outlet: closestLocation.name,
            distance: Math.round(distance || 0)
          }),
          photo
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccessMsg(`Presensi ${type === 'in' ? 'Masuk' : 'Keluar'} berhasil dicatat di ${closestLocation.name}!`);
        setTimeout(() => {
          closeCameraModal();
          navigate('/history');
        }, 2000);
      } else {
        setSubmitError(data.error || 'Gagal mencatat presensi.');
      }
    } catch {
      setSubmitError('Tidak dapat terhubung ke server. Pastikan backend berjalan.');
    } finally {
      setSubmitting(false);
    }
  };

  if (fetchingOutlets) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 size={32} className="text-red-500 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Memuat data outlet...</p>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 pb-24">

      {/* Info Divisi & Shift */}
      {user && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex justify-between items-center gap-3">
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Divisi & Jam Kerja</span>
            <p className="text-sm font-bold text-gray-900 truncate">
              {currentUser?.division?.name || user?.division?.name || 'Tidak ada divisi'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 shrink-0">
            {todaySchedule === null ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                <Loader2 size={13} className="animate-spin text-gray-400" />
                Memuat jadwal...
              </span>
            ) : isOffToday ? (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                🏖️ Libur (OFF)
              </span>
            ) : todaySchedule.includes('Belum ada jadwal') ? (
              <span className="text-xs font-medium text-gray-500">
                Belum ada jadwal
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-indigo-700">
                  {todaySchedule}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {locations.length === 0 ? (
        <div className="text-center mt-10">
          <div className="bg-red-50 text-red-600 p-6 rounded-3xl border border-red-100">
            <AlertCircle size={48} className="mx-auto mb-4 opacity-80" />
            <h2 className="text-xl font-bold mb-2">Belum Ada Titik Presensi</h2>
            <p className="text-sm opacity-80">Admin belum mendaftarkan outlet atau titik lokasi manapun ke dalam database. Aplikasi membutuhkan kordinat lokasi Outlet agar karyawan bisa melakukan presensi. Silakan tambahkan lokasi di Supabase terlebih dahulu.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Location Section */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <MapPin size={18} className="text-red-600" />
            {isAssignedOutlet ? 'Titik Outlet Penugasan' : 'Titik Outlet Terdekat'}
          </h3>
          <button onClick={locateUser} className="p-2 text-gray-400 hover:text-red-600 bg-white rounded-full shadow-sm" title="Perbarui Lokasi GPS">
            <RefreshCw size={16} className={loadingLoc ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="h-64 relative bg-gray-100">
          {position && closestLocation ? (
            <MapContainer center={[closestLocation.latitude, closestLocation.longitude]} zoom={17} style={{ height: '100%', width: '100%', zIndex: 10 }}>
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
              />
              <Circle center={[closestLocation.latitude, closestLocation.longitude]} radius={closestLocation.radius} pathOptions={{ color: isWithinRadius ? '#10b981' : '#ef4444', fillColor: isWithinRadius ? '#10b981' : '#ef4444', fillOpacity: 0.2, weight: 2 }} />
              <Marker position={[closestLocation.latitude, closestLocation.longitude]}>
                <Popup>{closestLocation.name}</Popup>
              </Marker>
              <Marker position={[position.lat, position.lng]}>
                <Popup>Lokasi Anda ({Math.round(distance || 0)}m)</Popup>
              </Marker>
            </MapContainer>
          ) : gpsError ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
              <AlertCircle size={32} className="text-orange-400 shrink-0" />
              <p className="text-sm text-orange-700 font-medium leading-relaxed">{gpsError}</p>
              <button
                onClick={locateUser}
                className="text-xs font-bold text-red-600 bg-red-50 px-4 py-2 rounded-full border border-red-100 hover:bg-red-100 transition-colors"
              >
                Coba Lagi
              </button>
            </div>
          ) : loadingLoc ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
              <Loader2 size={28} className="animate-spin text-red-500" />
              <p className="text-sm font-medium">Mencari koordinat GPS Anda secara realtime...</p>
            </div>
          ) : !gpsStarted ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                <MapPin size={28} className="text-red-600" />
              </div>
              <p className="text-sm text-gray-500 text-center font-medium">Ketuk tombol di bawah untuk mendeteksi lokasi Anda</p>
              <button
                onClick={locateUser}
                className="bg-gray-900 text-white text-sm font-bold px-6 py-3 rounded-2xl flex items-center gap-2 active:scale-95 transition-transform shadow-md"
              >
                <MapPin size={16} />
                Deteksi Lokasi Saya
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 font-medium">
              Lokasi tidak ditemukan
            </div>
          )}
        </div>

        <div className="p-4 flex flex-col gap-3">
          {closestLocation && distance !== null ? (
            <>
              <div className="flex justify-between items-center px-1">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
                    {isAssignedOutlet ? '📍 Outlet Penugasan Shift' : '📍 Titik Outlet Terdekat'}
                  </span>
                  <span className="text-base font-black text-gray-900">{closestLocation.name.trim()}</span>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                  Radius {closestLocation.radius}m
                </span>
              </div>

              {isWithinRadius ? (
                <div className="bg-emerald-50 text-emerald-900 p-4 rounded-2xl border border-emerald-200 shadow-sm flex items-start gap-3">
                  <CheckCircle size={22} className="shrink-0 text-emerald-600 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <span className="font-bold block text-sm text-emerald-950">
                      ✅ Dalam Radius Presensi ({Math.round(distance)}m)
                    </span>
                    <p className="text-emerald-800 leading-relaxed">
                      Anda terdeteksi berada <strong>{Math.round(distance)} meter</strong> dari {closestLocation.name.trim()} (Maksimal radius: {closestLocation.radius}m). Posisi valid untuk presensi!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 text-red-900 p-4 rounded-2xl border border-red-200 shadow-sm flex items-start gap-3">
                  <AlertCircle size={22} className="shrink-0 text-red-600 mt-0.5" />
                  <div className="text-xs space-y-1.5 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-red-950">
                        ⚠️ Di Luar Radius Presensi!
                      </span>
                      <span className="bg-red-200/80 text-red-950 font-black text-[11px] px-2 py-0.5 rounded-md">
                        {Math.round(distance)} meter
                      </span>
                    </div>
                    <p className="text-red-800 leading-relaxed">
                      Anda terdeteksi berada <strong>{Math.round(distance)} meter</strong> dari {closestLocation.name.trim()}. Batas radius presensi yang diizinkan adalah <strong>{closestLocation.radius} meter</strong>.
                    </p>
                    <div className="bg-white/90 p-2.5 rounded-xl border border-red-200 text-red-950 flex items-center justify-between font-semibold">
                      <span>Harus lebih mendekat:</span>
                      <span className="text-sm font-black text-red-600">
                        ± {Math.max(1, Math.round(distance - closestLocation.radius))} meter lagi
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 p-3 bg-gray-50 rounded-xl animate-pulse h-12 flex items-center justify-center text-xs text-gray-400 gap-2">
              <Loader2 size={14} className="animate-spin text-red-500" />
              Menghitung jarak ke outlet...
            </div>
          )}
        </div>
      </div>

      {submitError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-xl">
          {submitError}
        </div>
      )}

      {isOffToday && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2">
          <span>🏖️ Hari ini jadwal Anda Libur Kerja (OFF).</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <button
          onClick={() => onClockClick('in')}
          disabled={!position || submitting || !isWithinRadius || todayStatus !== 'none' || isOffToday}
          className={`py-4 ${todayStatus !== 'none' || !position || !isWithinRadius || isOffToday ? 'bg-gray-100 text-gray-400 border-2 border-gray-200 cursor-not-allowed opacity-60' : 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-200 active:scale-95'} rounded-2xl font-bold transition-all flex flex-col items-center justify-center gap-1`}
        >
          <span>Clock IN</span>
        </button>
        <button
          onClick={() => onClockClick('out')}
          disabled={!position || submitting || !isWithinRadius || todayStatus !== 'in'}
          className={`py-4 ${todayStatus !== 'in' || !position || !isWithinRadius ? 'bg-gray-100 text-gray-400 border-2 border-gray-200 cursor-not-allowed opacity-60' : 'bg-white border-2 border-red-600 text-red-600 hover:bg-red-50 shadow-sm active:scale-95'} rounded-2xl font-bold transition-all flex flex-col items-center justify-center gap-1`}
        >
          <span>Clock OUT</span>
        </button>
      </div>

      {!isWithinRadius && distance !== null && closestLocation && (
        <div className="text-center text-xs text-red-700 font-bold bg-red-50 p-3.5 rounded-2xl border border-red-200 mt-4 flex items-center justify-center gap-2">
          <AlertCircle size={16} className="shrink-0 text-red-600" />
          <span>Tombol Clock IN & OUT terkunci karena Anda berada {Math.round(distance)}m di luar area {closestLocation.name.trim()}.</span>
        </div>
      )}

      {todayStatus === 'out' && (
        <div className="text-center bg-blue-50 border border-blue-100 text-blue-700 p-3 rounded-xl text-sm font-bold shadow-sm">
          ✅ Anda sudah menyelesaikan presensi hari ini.
        </div>
      )}
      
      {todayStatus === 'loading' && (
        <div className="flex justify-center text-gray-400 mt-4">
          <Loader2 size={24} className="animate-spin" />
        </div>
      )}

      {!isWithinRadius && distance !== null && closestLocation && (
        <p className="text-center text-xs text-orange-600 font-bold bg-orange-50 p-3 rounded-xl border border-orange-100 mt-4">
          Anda tidak dapat presensi karena berada di luar area {closestLocation.name}.
        </p>
      )}
        </>
      )}

      {/* Camera Modal */}
      {/* Camera Fullscreen */}
      {showCameraModal && (
        <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
          <div className="p-4 flex justify-between items-center bg-black/40 absolute top-0 left-0 right-0 z-10">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Camera size={18} className="text-white" />
              Ambil Foto Selfie
            </h3>
            <button onClick={closeCameraModal} className="text-white hover:text-gray-300 bg-black/50 rounded-full p-2">
              <X size={24} />
            </button>
          </div>
          
          <div className="flex-1 relative flex flex-col justify-center bg-black">
            {!stream && !photo ? (
              <div className="flex flex-col items-center justify-center text-gray-500">
                <Loader2 size={32} className="animate-spin text-red-500 mb-2" />
                <p className="font-medium text-white">Membuka kamera...</p>
              </div>
            ) : photo ? (
              <>
                <img src={photo} alt="Selfie" className="w-full h-full object-contain" />
                <button
                  onClick={retakePhoto}
                  className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm px-6 py-3 rounded-full font-bold text-gray-900 shadow-xl"
                >
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
                />
                <button
                  onClick={takePhoto}
                  className="absolute bottom-16 left-1/2 -translate-x-1/2 w-20 h-20 bg-white/30 backdrop-blur-md rounded-full border-4 border-white flex items-center justify-center shadow-xl active:scale-95 transition-transform"
                >
                  <div className="w-16 h-16 bg-white rounded-full"></div>
                </button>
              </>
            )}
          </div>

          {photo && (
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
              <button
                onClick={handlePresensi}
                disabled={submitting}
                className="w-full py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded-xl font-bold shadow-lg transition-all active:scale-95 flex items-center justify-center text-lg"
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
          <div className="bg-white rounded-3xl p-8 flex flex-col items-center justify-center max-w-xs w-full shadow-2xl animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
              <CheckCircle size={40} />
            </div>
            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Berhasil!</h3>
            <p className="text-gray-500 text-center font-medium leading-relaxed">{successMsg}</p>
          </div>
        </div>
      )}

    </div>
  );
};

export default ClockInOut;
