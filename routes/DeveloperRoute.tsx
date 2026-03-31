import React from 'react';
import { LogOut, ShieldCheck, Wrench } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { DeveloperLogin } from '../components/Dev/DeveloperLogin';
import { isDeveloperEmail } from '../config/developer';
import { DeveloperPanel } from '../components/Dev/DeveloperPanel';
import { AdminPanel } from '../components/Admin/AdminPanel';

export const DeveloperRoute: React.FC = () => {
  const { isAuthenticated, loading, profile, logout } = useUser();
  const [mode, setMode] = React.useState<'dev' | 'admin'>('dev');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !profile) return <DeveloperLogin />;

  if (!isDeveloperEmail(profile.email)) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900/90 border border-red-800/50 p-6 rounded-xl max-w-sm text-center space-y-4">
          <div>
            <p className="text-red-400 text-sm font-medium mb-1">Acesso Negado</p>
            <p className="text-slate-400 text-xs">Somente o usuário de desenvolvimento pode acessar este painel.</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-red-300 border border-red-500/60 hover:bg-red-500/10 transition-colors"
          >
            <LogOut size={14} />
            Sair da conta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="h-12 border-b border-slate-800 bg-slate-900/95 px-4 flex items-center justify-between">
        <div className="text-xs text-slate-400 inline-flex items-center gap-1.5">
          <ShieldCheck size={13} className="text-amber-400" />
          Painel do desenvolvedor
        </div>
        <div className="inline-flex items-center gap-2">
          {mode === 'admin' && (
            <button
              onClick={() => setMode('dev')}
              className="text-xs px-3 py-1 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1.5"
            >
              <Wrench size={13} /> Fechar gestao
            </button>
          )}
        </div>
      </div>

      {mode === 'admin' ? (
        <AdminPanel />
      ) : (
        <DeveloperPanel onToggleAdminMode={() => setMode('admin')} />
      )}
    </div>
  );
};
