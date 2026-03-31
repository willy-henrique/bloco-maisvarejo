import React from 'react';
import type { UserProfile } from '../../types/user';
import { Edit2, KeyRound, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';

const ROLE_LABELS: Record<UserProfile['role'], string> = {
  administrador: 'Admin',
  gerente: 'Gerente',
  usuario: 'Usuário',
};

const ROLE_COLORS: Record<UserProfile['role'], string> = {
  administrador: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  gerente: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  usuario: 'text-slate-400 bg-slate-400/10 border-slate-400/30',
};

interface UserListProps {
  users: UserProfile[];
  loading: boolean;
  onEdit: (user: UserProfile) => void;
  onToggleAtivo: (user: UserProfile) => void;
  onRequestRemove: (user: UserProfile) => void;
  onOpenPasswordActions: (user: UserProfile) => void;
  currentUid: string;
}

export const UserList: React.FC<UserListProps> = ({
  users,
  loading,
  onEdit,
  onToggleAtivo,
  onRequestRemove,
  onOpenPasswordActions,
  currentUid,
}) => {
  const normalizeTags = (values: string[] | undefined | null) => {
    const list = Array.isArray(values) ? values : [];
    const clean = list.map((v) => String(v ?? '').trim()).filter(Boolean);
    if (clean.some((v) => v === '*' || v.toLowerCase() === 'todas')) return ['Todas'];
    return clean;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="text-center text-slate-500 text-sm py-12">
        Nenhum usuário cadastrado.
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Nome</th>
              <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Email</th>
              <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Perfil</th>
              <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Views</th>
              <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Empresas</th>
              <th className="text-center px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Status</th>
              <th className="text-center px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.uid} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-100">{u.nome}</td>
                <td className="px-4 py-3 text-slate-400">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded border ${ROLE_COLORS[u.role]}`}>
                    {ROLE_LABELS[u.role]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {normalizeTags(u.views).length > 0 ? (
                      normalizeTags(u.views).map((v) => (
                        <span key={v} className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                          {v}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-500">—</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {normalizeTags(u.empresas).length > 0 ? (
                      normalizeTags(u.empresas).map((e) => (
                        <span key={e} className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                          {e}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-500">—</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  {u.ativo ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Ativo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-red-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Inativo
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => onEdit(u)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
                      title="Editar"
                    >
                      <Edit2 size={14} />
                    </button>
                    {u.uid !== currentUid && (
                      <>
                        <button
                          onClick={() => onToggleAtivo(u)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            u.ativo
                              ? 'text-emerald-400 hover:text-red-400 hover:bg-red-500/10'
                              : 'text-red-400 hover:text-emerald-400 hover:bg-emerald-500/10'
                          }`}
                          title={u.ativo ? 'Desativar' : 'Ativar'}
                        >
                          {u.ativo ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenPasswordActions(u)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                          title="Ações de senha"
                        >
                          <KeyRound size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRequestRemove(u)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Excluir cadastro (somente se não houver histórico na plataforma)"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
