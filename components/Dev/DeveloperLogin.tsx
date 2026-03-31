import React, { useState } from 'react';
import { AlertTriangle, Code2, Lock } from 'lucide-react';
import { useUser } from '../../contexts/UserContext';
import { DEVELOPER_EMAIL } from '../../config/developer';

export const DeveloperLogin: React.FC = () => {
  const { login } = useUser();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!password.trim()) {
      setError('Preencha a senha.');
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await login(DEVELOPER_EMAIL, password);
      if (!result.success) setError(result.error || 'Erro ao fazer login.');
    } catch {
      setError('Erro inesperado. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 mb-3">
            <Code2 size={24} className="text-cyan-400" />
          </div>
          <h1 className="text-xl font-semibold text-slate-100 tracking-tight">Painel dev</h1>
          <p className="text-slate-500 text-xs mt-0.5">Acesso exclusivo do desenvolvedor</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-xl shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-500 text-[10px] font-medium uppercase tracking-wider mb-1.5">Senha</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"><Lock size={14} /></span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Senha do desenvolvedor"
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-slate-600"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-amber-400/90 bg-amber-400/10 px-2.5 py-2 rounded border border-amber-400/20 text-[11px]">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[46px] bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white text-sm font-medium rounded-lg transition-all"
            >
              {isSubmitting ? 'Entrando...' : 'Acessar Painel dev'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
