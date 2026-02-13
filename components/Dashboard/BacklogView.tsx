/**
 * Back Log: visão integrada ao Prioridades e Matriz 5W2H.
 * Itens em demanda (não concluídos) em lista profissional; concluídos em seção colapsada.
 */

import React, { useMemo, useState } from 'react';
import { ActionItem, ItemStatus, UrgencyLevel } from '../../types';
import { Badge } from '../Shared/Badge';
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  PlayCircle,
  Calendar,
  User,
  Lock,
  FileText,
} from 'lucide-react';

const URGENCY_ORDER: UrgencyLevel[] = [
  UrgencyLevel.CRITICAL,
  UrgencyLevel.HIGH,
  UrgencyLevel.MEDIUM,
  UrgencyLevel.LOW,
];

const STATUS_ORDER: ItemStatus[] = [
  ItemStatus.ACTIVE,
  ItemStatus.EXECUTING,
  ItemStatus.BLOCKED,
];

interface BacklogViewProps {
  items: ActionItem[];
  onUpdate: (id: string, data: Partial<ActionItem>) => void;
  onDelete: (id: string) => void;
  onEditItem: (item: ActionItem) => void;
  onStatusChange: (id: string, status: ItemStatus) => void;
  /** Opcional: bloco de decisões estratégicas (notas criptografadas) */
  strategicNote?: string;
  onStrategicNoteChange?: (value: string) => void;
  onSaveStrategicNote?: () => Promise<void>;
  noteSaving?: boolean;
}

