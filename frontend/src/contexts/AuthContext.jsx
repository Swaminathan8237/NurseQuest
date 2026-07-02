import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check if we already have an active session via the HttpOnly cookie
    const checkSession = async () => {
      try {
        const profile = await authAPI.getProfile();
        setUser(profile);
      } catch (err) {
        console.log('No active session found on backend:', err.message);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    // 2. Listen to Supabase auth changes (mainly for OAuth flow)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change event:', event, !!session);
      
      if (session) {
        try {
          // Set the cookie on the Express backend using the token
          await authAPI.setCookie(session.access_token);
          
          // Fetch user profile from Express backend
          const profile = await authAPI.getProfile();
          setUser(profile);
        } catch (err) {
          console.error('Failed to sync profile after state change:', err);
          setUser(null);
        }
      } else {
        if (event === 'SIGNED_OUT') {
          try {
            await authAPI.logout();
          } catch (err) {
            console.error('Failed to clear cookie on logout:', err);
          }
          setUser(null);
        }
      }
      setLoading(false);
    });

    checkSession();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const profile = await authAPI.login(email, password);
      setUser(profile);
      return profile;
    } catch (err) {
      console.error('Login failed:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (formData) => {
    setLoading(true);
    try {
      const response = await authAPI.register({
        email: formData.email,
        password: formData.password,
        name: formData.name,
        role: formData.role,
        avatarConfig: { ...formData.avatarConfig, gender: formData.gender }
      });

      if (response.emailVerificationPending) {
        return response;
      }

      const finalUser = response.user || response;
      setUser(finalUser);
      return finalUser;
    } catch (err) {
      console.error('Registration failed:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const syncOAuthProfile = async (formData) => {
    setLoading(true);
    try {
      const profileData = await authAPI.syncProfile(formData);
      const finalUser = profileData.user || profileData;
      setUser(finalUser);
      return finalUser;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      try {
        await supabase.auth.signOut();
      } catch (e) {}
      await authAPI.logout();
      setUser(null);
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateAvatar = async (avatarConfig) => {
    await authAPI.updateAvatar(avatarConfig);
    setUser(prev => ({ ...prev, avatar_config: avatarConfig }));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, syncOAuthProfile, logout, updateAvatar }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
