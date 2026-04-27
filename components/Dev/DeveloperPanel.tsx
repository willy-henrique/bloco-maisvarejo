import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bug,
  CheckCircle2,
  Cog,
  RefreshCcw,
  Settings,
  ShieldCheck,
  TestTube2,
  Trash2,
  Users,
  Wrench,
} from 'lucide-react';
import { useUser } from '../../contexts/UserContext';
import { fetchDevUsageRows, fetchOnlineUsersCount } from '../../services/devAnalytics';
import { getAppSettings } from '../../services/appSettings';
import { isFirebaseConfigured } from '../../services/firebase';
import { listAllUsers } from '../../services/firebaseAuth';
import type { UserProfile } from '../../types/user';

type DeveloperPanelProps = {
  onToggleAdminMode?: () => void;
};

export const DeveloperPanel: React.FC<DeveloperPanelProps> = ({ onToggleAdminMode }) => {
  const { logout } = useUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);
  const [rows, setRows] = useState<
    Array<{
      uid: string;
      nome: string;
      lastSeenAtMs: number;
      totalHeartbeats: number;
      totalPageViews: number;
    }>
  >([]);
  const [debugEvents, setDebugEvents] = useState<string[]>([]);
  const [testOutput, setTestOutput] = useState<string[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const secretTapCountRef = useRef(0);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [online, usage] = await Promise.all([fetchOnlineUsersCount(), fetchDevUsageRows()]);
      setOnlineCount(online);
      setRows(usage);
    } catch {
      setError('Erro ao carregar métricas.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const all = await listAllUsers();
      all.sort((a, b) => (b.criadoEm ?? 0) - (a.criadoEm ?? 0));
      setUsers(all);
    } catch {
      setUsersError('Não foi possível carregar usuários.');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const mostActive = useMemo(() => {
    if (rows.length === 0) return null;
    return [...rows].sort((a, b) => b.totalHeartbeats - a.totalHeartbeats)[0];
  }, [rows]);

  const admins = useMemo(() => users.filter((u) => u.role === 'administrador').length, [users]);
  const gerentes = useMemo(() => users.filter((u) => u.role === 'gerente').length, [users]);
  const usuariosComuns = useMemo(() => users.filter((u) => u.role === 'usuario').length, [users]);

  useEffect(() => {
    const add = (entry: string) => {
      setDebugEvents((prev) => [entry, ...prev].slice(0, 30));
    };
    const onError = (event: ErrorEvent) => {
      add(`[error] ${event.message} (${event.filename}:${event.lineno})`);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? 'unknown');
      add(`[promise] ${reason}`);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  const runQuickTests = useCallback(async () => {
    setIsRunningTests(true);
    const out: string[] = [];
    const ok = (name: string) => out.push(`SUCESSO - ${name}`);
    const fail = (name: string, msg: string) => out.push(`FALHA - ${name}: ${msg}`);
    try {
      if (isFirebaseConfigured) ok('Firebase configurado');
      else fail('Firebase configurado', 'variáveis de ambiente ausentes');
      try {
        await fetchOnlineUsersCount();
        ok('Leitura de presença dev_usage');
      } catch (e) {
        fail('Leitura de presença dev_usage', e instanceof Error ? e.message : 'erro desconhecido');
      }
      try {
        await getAppSettings();
        ok('Leitura de appSettings');
      } catch (e) {
        fail('Leitura de appSettings', e instanceof Error ? e.message : 'erro desconhecido');
      }
      if ('crypto' in window && !!window.crypto?.subtle) ok('WebCrypto disponível');
      else fail('WebCrypto disponível', 'window.crypto.subtle indisponível');
    } finally {
      setTestOutput(out);
      setIsRunningTests(false);
    }
  }, []);

  const clearLocalData = useCallback(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  }, []);

  const handleSecretAdminTrigger = useCallback(() => {
    if (!onToggleAdminMode) return;
    secretTapCountRef.current += 1;
    if (secretTapCountRef.current >= 5) {
      secretTapCountRef.current = 0;
      onToggleAdminMode();
    }
  }, [onToggleAdminMode]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="h-14 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between px-4 md:px-6">
        <h1 className="text-sm font-semibold tracking-tight">Painel dev</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 inline-flex items-center gap-1.5"
          >
            <RefreshCcw size={13} /> Atualizar
          </button>
          <button
            onClick={() => void loadUsers()}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 inline-flex items-center gap-1.5"
          >
            <Users size={13} /> Atualizar usuários
          </button>
          <button
            onClick={logout}
            className="text-xs px-3 py-1.5 rounded-lg border border-red-600/40 text-red-300 hover:bg-red-500/10"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
        {error && <div className="text-xs text-red-300 border border-red-800/40 bg-red-900/10 rounded-lg p-3">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider">
              <Users size={14} /> Pessoas online agora
            </div>
            <div className="mt-2 text-3xl font-semibold">{loading ? '...' : onlineCount}</div>
            <p className="mt-1 text-[11px] text-slate-500">Janela de presença: últimos 2 minutos.</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider">
              <Activity size={14} /> Usuário mais ativo
            </div>
            {mostActive ? (
              <div className="mt-2">
                <div className="text-sm font-medium">{mostActive.nome || '(sem nome)'}</div>
                <div className="text-xs text-slate-400 mt-1">
                  Batimentos: {mostActive.totalHeartbeats} • Visualizacoes: {mostActive.totalPageViews}
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-500">{loading ? '...' : 'Sem dados ainda.'}</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 text-sm font-medium">Uso por usuário</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-2">Nome</th>
                  <th className="text-right px-4 py-2">Batimentos</th>
                  <th className="text-right px-4 py-2">Visualizacoes</th>
                  <th className="text-right px-4 py-2">Ultima atividade</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.uid} className="border-b border-slate-800/40">
                    <td className="px-4 py-2">{r.nome || '-'}</td>
                    <td className="px-4 py-2 text-right">{r.totalHeartbeats}</td>
                    <td className="px-4 py-2 text-right">{r.totalPageViews}</td>
                    <td className="px-4 py-2 text-right text-slate-500">
                      {r.lastSeenAtMs ? new Date(r.lastSeenAtMs).toLocaleString('pt-BR') : '-'}
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      Nenhum dado de uso ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 text-sm font-medium">Usuários cadastrados</div>
          <div className="px-4 py-3 border-b border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
              Total: <strong className="text-slate-200">{users.length}</strong>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
              Administradores: <strong className="text-amber-300">{admins}</strong>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
              Gerentes: <strong className="text-blue-300">{gerentes}</strong>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
              Usuários: <strong className="text-slate-300">{usuariosComuns}</strong>
            </div>
          </div>
          {usersError && <div className="px-4 py-2 text-xs text-red-300">{usersError}</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-2">Nome</th>
                  <th className="text-left px-4 py-2">Email</th>
                  <th className="text-left px-4 py-2">Perfil</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Empresas</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.uid} className="border-b border-slate-800/40">
                    <td className="px-4 py-2">{u.nome || '-'}</td>
                    <td className="px-4 py-2 text-slate-400">{u.email || '-'}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                          u.role === 'administrador'
                            ? 'bg-amber-400/10 text-amber-300 border border-amber-400/30'
                            : u.role === 'gerente'
                              ? 'bg-blue-400/10 text-blue-300 border border-blue-400/30'
                              : 'bg-slate-400/10 text-slate-300 border border-slate-400/30'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {u.ativo ? (
                        <span className="text-emerald-300 text-xs">Ativo</span>
                      ) : (
                        <span className="text-red-300 text-xs">Inativo</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-400">
                      {Array.isArray(u.empresas) && u.empresas.length > 0 ? u.empresas.join(', ') : '-'}
                    </td>
                  </tr>
                ))}
                {!usersLoading && users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                )}
                {usersLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      Carregando usuários...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Bug size={15} className="text-amber-400" /> Depuracao (erros e logs)
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">Captura erros de execucao e rejeicoes de promessas nesta sessao.</p>
            <div className="mt-3 space-y-1.5 max-h-44 overflow-auto rounded-lg border border-slate-800 bg-slate-950/60 p-2">
              {debugEvents.length === 0 ? (
                <div className="text-xs text-slate-600">Sem eventos de erro capturados.</div>
              ) : (
                debugEvents.map((e) => (
                  <div key={e} className="text-[11px] text-slate-300 wrap-break-word">
                    {e}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <TestTube2 size={15} className="text-cyan-400" /> Testar funcionalidades
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">Testes rápidos de leitura das integrações principais.</p>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => void runQuickTests()}
                disabled={isRunningTests}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-60"
              >
                {isRunningTests ? 'Executando...' : 'Rodar testes rápidos'}
              </button>
            </div>
            <div className="mt-3 space-y-1.5 rounded-lg border border-slate-800 bg-slate-950/60 p-2 min-h-20">
              {testOutput.length === 0 ? (
                <div className="text-xs text-slate-600">Nenhum teste executado.</div>
              ) : (
                testOutput.map((line) => (
                  <div
                    key={line}
                    className={`text-[11px] ${line.startsWith('SUCESSO') ? 'text-emerald-300' : 'text-red-300'}`}
                  >
                    {line}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h3
              className="text-sm font-semibold flex items-center gap-2"
              onClick={handleSecretAdminTrigger}
              title="Configurações técnicas"
            >
              <Settings size={15} className="text-blue-400" /> Configurar coisas técnicas
            </h3>
            <div className="mt-3 text-[11px] text-slate-400 space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                <span className="flex items-center gap-2"><ShieldCheck size={13} /> Firebase</span>
                <span className={isFirebaseConfigured ? 'text-emerald-300' : 'text-red-300'}>
                  {isFirebaseConfigured ? 'Configurado' : 'Não configurado'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                <span className="flex items-center gap-2"><Cog size={13} /> Ambiente</span>
                <span className="text-slate-300">{import.meta.env.MODE}</span>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Wrench size={15} className="text-emerald-400" /> Manutenção do sistema
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">Ações operacionais locais para recuperação de sessão.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => window.location.reload()}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 inline-flex items-center gap-1.5"
              >
                <RefreshCcw size={13} /> Recarregar aplicação
              </button>
              <button
                onClick={clearLocalData}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-700/50 text-red-300 hover:bg-red-900/20 inline-flex items-center gap-1.5"
              >
                <Trash2 size={13} /> Limpar cache local e recarregar
              </button>
            </div>
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-[11px] text-slate-500">
              Use “limpar cache” apenas quando a sessão estiver inconsistente.
            </div>
          </section>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-[11px] text-slate-500 flex items-center gap-2">
          {error ? <AlertTriangle size={13} className="text-amber-400" /> : <CheckCircle2 size={13} className="text-emerald-400" />}
          Painel dev ativo com telemetria de uso, depuracao, testes rapidos e manutencao local.
        </div>
      </main>
    </div>
  );
};
