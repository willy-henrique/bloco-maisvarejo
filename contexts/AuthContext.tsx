/**
 * Contexto de autenticação: sessão + chave de criptografia derivada no login.
 * RLS: toda leitura/escrita de dados sensíveis usa esta chave; sem login = sem acesso.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  verifyPassword,
  deriveKeyFromPassword,
  exportKeyToBase64,
  importKeyFromBase64,
  getEnvSalt
} from '../services/encryptionService';

const SESSION_TOKEN_KEY = '@Estrategico:Session';
const ENCRYPTION_KEY_KEY = '@Estrategico:EncryptionKey';

interface AuthState {
  isAuthenticated: boolean;
  encryptionKey: CryptoKey | null;
  sessionToken: string | null;
}

interface AuthContextValue extends AuthState {
  login: (password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  getStoredKey: () => Promise<CryptoKey | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    encryptionKey: null,
    sessionToken: null
  });

  const getStoredKey = useCallback(async (): Promise<CryptoKey | null> => {
    const keyBase64 = sessionStorage.getItem(ENCRYPTION_KEY_KEY);
    if (!keyBase64) return null;
    try {
      return await importKeyFromBase64(keyBase64);
    } catch {
      sessionStorage.removeItem(ENCRYPTION_KEY_KEY);
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
      return null;
    }
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (!token) {
      setState(s => ({ ...s, isAuthenticated: false, encryptionKey: null, sessionToken: null }));
      return;
    }
    getStoredKey().then(key => {
      if (key) {
        setState({ isAuthenticated: true, encryptionKey: key, sessionToken: token });
      } else {
        setState({ isAuthenticated: false, encryptionKey: null, sessionToken: null });
      }
    });
  }, [getStoredKey]);

  const login = useCallback(async (password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const valid = await verifyPassword(password);
      if (!valid) {
        return { success: false, error: 'Acesso negado. Credencial incorreta.' };
      }
      const saltHex = getEnvSalt();
      const iterations = Number(import.meta.env.VITE_APP_PBKDF2_ITERATIONS) || 310000;
      const key = await deriveKeyFromPassword(password, saltHex, iterations);
      const keyBase64 = await exportKeyToBase64(key);
      const token = crypto.randomUUID();
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
      sessionStorage.setItem(ENCRYPTION_KEY_KEY, keyBase64);
      setState({ isAuthenticated: true, encryptionKey: key, sessionToken: token });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao validar credenciais.';
      return { success: false, error: message };
    }
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(ENCRYPTION_KEY_KEY);
    setState({ isAuthenticated: false, encryptionKey: null, sessionToken: null });
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    getStoredKey
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return ctx;
}
