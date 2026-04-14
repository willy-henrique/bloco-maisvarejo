/**
 * Back Log: visão integrada ao Prioridades e Matriz 5W2H.
 * Itens em demanda (não concluídos) em lista profissional; concluídos em seção colapsada.
 */

import React, { useMemo, useState } from 'react';
import { ActionItem, ItemStatus, type Responsavel } from '../../types';
import {
  Trash2,
  PlayCircle,
  ExternalLink,
} from 'lucide-react';
import { toExternalHttpUrl } from '../../utils/externalLink';
import { Modal } from '../Shared/Modal';
import { nomeExibicaoWhoParaItem } from './responsavelSearchUtils';
import { VisibilityFilterBar, type VisibilityFilter } from '../Shared/VisibilityFilterBar';

function initialsFromName(nome: string): string {
  const t = nome.trim();
  if (!t) return '?';
  return t
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

export interface BacklogCapabilities {
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canWorkflow?: boolean;
}

interface BacklogViewProps {
  items: ActionItem[];
  onUpdate: (id: string, data: Partial<ActionItem>) => void;
  onDelete: (id: string) => void;
  onEditItem: (item: ActionItem) => void;
  onStatusChange: (id: string, status: ItemStatus) => void;
  onAddNew?: () => void;
  capabilities?: BacklogCapabilities;
  displayWho?: (who: string) => string;
  responsaveis?: Responsavel[];
  currentUserId?: string | null;
  isAdmin?: boolean;
}

export const BacklogView: React.FC<BacklogViewProps> = ({
  items,
  onUpdate,
  onDelete,
  onEditItem,
  onStatusChange,
  onAddNew,
  capabilities,
  displayWho,
  responsaveis = [],
  currentUserId,
  isAdmin = false,
}) => {
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [visFilters, setVisFilters] = useState<VisibilityFilter[]>([]);
  const creatorDisplay = (item: ActionItem): string => {
    const creator = (item.created_by ?? '').trim();
    if (creator) {
      return displayWho?.(creator) ?? nomeExibicaoWhoParaItem(creator, responsaveis, null);
    }
    const owner = (item.who ?? '').trim();
    if (!owner) return '—';
    return displayWho?.(owner) ?? nomeExibicaoWhoParaItem(owner, responsaveis, null);
  };
  const cap = {
    canCreate: capabilities?.canCreate !== false,
    canEdit: capabilities?.canEdit !== false,
    canDelete: capabilities?.canDelete !== false,
    canWorkflow: capabilities?.canWorkflow !== false,
  };
  const backlogItems = useMemo(() => {
    // Itens em demanda (BACKLOG)
    const backlog = items
      .filter((i) => i.status === ItemStatus.BACKLOG)
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    if (isAdmin || visFilters.length === 0) return backlog;
    const uid = (currentUserId ?? '').trim();
    return backlog.filter((item) => {
      const isCreator = (item.created_by ?? '') === uid;
      const isOwner = (item.who ?? '') === uid;
      const isObserver = false;
      return (
        (visFilters.includes('created') && isCreator) ||
        (visFilters.includes('assigned') && isOwner) ||
        (visFilters.includes('observing') && isObserver)
      );
    });
  }, [items, isAdmin, visFilters, currentUserId]);

  const moveToPrioridade = (id: string) => onStatusChange(id, ItemStatus.ACTIVE);

  return (
    <div className="max-w-5xl mx-auto space-y-6 w-full min-w-0">
      {!isAdmin && <VisibilityFilterBar active={visFilters} onChange={setVisFilters} />}
      {/* Backlog (não concluídos) */}
      <section className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Backlog
          </h3>
          <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-1 rounded tabular-nums">
            {backlogItems.length} {backlogItems.length === 1 ? 'item' : 'itens'}
          </span>
        </div>
        <div className="overflow-x-auto overflow-touch">
          {backlogItems.length === 0 ? (
            <div className="py-10 px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
              <p className="text-slate-500 text-center sm:text-left">
                Nenhum item em demanda. Use &quot;Item Backlog&quot; para registrar uma nova ideia
                ou mova itens do Kanban de volta para o Backlog.
              </p>
              {onAddNew && cap.canCreate && (
                <button
                  type="button"
                  onClick={onAddNew}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-medium text-white shadow-sm transition-colors"
                >
                  <PlayCircle size={14} />
                  Item Backlog
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[640px]">
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
                      <div
                        className="flex items-center gap-1.5 mt-0.5 min-w-0"
                        title="Quem criou a demanda"
                      >
                        <span className="w-5 h-5 rounded-full bg-slate-700 text-slate-300 text-[8px] font-bold flex items-center justify-center shrink-0">
                          {initialsFromName(creatorDisplay(item))}
                        </span>
                        <span className="text-[11px] text-slate-300 truncate">{creatorDisplay(item)}</span>
                      </div>
                      {item.link && item.link.trim() && (
                        <a
                          href={toExternalHttpUrl(item.link)}
                          target="_blank"
                          rel="noreferrer noopener"
                          onClick={(e) => e.stopPropagation()}
                          className="sm:hidden mt-1 inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                          title="Abrir link do documento"
                        >
                          <ExternalLink size={10} />
                          Abrir link
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      <div
                        className="flex items-center gap-1.5 text-[11px] text-slate-500 min-w-0"
                        title="Quem criou a demanda"
                      >
                        <span className="w-5 h-5 rounded-full bg-slate-700 text-slate-300 text-[8px] font-bold flex items-center justify-center shrink-0">
                          {initialsFromName(creatorDisplay(item))}
                        </span>
                        <span className="text-slate-300 truncate">{creatorDisplay(item)}</span>
                      </div>
                      {item.link && item.link.trim() && (
                        <a
                          href={toExternalHttpUrl(item.link)}
                          target="_blank"
                          rel="noreferrer noopener"
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                          title="Abrir link do documento"
                        >
                          <ExternalLink size={10} />
                          Abrir link
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        {cap.canWorkflow && (
                          <button
                            type="button"
                            onClick={() => moveToPrioridade(item.id)}
                            className="inline-flex items-center justify-center px-3 py-1.5 text-[11px] font-medium rounded-full bg-blue-600/90 hover:bg-blue-500 text-white transition-colors shadow-sm"
                            title="Mover para Priorizar (Kanban)"
                          >
                            <PlayCircle size={14} className="mr-1" />
                            Priorizar
                          </button>
                        )}
                        {cap.canDelete && (
                          <button
                            type="button"
                            onClick={() => setItemToDelete(item.id)}
                            className="inline-flex items-center justify-center p-2 rounded-full text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Excluir iniciativa do Backlog"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
      {itemToDelete && (
        <Modal isOpen onClose={() => setItemToDelete(null)} title="Remover item" maxWidth="sm">
          <div className="space-y-4 text-sm text-slate-200">
            <p>Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2 text-xs font-medium text-slate-300 border border-slate-600 rounded-lg hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(itemToDelete);
                  setItemToDelete(null);
                }}
                className="px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
              >
                Remover
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
