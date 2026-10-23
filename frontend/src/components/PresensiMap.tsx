// Komponen ini di-lazy load — Leaflet TIDAK ikut bundle utama
import { MapContainer, TileLayer, Marker, Circle, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

type Props = {
  position: { lat: number; lng: number };
  outlet: { latitude: number; longitude: number; name: string; radius: number };
  distance: number;
  isWithinRadius: boolean;
};

const PresensiMap = ({ position, outlet, distance, isWithinRadius }: Props) => (
  <MapContainer
    center={[outlet.latitude, outlet.longitude]}
    zoom={17}
    style={{ height: '100%', width: '100%', zIndex: 10 }}
  >
    <TileLayer
      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      attribution="Tiles &copy; Esri"
    />
    <Circle
      center={[outlet.latitude, outlet.longitude]}
      radius={outlet.radius}
      pathOptions={{
        color: isWithinRadius ? '#10b981' : '#ef4444',
        fillColor: isWithinRadius ? '#10b981' : '#ef4444',
        fillOpacity: 0.2,
        weight: 2,
      }}
    />
    <Marker position={[outlet.latitude, outlet.longitude]}>
      <Popup>{outlet.name}</Popup>
    </Marker>
    <Marker position={[position.lat, position.lng]}>
      <Popup>Lokasi Anda ({Math.round(distance)}m)</Popup>
    </Marker>
  </MapContainer>
);

export default PresensiMap;
