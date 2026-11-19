import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Camera,
  MapPin,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Loader2,
  X,
  Clock,
  SwitchCamera,
  Eye,
  Check,
  Building2,
} from 'lucide-react';
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

type Shift = {
  id: string;
  name: string;
  description?: string | null;
  checkInTime: string;
  checkOutTime: string;
  divisionId: string;
  locationId?: string | null;
  location?: Location | null;
  division?: { id: string; name: string } | null;
};

const ClockInOut = () => {
  const { user, updateUser } = useAuth();
  const [currentUser, setCurrentUser] = useState<any>(user);
  const navigate = useNavigate();

  // Locations & GPS
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

  // Camera
  const [showCameraModal, setShowCameraModal] = useState<false | 'in' | 'out'>(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoSizeKb, setPhotoSizeKb] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  // Submit states
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Jadwal Terdaftar (HANYA PELIHAT / DISPLAY ONLY)
  const [registeredScheduleText, setRegisteredScheduleText] = useState<string | null>(null);
  const [registeredScheduleShiftId, setRegisteredScheduleShiftId] = useState<string | null>(null);
  const [isRegisteredOff, setIsRegisteredOff] = useState(false);

  // Pilihan Shift Aktif (Ditentukan oleh karyawan lewat pop-up)
  const [availableShifts, setAvailableShifts] = useState<Shift[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(true);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [requiredLocationId, setRequiredLocationId] = useState<string | null>(null);

  // Status presensi hari ini
  const [todayStatus, setTodayStatus] = useState<'none' | 'in' | 'out' | 'loading'>('loading');

  // Helper date string YYYY-MM-DD
  const getTodayDateStr = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  // Clock tick
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

  // 1. Fetch outlets & initial data
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

    const todayDateStr = getTodayDateStr();

    // Cek apakah ada shift tersimpan di sessionStorage untuk hari ini
    const storageKey = `presensi_selected_shift_${user.id}_${todayDateStr}`;
    const savedShiftJson = sessionStorage.getItem(storageKey);
    let preselectedShift: Shift | null = null;
    if (savedShiftJson) {
      try {
        preselectedShift = JSON.parse(savedShiftJson);
        setSelectedShift(preselectedShift);
        setRequiredLocationId(preselectedShift?.locationId || null);
      } catch {
        sessionStorage.removeItem(storageKey);
      }
    }

    // Fetch user profile + jadwal terdaftar + status presensi
    Promise.all([
      fetch(`/api/users/${user.id}`).catch(() => null),
      fetch(`/api/schedules?date=${todayDateStr}&userId=${user.id}`).catch(() => null),
      fetch(`/api/attendance/${user.id}`).catch(() => null),
    ]).then(async ([userRes, schedRes, attRes]) => {
      let activeUser = currentUser || user;

      // 1. Update user profile
      if (userRes?.ok) {
        const ud = await userRes.json();
        if (ud.success && ud.user) {
          activeUser = ud.user;
          setCurrentUser(ud.user);
          updateUser(ud.user);
        }
      }

      const userDivisionId = activeUser?.divisionId;

      // Validasi cache shift di sessionStorage: HANYA boleh jika sesuai divisi user
      if (preselectedShift && (!userDivisionId || preselectedShift.divisionId !== userDivisionId)) {
        preselectedShift = null;
        setSelectedShift(null);
        setRequiredLocationId(null);
        sessionStorage.removeItem(storageKey);
      }

      // 2. Fetch shifts — HANYA SHIFT DARI DIVISI KARYAWAN SENDIRI
      let validShifts: Shift[] = [];
      if (userDivisionId) {
        try {
          const shiftsRes = await fetch(`/api/shifts?divisionId=${userDivisionId}`);
          if (shiftsRes.ok) {
            const sfd = await shiftsRes.json();
            if (sfd.success && Array.isArray(sfd.shifts)) {
              // Pastikan hanya shift milik divisinya sendiri dan bukan shift libur/off
              validShifts = sfd.shifts.filter(
                (s: Shift) =>
                  s.divisionId === userDivisionId &&
                  !(s.checkInTime === '00:00' && s.checkOutTime === '00:00') &&
                  !s.name.toUpperCase().includes('LIBUR') &&
                  !s.name.toUpperCase().includes('OFF')
              );
            }
          }
        } catch (e) {
          console.error('Error fetching division shifts:', e);
        }
      }
      setAvailableShifts(validShifts);
      setLoadingShifts(false);

      // 3. Update jadwal terdaftar (PELIHAT SAJA)
      let matchedRegisteredShift: Shift | null = null;
      let isRegisteredOffLocal = false;
      if (schedRes?.ok) {
        const sd = await schedRes.json();
        if (sd.success && sd.schedules?.length > 0 && sd.schedules[0]?.shift) {
          const shift = sd.schedules[0].shift;
          const isOff =
            (shift.checkInTime === '00:00' && shift.checkOutTime === '00:00') ||
            shift.name.toUpperCase().includes('OFF') ||
            shift.name.toUpperCase().includes('LIBUR');

          isRegisteredOffLocal = isOff;
          setIsRegisteredOff(isOff);
          setRegisteredScheduleShiftId(shift.id);

          if (isOff) {
            setRegisteredScheduleText('🏖️ Libur (OFF)');
          } else {
            setRegisteredScheduleText(
              `${shift.name} (${shift.checkInTime}–${shift.checkOutTime})${
                shift.location ? ` · ${shift.location.name}` : ''
              }`
            );
          }
          matchedRegisteredShift = shift;
        } else {
          setRegisteredScheduleText('Belum ada jadwal terdaftar');
        }
      } else {
        setRegisteredScheduleText('Belum ada jadwal terdaftar');
      }

      // 4. Update status presensi hari ini
      if (attRes?.ok) {
        const ad = await attRes.json();
        if (ad.success && ad.records) {
          const todayStr = new Date().toDateString();
          const todays = ad.records.filter(
            (r: any) => new Date(r.timestamp).toDateString() === todayStr
          );
          setTodayStatus(todays.length === 0 ? 'none' : todays[0].type);
        } else {
          setTodayStatus('none');
        }
      } else {
        setTodayStatus('none');
      }

      // 5. Penentuan default shift
      if (!preselectedShift) {
        if (matchedRegisteredShift && !isRegisteredOffLocal && matchedRegisteredShift.divisionId === userDivisionId) {
          const foundInValid = validShifts.find((s) => s.id === matchedRegisteredShift?.id);
          if (foundInValid) {
            setSelectedShift(foundInValid);
            setRequiredLocationId(foundInValid.locationId || null);
            sessionStorage.setItem(storageKey, JSON.stringify(foundInValid));
          } else {
            setShowShiftModal(true);
          }
        } else {
          setShowShiftModal(true);
        }
      }
    }).catch((err) => {
      console.error(err);
      setRegisteredScheduleText('Belum ada jadwal terdaftar');
      setTodayStatus('none');
      setLoadingShifts(false);
      setShowShiftModal(true);
    });
  }, [user?.id]);

  // Handler memilih shift dari modal
  const handleSelectShift = (shift: Shift) => {
    setSelectedShift(shift);
    setRequiredLocationId(shift.locationId || null);

    const todayDateStr = getTodayDateStr();
    if (user?.id) {
      sessionStorage.setItem(`presensi_selected_shift_${user.id}_${todayDateStr}`, JSON.stringify(shift));
    }
    setShowShiftModal(false);
  };

  // Evaluasi jarak ke outlet target berdasarkan aturan shift yang dipilih
  useEffect(() => {
    if (!position || locations.length === 0) return;

    let target: Location | null = null;
    let isAssigned = false;

    // Jika shift mewajibkan lokasi toko tertentu
    if (requiredLocationId) {
      const found = locations.find((l) => l.id === requiredLocationId);
      if (found) {
        target = found;
        isAssigned = true;
      }
    }

    // Jika shift bebas outlet (tanpa outlet spesifik):
    // Bebas presensi di outlet mana saja selama dalam radius salah satu outlet terdaftar.
    if (!target) {
      let minGap = Infinity;
      locations.forEach((loc) => {
        const d = getDistance(position, { lat: loc.latitude, lng: loc.longitude });
        const gap = d - loc.radius;
        if (gap < minGap) {
          minGap = gap;
          target = loc;
        }
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
          coords: {
            latitude: locations[0]?.latitude || -6.2,
            longitude: locations[0]?.longitude || 106.816666,
            accuracy: 10,
          },
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
      (err) => {
        if (!(err.code === 3 && position)) handleError(err);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
    );

    // getCurrentPosition untuk posisi pertama yang cepat
    navigator.geolocation.getCurrentPosition(
      processPosition,
      (err) => {
        if (!position) handleError(err);
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 5000 }
    );
  };

  // Camera handling
  const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
    try {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
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
      if (facingMode === 'user') {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, width, height);

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
    if (!selectedShift) {
      setShowShiftModal(true);
      return;
    }
    if (!isWithinRadius) {
      alert(
        `Lokasi belum sesuai aturan shift! Anda harus berada dalam radius ${
          closestLocation?.name || 'outlet'
        }.`
      );
      return;
    }
    setShowCameraModal(type);
    setPhoto(null);
    startCamera(facingMode);
  };

  const handlePresensi = async () => {
    if (!position || !user || !closestLocation || !showCameraModal || !photo || !isWithinRadius || !selectedShift) {
      return;
    }
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
          location: JSON.stringify({
            ...position,
            outlet: closestLocation.name,
            distance: Math.round(distance || 0),
            shiftName: selectedShift.name,
            shiftId: selectedShift.id,
          }),
          photo,
          shiftId: selectedShift.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (type === 'in') {
          if (data.lateInfo?.isLate) {
            setSuccessMsg(
              `⚠️ Presensi Masuk berhasil (${selectedShift.name}) di ${closestLocation.name}! (Terlambat ${data.lateInfo.durationText} dari Jadwal ${data.lateInfo.shiftCheckIn} WIB)`
            );
          } else {
            setSuccessMsg(
              `✅ Presensi Masuk (${selectedShift.name}) Tepat Waktu pukul ${formatAttendanceTime(
                new Date()
              )} WIB di ${closestLocation.name}!`
            );
          }
        } else {
          if (data.outInfo?.isEarly) {
            setSuccessMsg(
              `⚠️ Presensi Keluar berhasil (${selectedShift.name}) di ${closestLocation.name}! (Pulang lebih awal ${data.outInfo.durationText} dari Jadwal ${data.outInfo.shiftCheckOut} WIB)`
            );
          } else {
            setSuccessMsg(
              `✅ Presensi Keluar (${selectedShift.name}) Selesai pukul ${formatAttendanceTime(
                new Date()
              )} WIB di ${closestLocation.name}!`
            );
          }
        }
        setTimeout(() => {
          closeCameraModal();
          navigate('/history');
        }, 2500);
      } else {
        setSubmitError(data.error || 'Gagal mencatat presensi.');
      }
    } catch {
      setSubmitError('Tidak dapat terhubung ke server.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Loading awal ───
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
      {/* ─── Header: Divisi + Waktu WIB ─── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
            {currentUser?.division?.name || user?.division?.name || 'Karyawan'}
          </span>
          <div className="text-sm font-bold text-gray-900 truncate">
            {currentUser?.name || user?.name || 'Presensi'}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-black font-mono tracking-tight text-gray-900">
            {formatAttendanceTime(currentTime)}
            <span className="text-[10px] font-bold text-indigo-400 ml-1">WIB</span>
          </div>
          <div className="text-[10px] text-gray-400">
            {currentTime.toLocaleDateString('id-ID', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}
          </div>
        </div>
      </div>

      {/* ─── Info Jadwal Terdaftar (HANYA PELIHAT / DISPLAY ONLY) ─── */}
      <div className="flex items-center justify-between text-xs text-gray-600 bg-gray-50/90 border border-gray-200/80 rounded-xl px-3.5 py-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Eye size={14} className="text-gray-400 shrink-0" />
          <span className="font-medium text-gray-500 shrink-0">Jadwal Terdaftar:</span>
          {registeredScheduleText === null ? (
            <Loader2 size={12} className="animate-spin text-gray-400" />
          ) : (
            <span
              className={`font-semibold truncate ${
                isRegisteredOff ? 'text-amber-700' : 'text-gray-800'
              }`}
            >
              {registeredScheduleText}
            </span>
          )}
        </div>
        <span className="text-[10px] bg-gray-200/80 text-gray-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 ml-1">
          Pelihat
        </span>
      </div>

      {/* ─── Kartu Shift yang Dipilih & Aturan Shift ─── */}
      <div className="bg-gradient-to-br from-white to-red-50/30 border border-red-100 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                Shift yang Dipilih
              </span>
              {selectedShift && (
                <span className="text-xs font-mono font-bold text-gray-700">
                  {selectedShift.checkInTime} – {selectedShift.checkOutTime} WIB
                </span>
              )}
            </div>

            <h3 className="text-base font-black text-gray-900 truncate">
              {selectedShift ? selectedShift.name : 'Belum Memilih Shift'}
            </h3>

            <div className="text-xs text-gray-600 mt-1 flex items-center gap-1">
              <Building2 size={13} className="text-red-500 shrink-0" />
              <span className="truncate">
                {selectedShift?.location ? (
                  <>
                    Aturan Lokasi: <strong className="text-gray-900">{selectedShift.location.name}</strong>
                  </>
                ) : (
                  'Aturan Lokasi: Bebas di outlet mana saja'
                )}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowShiftModal(true)}
            className="px-3 py-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold rounded-xl shadow-sm transition-all active:scale-95 flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw size={13} />
            Ganti Shift
          </button>
        </div>

        {/* Status Evaluasi Aturan Shift */}
        {selectedShift && (
          <div
            className={`p-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
              !position
                ? 'bg-gray-50 border-gray-200 text-gray-600'
                : isWithinRadius
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {!position ? (
              <>
                <Loader2 size={14} className="animate-spin text-gray-400 shrink-0" />
                <span>Mendeteksi lokasi GPS untuk verifikasi aturan shift...</span>
              </>
            ) : isWithinRadius ? (
              <>
                <CheckCircle size={15} className="text-emerald-600 shrink-0" />
                <span>
                  <strong>Sudah sesuai aturan!</strong> Berada di {closestLocation?.name} (jarak{' '}
                  {Math.round(distance || 0)}m). Siap presensi.
                </span>
              </>
            ) : (
              <>
                <AlertCircle size={15} className="text-red-500 shrink-0" />
                <span>
                  <strong>Belum sesuai aturan!</strong> Shift {selectedShift.name}{' '}
                  {isAssignedOutlet
                    ? `mengharuskan presensi di ${closestLocation?.name}`
                    : 'memerlukan Anda berada di radius outlet'}
                  . Jarak Anda {Math.round(distance || 0)}m (maks {closestLocation?.radius}m).
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {locations.length === 0 ? (
        <div className="bg-red-50 text-red-600 p-5 rounded-2xl border border-red-100 text-center">
          <AlertCircle size={32} className="mx-auto mb-2 opacity-80" />
          <h2 className="text-base font-bold mb-1">Belum Ada Titik Presensi</h2>
          <p className="text-xs opacity-80">
            Admin belum mendaftarkan outlet. Tambahkan lokasi di database terlebih dahulu.
          </p>
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
                  {closestLocation
                    ? closestLocation.name
                    : isAssignedOutlet
                    ? 'Outlet Penugasan'
                    : 'Outlet Terdekat'}
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
                <Suspense
                  fallback={
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                      <Loader2 size={22} className="animate-spin text-red-500" />
                      <p className="text-xs text-gray-400">Memuat peta...</p>
                    </div>
                  }
                >
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

            {/* Status bar jarak */}
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

          {/* Banner status hari ini */}
          {todayStatus === 'out' && (
            <div className="bg-blue-50 border border-blue-100 text-blue-700 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
              <CheckCircle size={15} className="text-blue-600 shrink-0" />
              <span>Presensi hari ini sudah selesai (Clock IN & OUT tercatat).</span>
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
              disabled={
                !selectedShift ||
                !position ||
                submitting ||
                !isWithinRadius ||
                todayStatus !== 'none'
              }
              className={`py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2
                ${
                  !selectedShift ||
                  todayStatus !== 'none' ||
                  !position ||
                  !isWithinRadius
                    ? 'bg-gray-100 text-gray-400 border-2 border-gray-200 cursor-not-allowed opacity-60'
                    : 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-200'
                }`}
            >
              <Clock size={16} />
              Clock IN
            </button>
            <button
              onClick={() => onClockClick('out')}
              disabled={
                !selectedShift ||
                !position ||
                submitting ||
                !isWithinRadius ||
                todayStatus !== 'in'
              }
              className={`py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2
                ${
                  !selectedShift ||
                  todayStatus !== 'in' ||
                  !position ||
                  !isWithinRadius
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

      {/* ─── Pop-up Sederhana: Mau Presensi Sebagai Shift Apa? ─── */}
      {showShiftModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-gray-100 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base sm:text-lg font-black text-gray-900">
                  Mau Presensi Sebagai Shift Apa?
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Shift divisi: <strong className="text-red-600">{currentUser?.division?.name || user?.division?.name || 'Divisi Anda'}</strong>
                </p>
              </div>
              {selectedShift && (
                <button
                  type="button"
                  onClick={() => setShowShiftModal(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                  title="Tutup"
                >
                  <X size={20} />
                </button>
              )}
            </div>

            {/* Info Jadwal Terdaftar (Pelihat Saja) */}
            {registeredScheduleText && (
              <div className="mt-3 p-2.5 bg-blue-50/80 border border-blue-100 rounded-xl text-xs text-blue-900 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold shrink-0">📅 Jadwal Terdaftar:</span>
                  <span className="truncate">{registeredScheduleText}</span>
                </div>
                <span className="text-[10px] bg-blue-200/80 text-blue-800 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0">
                  Pelihat
                </span>
              </div>
            )}

            {/* Daftar Pilihan Shift */}
            <div className="my-3 overflow-y-auto flex-1 space-y-2 pr-1 max-h-[50vh]">
              {loadingShifts ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Loader2 size={24} className="animate-spin text-red-500" />
                  <p className="text-xs text-gray-400">Memuat daftar shift divisi...</p>
                </div>
              ) : availableShifts.length === 0 ? (
                <div className="text-center py-8 px-4 text-xs">
                  {!(currentUser?.divisionId || user?.divisionId) ? (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl">
                      <AlertCircle size={28} className="mx-auto mb-2 text-amber-500" />
                      <p className="font-bold">Belum Terdaftar di Divisi</p>
                      <p className="mt-1 text-gray-600">Akun Anda belum memiliki divisi. Silakan hubungi admin untuk menentukan divisi Anda.</p>
                    </div>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 text-gray-600 p-4 rounded-2xl">
                      <AlertCircle size={28} className="mx-auto mb-2 text-gray-400" />
                      <p className="font-bold">Belum Ada Shift di Divisi Ini</p>
                      <p className="mt-1 text-gray-500">Belum ada shift kerja terdaftar untuk divisi {currentUser?.division?.name || user?.division?.name}.</p>
                    </div>
                  )}
                </div>
              ) : (
                availableShifts.map((s) => {
                  const isSelected = selectedShift?.id === s.id;
                  const isMatchSchedule = registeredScheduleShiftId === s.id;

                  return (
                    <div
                      key={s.id}
                      onClick={() => handleSelectShift(s)}
                      className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all active:scale-[0.98] ${
                        isSelected
                          ? 'border-red-500 bg-red-50/70 ring-2 ring-red-500/20 shadow-sm'
                          : 'border-gray-200 hover:border-red-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-bold text-sm text-gray-900 flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{s.name}</span>
                          {isMatchSchedule && (
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md shrink-0">
                              ⭐ Sesuai Jadwal
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-mono font-bold text-red-600 bg-white px-2 py-0.5 rounded-lg border border-red-100 shrink-0">
                          {s.checkInTime} – {s.checkOutTime}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1 min-w-0">
                          <MapPin
                            size={13}
                            className={s.location ? 'text-red-500 shrink-0' : 'text-gray-400 shrink-0'}
                          />
                          {s.location ? (
                            <span className="font-semibold text-gray-700 truncate">
                              Wajib di {s.location.name} (r={s.location.radius}m)
                            </span>
                          ) : (
                            <span className="text-gray-500 truncate">Bebas Outlet (Semua Lokasi)</span>
                          )}
                        </span>
                        {isSelected && (
                          <span className="ml-auto flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-100/80 px-2 py-0.5 rounded-full shrink-0">
                            <Check size={12} />
                            Dipilih
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
              <p className="text-[11px] text-gray-400">
                *Klik salah satu shift untuk mulai presensi.
              </p>
              {selectedShift && (
                <button
                  type="button"
                  onClick={() => setShowShiftModal(false)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-md active:scale-95 transition-all"
                >
                  Gunakan Shift Ini
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Camera Modal ─── */}
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
              <button
                onClick={closeCameraModal}
                className="text-white bg-black/50 hover:bg-black/75 rounded-full p-2.5"
              >
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
                    <span className="text-emerald-300 text-[10px] font-bold uppercase tracking-wider bg-emerald-950/60 px-1.5 py-0.5 rounded">
                      Optimal
                    </span>
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

      {/* ─── Success Modal ─── */}
      {successMsg && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white rounded-3xl p-8 flex flex-col items-center max-w-xs w-full shadow-2xl">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
              <CheckCircle size={32} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Berhasil!</h3>
            <p className="text-gray-500 text-sm text-center font-medium leading-relaxed">
              {successMsg}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClockInOut;
