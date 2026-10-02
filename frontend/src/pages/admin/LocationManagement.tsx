import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { MapPin, Plus, Trash2, Edit2, Check, X, Search, Loader2, Navigation } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet default marker icon issue in React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

type Location = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
};

// Component to handle map clicks for coordinate selection
function LocationPicker({ position, setPosition }: { position: [number, number], setPosition: (p: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });
  return position ? <Marker position={position} /> : null;
}

// Component to programmatically move the map
function MapCenterer({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 17);
  }, [center, map]);
  return null;
}

const LocationManagement = () => {
  const { user } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  
  // Form State
  const [name, setName] = useState('');
  const [position, setPosition] = useState<[number, number]>([-6.200000, 106.816666]); // Default Jakarta
  const [mapCenter, setMapCenter] = useState<[number, number]>([-6.200000, 106.816666]);
  const [radius, setRadius] = useState<number>(50);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      const response = await fetch('/api/locations');
      const data = await response.json();
      if (data.success) {
        setLocations(data.locations);
      }
    } catch (error) {
      console.error('Failed to fetch locations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseCurrentLocation = () => {
    setIsGettingLocation(true);
    if (!('geolocation' in navigator)) {
      alert('GPS tidak didukung di perangkat ini');
      setIsGettingLocation(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newPos: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setPosition(newPos);
        setMapCenter(newPos);
        setIsGettingLocation(false);
      },
      (err) => {
        console.error(err);
        alert('Gagal mendapatkan lokasi. Pastikan izin GPS diberikan.');
        setIsGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const url = editingLocation ? `/api/locations/${editingLocation.id}` : '/api/locations';
      const method = editingLocation ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, latitude: position[0], longitude: position[1], radius })
      });
      
      const data = await response.json();
      if (data.success) {
        fetchLocations();
        closeModal();
      }
    } catch (error) {
      console.error('Failed to save location:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus lokasi ini?')) return;
    
    try {
      await fetch(`/api/locations/${id}`, { method: 'DELETE' });
      fetchLocations();
    } catch (error) {
      console.error('Failed to delete location:', error);
    }
  };

  const openModal = (location?: Location) => {
    if (location) {
      setEditingLocation(location);
      setName(location.name);
      setPosition([location.latitude, location.longitude]);
      setMapCenter([location.latitude, location.longitude]);
      setRadius(location.radius);
    } else {
      setEditingLocation(null);
      setName('');
      setPosition([-6.200000, 106.816666]);
      setMapCenter([-6.200000, 106.816666]);
      setRadius(50);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingLocation(null);
    setName('');
  };

  // If not admin, block access
  if ((user?.role || '').toLowerCase() !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const filteredLocations = locations.filter(l => 
    l.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="pb-24 pt-6 px-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manajemen Lokasi</h1>
          <p className="text-sm text-gray-500 mt-1">Kelola titik presensi (outlet) untuk karyawan</p>
        </div>
        <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center text-red-600 shadow-sm">
          <MapPin size={24} strokeWidth={2.5} />
        </div>
      </div>

      {/* Search and Add Action */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Cari lokasi..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all text-sm shadow-sm"
          />
        </div>
        <button 
          onClick={() => openModal()}
          className="bg-gray-900 text-white px-4 rounded-xl flex items-center justify-center shadow-md shadow-gray-900/20 active:scale-95 transition-transform"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Location List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={24} className="text-red-500 animate-spin" />
          </div>
        ) : filteredLocations.length > 0 ? (
          filteredLocations.map((location) => (
            <div key={location.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-red-600">
                  <MapPin size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{location.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Radius: {location.radius}m • {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => openModal(location)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Edit2 size={16} />
                </button>
                <button 
                  onClick={() => handleDelete(location.id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-10 bg-white rounded-2xl border border-gray-100 border-dashed">
            <MapPin size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium text-sm">Tidak ada lokasi ditemukan.</p>
          </div>
        )}
      </div>

      {/* Modal Add/Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
              <h2 className="font-bold text-lg text-gray-900">
                {editingLocation ? 'Edit Lokasi' : 'Tambah Lokasi Baru'}
              </h2>
              <button type="button" onClick={closeModal} className="p-1 text-gray-400 hover:text-gray-600 bg-white rounded-full shadow-sm">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 flex-1 overflow-y-auto">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Nama Outlet/Lokasi</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all text-sm"
                    placeholder="Contoh: Outlet Sudirman"
                    required
                  />
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Pilih Titik di Peta</label>
                    <button 
                      type="button"
                      onClick={handleUseCurrentLocation}
                      disabled={isGettingLocation}
                      className="text-[10px] bg-red-50 text-red-600 px-2 py-1.5 rounded-lg font-bold flex items-center gap-1.5 hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      {isGettingLocation ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Navigation size={12} />
                      )}
                      <span>Gunakan GPS</span>
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">Geser dan klik peta atau gunakan GPS otomatis.</p>
                  <div className="h-48 rounded-xl overflow-hidden border border-gray-200 z-0 relative">
                    <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <LocationPicker position={position} setPosition={setPosition} />
                      <MapCenterer center={mapCenter} />
                    </MapContainer>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <input type="number" step="any" value={position[0]} readOnly className="w-1/2 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-600" />
                    <input type="number" step="any" value={position[1]} readOnly className="w-1/2 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-600" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Radius Toleransi (Meter)</label>
                  <input 
                    type="number" 
                    value={radius}
                    onChange={(e) => setRadius(parseInt(e.target.value))}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all text-sm"
                    placeholder="50"
                    min="10"
                    required
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Jarak maksimal karyawan bisa melakukan presensi dari titik ini.</p>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting || !name.trim()}
                className="w-full mt-8 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-red-600/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    <Check size={18} />
                    <span>Simpan Lokasi</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationManagement;
