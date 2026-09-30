import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn } from 'lucide-react';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !dobDay || !dobMonth || !dobYear) return;

    setLoading(true);
    setError('');

    const dob = `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`;

    try {
      const res = await fetch('http://localhost:5000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, dob }),
      });

      const data = await res.json();

      if (data.success) {
        login(data.user);
        navigate('/dashboard');
      } else {
        setError(data.message || 'Nama atau tanggal lahir salah.');
      }
    } catch {
      setError('Tidak dapat terhubung ke server. Pastikan backend berjalan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-100 min-h-screen flex justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-white sm:rounded-2xl sm:shadow-xl min-h-screen sm:min-h-[90vh] flex flex-col justify-center sm:border sm:border-gray-200 overflow-y-auto relative p-6 sm:p-8">
        
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-full h-40 bg-gradient-to-b from-indigo-50/50 to-transparent -z-10" />

        <div className="flex justify-center mb-6">
          <img
            src="/logoDONATTOUR.PNG"
            alt="Donattour Logo"
            className="w-40 h-auto object-contain drop-shadow-sm"
          />
        </div>
        <div className="text-center mb-8">
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Selamat Datang</h2>
          <p className="text-sm font-medium text-gray-500 mt-1">Aplikasi Kehadiran Karyawan</p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">
              Nama Lengkap
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="appearance-none block w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent sm:text-sm font-medium transition-all"
              placeholder="Masukkan nama Anda"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">
              Tanggal Lahir
            </label>
            <div className="grid grid-cols-3 gap-3">
              <input
                type="number"
                min="1"
                max="31"
                required
                value={dobDay}
                onChange={(e) => setDobDay(e.target.value)}
                className="appearance-none block w-full px-3 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent sm:text-sm font-medium transition-all text-center"
                placeholder="Tgl"
              />
              <select
                required
                value={dobMonth}
                onChange={(e) => setDobMonth(e.target.value)}
                className="block w-full px-2 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent sm:text-sm font-medium transition-all appearance-none text-center"
              >
                <option value="" disabled>Bulan</option>
                <option value="01">Jan</option>
                <option value="02">Feb</option>
                <option value="03">Mar</option>
                <option value="04">Apr</option>
                <option value="05">Mei</option>
                <option value="06">Jun</option>
                <option value="07">Jul</option>
                <option value="08">Agu</option>
                <option value="09">Sep</option>
                <option value="10">Okt</option>
                <option value="11">Nov</option>
                <option value="12">Des</option>
              </select>
              <input
                type="number"
                min="1900"
                max="2026"
                required
                value={dobYear}
                onChange={(e) => setDobYear(e.target.value)}
                className="appearance-none block w-full px-3 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent sm:text-sm font-medium transition-all text-center"
                placeholder="Tahun"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-2xl font-medium text-center animate-in fade-in slide-in-from-top-2">
              {error}
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className={`w-full flex justify-center items-center py-4 px-4 rounded-2xl shadow-lg text-sm font-bold text-white transition-all active:scale-95 ${
                loading ? 'bg-indigo-400 shadow-none' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-indigo-200'
              }`}
            >
              {loading ? 'Memproses...' : (
                <>
                  Masuk Sekarang
                  <LogIn className="ml-2" size={18} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
