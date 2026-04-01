import React, { useState, useEffect, useMemo } from 'react';
import { PERMISSIONS_SCHEMA_VERSION, type UserProfile, type UserRole } from '../../types/user';
import type { ViewId } from '../Layout/Sidebar';
import {
  ADMIN_SELECTABLE_VIEWS,
  MODULE_ACTIONS,
  type ModulePermissionMap,
  allActionIdsForView,
  defaultModulePermissionsForViews,
} from '../../types/modulePermissions';
import { Save, UserPlus, ChevronDown, ChevronRight } from 'lucide-react';

const ROLES: { id: UserRole; label: string; hint: string }[] = [
  {
    id: 'administrador',
    label: 'Administrador',
    hint: 'Acesso total, workspaces e painel de usuários.',
  },
  {
    id: 'gerente',
    label: 'Gerente',
    hint: 'Visão ampla no app; permissões por view/ação abaixo (incl. atribuir tarefas, se marcado).',
  },
  {
    id: 'usuario',
    label: 'Usuário',
    hint: 'Acesso só às views e ações que você marcar (ex.: Tático sem atribuir a terceiros).',
  },
];

interface UserFormProps {
  mode: 'create' | 'edit';
  user: UserProfile | null;
  currentUid?: string;
  empresasDisponiveis: string[];
  onCreate: (data: {
    nome: string;
    email: string;
    password: string;
    role: UserRole;
    views: ViewId[];
    modulePermissions: ModulePermissionMap;
    empresas: string[];
    ativo: boolean;
  }) => Promise<void>;
  onUpdate: (uid: string, data: Partial<UserProfile>) => Promise<void>;
}

