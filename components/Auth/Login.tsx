/**
 * Tela de acesso: verificação PBKDF2 + rate limit (anti brute-force).
 */

import React, { useState, useCallback } from 'react';
import { Lock, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 2 * 60 * 1000; // 2 minutos
const STORAGE_ATTEMPTS = '@Estrategico:LoginAttempts';
const STORAGE_LOCKOUT_UNTIL = '@Estrategico:LockoutUntil';

function getAttempts(): number {
  try {
    return parseInt(sessionStorage.getItem(STORAGE_ATTEMPTS) ?? '0', 10);
  } catch {
    return 0;
  }
}

function setAttempts(n: number): void {
  sessionStorage.setItem(STORAGE_ATTEMPTS, String(n));
}

function getLockoutUntil(): number {
  try {
    return parseInt(sessionStorage.getItem(STORAGE_LOCKOUT_UNTIL) ?? '0', 10);
  } catch {
    return 0;
  }
}

function setLockout(): void {
  sessionStorage.setItem(STORAGE_LOCKOUT_UNTIL, String(Date.now() + LOCKOUT_MS));
}

function clearAttempts(): void {
  sessionStorage.removeItem(STORAGE_ATTEMPTS);
  sessionStorage.removeItem(STORAGE_LOCKOUT_UNTIL);
}

export const Login: React.FC = () => {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  const updateLockoutRemaining = useCallback(() => {
    const until = getLockoutUntil();
    if (until <= Date.now()) {
      clearAttempts();
      setLockoutRemaining(0);
      return;
    }
    setLockoutRemaining(Math.ceil((until - Date.now()) / 1000));
  }, []);

  React.useEffect(() => {
    updateLockoutRemaining();
    const interval = setInterval(updateLockoutRemaining, 1000);
    return () => clearInterval(interval);
  }, [updateLockoutRemaining]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (lockoutRemaining > 0) {
      setError(`Muitas tentativas. Aguarde ${lockoutRemaining}s para tentar novamente.`);
      return;
    }

    setIsSubmitting(true);
    const result = await login(password);
    setIsSubmitting(false);

    if (result.success) {
      setPassword('');
      return;
    }

    setError(result.error ?? 'Acesso negado.');
    const attempts = getAttempts() + 1;
    setAttempts(attempts);
    if (attempts >= MAX_ATTEMPTS) {
      setLockout();
      setLockoutRemaining(Math.ceil(LOCKOUT_MS / 1000));
      setError(`Muitas tentativas. Acesso bloqueado por ${LOCKOUT_MS / 60000} minutos.`);
    }
  };

  const isLockedOut = lockoutRemaining > 0;

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
      <div className="w-full max-w-[360px]">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-10 h-10 bg-blue-600/10 text-blue-500 rounded-lg mb-3 border border-slate-700">
            <ShieldCheck size={20} />
          </div>
          <h1 className="text-xl font-semibold text-slate-100 tracking-tight">WillTech Diretoria</h1>
          <p className="text-slate-500 text-xs mt-0.5">Gestão Estratégica</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-xl shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-500 text-[10px] font-medium uppercase tracking-wider mb-1.5">Senha</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                  <Lock size={14} />
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-slate-600 transition-all"
                  required
                  disabled={isLockedOut}
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-amber-400/90 bg-amber-400/10 px-2.5 py-2 rounded border border-amber-400/20 text-[11px]">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || isLockedOut}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 group disabled:opacity-70"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Entrar
                  <Lock size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          <p className="mt-4 text-center text-slate-600 text-[10px] flex items-center justify-center gap-1.5">
            <ShieldCheck size={12} />
            Sessão segura • Dados protegidos
          </p>
        </div>
      </div>
    </div>
  );
};
