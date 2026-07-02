import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen to Supabase auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change event:', event, !!session);
      
      if (session) {
        // Store token in sessionStorage for API client
        sessionStorage.setItem('nursequest_token', session.access_token);
        
        try {
          // Fetch user profile from Express backend
          const profile = await authAPI.getProfile();
          setUser(profile);
        } catch (err) {
          console.error('Failed to fetch user profile:', err);
          if (err.message && (err.message.includes('User not found') || err.message.includes('404') || err.message.toLowerCase().includes('not found'))) {
            // User is logged in to Supabase but does not have a database profile (e.g. OAuth signup)
            setUser({
              id: session.user.id,
              email: session.user.email,
              needProfileSetup: true
            });
          } else {
            // Other error, maybe server is down or token invalid
            sessionStorage.removeItem('nursequest_token');
            setUser(null);
          }
        }
      } else {
        sessionStorage.removeItem('nursequest_token');
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    try {
      let data, error;
      try {
        const res = await supabase.auth.signInWithPassword({ email, password });
        data = res.data;
        error = res.error;
      } catch (supabaseErr) {
        error = supabaseErr;
      }

      if (error) {
        // Check if this is a demo account fallback
        const lowerEmail = email.toLowerCase();
        const demoAccounts = {
          'teacher@nursequest.com': { role: 'teacher', pw: 'teacher123', sub: 'cf04c84d-2deb-41f5-96fc-e5b3e95ed552' },
          'student1@nursequest.com': { role: 'student', pw: 'student123', sub: 'f223f644-4940-45d2-aa80-7438f09e3898' },
          'student2@nursequest.com': { role: 'student', pw: 'student123', sub: '4e8fa16b-fe24-4b57-b0ca-665838ac16e5' },
          'student3@nursequest.com': { role: 'student', pw: 'student123', sub: 'eade2fc4-d726-40b1-a0c0-161caa32f8f1' },
          'student4@nursequest.com': { role: 'student', pw: 'student123', sub: '776f9961-6107-41f1-af72-64f60e81b3d2' },
          'student5@nursequest.com': { role: 'student', pw: 'student123', sub: 'f6ac2406-21e4-4c78-a492-0b48b37f0b85' },
          'admin@nursequest.com': { role: 'admin', pw: 'admin123', sub: 'afe4000c-08b3-49dd-b050-832ce0a7465a' }
        };

        const demo = demoAccounts[lowerEmail];
        if (demo && password === demo.pw) {
          console.warn('⚠️ Supabase login failed. Falling back to local offline demo mode.');
          // Generate a mock JWT token: header.payload.signature
          const payload = {
            sub: demo.sub,
            email: lowerEmail,
            role: 'authenticated',
            exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // 24 hours
          };
          const base64Payload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
          const mockToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${base64Payload}.mocksignature`;

          sessionStorage.setItem('nursequest_token', mockToken);
          try {
            const profile = await authAPI.getProfile();
            setUser(profile);
            return profile;
          } catch (err) {
            throw new Error('Local fallback failed: ' + err.message);
          }
        }
        throw error;
      }

      if (data.session) {
        sessionStorage.setItem('nursequest_token', data.session.access_token);
        try {
          const profile = await authAPI.getProfile();
          setUser(profile);
          return profile;
        } catch (err) {
          if (err.message && (err.message.includes('User not found') || err.message.includes('404') || err.message.toLowerCase().includes('not found'))) {
            const tempUser = {
              id: data.session.user.id,
              email: data.session.user.email,
              needProfileSetup: true
            };
            setUser(tempUser);
            return tempUser;
          }
          throw err;
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const register = async (formData) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password
      });
      if (error) throw error;

      if (data.session) {
        sessionStorage.setItem('nursequest_token', data.session.access_token);

        // Sync profile immediately if session is available
        const profileData = await authAPI.syncProfile({
          name: formData.name,
          role: formData.role,
          avatarConfig: { ...formData.avatarConfig, gender: formData.gender }
        });

        const finalUser = profileData.user || profileData;
        setUser(finalUser);
        return finalUser;
      } else {
        // If email verification is enabled, session is null initially.
        // We will sync the profile later when they confirm their email and log in.
        return {
          email: formData.email,
          emailVerificationPending: true
        };
      }
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
      await supabase.auth.signOut();
      sessionStorage.removeItem('nursequest_token');
      setUser(null);
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
