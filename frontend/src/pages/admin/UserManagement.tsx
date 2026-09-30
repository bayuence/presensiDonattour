import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { User } from '../../context/AuthContext';
import { Users, Plus, Pencil, Trash2, X, Search, Shield, ShieldAlert, User as UserIcon } from 'lucide-react';
import { Navigate } from 'react-router-dom';

const UserManagement = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [divisions, setDivisions] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [role, setRole] = useState('Karyawan');
  const [divisionId, setDivisionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If not admin, block access
  if ((currentUser?.role || '').toLowerCase() !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const fetchData = async () => {
    try {
      const [resUsers, resDivisions] = await Promise.all([
        fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/users'),
        fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/divisions')
      ]);
      const dataUsers = await resUsers.json();
      const dataDivisions = await resDivisions.json();
      
      if (dataUsers.success && Array.isArray(dataUsers.users)) {
        setUsers(dataUsers.users);
      }
      if (dataDivisions.success && Array.isArray(dataDivisions.divisions)) {
        setDivisions(dataDivisions.divisions);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setName(user.name || '');
      setDob(user.dob || '');
      setRole(user.role || 'Karyawan');
      setDivisionId(user.divisionId || '');
    } else {
      setEditingUser(null);
      setName('');
      setDob('');
      setRole('Karyawan');
      setDivisionId('');
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !dob) return alert('Nama dan Tanggal Lahir wajib diisi');
    
    setIsSubmitting(true);
    try {
      const url = editingUser 
        ? `https://presensi-api.onrender.com/api/users/${editingUser.id}` 
        : (import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/users';
      
      const method = editingUser ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, dob, role, divisionId: divisionId || null }),
      });
      
      const data = await res.json();
      if (data.success) {
        fetchData();
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

  const handleDelete = async (id: string, userName: string) => {
    if (currentUser && id === currentUser.id) {
      return alert('Anda tidak bisa menghapus akun Anda sendiri.');
    }
    if (!window.confirm(`Apakah Anda yakin ingin menghapus akun ${userName}?`)) return;
    
    try {
      const res = await fetch(`https://presensi-api.onrender.com/api/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchData();
      } else {
        alert('Gagal menghapus data');
      }
    } catch (error) {
      console.error(error);
      alert('Terjadi kesalahan jaringan');
    }
  };

  const safeSearch = (search || '').toLowerCase();
  const filteredUsers = (users || []).filter(u => 
    (u?.name || '').toLowerCase().includes(safeSearch) || 
    (u?.role || '').toLowerCase().includes(safeSearch)
  );

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24">
      
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={24} className="text-indigo-600" />
            Akun Pengguna
          </h2>
          <p className="text-sm text-gray-500 font-medium">Kelola akses dan data karyawan</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search size={20} className="text-gray-400" />
        </div>
        <input 
          type="text" 
          placeholder="Cari nama atau role..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-medium text-gray-900"
        />
      </div>

      {/* User List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-10">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
            <p className="text-gray-500 text-sm mt-3 font-medium">Memuat data...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-3xl border border-gray-100 border-dashed">
            <Users size={48} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Tidak ada pengguna ditemukan.</p>
          </div>
        ) : (
          filteredUsers.map((u) => (
            <div key={u.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between group">
              <div className="flex items-center gap-4 overflow-hidden">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-100 to-purple-50 flex items-center justify-center text-indigo-600 shrink-0 overflow-hidden border border-indigo-50">
                  {u?.photo ? (
                    <img src={u.photo} alt={u.name} className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon size={24} />
                  )}
                </div>
                <div className="truncate pr-2">
                  <h3 className="font-bold text-gray-900 truncate">{u?.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                      (u?.role || '').toLowerCase() === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {u?.role}
                    </span>
                    <span className="text-xs text-gray-400 font-medium truncate">
                      {u?.division ? u.division.name : u?.dob}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => handleOpenModal(u)}
                  className="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition-colors"
                >
                  <Pencil size={18} />
                </button>
                <button 
                  onClick={() => handleDelete(u.id, u.name)}
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
                {editingUser ? 'Edit Pengguna' : 'Tambah Pengguna'}
              </h3>
              <button onClick={handleCloseModal} className="p-2 text-gray-400 hover:bg-white hover:text-gray-600 rounded-full transition-colors shadow-sm border border-transparent hover:border-gray-200">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nama Lengkap</label>
                <input 
                  type="text" 
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium text-gray-900"
                  placeholder="Masukkan nama"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tanggal Lahir</label>
                <input 
                  type="date" 
                  required
                  value={dob}
                  onChange={e => setDob(e.target.value)}
                  className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Hak Akses (Role)</label>
                <select 
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium text-gray-900"
                >
                  <option value="Karyawan">Karyawan</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Divisi / Jabatan</label>
                <select 
                  value={divisionId}
                  onChange={e => setDivisionId(e.target.value)}
                  className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium text-gray-900"
                >
                  <option value="">-- Pilih Divisi (Opsional) --</option>
                  {divisions.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
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
                    editingUser ? 'Simpan Perubahan' : 'Buat Pengguna'
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

export default UserManagement;
