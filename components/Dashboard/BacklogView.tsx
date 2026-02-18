/**
 * Backlog: repositório de demandas. Itens podem ser promovidos a Prioridade (máx 3 ativas).
 */

import React, { useState } from 'react';
import { BacklogItem, BacklogStatus } from '../../types';
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  ArrowUpCircle,
  FileText,
  Lock,
} from 'lucide-react';

interface BacklogViewProps {
  backlog: BacklogItem[];
  prioridadesAtivasCount: number;
  maxPrioridadesAtivas: number;
  onUpdate: (id: string, data: Partial<BacklogItem>) => void;
  onDelete: (id: string) => void;
  onPromote: (id: string) => void;
  onEditItem: (item: BacklogItem) => void;
  onAddNew: () => void;
  strategicNote?: string;
  onStrategicNoteChange?: (value: string) => void;
  onSaveStrategicNote?: () => Promise<void>;
  noteSaving?: boolean;
}

export const BacklogView: React.FC<BacklogViewProps> = ({
  backlog,
  prioridadesAtivasCount,
  maxPrioridadesAtivas,
  onUpdate,
  onDelete,
  onPromote,
  onEditItem,
  onAddNew,
  strategicNote = '',
  onStrategicNoteChange,
  onSaveStrategicNote,
  noteSaving = false,
}) => {
  const [decisoesOpen, setDecisoesOpen] = useState(false);

  const canPromote = prioridadesAtivasCount < maxPrioridadesAtivas;

  return (
    <div className="max-w-5xl mx-auto space-y-6 w-full min-w-0">
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

      <section className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Backlog — demandas potenciais
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-1 rounded tabular-nums">
              {backlog.length} {backlog.length === 1 ? 'item' : 'itens'}
            </span>
            <button
              type="button"
              onClick={onAddNew}
              className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              Novo item
            </button>
          </div>
        </div>
        <div className="overflow-x-auto overflow-touch">
          {backlog.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              Nenhum item no backlog. Use &quot;Novo item&quot; para registrar demandas e depois
              promover a prioridade.
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead>
                <tr className="text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-800 bg-slate-900/60">
                  <th className="px-3 py-2.5 font-semibold">Título</th>
                  <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">Origem / Data</th>
                  <th className="px-3 py-2.5 font-semibold w-28">Status</th>
                  <th className="px-3 py-2.5 font-semibold text-right w-36">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {backlog.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => onEditItem(item)}
                        className="text-left w-full text-sm font-medium text-slate-100 hover:text-blue-400 transition-colors line-clamp-2"
                      >
                        {item.titulo || '—'}
                      </button>
                      {item.descricao && (
                        <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 sm:hidden">
                          {item.origem} ·{' '}
                          {new Date(item.data_criacao).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell text-[11px] text-slate-400">
                      {item.origem || '—'} ·{' '}
                      {new Date(item.data_criacao).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[11px] font-medium text-slate-400 capitalize">
                        {item.status_backlog}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        {item.status_backlog !== BacklogStatus.PROMOVIDO && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!canPromote) return;
                              onPromote(item.id);
                            }}
                            disabled={!canPromote}
                            className={`p-2 rounded transition-colors ${
                              canPromote
                                ? 'text-slate-500 hover:text-blue-400 hover:bg-blue-500/10'
                                : 'text-slate-600 opacity-60 cursor-not-allowed'
                            }`}
                            title={
                              canPromote
                                ? 'Promover a Prioridade'
                                : 'Limite de prioridades ativas atingido. Conclua ou rebaixe uma prioridade antes de promover.'
                            }
                          >
                            <ArrowUpCircle size={14} />
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
                          onClick={() => {
                            if (window.confirm('Tem certeza que deseja excluir este item do backlog?')) {
                              onDelete(item.id);
                            }
                          }}
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
    </div>
  );
};