export const BacklogView: React.FC<BacklogViewProps> = ({
  items,
  onUpdate,
  onDelete,
  onEditItem,
  onStatusChange,
  strategicNote = '',
  onStrategicNoteChange,
  onSaveStrategicNote,
  noteSaving = false,
}) => {
  const [concluidosOpen, setConcluidosOpen] = useState(false);
  const [decisoesOpen, setDecisoesOpen] = useState(false);

  const { backlogItems, completedItems } = useMemo(() => {
    const completed = items.filter((i) => i.status === ItemStatus.COMPLETED);
    const rest = items.filter((i) => i.status !== ItemStatus.COMPLETED);
    const byUrgency = (a: ActionItem, b: ActionItem) => {
      const ai = URGENCY_ORDER.indexOf(a.urgency);
      const bi = URGENCY_ORDER.indexOf(b.urgency);
      if (ai !== bi) return ai - bi;
      const as = STATUS_ORDER.indexOf(a.status);
      const bs = STATUS_ORDER.indexOf(b.status);
      if (as !== bs) return as - bs;
      return new Date(b.when).getTime() - new Date(a.when).getTime();
    };
    rest.sort(byUrgency);
    completed.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return { backlogItems: rest, completedItems: completed };
  }, [items]);

  const moveToPrioridade = (id: string) => onStatusChange(id, ItemStatus.ACTIVE);

  return (
    <div className="max-w-5xl mx-auto space-y-6 w-full min-w-0">
      {/* Decisões da diretoria (opcional, colapsável) */}
      {onStrategicNoteChange != null && onSaveStrategicNote != null && (
        <section className="bg-slate-900/60 border border-slate-800 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setDecisoesOpen((o) => !o)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
          >
            <div className="flex items-center gap-2 text-slate-400">
              <FileText size={16} />
              <span className="text-sm font-medium text-slate-200">Decisões da diretoria</span>
            </div>
            {decisoesOpen ? (
              <ChevronDown size={18} className="text-slate-500" />
            ) : (
              <ChevronRight size={18} className="text-slate-500" />
            )}
          </button>
          {decisoesOpen && (
            <div className="px-4 pb-4 pt-0 border-t border-slate-800/80 space-y-3">
              <div className="flex items-center gap-2 text-slate-500 text-xs">
                <Lock size={12} />
                Criptografia ativa antes de salvar.
              </div>
              <textarea
                value={strategicNote}
                onChange={(e) => onStrategicNoteChange(e.target.value)}
                placeholder="Decisões da reunião de diretoria..."
                className="w-full min-h-[120px] bg-slate-900/40 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 outline-none focus:border-slate-600 transition-colors resize-y"
              />
              <button
                type="button"
                onClick={onSaveStrategicNote}
                disabled={noteSaving}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {noteSaving ? 'Salvando…' : 'Salvar decisões'}
              </button>
            </div>
          )}
        </section>
      )}

      {/* Fila de demanda (não concluídos) */}
      <section className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Em demanda — Prioridade e Matriz
          </h3>
          <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-1 rounded tabular-nums">
            {backlogItems.length} {backlogItems.length === 1 ? 'item' : 'itens'}
          </span>
        </div>
        <div className="overflow-x-auto overflow-touch">
          {backlogItems.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              Nenhum item em demanda. Use &quot;Nova Iniciativa&quot; ou mova itens do Kanban para cá.
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead>
                <tr className="text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-800 bg-slate-900/60">
                  <th className="px-3 py-2.5 font-semibold">O quê?</th>
                  <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">Quem / Quando</th>
                  <th className="px-3 py-2.5 font-semibold w-24">Urgência</th>
                  <th className="px-3 py-2.5 font-semibold w-36">Status</th>
                  <th className="px-3 py-2.5 font-semibold text-right w-28">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {backlogItems.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-800/30 transition-colors group"
                  >
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => onEditItem(item)}
                        className="text-left w-full text-sm font-medium text-slate-100 hover:text-blue-400 transition-colors line-clamp-2"
                      >
                        {item.what || '—'}
                      </button>
                      <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 sm:hidden">
                        {item.who && `${item.who} · `}
                        {item.when && new Date(item.when).toLocaleDateString('pt-BR')}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <User size={10} />
                        {item.who || '—'}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                        <Calendar size={10} />
                        {item.when ? new Date(item.when).toLocaleDateString('pt-BR') : '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge type="urgency" value={item.urgency} />
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={item.status}
                        onChange={(e) => onStatusChange(item.id, e.target.value as ItemStatus)}
                        className="bg-slate-800/50 border border-slate-700 text-[11px] font-medium rounded py-1.5 px-2 outline-none text-slate-200 focus:border-slate-500 w-full max-w-[140px] cursor-pointer"
                      >
                        {STATUS_ORDER.map((s) => (
                          <option key={s} value={s} className="bg-slate-900">
                            {s}
                          </option>
                        ))}
                        <option value={ItemStatus.COMPLETED} className="bg-slate-900">
                          {ItemStatus.COMPLETED}
                        </option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        {item.status !== ItemStatus.ACTIVE && (
                          <button
                            type="button"
                            onClick={() => moveToPrioridade(item.id)}
                            className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                            title="Mover para Prioridade Ativa (Kanban)"
                          >
                            <PlayCircle size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onEditItem(item)}
                          className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(item.id)}
                          className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Concluídos (colapsado por padrão — "sumir" do fluxo principal) */}
      {completedItems.length > 0 && (
        <section className="bg-slate-900/30 border border-slate-800/80 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setConcluidosOpen((o) => !o)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-2 text-slate-500">
              {concluidosOpen ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Concluídos (arquivo)
              </span>
            </div>
            <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded tabular-nums">
              {completedItems.length}
            </span>
          </button>
          {concluidosOpen && (
            <div className="border-t border-slate-800/80">
              <table className="w-full text-left border-collapse min-w-[520px]">
                <thead>
                  <tr className="text-slate-600 text-[10px] uppercase tracking-wider border-b border-slate-800/80 bg-slate-900/60">
                    <th className="px-3 py-2 font-semibold">O quê?</th>
                    <th className="px-3 py-2 font-semibold hidden sm:table-cell">Quem / Quando</th>
                    <th className="px-3 py-2 font-semibold text-right w-24">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {completedItems.map((item) => (
                    <tr key={item.id} className="text-slate-400 hover:bg-slate-800/20">
                      <td className="px-3 py-2 text-sm">{item.what || '—'}</td>
                      <td className="px-3 py-2 text-[11px] hidden sm:table-cell">
                        {item.who || '—'} · {item.when ? new Date(item.when).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => onEditItem(item)}
                          className="p-1.5 text-slate-500 hover:text-blue-400 rounded"
                          title="Editar"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onStatusChange(item.id, ItemStatus.ACTIVE)}
                          className="p-1.5 text-slate-500 hover:text-amber-400 rounded ml-0.5"
                          title="Reabrir (Prioridade Ativa)"
                        >
                          <PlayCircle size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(item.id)}
                          className="p-1.5 text-slate-500 hover:text-red-400 rounded ml-0.5"
                          title="Excluir"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
