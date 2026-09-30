import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Briefcase, Plus, Pencil, Trash2, X, Search } from 'lucide-react';
import { Navigate } from 'react-router-dom';

type Division = {
  id: string;
  name: string;
};

const DivisionManagement = () => {
  const { user: currentUser } = useAuth();
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If not admin, block access
  if ((currentUser?.role || '').toLowerCase() !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const fetchDivisions = async () => {
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/divisions');
      const data = await res.json();
      if (data.success && Array.isArray(data.divisions)) {
        setDivisions(data.divisions);
      } else {
        setDivisions([]);
      }
    } catch (error) {
      console.error(error);
      setDivisions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDivisions();
  }, []);

  const handleOpenModal = (division?: Division) => {
    if (division) {
      setEditingDivision(division);
      setName(division.name || '');
    } else {
      setEditingDivision(null);
      setName('');
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingDivision(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return alert('Nama Divisi wajib diisi');
    
    setIsSubmitting(true);
    try {
      const url = editingDivision 
        ? `https://presensi-api.onrender.com/api/divisions/${editingDivision.id}` 
        : (import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/divisions';
      
      const method = editingDivision ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      
      const data = await res.json();
      if (data.success) {
        fetchDivisions();
        handleCloseModal();
      } else {
        alert(data.message || 'Gagal menyimpan data');
      }
    } catch (error) {
      console.error(error);
      alert('Terjadi kesalahan jaringan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, divName: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus divisi ${divName}?`)) return;
    
    try {
      const res = await fetch(`https://presensi-api.onrender.com/api/divisions/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchDivisions();
      } else {
        alert('Gagal menghapus data');
      }
    } catch (error) {
      console.error(error);
      alert('Terjadi kesalahan jaringan');
    }
  };

  const safeSearch = (search || '').toLowerCase();
  const filteredDivisions = (divisions || []).filter(d => 
    (d?.name || '').toLowerCase().includes(safeSearch)
  );

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24">
      
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Briefcase size={24} className="text-indigo-600" />
            Divisi / Jabatan
          </h2>
          <p className="text-sm text-gray-500 font-medium">Kelola daftar pekerjaan di kantor</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search size={20} className="text-gray-400" />
        </div>
        <input 
          type="text" 
          placeholder="Cari nama divisi..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-medium text-gray-900"
        />
      </div>

      {/* Division List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-10">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
            <p className="text-gray-500 text-sm mt-3 font-medium">Memuat data...</p>
          </div>
        ) : filteredDivisions.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-3xl border border-gray-100 border-dashed">
            <Briefcase size={48} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Tidak ada divisi ditemukan.</p>
          </div>
        ) : (
          filteredDivisions.map((d) => (
            <div key={d.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between group">
              <div className="flex items-center gap-4 overflow-hidden">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                  <Briefcase size={22} />
                </div>
                <div className="truncate pr-2">
                  <h3 className="font-bold text-gray-900 truncate">{d?.name}</h3>
                </div>
              </div>
              
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => handleOpenModal(d)}
                  className="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition-colors"
                >
                  <Pencil size={18} />
                </button>
                <button 
                  onClick={() => handleDelete(d.id, d.name)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* FAB Add Button */}
      <button 
        onClick={() => handleOpenModal()}
        className="absolute bottom-24 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-2xl shadow-indigo-600/40 flex items-center justify-center transition-transform active:scale-90 z-[100]"
      >
        <Plus size={28} strokeWidth={2.5} />
      </button>

      {/* Modal / Bottom Sheet */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-center items-end sm:items-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCloseModal}></div>
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl relative animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-10 duration-300">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-3xl">
              <h3 className="text-lg font-bold text-gray-900">
                {editingDivision ? 'Edit Divisi' : 'Tambah Divisi'}
              </h3>
              <button onClick={handleCloseModal} className="p-2 text-gray-400 hover:bg-white hover:text-gray-600 rounded-full transition-colors shadow-sm border border-transparent hover:border-gray-200">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nama Divisi / Jabatan</label>
                <input 
                  type="text" 
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium text-gray-900"
                  placeholder="Misal: Kasir, Dapur, Logistik, dll"
                />
              </div>

              <div className="pt-4 pb-2">
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-4 rounded-xl transition-colors shadow-lg shadow-indigo-600/20 active:scale-95 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    editingDivision ? 'Simpan Perubahan' : 'Buat Divisi'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default DivisionManagement;
