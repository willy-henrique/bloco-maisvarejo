import React, { useState } from 'react';
import { Lock, ShieldCheck, AlertTriangle, Mail } from 'lucide-react';
import { useUser } from '../../contexts/UserContext';

export const AdminLogin: React.FC = () => {
  const { login } = useUser();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Preencha todos os campos.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(email, password);
      if (!result.success) {
        setError(result.error || 'Erro ao fazer login.');
        setIsSubmitting(false);
        return;
      }
    } catch {
      setError('Erro inesperado. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex items-center justify-center p-4 pt-[env(safe-area-inset-top,0)] pb-[env(safe-area-inset-bottom,0)] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
      <div className="w-full max-w-[380px] min-w-0">
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-950 mb-3">
            <img
              src="/mavo-logo.png"
              alt="MAVO Participações"
              className="h-14 w-14 shrink-0 object-contain object-center"
              width={56}
              height={56}
              decoding="async"
            />
          </div>
          <h1 className="text-xl font-semibold text-slate-100 tracking-tight">Painel Administrativo</h1>
          <p className="text-slate-500 text-xs mt-0.5">Acesso restrito a administradores</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-xl shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-500 text-[10px] font-medium uppercase tracking-wider mb-1.5">Email do administrador</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                  <Mail size={14} />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@diretoria.com"
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-slate-600 transition-all"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

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
                  placeholder="Senha de administrador"
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-slate-600 transition-all"
                  required
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
              disabled={isSubmitting}
              className="w-full min-h-[48px] bg-amber-600 hover:bg-amber-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 group disabled:opacity-70 touch-manipulation"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Acessar Painel Admin
                  <Lock size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          <p className="mt-4 text-center text-slate-600 text-[10px] flex items-center justify-center gap-1.5">
            <ShieldCheck size={12} />
            Painel administrativo • Acesso restrito
          </p>
        </div>
      </div>
    </div>
  );
};
