import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, Loader2 } from 'lucide-react';

interface NameSuggestion {
  id: string;
  name: string;
  division: string;
}

const Login = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  // Jika user sudah memiliki sesi login yang aktif, langsung arahkan ke dashboard
  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const [name, setName] = useState('');
  const [suggestions, setSuggestions] = useState<NameSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const nameBoxRef = useRef<HTMLDivElement>(null);
  const dobDayRef = useRef<HTMLInputElement>(null);

  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/login-names')
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.names)) {
          setSuggestions(data.names);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (nameBoxRef.current && !nameBoxRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const filteredNames = suggestions.filter(s => {
    const q = name.trim().toLowerCase();
    if (!q) return false;
    return s.name.toLowerCase().includes(q);
  });

  const pickName = (picked: NameSuggestion) => {
    setName(picked.name);
    setShowDropdown(false);
    setHighlightIdx(0);
    setTimeout(() => dobDayRef.current?.focus(), 30);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || filteredNames.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, filteredNames.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = filteredNames[highlightIdx] || filteredNames[0];
      if (picked) pickName(picked);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !dobDay || !dobMonth || !dobYear) return;

    setLoading(true);
    setError('');

    const dob = `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`;

    try {
      const res = await fetch('/api/login', {
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
        
        {/* Decorative */}
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
          <div ref={nameBoxRef} className="relative">
            <label htmlFor="name" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">
              Nama Lengkap
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="off"
              required
              value={name}
              onFocus={() => { if (name.trim()) setShowDropdown(true); }}
              onChange={(e) => {
                setName(e.target.value);
                setShowDropdown(true);
                setHighlightIdx(0);
              }}
              onKeyDown={handleNameKeyDown}
              className="appearance-none block w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent sm:text-sm font-medium transition-all"
              placeholder="Ketik nama Anda, lalu Enter..."
            />

            {showDropdown && filteredNames.length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-2xl shadow-xl z-30 divide-y divide-gray-50">
                {filteredNames.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => pickName(item)}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between text-sm transition-colors ${
                      idx === highlightIdx ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-gray-50 text-gray-800'
                    }`}
                  >
                    <span>{item.name}</span>
                    <span className="text-xs text-gray-400 font-normal flex items-center gap-1.5">
                      {item.division || '-'}
                      {idx === highlightIdx && (
                        <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-bold">Enter</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">
              Tanggal Lahir
            </label>
            <div className="grid grid-cols-3 gap-3">
              <input
                ref={dobDayRef}
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
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-2xl font-medium text-center">
              {error}
            </div>
          )}

          {/* Loading overlay feedback — mencegah kesan "freeze" */}
          {loading && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 flex items-center justify-center gap-3">
              <Loader2 size={18} className="animate-spin text-indigo-500 shrink-0" />
              <span className="text-sm font-semibold text-indigo-700">Memverifikasi data...</span>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className={`w-full flex justify-center items-center gap-2 py-4 px-4 rounded-2xl shadow-lg text-sm font-bold text-white transition-all active:scale-95 ${
                loading
                  ? 'bg-indigo-400 shadow-none cursor-not-allowed'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-indigo-200 hover:shadow-lg'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  Masuk Sekarang
                  <LogIn size={18} />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Footer Published */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400 font-normal">
            published by{' '}
            <a
              href="https://www.instagram.com/ence.dev/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600 hover:underline lowercase font-medium transition-colors"
            >
              encedev
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
