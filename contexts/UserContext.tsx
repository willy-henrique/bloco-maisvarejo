import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { onAuthChange, getUserProfile, logoutFirebase } from '../services/firebaseAuth';
import { isFirebaseConfigured } from '../services/firebase';
import type { UserProfile, UserRole } from '../types/user';
import type { ViewId } from '../components/Layout/Sidebar';
import { userHasViewAccess, userHasModuleAction } from '../utils/permissions';
import {
  exportKeyToBase64,
  importKeyFromBase64,
} from '../services/encryptionService';

const ENCRYPTION_KEY_KEY = '@Estrategico:EncryptionKey';
const PROFILE_CACHE_KEY = '@Mavo:ProfileCache';

function saveProfileCache(uid: string, profile: UserProfile): void {
  try { sessionStorage.setItem(PROFILE_CACHE_KEY + uid, JSON.stringify(profile)); } catch {}
}

function loadProfileCache(uid: string): UserProfile | null {
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY + uid);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch { return null; }
}

function clearProfileCache(): void {
  try {
    const keys = Object.keys(sessionStorage).filter(k => k.startsWith(PROFILE_CACHE_KEY));
    keys.forEach(k => sessionStorage.removeItem(k));
  } catch {}
}

function normalizeEmpresa(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

function profileHasAllEmpresaAccess(profile: UserProfile | null): boolean {
  if (!profile) return false;
  const empresas = Array.isArray(profile.empresas) ? profile.empresas : [];
  const hasAllFlag = empresas.some((empresa) => {
    const normalized = normalizeEmpresa(empresa);
    return normalized === '*' || normalized === 'todas';
  });
  if (hasAllFlag) return true;
  return profile.role === 'administrador' && empresas.length === 0;
}

interface UserContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  encryptionKey: CryptoKey | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  hasView: (view: ViewId) => boolean;
  hasModuleAction: (view: ViewId, actionId: string) => boolean;
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

      if (!user) {
        setProfile(null);
        setEncryptionKey(null);
        sessionStorage.removeItem(ENCRYPTION_KEY_KEY);
        clearProfileCache();
        setLoading(false);
        return;
      }

      // Fast path: restore from sessionStorage cache — no network needed
      const cachedProfile = loadProfileCache(user.uid);
      const storedKeyB64 = sessionStorage.getItem(ENCRYPTION_KEY_KEY);
      let resolvedFromCache = false;

      if (cachedProfile && storedKeyB64) {
        try {
          const cachedKey = await importKeyFromBase64(storedKeyB64);
          setProfile(cachedProfile);
          setEncryptionKey(cachedKey);
          setLoading(false);
          resolvedFromCache = true;
        } catch {
          sessionStorage.removeItem(ENCRYPTION_KEY_KEY);
        }
      }

      // Background refresh: verify with Firestore and update if changed
      try {
        const prof = await getUserProfile(user.uid);
        if (prof) {
          setProfile(prof);
          saveProfileCache(user.uid, prof);
        }

        let key: CryptoKey | null = null;
        const currentKeyB64 = sessionStorage.getItem(ENCRYPTION_KEY_KEY);
        if (currentKeyB64) {
          try { key = await importKeyFromBase64(currentKeyB64); } catch {
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
        if (!resolvedFromCache) setProfile(null);
      } finally {
        if (!resolvedFromCache) setLoading(false);
      }
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
        saveProfileCache(user.uid, prof);

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
    clearProfileCache();
  }, []);

  const hasView = useCallback(
    (view: ViewId): boolean => {
      return userHasViewAccess(profile, view);
    },
    [profile]
  );

  const hasModuleAction = useCallback(
    (view: ViewId, actionId: string): boolean => {
      return userHasModuleAction(profile, view, actionId);
    },
    [profile]
  );

  const hasEmpresa = useCallback(
    (empresa: string): boolean => {
      if (!profile) return false;
      if (profileHasAllEmpresaAccess(profile)) return true;
      return profile.empresas.some(
        (allowed) => normalizeEmpresa(allowed) === normalizeEmpresa(empresa),
      );
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
    hasModuleAction,
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
