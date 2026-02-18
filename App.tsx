import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './components/Auth/Login';
import { Sidebar } from './components/Layout/Sidebar';
import { KanbanBoard } from './components/Dashboard/KanbanBoard';
import { PrioridadeTable } from './components/Dashboard/PrioridadeTable';
import { BacklogView } from './components/Dashboard/BacklogView';
import { PrioridadeModal } from './components/Dashboard/PrioridadeModal';
import { PrioridadeDetailModal } from './components/Dashboard/PrioridadeDetailModal';
import { BacklogModal } from './components/Dashboard/BacklogModal';
import { PerformanceView } from './components/Dashboard/PerformanceView';
import { AlertasPanel } from './components/Dashboard/AlertasPanel';
import { RoadmapView } from './components/Dashboard/RoadmapView';
import type { ViewId } from './components/Layout/Sidebar';
import { usePrioridadesBoard } from './controllers/usePrioridadesBoard';
import { StorageService } from './services/storageService';
import { isFirebaseConfigured, subscribeBoard, saveBoardNotes } from './services/firestoreSync';
import { Plus, Search, Activity, Target, Menu, ListTodo, AlertCircle, PieChart, Briefcase, Bot } from 'lucide-react';
import type { Prioridade, PrioridadeStatus } from './types';
import type { BacklogItem } from './types';
import { Toast, type ToastType } from './components/Shared/Toast';
import { ChatView } from './components/Chat/ChatView';

