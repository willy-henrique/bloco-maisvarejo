import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { onAuthChange, getUserProfile, logoutFirebase } from '../services/firebaseAuth';
import { isFirebaseConfigured } from '../services/firebase';
import type { UserProfile, UserRole } from '../types/user';
import type { ViewId } from '../components/Layout/Sidebar';
import {
  exportKeyToBase64,
  importKeyFromBase64,
} from '../services/encryptionService';

const ENCRYPTION_KEY_KEY = '@Estrategico:EncryptionKey';

interface UserContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  encryptionKey: CryptoKey | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  hasView: (view: ViewId) => boolean;
  hasEmpresa: (empresa: string) => boolean;
  role: UserRole | null;
}

const UserCtx = createContext<UserContextValue | null>(null);

async function importKeyFromEnvHash(): Promise<CryptoKey> {
  const hashHex = import.meta.env.VITE_APP_PASSWORD_HASH as string;
  if (!hashHex) throw new Error('VITE_APP_PASSWORD_HASH não configurado.');
  const bytes = new Uint8Array(hashHex.length / 2);
  for (let i = 0; i < hashHex.length; i += 2) {
    bytes[i / 2] = parseInt(hashHex.slice(i, i + 2), 16);
  }
  return crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    const unsub = onAuthChange(async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const prof = await getUserProfile(user.uid);
          setProfile(prof);

          let key: CryptoKey | null = null;
          const storedKey = sessionStorage.getItem(ENCRYPTION_KEY_KEY);
          if (storedKey) {
            try {
              key = await importKeyFromBase64(storedKey);
            } catch {
              sessionStorage.removeItem(ENCRYPTION_KEY_KEY);
            }
          }
          if (!key) {
            key = await importKeyFromEnvHash();
            const keyB64 = await exportKeyToBase64(key);
            sessionStorage.setItem(ENCRYPTION_KEY_KEY, keyB64);
          }
          setEncryptionKey(key);
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
        setEncryptionKey(null);
        sessionStorage.removeItem(ENCRYPTION_KEY_KEY);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const login = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const { loginWithEmail } = await import('../services/firebaseAuth');
        const user = await loginWithEmail(email, password);

        const prof = await getUserProfile(user.uid);
        if (!prof) {
          await logoutFirebase();
          return { success: false, error: 'Perfil de usuário não encontrado. Contate o administrador.' };
        }
        if (!prof.ativo) {
          await logoutFirebase();
          return { success: false, error: 'Conta desativada. Contate o administrador.' };
        }

        const key = await importKeyFromEnvHash();
        const keyB64 = await exportKeyToBase64(key);
        sessionStorage.setItem(ENCRYPTION_KEY_KEY, keyB64);

        setFirebaseUser(user);
        setProfile(prof);
        setEncryptionKey(key);
        return { success: true };
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Erro ao fazer login.';
        if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found')) {
          return { success: false, error: 'Email ou senha incorretos.' };
        }
        return { success: false, error: msg };
      }
    },
    []
  );

  const logout = useCallback(() => {
    logoutFirebase();
    setFirebaseUser(null);
    setProfile(null);
    setEncryptionKey(null);
    sessionStorage.removeItem(ENCRYPTION_KEY_KEY);
  }, []);

  const hasView = useCallback(
    (view: ViewId): boolean => {
      if (!profile) return false;
      if (profile.role === 'administrador' || profile.role === 'gerente') return true;
      return profile.views.includes(view);
    },
    [profile]
  );

  const hasEmpresa = useCallback(
    (empresa: string): boolean => {
      if (!profile) return false;
      if (profile.role === 'administrador') return true;
      return profile.empresas.includes(empresa);
    },
    [profile]
  );

  const value: UserContextValue = {
    firebaseUser,
    profile,
    loading,
    encryptionKey,
    isAuthenticated: !!firebaseUser && !!profile && !!encryptionKey,
    login,
    logout,
    hasView,
    hasEmpresa,
    role: profile?.role ?? null,
  };

  return <UserCtx.Provider value={value}>{children}</UserCtx.Provider>;
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserCtx);
  if (!ctx) throw new Error('useUser deve ser usado dentro de UserProvider');
  return ctx;
}
