import React, { useState, useEffect, useCallback } from 'react';
import { useUser } from '../../contexts/UserContext';
import { useRitmoGestao } from '../../controllers/useRitmoGestao';
import { UserList } from './UserList';
import { UserForm } from './UserForm';
import { listAllUsers, saveUserProfile, updateUserProfile, createUser } from '../../services/firebaseAuth';
import type { UserProfile } from '../../types/user';
import { LogOut, Users, Plus, ArrowLeft, ShieldCheck } from 'lucide-react';

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

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const all = await listAllUsers();
      setUsers(all);
    } catch {
      setError('Erro ao carregar usuários.');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

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
          ? { modulePermissions: data.modulePermissions }
          : {}),
        empresas: data.empresas,
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
    try {
      await updateUserProfile(uid, data);
      setSuccess('Usuário atualizado com sucesso.');
      setView('list');
      setEditingUser(null);
      await loadUsers();
    } catch {
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="h-14 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center">
            <ShieldCheck size={16} />
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
              currentUid={currentAdmin?.uid ?? ''}
            />

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