function AppContent() {
  const { isAuthenticated, encryptionKey, logout } = useAuth();
  const [activeView, setActiveView] = useState<ViewId>('backlog');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [strategicNote, setStrategicNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [prioridadeModalOpen, setPrioridadeModalOpen] = useState(false);
  const [selectedPrioridade, setSelectedPrioridade] = useState<Prioridade | null>(null);
  const [defaultStatusForNew, setDefaultStatusForNew] = useState<PrioridadeStatus | null>(null);
  const [backlogModalOpen, setBacklogModalOpen] = useState(false);
  const [selectedBacklogItem, setSelectedBacklogItem] = useState<BacklogItem | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const {
    prioridades,
    backlog,
    planos,
    tarefas,
    loading,
    addPrioridade,
    updatePrioridade,
    deletePrioridade,
    updatePrioridadeStatus,
    addBacklogItem,
    updateBacklogItem,
    deleteBacklogItem,
    promoteToPrioridade,
    addPlano,
    updatePlano,
    deletePlano,
    addTarefa,
    updateTarefa,
    deleteTarefa,
    maxPrioridadesAtivas,
    countPrioridadesAtivas,
  } = usePrioridadesBoard(encryptionKey ?? null);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedPrioridadeIdForDetail, setSelectedPrioridadeIdForDetail] = useState<string | null>(null);

  const openDetailModal = useCallback((prioridade: Prioridade) => {
    setSelectedPrioridadeIdForDetail(prioridade.id);
    setDetailModalOpen(true);
  }, []);

  const closeDetailModal = useCallback(() => {
    setDetailModalOpen(false);
    setSelectedPrioridadeIdForDetail(null);
  }, []);

  const selectedPrioridadeForDetail = selectedPrioridadeIdForDetail
    ? prioridades.find((p) => p.id === selectedPrioridadeIdForDetail) ?? null
    : null;

  const openPrioridadeModal = useCallback((item: Prioridade | null, statusForNew?: PrioridadeStatus) => {
    setSelectedPrioridade(item);
    setDefaultStatusForNew(item === null && statusForNew ? statusForNew : null);
    setPrioridadeModalOpen(true);
  }, []);

  const closePrioridadeModal = useCallback(() => {
    setPrioridadeModalOpen(false);
    setSelectedPrioridade(null);
    setDefaultStatusForNew(null);
  }, []);

  const openBacklogModal = useCallback((item: BacklogItem | null) => {
    setSelectedBacklogItem(item);
    setBacklogModalOpen(true);
  }, []);

  const closeBacklogModal = useCallback(() => {
    setBacklogModalOpen(false);
    setSelectedBacklogItem(null);
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

  const handlePrioridadeStatusChange = useCallback(
    async (id: string, newStatus: PrioridadeStatus) => {
      const ok = await updatePrioridadeStatus(id, newStatus);
      if (ok === false) {
        setToast({
          message: `Limite de ${maxPrioridadesAtivas} prioridades ativas no quadro. Conclua ou rebaixe uma antes de ativar outra.`,
          type: 'error',
        });
      }
    },
    [updatePrioridadeStatus, maxPrioridadesAtivas]
  );

  const handleSaveNewPrioridade = useCallback(
    async (data: Omit<Prioridade, 'id' | 'createdAt' | 'updatedAt'>) => {
      const ok = await addPrioridade(data);
      if (ok === false) {
        setToast({
          message: `Limite de ${maxPrioridadesAtivas} prioridades ativas. Ajuste as prioridades antes de criar uma nova.`,
          type: 'error',
        });
      }
    },
    [addPrioridade, maxPrioridadesAtivas]
  );

  const handlePromote = useCallback(
    async (backlogId: string) => {
      const ok = await promoteToPrioridade(backlogId);
      if (!ok) {
        setToast({
          message: `Limite de ${maxPrioridadesAtivas} prioridades ativas. Conclua ou rebaixe uma antes de promover.`,
          type: 'error',
        });
      }
    },
    [promoteToPrioridade, maxPrioridadesAtivas]
  );

  const handleAddNewPrioridade = () => openPrioridadeModal(null);

  if (!isAuthenticated) return <Login />;

  const ativasCount = countPrioridadesAtivas();
  const limiteAtivo = ativasCount >= maxPrioridadesAtivas;
  const execucaoCount = prioridades.filter((p) => p.status_prioridade === PrioridadeStatus.EXECUCAO).length;
  const bloqueadoCount = prioridades.filter((p) => p.status_prioridade === PrioridadeStatus.BLOQUEADO).length;
  const concluidoCount = prioridades.filter((p) => p.status_prioridade === PrioridadeStatus.CONCLUIDO).length;

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
              {activeView === 'dashboard' && <Target size={18} className="text-amber-500 shrink-0" />}
              {activeView === 'table' && <Target size={18} className="text-blue-500 shrink-0" />}
              {activeView === 'backlog' && <ListTodo size={18} className="text-emerald-500 shrink-0" />}
              {activeView === 'performance' && <PieChart size={18} className="text-violet-500 shrink-0" />}
              {activeView === 'roadmap' && <Briefcase size={18} className="text-cyan-500 shrink-0" />}
              {activeView === 'ia' && <Bot size={18} className="text-blue-400 shrink-0" />}
              <h2 className="text-base font-semibold text-slate-100 tracking-tight">
                {activeView === 'dashboard' && 'Quadro de Prioridades'}
                {activeView === 'table' && 'Prioridades'}
                {activeView === 'backlog' && 'Backlog'}
                {activeView === 'performance' && 'Desempenho'}
                {activeView === 'roadmap' && 'Roadmap'}
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
            {activeView !== 'ia' && activeView !== 'backlog' && (
              <button
                onClick={handleAddNewPrioridade}
                disabled={limiteAtivo}
                title={
                  limiteAtivo
                    ? `Limite de ${maxPrioridadesAtivas} prioridades ativas. Conclua ou rebaixe uma antes de criar outra.`
                    : 'Criar nova prioridade estratégica'
                }
                className={`text-white text-sm font-medium px-4 py-2.5 min-h-[44px] rounded-lg flex items-center gap-2 transition-colors shrink-0 touch-manipulation ${
                  limiteAtivo
                    ? 'bg-slate-700 cursor-not-allowed opacity-60'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                <Plus size={16} /> <span className="hidden sm:inline">Nova prioridade</span>
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 p-3 sm:p-4 md:p-6">
          {(activeView === 'dashboard' || activeView === 'table' || activeView === 'backlog') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 sm:mb-6">
              {[
                { label: 'Prioridades', val: prioridades.length, icon: Target },
                { label: 'Em Execução', val: execucaoCount, icon: Activity },
                { label: 'Bloqueios', val: bloqueadoCount, icon: AlertCircle },
                { label: 'Concluídas', val: concluidoCount, icon: Target },
              ].map((stat, i) => (
                <div key={i} className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 flex items-center gap-3 hover:border-slate-700 transition-colors">
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

          {activeView === 'ia' ? (
            <div className="pb-8 h-full min-h-0 flex flex-col">
              <ChatView />
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-slate-500 text-xs uppercase tracking-wider">Carregando...</p>
            </div>
          ) : (
            <div className="pb-8">
              {activeView === 'dashboard' && (
                <>
                  <AlertasPanel
                    prioridades={prioridades}
                    tarefas={tarefas}
                    onOpenPrioridade={openDetailModal}
                  />
                  <KanbanBoard
                  prioridades={prioridades}
                  onStatusChange={handlePrioridadeStatusChange}
                  onOpenItem={openDetailModal}
                  onAddInColumn={(status) => openPrioridadeModal(null, status)}
                  onDelete={deletePrioridade}
                />
                </>
              )}
              {activeView === 'table' && (
                <>
                  <AlertasPanel
                    prioridades={prioridades}
                    tarefas={tarefas}
                    onOpenPrioridade={openDetailModal}
                  />
                  <PrioridadeTable
                    prioridades={prioridades}
                    onUpdate={updatePrioridade}
                    onDelete={deletePrioridade}
                    onEditItem={openDetailModal}
                  />
                </>
              )}
              {activeView === 'backlog' && (
                <BacklogView
                  backlog={backlog}
                  prioridadesAtivasCount={ativasCount}
                  maxPrioridadesAtivas={maxPrioridadesAtivas}
                  onUpdate={updateBacklogItem}
                  onDelete={deleteBacklogItem}
                  onPromote={handlePromote}
                  onEditItem={openBacklogModal}
                  onAddNew={() => openBacklogModal(null)}
                  strategicNote={strategicNote}
                  onStrategicNoteChange={setStrategicNote}
                  onSaveStrategicNote={saveNote}
                  noteSaving={noteSaving}
                />
              )}
              {activeView === 'performance' && <PerformanceView prioridades={prioridades} />}
              {activeView === 'roadmap' && (
                <RoadmapView prioridades={prioridades} onOpenItem={openDetailModal} />
              )}
            </div>
          )}
        </div>

        <PrioridadeModal
          isOpen={prioridadeModalOpen}
          onClose={closePrioridadeModal}
          item={selectedPrioridade}
          initialStatus={selectedPrioridade === null ? defaultStatusForNew ?? undefined : undefined}
          onSave={handleSaveNewPrioridade}
          onUpdate={(id, data) => {
            updatePrioridade(id, data);
            closePrioridadeModal();
          }}
        />

        <PrioridadeDetailModal
          isOpen={detailModalOpen}
          onClose={closeDetailModal}
          prioridade={selectedPrioridadeForDetail}
          planos={planos}
          tarefas={tarefas}
          onEditPrioridade={(p) => {
            setSelectedPrioridade(p);
            setPrioridadeModalOpen(true);
          }}
          onAddPlano={addPlano}
          onUpdatePlano={updatePlano}
          onDeletePlano={deletePlano}
          onAddTarefa={addTarefa}
          onUpdateTarefa={updateTarefa}
          onDeleteTarefa={deleteTarefa}
        />

        <BacklogModal
          isOpen={backlogModalOpen}
          onClose={closeBacklogModal}
          item={selectedBacklogItem}
          onSave={(data) => {
            addBacklogItem(data);
            closeBacklogModal();
          }}
          onUpdate={(id, data) => {
            updateBacklogItem(id, data);
            closeBacklogModal();
          }}
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
