import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Clock, MapPin, Loader2, Image as ImageIcon, X } from 'lucide-react';

const History = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!user?.id) return;
      try {
        const res = await fetch(`/api/attendance/${user.id}`);
        const data = await res.json();
        if (data.success) {
          setRecords(data.records);
        }
      } catch (err) {
        console.error('Failed to fetch history', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [user]);

  // Group records by day
  const groupedRecords: { [key: string]: { date: Date; in?: any; out?: any } } = {};
  
  records.forEach(record => {
    const dateObj = new Date(record.timestamp);
    const dateStr = dateObj.toDateString(); // e.g. "Mon Oct 07 2026"
    
    if (!groupedRecords[dateStr]) {
      groupedRecords[dateStr] = { date: dateObj };
    }
    
    // Sort logic to make sure we don't overwrite the correct in/out if multiple exist
    if (record.type === 'in' && !groupedRecords[dateStr].in) {
      groupedRecords[dateStr].in = record;
    } else if (record.type === 'out' && !groupedRecords[dateStr].out) {
      groupedRecords[dateStr].out = record;
    }
  });

  const dailyHistory = Object.values(groupedRecords).sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="p-4 max-w-lg mx-auto pb-24">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Clock className="text-indigo-600" />
        Riwayat Kehadiran
      </h2>

      {loading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="animate-spin text-indigo-600" size={32} />
        </div>
      ) : dailyHistory.length === 0 ? (
        <div className="bg-gray-50 border border-gray-100 rounded-3xl p-8 text-center">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm mb-4">
            <Clock className="text-gray-400" size={24} />
          </div>
          <p className="text-gray-500 font-medium">Belum ada riwayat kehadiran.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {dailyHistory.map((dayData, idx) => {
            const inRecord = dayData.in;
            const outRecord = dayData.out;
            const locInfoIn = inRecord ? JSON.parse(inRecord.location || '{}') : null;
            const locInfoOut = outRecord ? JSON.parse(outRecord.location || '{}') : null;
            
            return (
              <div key={idx} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Header Card */}
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-800">
                    {dayData.date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
                
                {/* Body Card */}
                <div className="p-4 flex flex-col gap-4">
                  {/* Clock IN */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-50 text-green-600 flex items-center justify-center shrink-0 border border-green-100">
                      <span className="font-bold text-xs">IN</span>
                    </div>
                    <div className="flex-1">
                      {inRecord ? (
                        <>
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-gray-900">
                              {new Date(inRecord.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {inRecord.photo && (
                              <button 
                                onClick={() => setSelectedPhoto(inRecord.photo)}
                                className="w-10 h-10 rounded-lg overflow-hidden border-2 border-indigo-100 shadow-sm transition-transform active:scale-95 shrink-0"
                              >
                                <img 
                                  src={inRecord.photo.startsWith('data:') ? inRecord.photo : `data:image/jpeg;base64,${inRecord.photo}`} 
                                  alt="Foto IN" 
                                  className="w-full h-full object-cover"
                                />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <MapPin size={12} className="shrink-0 text-gray-400" />
                            <span className="truncate">{locInfoIn?.outlet || 'Lokasi tidak diketahui'}</span>
                          </div>
                        </>
                      ) : (
                        <div className="h-10 flex items-center text-sm font-medium text-gray-400 italic">
                          Belum absen masuk
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="h-px bg-gray-100 w-full my-1"></div>

                  {/* Clock OUT */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 border border-orange-100">
                      <span className="font-bold text-xs">OUT</span>
                    </div>
                    <div className="flex-1">
                      {outRecord ? (
                        <>
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-gray-900">
                              {new Date(outRecord.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {outRecord.photo && (
                              <button 
                                onClick={() => setSelectedPhoto(outRecord.photo)}
                                className="w-10 h-10 rounded-lg overflow-hidden border-2 border-indigo-100 shadow-sm transition-transform active:scale-95 shrink-0"
                              >
                                <img 
                                  src={outRecord.photo.startsWith('data:') ? outRecord.photo : `data:image/jpeg;base64,${outRecord.photo}`} 
                                  alt="Foto OUT" 
                                  className="w-full h-full object-cover"
                                />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <MapPin size={12} className="shrink-0 text-gray-400" />
                            <span className="truncate">{locInfoOut?.outlet || 'Lokasi tidak diketahui'}</span>
                          </div>
                        </>
                      ) : (
                        <div className="h-10 flex items-center text-sm font-medium text-gray-400 italic">
                          Belum absen keluar
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Photo Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm relative">
            <button 
              onClick={() => setSelectedPhoto(null)} 
              className="absolute -top-12 right-0 text-white bg-black/50 p-2 rounded-full hover:bg-gray-800 transition"
            >
              <X size={24} />
            </button>
            <img 
              src={selectedPhoto.startsWith('data:') ? selectedPhoto : `data:image/jpeg;base64,${selectedPhoto}`} 
              alt="Bukti Kehadiran" 
              className="w-full rounded-2xl shadow-2xl object-contain max-h-[80vh]" 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default History;