export const UserForm: React.FC<UserFormProps> = ({
  mode,
  user,
  currentUid,
  empresasDisponiveis,
  onCreate,
  onUpdate,
}) => {
  const ensureBacklogView = (list: ViewId[]): ViewId[] =>
    list.includes('backlog') ? list : (['backlog', ...list] as ViewId[]);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('usuario');
  const [views, setViews] = useState<ViewId[]>([]);
  const [modulePermissions, setModulePermissions] = useState<ModulePermissionMap>({});
  const [expandedModule, setExpandedModule] = useState<ViewId | null>(null);
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [ativo, setAtivo] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && user) {
      setNome(user.nome);
      setEmail(user.email);
      setRole(user.role);
      const safeViews = ensureBacklogView(Array.isArray(user.views) ? user.views : []);
      setViews(safeViews);
      if (user.modulePermissions && Object.keys(user.modulePermissions).length > 0) {
        const ver = user.permissionsSchemaVersion ?? 1;
        const raw = {
          ...user.modulePermissions,
          backlog: user.modulePermissions.backlog ?? allActionIdsForView('backlog'),
        };
        for (const vid of ['table', 'operacional'] as const) {
          const arr = raw[vid];
          if (!arr || ver >= PERMISSIONS_SCHEMA_VERSION) continue;
          if (arr.includes('tarefa_write') && !arr.includes('tarefa_assign')) {
            raw[vid] = [...arr, 'tarefa_assign'];
          }
        }
        setModulePermissions(raw);
      } else {
        setModulePermissions(defaultModulePermissionsForViews(safeViews));
      }
      setEmpresas(user.empresas);
      setAtivo(user.ativo);
      setExpandedModule(null);
    }
  }, [mode, user]);

  const showViewsAndActions = role === 'usuario' || role === 'gerente';

  const viewLabel = useMemo(() => {
    const m = new Map(ADMIN_SELECTABLE_VIEWS.map((v) => [v.id, v.label]));
    return (id: ViewId) => m.get(id) ?? id;
  }, []);

  const toggleView = (v: ViewId) => {
    if (v === 'backlog') return;
    setViews((prev) => {
      if (prev.includes(v)) {
        setModulePermissions((mp) => {
          const next = { ...mp };
          delete next[v];
          return next;
        });
        return prev.filter((x) => x !== v);
      }
      const ids = allActionIdsForView(v);
      setModulePermissions((mp) => ({ ...mp, [v]: ids }));
      return ensureBacklogView([...prev, v]);
    });
  };

  const toggleAction = (view: ViewId, actionId: string) => {
    setModulePermissions((mp) => {
      const cur = mp[view] ?? allActionIdsForView(view);
      const next = cur.includes(actionId) ? cur.filter((a) => a !== actionId) : [...cur, actionId];
      return { ...mp, [view]: next };
    });
  };

  const selectAllActions = (view: ViewId) => {
    setModulePermissions((mp) => ({ ...mp, [view]: allActionIdsForView(view) }));
  };

  const clearActions = (view: ViewId) => {
    setModulePermissions((mp) => ({ ...mp, [view]: [] }));
  };

  const handleRoleClick = (r: UserRole) => {
    setRole(r);
    if (r === 'gerente' || r === 'usuario') {
      setViews((prev) => {
        if (prev.length > 0) return ensureBacklogView(prev);
        const allIds = ensureBacklogView(ADMIN_SELECTABLE_VIEWS.map((x) => x.id));
        setModulePermissions(defaultModulePermissionsForViews(allIds));
        return allIds;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'create') {
        const mp =
          role === 'administrador'
            ? {}
            : Object.fromEntries(
                ensureBacklogView(views).map((v) => [v, modulePermissions[v] ?? allActionIdsForView(v)])
              ) as ModulePermissionMap;
        const safeViews = ensureBacklogView(views);
        await onCreate({
          nome,
          email,
          password,
          role,
          views: role === 'administrador' ? [] : safeViews,
          modulePermissions: mp,
          empresas,
          ativo,
        });
      } else if (user) {
        const base: Partial<UserProfile> = { nome, role, empresas, ativo };
        if (role === 'usuario' || role === 'gerente') {
          const safeViews = ensureBacklogView(views);
          base.views = safeViews;
          base.modulePermissions = Object.fromEntries(
            safeViews.map((v) => [v, modulePermissions[v] ?? allActionIdsForView(v)])
          ) as ModulePermissionMap;
          base.permissionsSchemaVersion = PERMISSIONS_SCHEMA_VERSION;
        }
        await onUpdate(user.uid, base);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const hasAllEmpresas = empresas.includes('*');
  const isEditingSelfAdmin =
    mode === 'edit' &&
    !!user &&
    user.uid === currentUid &&
    user.role === 'administrador';

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 max-w-3xl">
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
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => handleRoleClick(r.id)}
                disabled={isEditingSelfAdmin && r.id !== 'administrador'}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  role === r.id
                    ? 'bg-amber-600 border-amber-500 text-white'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                } ${isEditingSelfAdmin && r.id !== 'administrador' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
            {ROLES.find((r) => r.id === role)?.hint}
          </p>
          {isEditingSelfAdmin && (
            <p className="text-[10px] text-amber-400/90 mt-2">
              Você não pode remover seu próprio perfil de administrador nesta sessão.
            </p>
          )}
        </div>

        {showViewsAndActions && (
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5">
                Views permitidas
              </label>
              <div className="flex flex-wrap gap-2">
                {ADMIN_SELECTABLE_VIEWS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => toggleView(v.id)}
                    disabled={v.id === 'backlog'}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      views.includes(v.id)
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                    } ${v.id === 'backlog' ? 'opacity-80 cursor-not-allowed' : ''}`}
                  >
                    {v.label} {v.id === 'backlog' ? '(obrigatório)' : ''}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-600 mt-1">
                Workspace é exclusivo para administradores.
              </p>
            </div>

            <div className="border border-slate-800 rounded-lg p-3 bg-slate-950/40 space-y-2">
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                Ações por módulo
              </label>
              <p className="text-[10px] text-slate-600 mb-2">
                Para cada view ativa, defina o que o usuário pode fazer. Sem nenhuma ação marcada = apenas visualizar (leitura). Em{' '}
                <span className="text-slate-400">Tático</span> e <span className="text-slate-400">Operacional</span>, a ação{' '}
                <span className="text-emerald-500/90">&quot;Atribuir tarefas a outras pessoas&quot;</span> controla se pode classificar a
                tarefa para outro responsável; sem ela, só a si mesmo. A ação{' '}
                <span className="text-emerald-500/90">&quot;Ver todos os planos de ataque&quot;</span> libera a visão completa da equipe
                no Tático (todas as prioridades e tarefas nos planos); sem ela, vê só o que for dele como dono ou atribuído.
              </p>
              {views.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">Selecione ao menos uma view acima.</p>
              ) : (
                <div className="space-y-1">
                  {views.map((vid) => {
                    const actions = MODULE_ACTIONS[vid] ?? [];
                    const selected = new Set(modulePermissions[vid] ?? allActionIdsForView(vid));
                    const open = expandedModule === vid;
                    return (
                      <div key={vid} className="border border-slate-800/80 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setExpandedModule(open ? null : vid)}
                          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-800/40 transition-colors"
                        >
                          <span className="text-xs font-medium text-slate-200 flex items-center gap-2">
                            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            {viewLabel(vid)}
                          </span>
                          <span className="text-[10px] text-slate-500 tabular-nums">
                            {selected.size}/{actions.length} ações
                          </span>
                        </button>
                        {open && (
                          <div className="px-3 pb-3 pt-0 border-t border-slate-800/80 space-y-2">
                            <div className="flex flex-wrap gap-2 pt-2">
                              <button
                                type="button"
                                onClick={() => selectAllActions(vid)}
                                className="text-[10px] px-2 py-1 rounded border border-slate-600 text-slate-400 hover:text-slate-200"
                              >
                                Marcar todas
                              </button>
                              <button
                                type="button"
                                onClick={() => clearActions(vid)}
                                className="text-[10px] px-2 py-1 rounded border border-slate-600 text-slate-400 hover:text-slate-200"
                              >
                                Somente leitura
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {actions.map((a) => (
                                <button
                                  key={a.id}
                                  type="button"
                                  onClick={() => toggleAction(vid, a.id)}
                                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                                    selected.has(a.id)
                                      ? 'bg-emerald-600/90 border-emerald-500 text-white'
                                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                                  }`}
                                >
                                  {a.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
                    onClick={() => !hasAllEmpresas && setEmpresas((prev) => (prev.includes(emp) ? prev.filter((x) => x !== emp) : [...prev, emp]))}
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
            disabled={submitting || (showViewsAndActions && views.length === 0)}
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
          {showViewsAndActions && views.length === 0 && (
            <p className="text-[10px] text-amber-500/90 mt-2">Selecione ao menos uma view para gerente ou usuário.</p>
          )}
        </div>
      </form>
    </div>
  );
};
