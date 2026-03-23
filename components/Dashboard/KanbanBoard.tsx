import React, { useMemo, useState, useEffect } from 'react';
import { ActionItem, ItemStatus } from '../../types';
import { formatDateOnlyPtBr } from '../../utils/date';
import {
  Clock,
  User,
  Plus,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  Pencil,
  Trash2,
  CornerDownLeft,
  Target,
  Archive,
} from 'lucide-react';

export interface KanbanCapabilities {
  canCreate?: boolean;
  canOpenDetail?: boolean;
  canDelete?: boolean;
  canWorkflow?: boolean;
  canLinkTatico?: boolean;
}

interface KanbanBoardProps {
  items: ActionItem[];
  onStatusChange: (id: string, status: ItemStatus) => void;
  onOpenItem?: (item: ActionItem) => void;
  onAddInColumn?: (status: ItemStatus) => void;
  onDelete?: (id: string) => void;
  forceOpenConcluidos?: boolean;
  onGoToTatico?: (item: ActionItem) => void;
  capabilities?: KanbanCapabilities;
}

// Ordem fixa do workflow — NUNCA reordenar
const WORKFLOW_COLUMNS = [
  { id: ItemStatus.ACTIVE,    label: 'Priorizar', color: 'bg-blue-500' },
  { id: ItemStatus.EXECUTING, label: 'Em Execução',      color: 'bg-amber-500' },
  { id: ItemStatus.BLOCKED,   label: 'Bloqueado',        color: 'bg-red-500' },
];

/** Índice no fluxo Estratégico (Priorizar → Execução → Bloqueado). */
const WORKFLOW_STATUS_ORDER = WORKFLOW_COLUMNS.map((c) => c.id);

function workflowNeighbors(status: ItemStatus): {
  prev: ItemStatus | null;
  next: ItemStatus | null;
  prevLabel: string | null;
  nextLabel: string | null;
} {
  const idx = WORKFLOW_STATUS_ORDER.indexOf(status);
  if (idx < 0) {
    return { prev: null, next: null, prevLabel: null, nextLabel: null };
  }
  const prev = idx > 0 ? WORKFLOW_STATUS_ORDER[idx - 1]! : null;
  const next = idx < WORKFLOW_STATUS_ORDER.length - 1 ? WORKFLOW_STATUS_ORDER[idx + 1]! : null;
  const col = (id: ItemStatus | null) =>
    id ? WORKFLOW_COLUMNS.find((c) => c.id === id)?.label ?? null : null;
  return {
    prev,
    next,
    prevLabel: col(prev),
    nextLabel: col(next),
  };
}

const iconBtnBase =
  'inline-flex items-center justify-center p-1.5 rounded-md border border-slate-600/80 bg-slate-700/50 text-slate-300 hover:bg-slate-600/70 hover:border-slate-500 transition-colors touch-manipulation disabled:opacity-25 disabled:pointer-events-none';

