import React, { useState, useEffect } from 'react';
import type { UserProfile, UserRole } from '../../types/user';
import type { ViewId } from '../Layout/Sidebar';
import { Save, UserPlus } from 'lucide-react';

const ALL_VIEWS: { id: ViewId; label: string }[] = [
  { id: 'backlog', label: 'BackLog' },
  { id: 'dashboard', label: 'Estratégico' },
  { id: 'table', label: 'Tático' },
  { id: 'performance', label: 'Desempenho' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'ia', label: '5W2H CHAT' },
];

const ROLES: { id: UserRole; label: string }[] = [
  { id: 'administrador', label: 'Administrador' },
  { id: 'gerente', label: 'Gerente' },
  { id: 'usuario', label: 'Usuário' },
];

interface UserFormProps {
  mode: 'create' | 'edit';
  user: UserProfile | null;
  empresasDisponiveis: string[];
  onCreate: (data: {
    nome: string;
    email: string;
    password: string;
    role: UserRole;
    views: ViewId[];
    empresas: string[];
    ativo: boolean;
  }) => Promise<void>;
  onUpdate: (uid: string, data: Partial<UserProfile>) => Promise<void>;
}

export const UserForm: React.FC<UserFormProps> = ({
  mode,
  user,
  empresasDisponiveis,
  onCreate,
  onUpdate,
}) => {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('usuario');
  const [views, setViews] = useState<ViewId[]>([]);
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [ativo, setAtivo] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && user) {
      setNome(user.nome);
      setEmail(user.email);
      setRole(user.role);
      setViews(user.views);
      setEmpresas(user.empresas);
      setAtivo(user.ativo);
    }
  }, [mode, user]);

  const toggleView = (v: ViewId) => {
    setViews((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const toggleEmpresa = (e: string) => {
    setEmpresas((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'create') {
        await onCreate({ nome, email, password, role, views, empresas, ativo });
      } else if (user) {
        await onUpdate(user.uid, { nome, role, views, empresas, ativo });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const showViewsConfig = role === 'usuario';
  const hasAllEmpresas = empresas.includes('*');

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 max-w-2xl">
      <h3 className="text-base font-semibold text-slate-100 mb-4 flex items-center gap-2">
        {mode === 'create' ? <UserPlus size={18} /> : <Save size={18} />}
        {mode === 'create' ? 'Novo Usuário' : `Editar: ${user?.nome}`}
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
              className="w-full bg-slate-950/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@empresa.com"
              className="w-full bg-slate-950/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
              required
              disabled={mode === 'edit'}
            />
          </div>
        </div>

        {mode === 'create' && (
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha do usuário (mín. 6 caracteres)"
              className="w-full bg-slate-950/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
              required
              minLength={6}
            />
          </div>
        )}

        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5">Perfil</label>
          <div className="flex gap-2">
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRole(r.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  role === r.id
                    ? 'bg-amber-600 border-amber-500 text-white'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {showViewsConfig && (
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5">
              Views permitidas
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => toggleView(v.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    views.includes(v.id)
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-600 mt-1">
              Workspace é exclusivo para administradores.
            </p>
          </div>
        )}

        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5">
            Empresas permitidas
          </label>

          {empresasDisponiveis.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhuma empresa cadastrada ainda.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setEmpresas(hasAllEmpresas ? [] : ['*'])}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    hasAllEmpresas
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  Todas as empresas
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {empresasDisponiveis.map((emp) => (
                  <button
                    key={emp}
                    type="button"
                    onClick={() => !hasAllEmpresas && toggleEmpresa(emp)}
                    disabled={hasAllEmpresas}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      hasAllEmpresas
                        ? 'bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed'
                        : empresas.includes(emp)
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {emp}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-medium">Status</label>
          <button
            type="button"
            onClick={() => setAtivo(!ativo)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              ativo ? 'bg-emerald-600' : 'bg-slate-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                ativo ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span className={`text-xs ${ativo ? 'text-emerald-400' : 'text-slate-500'}`}>
            {ativo ? 'Ativo' : 'Inativo'}
          </span>
        </div>

        <div className="pt-3 border-t border-slate-800">
          <button
            type="submit"
            disabled={submitting}
            className="bg-amber-600 hover:bg-amber-700 disabled:bg-slate-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-70"
          >
            {submitting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : mode === 'create' ? (
              <>
                <UserPlus size={16} /> Criar Usuário
              </>
            ) : (
              <>
                <Save size={16} /> Salvar Alterações
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
