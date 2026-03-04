import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// Admin secret - only you know this
const ADMIN_SECRET = process.env.EXPO_PUBLIC_ADMIN_SECRET || 'forge_master_2025';

interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  is_admin?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginWithGoogle: () => void;
  handleGoogleCallback: (sessionId: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  adminLogin: (secret: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to store token (SecureStore for native, localStorage for web)
async function storeToken(token: string) {
  if (Platform.OS === 'web') {
    localStorage.setItem('session_token', token);
  } else {
    await SecureStore.setItemAsync('session_token', token);
  }
}

// Exported so other screens can get the stored auth token
export async function getStoredToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem('session_token');
    }
    return await SecureStore.getItemAsync('session_token');
  } catch {
    return null;
  }
}

async function removeToken() {
  if (Platform.OS === 'web') {
    localStorage.removeItem('session_token');
  } else {
    await SecureStore.deleteItemAsync('session_token');
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check for stored admin status first, then run regular auth
  useEffect(() => {
    const initialize = async () => {
      // Step 1: check admin status
      let adminFound = false;
      try {
        const adminStatus = Platform.OS === 'web'
          ? localStorage.getItem('forge_admin')
          : await SecureStore.getItemAsync('forge_admin');

        if (adminStatus === 'true') {
          setIsAdmin(true);
          setUser({
            user_id: 'admin_master',
            email: 'admin@forge.ai',
            name: 'Forge Master',
            is_admin: true,
          });
          adminFound = true;
        }
      } catch (e) {
        console.log('Admin status check error:', e);
      }

      if (adminFound) {
        setIsLoading(false);
        return;
      }

      // Step 2: check regular session token
      // Skip if handling OAuth callback
      if (Platform.OS === 'web' && window.location.hash?.includes('session_id=')) {
        setIsLoading(false);
        return;
      }

      try {
        const token = await getStoredToken();
        if (token) {
          const response = await axios.get(`${API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          });
          setUser(response.data);
        }
      } catch (error: any) {
        // Only clear token on explicit 401 — not on network/server errors
        if (error.response?.status === 401) {
          console.log('Session expired, clearing token');
          await removeToken();
          setUser(null);
        } else {
          console.log('Auth check failed (keeping session):', error?.message);
        }
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adminLogin = (secret: string): boolean => {
    if (secret === ADMIN_SECRET) {
      setIsAdmin(true);
      setUser({
        user_id: 'admin_master',
        email: 'admin@forge.ai',
        name: 'Forge Master',
        is_admin: true,
      });
      // Store admin status
      if (Platform.OS === 'web') {
        localStorage.setItem('forge_admin', 'true');
      } else {
        SecureStore.setItemAsync('forge_admin', 'true');
      }
      return true;
    }
    return false;
  };


  const login = async (email: string, password: string) => {
    try {
      const response = await axios.post(
        `${API_URL}/api/auth/login`,
        { email, password },
        { withCredentials: true }
      );
      
      // Store session token from response if provided
      if (response.data.session_token) {
        await storeToken(response.data.session_token);
      }
      
      setUser(response.data);
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Login failed');
    }
  };

  const register = async (email: string, password: string, name: string) => {
    try {
      const response = await axios.post(
        `${API_URL}/api/auth/register`,
        { email, password, name },
        { withCredentials: true }
      );
      
      if (response.data.session_token) {
        await storeToken(response.data.session_token);
      }
      
      setUser(response.data);
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Registration failed');
    }
  };

  const loginWithGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    if (Platform.OS === 'web') {
      const redirectUrl = window.location.origin + '/auth-callback';
      window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    } else {
      // For native apps, use expo-web-browser
      // This will be handled differently
      console.log('Google auth not yet implemented for native');
    }
  };

  const handleGoogleCallback = async (sessionId: string) => {
    try {
      const response = await axios.post(
        `${API_URL}/api/auth/google/session`,
        { session_id: sessionId },
        { withCredentials: true }
      );
      
      if (response.data.session_token) {
        await storeToken(response.data.session_token);
      }
      
      setUser(response.data);
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Google auth failed');
    }
  };

  const logout = async () => {
    try {
      const token = await getStoredToken();
      await axios.post(
        `${API_URL}/api/auth/logout`,
        {},
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          withCredentials: true,
        }
      );
    } catch (error) {
      console.log('Logout error:', error);
    } finally {
      await removeToken();
      // Clear admin status too
      if (Platform.OS === 'web') {
        localStorage.removeItem('forge_admin');
      } else {
        await SecureStore.deleteItemAsync('forge_admin');
      }
      setIsAdmin(false);
      setUser(null);
    }
  };

  const refreshUser = async () => {
    // Re-validate token against the server
    try {
      const token = await getStoredToken();
      if (token) {
        const response = await axios.get(`${API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        });
        setUser(response.data);
      }
    } catch (error: any) {
      if (error.response?.status === 401) {
        await removeToken();
        setUser(null);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user || isAdmin,
        isAdmin,
        login,
        register,
        loginWithGoogle,
        handleGoogleCallback,
        logout,
        refreshUser,
        adminLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
