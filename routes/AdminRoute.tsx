import React from 'react';
import { useUser } from '../contexts/UserContext';
import { AdminLogin } from '../components/Admin/AdminLogin';
import { AdminPanel } from '../components/Admin/AdminPanel';
import { LogOut } from 'lucide-react';

export const AdminRoute: React.FC = () => {
  const { isAuthenticated, loading, profile, logout } = useUser();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
          <p className="text-slate-500 text-xs uppercase tracking-wider">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !profile) {
    return <AdminLogin />;
  }

  if (profile.role !== 'administrador') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900/90 border border-red-800/50 p-6 rounded-xl max-w-sm text-center space-y-4">
          <div>
            <p className="text-red-400 text-sm font-medium mb-1">Acesso Negado</p>
            <p className="text-slate-400 text-xs">
              Apenas administradores podem acessar este painel.
            </p>
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

  return <AdminPanel />;
};
