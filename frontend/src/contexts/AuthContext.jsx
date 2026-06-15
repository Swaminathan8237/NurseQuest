import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem('nursequest_token');
    if (token) {
      authAPI.getProfile()
        .then(data => setUser(data))
        .catch(() => {
          sessionStorage.removeItem('nursequest_token');
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const data = await authAPI.login(email, password);
    sessionStorage.setItem('nursequest_token', data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (formData) => {
    const data = await authAPI.register(formData);
    sessionStorage.setItem('nursequest_token', data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    sessionStorage.removeItem('nursequest_token');
    setUser(null);
  };

  const updateAvatar = async (avatarConfig) => {
    await authAPI.updateAvatar(avatarConfig);
    setUser(prev => ({ ...prev, avatar_config: avatarConfig }));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateAvatar }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
