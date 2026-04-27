import React, { useState, useEffect, useCallback } from 'react';
import { useUser } from '../../contexts/UserContext';
import { useRitmoGestao } from '../../controllers/useRitmoGestao';
import { UserList } from './UserList';
import { UserForm } from './UserForm';
import {
  listAllUsers,
  saveUserProfile,
  updateUserProfile,
  createUser,
  deleteUserProfile,
  resetPassword,
  adminSetUserPassword,
} from '../../services/firebaseAuth';
import {
  getBoardDataOnce,
  getRitmoBoardOnce,
  saveBoardItems,
  saveRitmoBoard,
} from '../../services/firestoreSync';
import {
  auditarAtividadeUsuarioNaPlataforma,
  type UserActivityAuditResult,
} from '../../utils/userActivityAudit';
import { isDeveloperEmail } from '../../config/developer';
import { getAppSettings, saveAppSettings } from '../../services/appSettings';
import type { UserProfile } from '../../types/user';
import { PERMISSIONS_SCHEMA_VERSION } from '../../types/user';
import { LogOut, Users, Plus, ArrowLeft, ShieldCheck, LayoutGrid } from 'lucide-react';

type AdminView = 'list' | 'create' | 'edit';

export const AdminPanel: React.FC = () => {
  const { logout, profile: currentAdmin, encryptionKey } = useUser();
  const ritmo = useRitmoGestao(encryptionKey ?? null);
  const [view, setView] = useState<AdminView>('list');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [estrategicoFiltrarKanbanPorWho, setEstrategicoFiltrarKanbanPorWho] = useState(false);
  const [backlogPermiteAlterarEmpresa, setBacklogPermiteAlterarEmpresa] = useState(false);
  const [backlogPermiteAlterarData, setBacklogPermiteAlterarData] = useState(false);
  const [tarefaPermiteAlterarData, setTarefaPermiteAlterarData] = useState(false);
  const [loadingAppSettings, setLoadingAppSettings] = useState(true);
  const [removeModalUser, setRemoveModalUser] = useState<UserProfile | null>(null);
  const [removeAuditLoading, setRemoveAuditLoading] = useState(false);
  const [removeAudit, setRemoveAudit] = useState<UserActivityAuditResult | null>(null);
  const [removeExecuting, setRemoveExecuting] = useState(false);
  const [passwordModalUser, setPasswordModalUser] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordActionLoading, setPasswordActionLoading] = useState(false);

  const buildRefs = useCallback((user: UserProfile): Set<string> => {
    const out = new Set<string>();
    const add = (v?: string | null) => {
      const n = String(v ?? '').trim().toLowerCase();
      if (n) out.add(n);
    };
    add(user.uid);
    add(user.nome);
    add(user.email);
    if ((user.email ?? '').includes('@')) add(user.email.split('@')[0]);
    return out;
  }, []);

  const valueMatchesRefs = useCallback((value: string | undefined | null, refs: Set<string>) => {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return false;
    if (refs.has(raw)) return true;
    return raw.split('|').some((p) => refs.has(p.trim()));
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const all = await listAllUsers();
      const visible = all.filter((u) => !isDeveloperEmail(u.email));
      setUsers(visible);
    } catch {
      setError('Erro ao carregar usuários.');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getAppSettings();
        if (!cancelled) {
          setEstrategicoFiltrarKanbanPorWho(s.estrategicoFiltrarKanbanPorWho);
          setBacklogPermiteAlterarEmpresa(Boolean(s.backlogPermiteAlterarEmpresa));
          setBacklogPermiteAlterarData(Boolean(s.backlogPermiteAlterarData));
          setTarefaPermiteAlterarData(Boolean(s.tarefaPermiteAlterarData));
        }
      } catch {
        if (!cancelled) {
          setEstrategicoFiltrarKanbanPorWho(false);
          setBacklogPermiteAlterarEmpresa(false);
          setBacklogPermiteAlterarData(false);
          setTarefaPermiteAlterarData(false);
        }
      } finally {
        if (!cancelled) setLoadingAppSettings(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Garante que empresas já cadastradas nos perfis de usuário
  // apareçam também como workspaces no Ritmo de Gestão.
  useEffect(() => {
    if (!encryptionKey) return;
    if (!ritmo.addEmpresa) return;

    const fromUsers = new Set<string>();
    users.forEach((u) => {
      if (Array.isArray(u.empresas)) {
        u.empresas.forEach((e) => {
          const nome = (e || '').trim();
          if (nome && nome !== '*' && nome.toLowerCase() !== 'todas') {
            fromUsers.add(nome);
          }
        });
      }
    });

    const existentes = new Set((ritmo.empresas ?? []).map((e: string) => e.trim()).filter(Boolean));
    fromUsers.forEach((nome) => {
      if (!existentes.has(nome)) {
        ritmo.addEmpresa(nome);
      }
    });
  }, [encryptionKey, ritmo, users]);

  const handleCreate = async (data: {
    nome: string;
    email: string;
    password: string;
    role: UserProfile['role'];
    views: UserProfile['views'];
    modulePermissions: NonNullable<UserProfile['modulePermissions']>;
    empresas: string[];
    externalWorkspaceLinks: NonNullable<UserProfile['externalWorkspaceLinks']>;
    ativo: boolean;
  }) => {
    setError('');
    setSuccess('');
    try {
      const fbUser = await createUser(data.email, data.password);
      const newProfile: UserProfile = {
        uid: fbUser.uid,
        email: data.email,
        nome: data.nome,
        role: data.role,
        views: data.views,
        ...(data.role !== 'administrador' && Object.keys(data.modulePermissions).length > 0
          ? {
              modulePermissions: data.modulePermissions,
              permissionsSchemaVersion: PERMISSIONS_SCHEMA_VERSION,
            }
          : {}),
        empresas: data.empresas,
        externalWorkspaceLinks: data.externalWorkspaceLinks,
        ativo: data.ativo,
        criadoEm: Date.now(),
        criadoPor: currentAdmin?.uid ?? '',
      };
      await saveUserProfile(newProfile);
      setSuccess(`Usuário "${data.nome}" criado com sucesso.`);
      setView('list');
      await loadUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar usuário.';
      if (msg.includes('auth/email-already-in-use')) {
        setError('Este email já está em uso.');
      } else {
        setError(msg);
      }
    }
  };

  const handleUpdate = async (uid: string, data: Partial<UserProfile>) => {
    setError('');
    setSuccess('');
    if (
      uid === currentAdmin?.uid &&
      data.role != null &&
      data.role !== 'administrador'
    ) {
      setError('Você não pode remover seu próprio perfil de administrador durante esta sessão.');
      return;
    }
    try {
      await updateUserProfile(uid, data);
      setSuccess('Usuário atualizado com sucesso.');
      setView('list');
      setEditingUser(null);
      await loadUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (
        msg.includes('permission-denied') ||
        msg.includes('Missing or insufficient permissions')
      ) {
        setError('Seu usuário não é mais administrador. Faça login com um administrador para continuar.');
        return;
      }
      setError('Erro ao atualizar usuário.');
    }
  };

  const handleToggleAtivo = async (user: UserProfile) => {
    await handleUpdate(user.uid, { ativo: !user.ativo });
  };

  const handleEdit = (user: UserProfile) => {
    setEditingUser(user);
    setView('edit');
  };

  const handleResetPassword = useCallback(async (user: UserProfile) => {
    setError('');
    setSuccess('');
    try {
      await resetPassword(user.email);
      setSuccess(`Link de redefinição de senha enviado para "${user.email}".`);
    } catch {
      setError('Não foi possível enviar o link de redefinição de senha.');
    }
  }, []);

  const openPasswordActions = useCallback((user: UserProfile) => {
    setPasswordModalUser(user);
    setNewPassword('');
    setPasswordActionLoading(false);
    setError('');
  }, []);

  const closePasswordActions = useCallback(() => {
    setPasswordModalUser(null);
    setNewPassword('');
    setPasswordActionLoading(false);
  }, []);

  const handleSetPasswordDirect = useCallback(async () => {
    if (!passwordModalUser) return;
    if (newPassword.trim().length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setPasswordActionLoading(true);
    setError('');
    setSuccess('');
    try {
      await adminSetUserPassword(passwordModalUser.uid, newPassword.trim());
      setSuccess(`Senha do usuário "${passwordModalUser.nome}" alterada com sucesso.`);
      closePasswordActions();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível alterar a senha no painel.';
      setError(msg);
    } finally {
      setPasswordActionLoading(false);
    }
  }, [passwordModalUser, newPassword, closePasswordActions]);

  const openRemoveUserModal = useCallback(
    async (user: UserProfile) => {
      if (user.uid === currentAdmin?.uid) return;
      setError('');
      setSuccess('');
      setRemoveModalUser(user);
      setRemoveAudit(null);
      if (!encryptionKey) {
        setRemoveAudit({
          semHistoricoNaPlataforma: false,
          motivos: ['Não foi possível verificar o board (chave de dados indisponível). Faça login novamente.'],
        });
        return;
      }
      setRemoveAuditLoading(true);
      try {
        const [boardPack, ritmo] = await Promise.all([
          getBoardDataOnce(encryptionKey),
          getRitmoBoardOnce(encryptionKey),
        ]);
        const items = boardPack?.items ?? [];
        const board = ritmo ?? {
          backlog: [],
          prioridades: [],
          planos: [],
          tarefas: [],
          responsaveis: [],
          empresas: [],
        };
        setRemoveAudit(auditarAtividadeUsuarioNaPlataforma(user, users, items, board));
      } catch {
        setRemoveAudit({
          semHistoricoNaPlataforma: false,
          motivos: ['Erro ao carregar dados do board para auditoria. Tente novamente.'],
        });
      } finally {
        setRemoveAuditLoading(false);
      }
    },
    [currentAdmin?.uid, encryptionKey, users],
  );

  const closeRemoveModal = useCallback(() => {
    setRemoveModalUser(null);
    setRemoveAudit(null);
    setRemoveAuditLoading(false);
    setRemoveExecuting(false);
  }, []);

  const confirmRemoveUser = useCallback(async () => {
    if (!removeModalUser || !removeAudit?.semHistoricoNaPlataforma || removeExecuting) return;
    setRemoveExecuting(true);
    setError('');
    try {
      await deleteUserProfile(removeModalUser.uid);
      setSuccess(
        `Cadastro de "${removeModalUser.nome}" removido do Firestore. ` +
          'Se precisar reutilizar o mesmo email, exclua também o usuário em Authentication no console do Firebase.',
      );
      closeRemoveModal();
      await loadUsers();
    } catch {
      setError('Não foi possível excluir o cadastro. Verifique permissões e conexão.');
    } finally {
      setRemoveExecuting(false);
    }
  }, [removeModalUser, removeAudit?.semHistoricoNaPlataforma, removeExecuting, closeRemoveModal, loadUsers]);

  const forceRemoveUserWithCleanup = useCallback(async () => {
    if (!removeModalUser || !encryptionKey || removeExecuting) return;
    setRemoveExecuting(true);
    setError('');
    setSuccess('');
    try {
      const refs = buildRefs(removeModalUser);
      const [boardPack, ritmoBoard] = await Promise.all([
        getBoardDataOnce(encryptionKey),
        getRitmoBoardOnce(encryptionKey),
      ]);

      const nextItems = (boardPack?.items ?? []).filter(
        (i) => !valueMatchesRefs(i.created_by, refs) && !valueMatchesRefs(i.who, refs),
      );

      const baseRitmo = ritmoBoard ?? {
        backlog: [],
        prioridades: [],
        planos: [],
        tarefas: [],
        responsaveis: [],
        empresas: [],
      };

      const nextBacklog = baseRitmo.backlog.filter((b) => !valueMatchesRefs(b.created_by, refs));
      const nextPrioridades = baseRitmo.prioridades.filter(
        (p) => !valueMatchesRefs(p.created_by, refs) && !valueMatchesRefs(p.dono_id, refs),
      );
      const prioridadeIds = new Set(nextPrioridades.map((p) => p.id));
      const nextPlanos = baseRitmo.planos.filter(
        (pl) =>
          prioridadeIds.has(pl.prioridade_id) &&
          !valueMatchesRefs(pl.created_by, refs) &&
          !valueMatchesRefs(pl.who_id, refs),
      );
      const planoIds = new Set(nextPlanos.map((pl) => pl.id));
      const nextTarefas = baseRitmo.tarefas.filter(
        (t) =>
          planoIds.has(t.plano_id) &&
          !valueMatchesRefs(t.created_by, refs) &&
          !valueMatchesRefs(t.responsavel_id, refs),
      );
      const nextResponsaveis = baseRitmo.responsaveis.filter(
        (r) => !valueMatchesRefs(r.id, refs) && !valueMatchesRefs(r.nome, refs),
      );

      const nextRitmo = {
        ...baseRitmo,
        backlog: nextBacklog,
        prioridades: nextPrioridades,
        planos: nextPlanos,
        tarefas: nextTarefas,
        responsaveis: nextResponsaveis,
      };

      await Promise.all([
        saveBoardItems(nextItems, encryptionKey),
        saveRitmoBoard(nextRitmo, encryptionKey),
      ]);

      const createdByTarget = users.filter(
        (u) => u.uid !== removeModalUser.uid && u.criadoPor === removeModalUser.uid,
      );
      await Promise.all(
        createdByTarget.map((u) => updateUserProfile(u.uid, { criadoPor: currentAdmin?.uid ?? 'system' })),
      );

      await deleteUserProfile(removeModalUser.uid);
      setSuccess(`Usuário "${removeModalUser.nome}" excluído com limpeza de vínculos concluída.`);
      closeRemoveModal();
      await loadUsers();
    } catch {
      setError('Falha ao excluir usuário com limpeza de vínculos.');
    } finally {
      setRemoveExecuting(false);
    }
  }, [
    removeModalUser,
    encryptionKey,
    removeExecuting,
    buildRefs,
    valueMatchesRefs,
    users,
    currentAdmin?.uid,
    closeRemoveModal,
    loadUsers,
  ]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="h-14 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-950 ring-1 ring-slate-700">
            <img
              src="/mavo-logo.png"
              alt="MAVO"
              className="h-9 w-9 shrink-0 object-contain object-center"
              width={36}
              height={36}
              decoding="async"
            />
          </div>
          <h1 className="text-sm font-semibold tracking-tight">Painel Administrativo</h1>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
        >
          <LogOut size={16} /> Sair
        </button>
      </header>

      <div className="max-w-5xl mx-auto p-4 md:p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
            {error}
            <button onClick={() => setError('')} className="ml-2 underline">Fechar</button>
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs">
            {success}
            <button onClick={() => setSuccess('')} className="ml-2 underline">Fechar</button>
          </div>
        )}

        {view === 'list' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-slate-400" />
                <h2 className="text-base font-semibold">Gestão de Usuários</h2>
                <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{users.length}</span>
              </div>
              <button
                onClick={() => { setView('create'); setEditingUser(null); setError(''); setSuccess(''); }}
                className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
              >
                <Plus size={16} /> Novo Usuário
              </button>
            </div>
            <UserList
              users={users}
              loading={loadingUsers}
              onEdit={handleEdit}
              onToggleAtivo={handleToggleAtivo}
              onRequestRemove={openRemoveUserModal}
              onOpenPasswordActions={openPasswordActions}
              currentUid={currentAdmin?.uid ?? ''}
            />

            {passwordModalUser && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                role="dialog"
                aria-modal="true"
              >
                <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
                  <h3 className="text-sm font-semibold text-slate-100">Ações de senha</h3>
                  <p className="mt-2 text-xs text-slate-400">
                    Usuário: <span className="text-slate-200">{passwordModalUser.nome}</span> · {passwordModalUser.email}
                  </p>

                  <div className="mt-4 space-y-3">
                    <button
                      type="button"
                      onClick={() => void handleResetPassword(passwordModalUser)}
                      disabled={passwordActionLoading}
                      className="w-full rounded-lg border border-amber-700/40 bg-amber-900/10 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-900/20 disabled:opacity-50"
                    >
                      Enviar e-mail para redefinição
                    </button>

                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2">
                      <label className="text-[11px] text-slate-400">Definir nova senha direto no painel</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Nova senha (mínimo 6 caracteres)"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => void handleSetPasswordDirect()}
                        disabled={passwordActionLoading}
                        className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {passwordActionLoading ? 'Alterando...' : 'Alterar senha agora'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={closePasswordActions}
                      className="rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {removeModalUser && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="remove-user-title"
              >
                <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
                  <h3 id="remove-user-title" className="text-sm font-semibold text-slate-100">
                    Excluir cadastro
                  </h3>
                  <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                    <span className="text-slate-200">{removeModalUser.nome}</span>
                    {' · '}
                    <span className="text-slate-500">{removeModalUser.email}</span>
                  </p>
                  <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                    Só é possível excluir usuários que nunca geraram referência nos dados da plataforma (iniciativas,
                    prioridades, planos, tarefas, responsáveis ou cadastro de terceiros).
                  </p>

                  <div className="mt-4 min-h-18">
                    {removeAuditLoading && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <div className="h-4 w-4 border-2 border-slate-600 border-t-amber-500 rounded-full animate-spin shrink-0" />
                        Verificando histórico no board…
                      </div>
                    )}
                    {!removeAuditLoading && removeAudit && !removeAudit.semHistoricoNaPlataforma && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-200/90 space-y-1.5">
                        <p className="font-medium text-amber-100">Exclusão bloqueada — há vínculos com este usuário:</p>
                        <ul className="list-disc pl-4 space-y-0.5 text-amber-200/80">
                          {removeAudit.motivos.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {!removeAuditLoading && removeAudit?.semHistoricoNaPlataforma && (
                      <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-[11px] text-emerald-200/90">
                        Nenhum registro de atividade encontrado. Você pode remover este cadastro com segurança.
                      </div>
                    )}
                  </div>

                  <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeRemoveModal}
                      disabled={removeExecuting}
                      className="rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void confirmRemoveUser()}
                      disabled={
                        removeAuditLoading || !removeAudit?.semHistoricoNaPlataforma || removeExecuting
                      }
                      className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {removeExecuting ? 'Excluindo…' : 'Excluir cadastro'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void forceRemoveUserWithCleanup()}
                      disabled={removeExecuting || removeAuditLoading}
                      className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {removeExecuting ? 'Processando…' : 'Excluir usuário + limpar vínculos'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Configurações do sistema */}
            <div className="mt-10 border-t border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-4">
                <LayoutGrid size={18} className="text-slate-400" />
                <h3 className="text-sm font-semibold">Configurações do sistema</h3>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 max-w-xl">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-slate-600 bg-slate-950 text-amber-600 focus:ring-amber-500/40"
                    checked={estrategicoFiltrarKanbanPorWho}
                    disabled={loadingAppSettings}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      setEstrategicoFiltrarKanbanPorWho(next);
                      setError('');
                      try {
                        await saveAppSettings({ estrategicoFiltrarKanbanPorWho: next });
                        setSuccess(
                          next
                            ? 'Filtro do Estratégico ativado: cada usuário verá só os cartões do seu WHO (exceto administradores).'
                            : 'Filtro do Estratégico desativado: todos veem as iniciativas do workspace (conforme empresa).',
                        );
                      } catch {
                        setEstrategicoFiltrarKanbanPorWho(!next);
                        setError('Não foi possível salvar a configuração. Verifique o Firestore e as regras de segurança.');
                      }
                    }}
                  />
                  <span>
                    <span className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
                      Filtrar quadro Estratégico (Kanban) por responsável (WHO)
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-1 leading-relaxed">
                      Quando ativado, usuários que <strong className="text-slate-400">não</strong> são administradores só veem
                      cartões cuja iniciativa está atribuída a eles no campo WHO. Administradores continuam vendo todo o
                      quadro do workspace. Desligado = comportamento anterior (todos veem as iniciativas da empresa selecionada).
                    </span>
                  </span>
                </label>
                <div className="my-4 border-t border-slate-800" />
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-slate-600 bg-slate-950 text-amber-600 focus:ring-amber-500/40"
                    checked={backlogPermiteAlterarEmpresa}
                    disabled={loadingAppSettings}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      setBacklogPermiteAlterarEmpresa(next);
                      setError('');
                      try {
                        await saveAppSettings({ backlogPermiteAlterarEmpresa: next });
                        setSuccess(
                          next
                            ? 'Backlog configurado para permitir alterar empresa/workspace no lançamento e edição.'
                            : 'Backlog configurado para fixar empresa/workspace automaticamente pelo filtro ativo.',
                        );
                      } catch {
                        setBacklogPermiteAlterarEmpresa(!next);
                        setError('Não foi possível salvar a configuração. Verifique o Firestore e as regras de segurança.');
                      }
                    }}
                  />
                  <span>
                    <span className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
                      Permitir alterar empresa no Backlog
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-1 leading-relaxed">
                      Quando desativado, a empresa do card de backlog é preenchida automaticamente com o workspace
                      selecionado no momento do lançamento. Quando ativado, o campo Empresa / Workspace volta a ser editável.
                    </span>
                  </span>
                </label>
                <div className="my-4 border-t border-slate-800" />
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-slate-600 bg-slate-950 text-amber-600 focus:ring-amber-500/40"
                    checked={backlogPermiteAlterarData}
                    disabled={loadingAppSettings}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      setBacklogPermiteAlterarData(next);
                      setError('');
                      try {
                        await saveAppSettings({ backlogPermiteAlterarData: next });
                        setSuccess(
                          next
                            ? 'Backlog configurado para permitir alterar a data no modal.'
                            : 'Backlog configurado para manter a data bloqueada no modal.',
                        );
                      } catch {
                        setBacklogPermiteAlterarData(!next);
                        setError('Não foi possível salvar a configuração. Verifique o Firestore e as regras de segurança.');
                      }
                    }}
                  />
                  <span>
                    <span className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
                      Permitir alterar data no Backlog
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-1 leading-relaxed">
                      Quando desativado, o campo de data no modal de backlog fica bloqueado. Quando ativado,
                      a data volta a ser editável na criação e edição do card.
                    </span>
                  </span>
                </label>
                <div className="my-4 border-t border-slate-800" />
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-slate-600 bg-slate-950 text-amber-600 focus:ring-amber-500/40"
                    checked={tarefaPermiteAlterarData}
                    disabled={loadingAppSettings}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      setTarefaPermiteAlterarData(next);
                      setError('');
                      try {
                        await saveAppSettings({ tarefaPermiteAlterarData: next });
                        setSuccess(
                          next
                            ? 'Prazo das tarefas liberado para usuários não administradores.'
                            : 'Prazo das tarefas bloqueado para usuários não administradores.',
                        );
                      } catch {
                        setTarefaPermiteAlterarData(!next);
                        setError('Não foi possível salvar a configuração. Verifique o Firestore e as regras de segurança.');
                      }
                    }}
                  />
                  <span>
                    <span className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
                      Permitir alterar prazo das Tarefas (Tático / Operacional)
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-1 leading-relaxed">
                      Administradores gerais sempre podem alterar o prazo. Para os demais usuários, quando desativado,
                      o campo de prazo (data de vencimento) fica somente leitura; quando ativado, o prazo pode ser
                      editado diretamente na linha da tarefa.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {/* Gestão de Workspaces / Empresas */}
            <div className="mt-10 border-t border-slate-800 pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-slate-400" />
                  <h3 className="text-sm font-semibold">Workspaces / Empresas</h3>
                  <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                    {ritmo.empresas?.length ?? 0}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 mb-3">
                Somente administradores podem criar novos workspaces. Essas empresas aparecem no seletor de Workspace do painel principal.
              </p>

              {ritmo.empresas && ritmo.empresas.length > 0 ? (
                <ul className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {ritmo.empresas.map((nome) => (
                    <li
                      key={nome}
                      className="flex items-center justify-between gap-2 bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2"
                    >
                      <span className="text-xs text-slate-200 truncate">{nome}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-600 mb-4">
                  Nenhuma empresa cadastrada ainda. Crie o primeiro workspace abaixo.
                </p>
              )}

              <form
                className="flex flex-col sm:flex-row gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!ritmo.addEmpresa) return;
                  const form = e.target as HTMLFormElement;
                  const input = form.elements.namedItem('novaEmpresaAdmin') as HTMLInputElement | null;
                  const nome = input?.value.trim() ?? '';
                  if (!nome) return;
                  ritmo.addEmpresa(nome);
                  if (input) input.value = '';
                  setSuccess(`Workspace "${nome}" criado com sucesso.`);
                }}
              >
                <input
                  name="novaEmpresaAdmin"
                  type="text"
                  placeholder="Nome da empresa / workspace"
                  className="flex-1 bg-slate-950/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-sm font-medium text-white shrink-0 flex items-center gap-2"
                >
                  <Plus size={16} /> Criar workspace
                </button>
              </form>
            </div>
          </>
        )}

        {(view === 'create' || view === 'edit') && (
          <>
            <button
              onClick={() => { setView('list'); setEditingUser(null); setError(''); setSuccess(''); }}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 mb-4 transition-colors"
            >
              <ArrowLeft size={16} /> Voltar para lista
            </button>
            <UserForm
              mode={view === 'create' ? 'create' : 'edit'}
              user={editingUser}
              currentUid={currentAdmin?.uid}
              empresasDisponiveis={ritmo.empresas ?? []}
              onCreate={handleCreate}
              onUpdate={handleUpdate}
            />
          </>
        )}
      </div>
    </div>
  );
};
