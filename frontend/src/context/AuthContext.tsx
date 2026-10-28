import { createContext, useContext, useState, useEffect } from 'react';

export type User = {
  id: string;
  name: string;
  role: string;
  dob: string;
  photo?: string;
  divisionId?: string;
  division?: { id: string; name: string };
};

type AuthContextType = {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  updateUser: (user: User) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Storage Keys ───────────────────────────────────────────────────────────
const USER_DATA_KEY = 'user_data';
const USER_PHOTO_KEY = 'user_photo';
const COOKIE_SESSION_KEY = 'presensi_session';

// ─── Safe localStorage wrapper — mencegah crash jika storage HP penuh/restricted ───
const safeGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const safeRemove = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};

// ─── Cookie Backup (Dual-Storage Redundancy) ─────────────────────────────────
// Pada iOS/Safari dan beberapa HP Android, OS dapat membersihkan LocalStorage saat storage hampir penuh.
// Cookie cadangan (~200 bytes, tanpa foto) memastikan sesi login tidak pernah terhapus tiba-tiba.
const setCookieBackup = (userData: Omit<User, 'photo'>) => {
  try {
    const val = encodeURIComponent(JSON.stringify(userData));
    // Sesi aktif hingga 1 tahun (31536000 detik)
    document.cookie = `${COOKIE_SESSION_KEY}=${val}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    /* ignore */
  }
};

const getCookieBackup = (): Omit<User, 'photo'> | null => {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_SESSION_KEY}=([^;]*)`));
    if (!match) return null;
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
};

const removeCookieBackup = () => {
  try {
    document.cookie = `${COOKIE_SESSION_KEY}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    /* ignore */
  }
};

// ─── Loader & Saver ─────────────────────────────────────────────────────────
const loadUserFromStorage = (): User | null => {
  let userData: User | null = null;

  // 1. Coba baca dari key 'user_data' di LocalStorage
  const raw = safeGet(USER_DATA_KEY);
  if (raw) {
    try {
      userData = JSON.parse(raw) as User;
    } catch {
      safeRemove(USER_DATA_KEY);
    }
  }

  // 2. Jika LocalStorage terhapus oleh OS HP, pulihkan otomatis dari Cookie Backup
  if (!userData) {
    const fromCookie = getCookieBackup();
    if (fromCookie) {
      userData = fromCookie as User;
      // Sinkronkan kembali ke LocalStorage
      safeSet(USER_DATA_KEY, JSON.stringify(fromCookie));
    }
  }

  // 3. Fallback migrasi dari key lama 'user' (versi sebelumnya)
  if (!userData) {
    const legacyRaw = safeGet('user');
    if (legacyRaw) {
      try {
        const legacyUser = JSON.parse(legacyRaw) as User;
        saveUserToStorage(legacyUser);
        safeRemove('user');
        return legacyUser;
      } catch {
        safeRemove('user');
      }
    }
  }

  if (!userData) return null;

  // Gabungkan kembali foto profil dari storage terpisah jika ada
  const photo = safeGet(USER_PHOTO_KEY);
  if (photo) {
    userData.photo = photo;
  }

  return userData;
};

const saveUserToStorage = (userData: User) => {
  // Pisahkan foto profil dari data inti user agar ukuran data selalu sangat kecil (< 300 bytes)
  const { photo, ...userWithoutPhoto } = userData;
  const jsonStr = JSON.stringify(userWithoutPhoto);

  // Simpan data inti ke LocalStorage
  let saved = safeSet(USER_DATA_KEY, jsonStr);
  if (!saved) {
    // Jika storage HP penuh, bersihkan foto lama terlebih dahulu lalu simpan ulang
    safeRemove(USER_PHOTO_KEY);
    saved = safeSet(USER_DATA_KEY, jsonStr);
  }

  // Simpan juga ke Cookie Backup sebagai pengaman ganda
  setCookieBackup(userWithoutPhoto);

  // Simpan foto profil secara terpisah (jika storage HP penuh, sesi login tetap aman)
  if (photo) {
    safeSet(USER_PHOTO_KEY, photo);
  } else {
    safeRemove(USER_PHOTO_KEY);
  }
};

const clearUserFromStorage = () => {
  safeRemove(USER_DATA_KEY);
  safeRemove(USER_PHOTO_KEY);
  safeRemove('user');
  removeCookieBackup();
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => loadUserFromStorage());

  // ─── Validasi user ke server saat aplikasi dibuka ──────────────────────────
  // ATURAN KRITIS:
  // - Hanya logout jika server secara eksplisit mengembalikan 404 (user dihapus admin).
  // - Jika terjadi cold-start Vercel, koneksi lambat, timeout, atau database error 500,
  //   JANGAN PERNAH logout! Biarkan user tetap login dan dapat beraktivitas offline/online.
  useEffect(() => {
    if (!user?.id) return;

    const controller = new AbortController();

    fetch(`/api/users/${user.id}`, { signal: controller.signal })
      .then(async (res) => {
        // Hanya logout jika user benar-benar telah dihapus dari database (404)
        if (res.status === 404) {
          console.warn('[Auth] Akun tidak ditemukan di database (404), sesi dibersihkan.');
          clearUserFromStorage();
          setUser(null);
          return;
        }

        // Jika server bermasalah (status 500/502/503/504), pertahankan sesi yang ada
        if (!res.ok) {
          return;
        }

        const data = await res.json();
        if (data?.success && data?.user) {
          // Perbarui data nama/role/divisi jika ada perubahan dari admin di database
          const serverUser: User = {
            ...data.user,
            photo: data.user.photo || user.photo,
          };
          setUser(serverUser);
          saveUserToStorage(serverUser);
        }
      })
      .catch(() => {
        // Error jaringan atau HP offline — pertahankan status login user
      });

    return () => {
      controller.abort();
    };
  }, [user?.id]);

  const login = (userData: User) => {
    setUser(userData);
    saveUserToStorage(userData);
  };

  const logout = () => {
    setUser(null);
    clearUserFromStorage();
  };

  const updateUser = (userData: User) => {
    setUser(userData);
    saveUserToStorage(userData);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
