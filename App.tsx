import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './components/Auth/Login';
import { Sidebar } from './components/Layout/Sidebar';
import { KanbanBoard } from './components/Dashboard/KanbanBoard';
import { Table5W2H } from './components/Dashboard/Table5W2H';
import { BacklogView } from './components/Dashboard/BacklogView';
import { QuadroEstrategico, DetalhePrioridadeModal } from './components/Dashboard/QuadroEstrategico';
import { PrioridadeModal } from './components/Dashboard/PrioridadeModal';
import { ActionItemModal } from './components/Dashboard/ActionItemModal';
import { PerformanceView } from './components/Dashboard/PerformanceView';
import { RoadmapView } from './components/Dashboard/RoadmapView';
import type { ViewId } from './components/Layout/Sidebar';
import { useStrategicBoard } from './controllers/useStrategicBoard';
import { useRitmoGestao } from './controllers/useRitmoGestao';
import { StorageService } from './services/storageService';
import { isFirebaseConfigured, subscribeBoard, saveBoardNotes } from './services/firestoreSync';
import { Plus, Search, Activity, Target, Zap, Menu, ListTodo, AlertCircle, PieChart, Briefcase, Bot } from 'lucide-react';
import { ActionItem, ItemStatus, UrgencyLevel } from './types';
import type { Prioridade } from './types';
import { Toast, type ToastType } from './components/Shared/Toast';
import { ChatView } from './components/Chat/ChatView';
import { Modal } from './components/Shared/Modal';

