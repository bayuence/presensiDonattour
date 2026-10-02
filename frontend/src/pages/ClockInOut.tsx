import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { MapContainer, TileLayer, Marker, Circle, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Camera, MapPin, CheckCircle, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [locations, setLocations] = useState<Location[]>([]);
  const [closestLocation, setClosestLocation] = useState<Location | null>(null);
  const [position, setPosition] = useState<{lat: number, lng: number} | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [isWithinRadius, setIsWithinRadius] = useState(false);
  
  const [loadingLoc, setLoadingLoc] = useState(true);
  const [fetchingOutlets, setFetchingOutlets] = useState(true);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const getDistance = (p1: {lat: number, lng: number}, p2: {lat: number, lng: number}) => {
    const R = 6371e3;
    const φ1 = p1.lat * Math.PI / 180;
    const φ2 = p2.lat * Math.PI / 180;
    const Δφ = (p2.lat - p1.lat) * Math.PI / 180;
    const Δλ = (p2.lng - p1.lng) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

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
  }, []);

  useEffect(() => {
    if (!fetchingOutlets) {
      locateUser();
    }
  }, [fetchingOutlets]);

  const locateUser = () => {
    if (locations.length === 0) {
      setLoadingLoc(false);
      return;
    }
    
    setLoadingLoc(true);
    if (!('geolocation' in navigator)) {
      setLoadingLoc(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(newPos);
        
        // Find closest location
        let minDistance = Infinity;
        let closest: Location | null = null;
        
        locations.forEach(loc => {
          const dist = getDistance(newPos, { lat: loc.latitude, lng: loc.longitude });
          if (dist < minDistance) {
            minDistance = dist;
            closest = loc;
          }
        });

        if (closest) {
          setClosestLocation(closest);
          setDistance(minDistance);
          setIsWithinRadius(minDistance <= (closest as Location).radius);
        }
        
        setLoadingLoc(false);
      },
      (err) => {
        console.error(err);
        setLoadingLoc(false);
        alert('Gagal mendapatkan lokasi. Pastikan GPS aktif.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      alert('Gagal mengakses kamera. Berikan izin kamera untuk melanjutkan.');
    }
  };

  const takePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      setPhoto(canvas.toDataURL('image/jpeg'));
      stream?.getTracks().forEach(t => t.stop());
      setStream(null);
    }
  };

  const retakePhoto = () => {
    setPhoto(null);
    startCamera();
  };

  const handlePresensi = async (type: 'in' | 'out') => {
    if (!position || !photo || !user || !closestLocation) return;
    
    // Opsional: Blokir presensi jika diluar radius
    // if (!isWithinRadius) {
    //   alert('Anda berada di luar area presensi yang diizinkan!');
    //   return;
    // }

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
        }),
      });

      const data = await res.json();

      if (data.success) {
        alert(`Presensi ${type === 'in' ? 'Masuk' : 'Keluar'} berhasil dicatat di ${closestLocation.name}!`);
        navigate('/dashboard');
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

  if (locations.length === 0) {
    return (
      <div className="p-4 max-w-lg mx-auto pb-24 text-center mt-10">
        <div className="bg-red-50 text-red-600 p-6 rounded-3xl border border-red-100">
          <AlertCircle size={48} className="mx-auto mb-4 opacity-80" />
          <h2 className="text-xl font-bold mb-2">Belum Ada Titik Presensi</h2>
          <p className="text-sm opacity-80">Admin belum mendaftarkan outlet atau titik lokasi manapun. Silakan hubungi Admin untuk mengatur Manajemen Lokasi terlebih dahulu.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6 pb-24">
      {/* Location Section */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <MapPin size={18} className="text-red-600" />
            Titik Outlet Terdekat
          </h3>
          <button onClick={locateUser} className="p-2 text-gray-400 hover:text-red-600 bg-white rounded-full shadow-sm">
            <RefreshCw size={16} className={loadingLoc ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="h-64 relative bg-gray-100">
          {position && closestLocation ? (
            <MapContainer center={[closestLocation.latitude, closestLocation.longitude]} zoom={17} style={{ height: '100%', width: '100%', zIndex: 10 }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Circle center={[closestLocation.latitude, closestLocation.longitude]} radius={closestLocation.radius} pathOptions={{ color: 'red', fillColor: 'red', fillOpacity: 0.1 }} />
              <Marker position={[closestLocation.latitude, closestLocation.longitude]}>
                <Popup>{closestLocation.name}</Popup>
              </Marker>
              <Marker position={[position.lat, position.lng]}>
                <Popup>Lokasi Anda</Popup>
              </Marker>
            </MapContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 font-medium">
              {loadingLoc ? 'Mencari lokasi Anda...' : 'Lokasi tidak ditemukan'}
            </div>
          )}
        </div>

        <div className="p-4 flex flex-col gap-3">
          {closestLocation && distance !== null ? (
            <>
              <div className="flex justify-between items-center px-2">
                <span className="text-sm text-gray-500 font-medium">Outlet Terdeteksi:</span>
                <span className="text-sm font-bold text-gray-900">{closestLocation.name}</span>
              </div>
              {isWithinRadius ? (
                <div className="flex-1 flex items-center gap-3 bg-green-50 text-green-700 p-3.5 rounded-xl border border-green-100">
                  <CheckCircle size={20} className="shrink-0" />
                  <span className="text-sm font-medium">Dalam radius (Jarak: {Math.round(distance)}m)</span>
                </div>
              ) : (
                <div className="flex-1 flex items-center gap-3 bg-red-50 text-red-700 p-3.5 rounded-xl border border-red-100">
                  <AlertCircle size={20} className="shrink-0" />
                  <span className="text-sm font-medium">Di luar radius (Jarak: {Math.round(distance)}m / Max: {closestLocation.radius}m)</span>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 p-3 bg-gray-50 rounded-xl animate-pulse h-12"></div>
          )}
        </div>
      </div>

      {/* Camera Section */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Camera size={18} className="text-red-600" />
            Selfie Kehadiran
          </h3>
        </div>

        <div className="p-4">
          {!stream && !photo ? (
            <div
              onClick={startCamera}
              className="h-64 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center text-gray-500 cursor-pointer hover:bg-gray-50 hover:border-red-300 transition-colors"
            >
              <Camera size={48} className="mb-3 opacity-50" />
              <p className="font-medium">Ketuk untuk buka kamera</p>
            </div>
          ) : photo ? (
            <div className="relative">
              <img src={photo} alt="Selfie" className="w-full h-auto rounded-2xl object-cover max-h-64" />
              <button
                onClick={retakePhoto}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm px-5 py-2.5 rounded-full font-bold text-sm text-gray-900 shadow-xl"
              >
                Foto Ulang
              </button>
            </div>
          ) : (
            <div className="relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-64 object-cover rounded-2xl bg-black"
              />
              <button
                onClick={takePhoto}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 w-16 h-16 bg-white/30 backdrop-blur-md rounded-full border-4 border-white flex items-center justify-center shadow-xl active:scale-95 transition-transform"
              >
                <div className="w-12 h-12 bg-white rounded-full"></div>
              </button>
            </div>
          )}
        </div>
      </div>

      {submitError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-xl">
          {submitError}
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => handlePresensi('in')}
          disabled={!photo || !position || submitting || !isWithinRadius}
          className="py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-2xl font-bold shadow-lg shadow-red-200 disabled:shadow-none transition-all active:scale-95 flex flex-col items-center justify-center gap-1"
        >
          <span>Clock IN</span>
        </button>
        <button
          onClick={() => handlePresensi('out')}
          disabled={!photo || !position || submitting || !isWithinRadius}
          className="py-4 bg-white border-2 border-red-600 text-red-600 hover:bg-red-50 disabled:border-gray-200 disabled:text-gray-400 rounded-2xl font-bold shadow-sm transition-all active:scale-95 flex flex-col items-center justify-center gap-1"
        >
          <span>Clock OUT</span>
        </button>
      </div>

      {!isWithinRadius && distance !== null && closestLocation && (
        <p className="text-center text-xs text-orange-600 font-bold bg-orange-50 p-3 rounded-xl border border-orange-100">
          Anda tidak dapat presensi karena berada di luar area {closestLocation.name}.
        </p>
      )}
    </div>
  );
};

export default ClockInOut;