const KanbanCard: React.FC<{
  item: ActionItem;
  onOpenItem?: (item: ActionItem) => void;
  onStatusChange: (id: string, status: ItemStatus) => void;
  onDelete?: (id: string) => void;
  onGoToTatico?: (item: ActionItem) => void;
  caps: Required<KanbanCapabilities>;
}> = ({ item, onOpenItem, onStatusChange, onDelete, onGoToTatico, caps }) => {
  const { prev, next, prevLabel, nextLabel } = workflowNeighbors(item.status);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => caps.canOpenDetail && onOpenItem?.(item)}
      onKeyDown={(e) => e.key === 'Enter' && caps.canOpenDetail && onOpenItem?.(item)}
      className={`bg-slate-800/60 p-3 rounded border border-slate-700/50 hover:border-slate-600 hover:ring-1 hover:ring-slate-500/50 transition-all focus:outline-none focus:ring-1 focus:ring-blue-500/50 touch-manipulation active:bg-slate-800/80 ${
        caps.canOpenDetail ? 'cursor-pointer' : 'cursor-default'
      }`}
    >
      <div className="flex justify-between items-start gap-1.5 mb-1.5 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {caps.canWorkflow && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange(item.id, ItemStatus.BACKLOG);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-amber-400/70 bg-amber-500/10 text-[10px] font-medium text-amber-300 hover:bg-amber-500/20 hover:border-amber-300 transition-colors"
              title="Voltar esta prioridade para o Backlog"
            >
              <CornerDownLeft size={12} />
              <span>Backlog</span>
            </button>
          )}
          {onGoToTatico && caps.canLinkTatico && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onGoToTatico(item);
              }}
              className="inline-flex items-center justify-center p-1.5 rounded-full border border-blue-400/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:border-blue-300 transition-colors"
              title="Ir para Tático"
              aria-label="Ir para Tático"
            >
              <Target size={12} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {caps.canWorkflow && prev != null && (
            <button
              type="button"
              className={iconBtnBase}
              title={prevLabel ? `Mover para ${prevLabel}` : 'Etapa anterior'}
              aria-label={prevLabel ? `Mover para ${prevLabel}` : 'Etapa anterior'}
              onClick={() => onStatusChange(item.id, prev)}
            >
              <ChevronLeft size={14} strokeWidth={2.25} />
            </button>
          )}
          {caps.canWorkflow && next != null && (
            <button
              type="button"
              className={iconBtnBase}
              title={nextLabel ? `Mover para ${nextLabel}` : 'Próxima etapa'}
              aria-label={nextLabel ? `Mover para ${nextLabel}` : 'Próxima etapa'}
              onClick={() => onStatusChange(item.id, next)}
            >
              <ChevronRight size={14} strokeWidth={2.25} />
            </button>
          )}
          {caps.canWorkflow && (
            <button
              type="button"
              className={`${iconBtnBase} border-emerald-600/50 text-emerald-300/90 hover:bg-emerald-500/15 hover:border-emerald-500/60`}
              title="Arquivar prioridade"
              aria-label="Arquivar prioridade"
              onClick={() => onStatusChange(item.id, ItemStatus.COMPLETED)}
            >
              <Archive size={14} />
            </button>
          )}
          {onDelete && caps.canDelete && (
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 opacity-60 hover:opacity-100 transition-all touch-manipulation border border-transparent hover:border-red-500/20"
              title="Excluir"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      <h4 className="text-xs font-medium text-slate-100 mb-1.5 leading-tight line-clamp-2">{item.what}</h4>
      {item.why && item.why.trim() !== item.what.trim() && (
        <p className="text-[10px] text-slate-500 mb-2 line-clamp-2">{item.why}</p>
      )}
      {item.where && (
        <p className="text-[10px] text-slate-500 mb-1 line-clamp-1">Onde: {item.where}</p>
      )}
      <div className="flex flex-col gap-1 border-t border-slate-700/50 pt-2">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <User size={10} />
          <span className="text-slate-400">{item.who}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <Clock size={10} />
          <span>{formatDateOnlyPtBr(item.when)}</span>
        </div>
        {item.notes && (
          <p className="text-[10px] text-slate-500 line-clamp-2 pt-1 border-t border-slate-700/50">{item.notes}</p>
        )}
      </div>
    </div>
  );
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  items,
  onStatusChange,
  onOpenItem,
  onAddInColumn,
  onDelete,
  forceOpenConcluidos,
  onGoToTatico,
  capabilities,
}) => {
  const caps: Required<KanbanCapabilities> = {
    canCreate: capabilities?.canCreate !== false,
    canOpenDetail: capabilities?.canOpenDetail !== false,
    canDelete: capabilities?.canDelete !== false,
    canWorkflow: capabilities?.canWorkflow !== false,
    canLinkTatico: capabilities?.canLinkTatico !== false,
  };

  const [concluidosOpen, setConcluidosOpen] = useState(false);

  useEffect(() => {
    if (forceOpenConcluidos) setConcluidosOpen(true);
  }, [forceOpenConcluidos]);

  // Itens ativos ordenados por criação — define a ordem fixa das linhas
  const activeItems = useMemo(
    () =>
      items
        .filter((i) => i.status !== ItemStatus.COMPLETED)
        .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)),
    [items]
  );

  const completedItems = useMemo(
    () =>
      items
        .filter((i) => i.status === ItemStatus.COMPLETED)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [items]
  );

  return (
    <div className="space-y-6">
      {/*
        Layout de LINHAS FIXAS:
        - Cada item ocupa uma linha permanente na grade.
        - O card aparece apenas na coluna do seu status atual.
        - As outras duas células da linha ficam em branco.
        - Quando um item muda de status, ele "viaja" horizontalmente
          mantendo sua linha — nada sobe ou desce.
      */}
      <div className="overflow-x-auto pb-2">
        <div
          className="min-w-[640px]"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', columnGap: '16px' }}
        >
          {/* ── CABEÇALHOS DAS COLUNAS ─────────────────────────────── */}
          {WORKFLOW_COLUMNS.map((col) => (
            <div
              key={`hd-${col.id}`}
              className="px-3 py-2.5 border border-slate-800 rounded-t-lg flex items-center justify-between bg-slate-900/80"
            >
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${col.color}`} />
                <h3 className="font-medium text-[11px] uppercase tracking-wider text-slate-400">
                  {col.label}
                </h3>
              </div>
              <span className="bg-slate-800 text-slate-500 text-[10px] px-1.5 py-0.5 rounded tabular-nums">
                {items.filter((i) => i.status === col.id).length}
              </span>
            </div>
          ))}

          {/* ── LINHAS (uma por item) ───────────────────────────────── */}
          {activeItems.flatMap((item) =>
            WORKFLOW_COLUMNS.map((col, ci) => (
              <div
                key={`${item.id}-c${ci}`}
                className="border-x border-slate-800/40 bg-slate-900/20 px-2 py-1.5"
              >
                {item.status === col.id ? (
                  <KanbanCard
                    item={item}
                    onOpenItem={onOpenItem}
                    onStatusChange={onStatusChange}
                    onDelete={onDelete}
                    onGoToTatico={onGoToTatico}
                    caps={caps}
                  />
                ) : (
                  <div aria-hidden="true" />
                )}
              </div>
            ))
          )}

          {/* ── BOTÕES "+ Novo módulo" ──────────────────────────────── */}
          {WORKFLOW_COLUMNS.map((col) => (
            <div
              key={`add-${col.id}`}
              className="border border-t-0 border-slate-800 rounded-b-lg bg-slate-900/50 px-2 py-2"
            >
              {onAddInColumn && caps.canCreate && (
                <button
                  type="button"
                  onClick={() => onAddInColumn(col.id)}
                  className="w-full flex items-center justify-center gap-2 py-3 px-3 min-h-[44px] rounded border border-dashed border-slate-600 hover:border-slate-500 hover:bg-slate-800/40 text-slate-500 hover:text-slate-300 text-[11px] font-medium transition-colors focus:outline-none touch-manipulation"
                >
                  <Plus size={14} />
                  Novo módulo
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── CONCLUÍDOS (colapsado) ────────────────────────────────── */}
      {completedItems.length > 0 && (
        <section className="bg-slate-900/30 border border-slate-800/80 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setConcluidosOpen((o) => !o)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-2 text-slate-400">
              {concluidosOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <CheckCircle size={16} className="text-emerald-500/80" />
              <span className="text-sm font-medium text-slate-300">Concluídos</span>
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                — abrir para ver detalhes e editar
              </span>
            </div>
            <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded tabular-nums">
              {completedItems.length}
            </span>
          </button>
          {concluidosOpen && (
            <div className="border-t border-slate-800/80 p-3 flex flex-col gap-2 max-h-[360px] overflow-y-auto">
              {completedItems.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => caps.canOpenDetail && onOpenItem?.(item)}
                  onKeyDown={(e) => e.key === 'Enter' && caps.canOpenDetail && onOpenItem?.(item)}
                  className={`bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 hover:border-emerald-500/40 hover:ring-1 hover:ring-emerald-500/30 transition-all flex items-center gap-3 text-left group focus:outline-none focus:ring-1 focus:ring-emerald-500/50 touch-manipulation ${
                    caps.canOpenDetail ? 'cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-slate-500">
                        {item.who} · {item.when ? formatDateOnlyPtBr(item.when) : '—'}
                      </span>
                    </div>
                    <h4 className="text-sm font-medium text-slate-100 line-clamp-1">{item.what}</h4>
                    {item.why && (
                      <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{item.why}</p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1 text-[11px]">
                    {caps.canWorkflow && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onStatusChange(item.id, ItemStatus.ACTIVE);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-blue-400/70 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:border-blue-300 transition-colors"
                        title="Reabrir como Priorizar"
                      >
                        <CornerDownLeft size={12} />
                        <span>Priorizar</span>
                      </button>
                    )}
                    {caps.canOpenDetail && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenItem?.(item);
                        }}
                        className="inline-flex items-center gap-1 text-slate-400 hover:text-emerald-400 transition-colors"
                      >
                        <Pencil size={12} />
                        Abrir detalhes
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