function AppContent() {
  const { isAuthenticated, encryptionKey, logout } = useAuth();
  const [activeView, setActiveView] = useState<ViewId>('backlog');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [strategicNote, setStrategicNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ActionItem | null>(null);
  const [defaultStatusForNew, setDefaultStatusForNew] = useState<ItemStatus | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [selectedPrioridade, setSelectedPrioridade] = useState<Prioridade | null>(null);
  const [prioridadeModalOpen, setPrioridadeModalOpen] = useState(false);
  const [prioridadeToDelete, setPrioridadeToDelete] = useState<Prioridade | null>(null);
  const [dashboardOpenConcluidas, setDashboardOpenConcluidas] = useState(false);
  const [tableOpenConcluidas, setTableOpenConcluidas] = useState(false);
  const [backlogOpenConcluidas, setBacklogOpenConcluidas] = useState(false);
  const [quadroVerConcluidas, setQuadroVerConcluidas] = useState(false);
  const { items, loading, addItem, updateItem, deleteItem, updateStatus } = useStrategicBoard(encryptionKey ?? null);
  const ritmo = useRitmoGestao(encryptionKey ?? null);

  // Prioridades exibidas no Quadro Estratégico:
  // - Prioridades estruturadas do Ritmo de Gestão
  // - + iniciativas existentes do dashboard (itens) mapeadas como prioridades estratégicas
  const quadroPrioridades = useMemo<Prioridade[]>(() => {
    const sinteticas: Prioridade[] = items
      // Evita duplicar prioridades que já existem no Ritmo (mesmo título e dono)
      .filter(
        (item) =>
          !ritmo.board.prioridades.some(
            (p) => p.titulo === item.what && p.dono_id === item.who
          )
      )
      .map((item) => ({
        id: `legacy-${item.id}`,
        titulo: item.what,
        descricao: item.why,
        dono_id: item.who,
        data_inicio: Date.now(),
        data_alvo: item.when ? new Date(item.when + 'T12:00:00').getTime() : Date.now(),
        status_prioridade:
          item.status === ItemStatus.BLOCKED
            ? 'Bloqueado'
            : item.status === ItemStatus.COMPLETED
            ? 'Concluido'
            : 'Execucao',
      }));
    return [...ritmo.board.prioridades, ...sinteticas];
  }, [ritmo.board.prioridades, ritmo.board.prioridades.length, items]);

  const openItemModal = useCallback((item: ActionItem | null, statusForNew?: ItemStatus) => {
    setSelectedItem(item);
    setDefaultStatusForNew(item === null && statusForNew ? statusForNew : null);
    setModalOpen(true);
  }, []);

  const closeItemModal = useCallback(() => {
    setModalOpen(false);
    setSelectedItem(null);
    setDefaultStatusForNew(null);
  }, []);

  const notesUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!encryptionKey) return;
    StorageService.getStrategicNote(encryptionKey).then(setStrategicNote).catch(() => setStrategicNote(''));
    if (isFirebaseConfigured) {
      const unsub = subscribeBoard(encryptionKey, () => {}, setStrategicNote);
      notesUnsubRef.current = unsub ?? null;
      return () => {
        if (notesUnsubRef.current) notesUnsubRef.current();
        notesUnsubRef.current = null;
      };
    }
  }, [encryptionKey]);

  const saveNote = useCallback(async () => {
    if (!encryptionKey) return;
    setNoteSaving(true);
    try {
      await StorageService.saveStrategicNote(strategicNote, encryptionKey);
      if (isFirebaseConfigured) await saveBoardNotes(strategicNote, encryptionKey);
      setToast({ message: 'Decisão salva e criptografada com sucesso.', type: 'success' });
    } catch (e) {
      setToast({ message: 'Erro ao salvar. Faça login novamente.', type: 'error' });
    } finally {
      setNoteSaving(false);
    }
  }, [encryptionKey, strategicNote]);

  const handleAddNew = () => openItemModal(null);
  const handleAddPrioridade = () => setPrioridadeModalOpen(true);
  const loadingAny = loading || ritmo.loading;

  const handleOpenPrioridade = useCallback(
    (p: Prioridade) => {
      if (p.id.startsWith('legacy-')) {
        const legacyId = p.id.replace('legacy-', '');
        const item = items.find((i) => i.id === legacyId) ?? null;
        if (item) {
          openItemModal(item);
          return;
        }
      }
      setSelectedPrioridade(p);
    },
    [items, openItemModal]
  );

  const performDeletePrioridade = useCallback(
    (p: Prioridade) => {
      if (p.id.startsWith('legacy-')) {
        const legacyId = p.id.replace('legacy-', '');
        deleteItem(legacyId);
        return;
      }
      ritmo.deletePrioridade(p.id);
      const match = items.find((i) => i.what === p.titulo && i.who === p.dono_id);
      if (match) deleteItem(match.id);
    },
    [items, deleteItem, ritmo]
  );

  const handleDeletePrioridade = useCallback((p: Prioridade) => {
    setPrioridadeToDelete(p);
  }, []);

  if (!isAuthenticated) return <Login />;

  return (
    <div className="flex h-screen min-h-[100dvh] bg-slate-950 overflow-hidden text-slate-100">
      <Toast
        message={toast?.message ?? ''}
        type={toast?.type ?? 'success'}
        visible={toast !== null}
        onClose={() => setToast(null)}
      />
      <Sidebar
        activeView={activeView}
        setView={setActiveView}
        onLogout={logout}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col overflow-hidden relative min-h-0">
        <header className="h-14 min-h-[52px] bg-slate-900/95 border-b border-slate-800 flex items-center justify-between px-3 sm:px-4 md:px-6 z-30 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2.5 min-h-[44px] min-w-[44px] text-slate-400 hover:text-white bg-slate-800/80 rounded-lg touch-manipulation"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2.5">
              {activeView === 'dashboard' && <Zap size={18} className="text-amber-500 shrink-0" />}
              {activeView === 'table' && <Target size={18} className="text-blue-500 shrink-0" />}
              {activeView === 'backlog' && <ListTodo size={18} className="text-emerald-500 shrink-0" />}
              {activeView === 'quadro' && <Target size={18} className="text-blue-500 shrink-0" />}
              {activeView === 'performance' && <PieChart size={18} className="text-violet-500 shrink-0" />}
              {activeView === 'roadmap' && <Briefcase size={18} className="text-cyan-500 shrink-0" />}
              {activeView === 'ia' && <Bot size={18} className="text-blue-400 shrink-0" />}
              <h2 className="text-base font-semibold text-slate-100 tracking-tight">
                {activeView === 'dashboard' && 'Dashboard'}
                {activeView === 'table' && 'Matriz 5W2H'}
                {activeView === 'backlog' && 'Back Log'}
                {activeView === 'quadro' && 'Quadro Estratégico'}
                {activeView === 'performance' && 'Desempenho'}
                {activeView === 'roadmap' && 'Roadmap 2026'}
                {activeView === 'ia' && '5W2H CHAT'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative hidden xl:block">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                placeholder="Pesquisar..."
                className="bg-slate-950/80 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-300 outline-none focus:border-slate-600 w-48 transition-all"
              />
            </div>
            {activeView === 'quadro' && ritmo.podeAdicionarPrioridade && (
              <button
                onClick={handleAddPrioridade}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 min-h-[44px] rounded-lg flex items-center gap-2 transition-colors shrink-0 touch-manipulation"
              >
                <Plus size={16} /> <span className="hidden sm:inline">Nova prioridade</span>
              </button>
            )}
            {activeView !== 'ia' && activeView !== 'quadro' && (
              <button
                onClick={handleAddNew}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 min-h-[44px] rounded-lg flex items-center gap-2 transition-colors shrink-0 touch-manipulation"
              >
                <Plus size={16} /> <span className="hidden sm:inline">Nova Iniciativa</span>
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 p-3 sm:p-4 md:p-6">
          {activeView === 'quadro' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 sm:mb-6">
              {[
                { label: 'Prioridades ativas', val: ritmo.prioridadesAtivas.length, color: 'blue', icon: Target },
                { label: 'Em execução', val: ritmo.board.prioridades.filter(p => p.status_prioridade === 'Execucao').length, color: 'amber', icon: Activity },
                { label: 'Bloqueadas', val: ritmo.board.prioridades.filter(p => p.status_prioridade === 'Bloqueado').length, color: 'red', icon: AlertCircle },
                { label: 'Concluídas', val: ritmo.board.prioridades.filter(p => p.status_prioridade === 'Concluido').length, color: 'emerald', icon: Target },
              ].map((stat, i) => (
                <div
                  key={i}
                  className={`bg-slate-900/50 p-4 rounded-lg border border-slate-800 flex items-center gap-3 hover:border-slate-700 transition-colors ${
                    stat.label === 'Concluídas' ? 'cursor-pointer' : ''
                  }`}
                  onClick={stat.label === 'Concluídas' ? () => setQuadroVerConcluidas(true) : undefined}
                >
                  <div className="p-2 rounded-lg bg-slate-800 text-slate-400">
                    <stat.icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{stat.label}</p>
                    <p className="text-xl font-semibold text-slate-100 tabular-nums">{stat.val}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {(activeView === 'dashboard' || activeView === 'table' || activeView === 'backlog') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 sm:mb-6">
              {[
                { label: 'Ações Totais', val: items.length, color: 'blue', icon: Zap },
                { label: 'Em Execução', val: items.filter(i => i.status === ItemStatus.EXECUTING).length, color: 'amber', icon: Activity },
                { label: 'Bloqueios', val: items.filter(i => i.status === ItemStatus.BLOCKED).length, color: 'red', icon: AlertCircle },
                { label: 'Concluídas', val: items.filter(i => i.status === ItemStatus.COMPLETED).length, color: 'emerald', icon: Target },
              ].map((stat, i) => (
                <div
                  key={i}
                  className={`bg-slate-900/50 p-4 rounded-lg border border-slate-800 flex items-center gap-3 hover:border-slate-700 transition-colors ${
                    stat.label === 'Concluídas' ? 'cursor-pointer' : ''
                  }`}
                  onClick={
                    stat.label === 'Concluídas'
                      ? () => {
                          if (activeView === 'dashboard') setDashboardOpenConcluidas(true);
                          if (activeView === 'table') setTableOpenConcluidas(true);
                          if (activeView === 'backlog') setBacklogOpenConcluidas(true);
                        }
                      : undefined
                  }
                >
                  <div className={`p-2 rounded-lg bg-slate-800 text-slate-400`}>
                    <stat.icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{stat.label}</p>
                    <p className="text-xl font-semibold text-slate-100 tabular-nums">{stat.val}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeView === 'ia' ? (
            <div className="pb-8 h-full min-h-0 flex flex-col">
              <ChatView />
            </div>
          ) : loadingAny ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-slate-500 text-xs uppercase tracking-wider">Carregando...</p>
            </div>
          ) : (
            <div className="pb-8">
              {activeView === 'dashboard' && (
                <KanbanBoard
                  items={items}
                  onStatusChange={updateStatus}
                  onOpenItem={openItemModal}
                  onAddInColumn={(status) => openItemModal(null, status)}
                  onDelete={deleteItem}
                  forceOpenConcluidos={dashboardOpenConcluidas}
                />
              )}
              {activeView === 'table' && (
                <Table5W2H
                  items={items}
                  onUpdate={updateItem}
                  onDelete={deleteItem}
                  onEditItem={openItemModal}
                  forceOpenConcluidos={tableOpenConcluidas}
                />
              )}
              {activeView === 'backlog' && (
                <BacklogView
                  items={items}
                  onUpdate={updateItem}
                  onDelete={deleteItem}
                  onEditItem={openItemModal}
                  onStatusChange={updateStatus}
                  strategicNote={strategicNote}
                  onStrategicNoteChange={setStrategicNote}
                  onSaveStrategicNote={saveNote}
                  noteSaving={noteSaving}
                  forceOpenConcluidos={backlogOpenConcluidas}
                />
              )}
              {activeView === 'performance' && <PerformanceView items={items} />}
              {activeView === 'roadmap' && <RoadmapView items={items} onOpenItem={openItemModal} />}
              {activeView === 'quadro' && (
                <QuadroEstrategico
                  prioridades={quadroPrioridades}
                  planos={ritmo.board.planos}
                  tarefas={ritmo.board.tarefas}
                  responsaveis={ritmo.responsaveis}
                  computeStatusPlano={ritmo.computeStatusPlano}
                  onStatusChange={(id, status) => ritmo.updatePrioridade(id, { status_prioridade: status })}
                  onOpenPrioridade={handleOpenPrioridade}
                  podeAdicionarPrioridade={ritmo.podeAdicionarPrioridade}
                  onAddPrioridade={handleAddPrioridade}
                  onDeletePrioridade={handleDeletePrioridade}
                  forceOpenConcluidas={quadroVerConcluidas}
                />
              )}
            </div>
          )}
        </div>

        {selectedPrioridade && (
          <DetalhePrioridadeModal
            prioridade={selectedPrioridade}
            planos={ritmo.board.planos}
            tarefas={ritmo.board.tarefas}
            responsaveis={ritmo.responsaveis}
            computeStatusPlano={ritmo.computeStatusPlano}
            onClose={() => setSelectedPrioridade(null)}
            onUpdatePrioridade={async (id, updates) => {
              await ritmo.updatePrioridade(id, updates);
              // tenta espelhar alterações básicas no item 5W2H correspondente
              const atualizada =
                ritmo.board.prioridades.find((p) => p.id === id) ?? selectedPrioridade;
              if (!atualizada) return;
              const titulo = updates.titulo ?? atualizada.titulo;
              const descricao = updates.descricao ?? atualizada.descricao ?? '';
              const dono = updates.dono_id ?? atualizada.dono_id;
              const dataAlvoMs = updates.data_alvo ?? atualizada.data_alvo;
              const whenIso = new Date(dataAlvoMs).toISOString().slice(0, 10);
              const candidato = items.find(
                (i) => i.what === titulo && i.who === dono
              );
              if (candidato) {
                await updateItem(candidato.id, {
                  what: titulo,
                  why: descricao,
                  who: dono,
                  when: whenIso,
                });
              }
            }}
          />
        )}

        {prioridadeToDelete && (
          <Modal
            isOpen={true}
            onClose={() => setPrioridadeToDelete(null)}
            title="Remover prioridade"
            maxWidth="sm"
          >
            <div className="space-y-4 text-sm text-slate-200">
              <p>
                Você realmente deseja remover a prioridade{' '}
                <span className="font-semibold">
                  &quot;{prioridadeToDelete.titulo || 'Sem título'}&quot;
                </span>
                ?
              </p>
              <p className="text-xs text-slate-500">
                Esta ação não pode ser desfeita e também remove a iniciativa vinculada na Matriz
                5W2H / quadro de Prioridades, quando existir.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPrioridadeToDelete(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 border border-slate-600 rounded-lg hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (prioridadeToDelete) {
                      performDeletePrioridade(prioridadeToDelete);
                      setPrioridadeToDelete(null);
                    }
                  }}
                  className="px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
                >
                  Remover
                </button>
              </div>
            </div>
          </Modal>
        )}

        <PrioridadeModal
          isOpen={prioridadeModalOpen}
          onClose={() => setPrioridadeModalOpen(false)}
          responsaveis={ritmo.responsaveis}
          onSave={(item) => {
            const ok = ritmo.addPrioridade(item);
            if (!ok) {
              setToast({
                message: 'Máximo de 3 prioridades ativas. Conclua uma para liberar vaga.',
                type: 'error',
              });
              return false;
            }
            // Espelha a prioridade criada no quadro de Prioridades (Kanban),
            // para que apareça também como cartão no dashboard.
            const whenIso = new Date(item.data_alvo).toISOString().slice(0, 10);
            addItem({
              what: item.titulo,
              why: item.descricao,
              where: '',
              when: whenIso,
              who: item.dono_id,
              how: '',
              status: ItemStatus.ACTIVE,
              urgency: UrgencyLevel.MEDIUM,
              notes: '',
            });
            return true;
          }}
        />

        <ActionItemModal
          isOpen={modalOpen}
          onClose={closeItemModal}
          item={selectedItem}
          initialStatus={selectedItem === null ? defaultStatusForNew ?? undefined : undefined}
          onSave={addItem}
          onUpdate={updateItem}
        />

        <footer className="h-8 min-h-[32px] bg-slate-900/95 border-t border-slate-800 px-3 sm:px-4 flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-wider z-30 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Conectado
          </div>
          <span>WillTech v4</span>
        </footer>
      </main>
    </div>
  );
}

const App: React.FC = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);

export default App;
