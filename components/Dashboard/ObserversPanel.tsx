import React, { useMemo, useState } from 'react';
import type { Observer } from '../../types';
import { Crown, Eye, UserPlus, X } from 'lucide-react';

interface ObserversPanelProps {
  entity: 'prioridade' | 'plano' | 'tarefa';
  entityId: string;
  observers: Observer[];
  allUsers: Array<{ id: string; label: string }>;
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
  canEdit: boolean;
  resolveUserName?: (userId: string) => string;
}

export const ObserversPanel: React.FC<ObserversPanelProps> = ({
  entity,
  entityId,
  observers,
  allUsers,
  onAdd,
  onRemove,
  canEdit,
  resolveUserName,
}) => {
  const [open, setOpen] = useState(false);
  const [candidate, setCandidate] = useState('');
  const normalizedCandidate = candidate.trim().toLowerCase();
  const selectedIds = useMemo(
    () => new Set((observers ?? []).map((o) => String(o.user_id ?? '').trim().toLowerCase()).filter(Boolean)),
    [observers],
  );

  const usersById = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const u of allUsers) {
      const id = String(u.id ?? '').trim();
      const label = String(u.label ?? '').trim();
      if (!id) continue;
      map.set(id.toLowerCase(), { id, label: label || id });
    }
    return map;
  }, [allUsers]);

  const addableUsers = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    for (const u of allUsers) {
      const id = String(u.id ?? '').trim();
      const label = String(u.label ?? '').trim();
      const key = id.toLowerCase();
      if (!id || selectedIds.has(key)) continue;
      out.push({ id, label: label || id });
    }
    return out;
  }, [allUsers, selectedIds]);

  const resolvedCandidateId = useMemo(() => {
    if (!normalizedCandidate) return '';
    const byId = usersById.get(normalizedCandidate);
    if (byId) return byId.id;
    const byLabel = addableUsers.find((u) => u.label.trim().toLowerCase() === normalizedCandidate);
    if (byLabel) return byLabel.id;
    return '';
  }, [normalizedCandidate, usersById, addableUsers]);

  const handleAdd = () => {
    const userId = resolvedCandidateId || candidate.trim();
    if (!userId) return;
    if (selectedIds.has(userId.toLowerCase())) return;
    onAdd(userId);
    setCandidate('');
  };

  return (
    <div className="mt-3 border border-slate-800 rounded-lg bg-slate-900/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-800/40 rounded-lg transition-colors"
      >
        <span className="inline-flex items-center gap-2 text-xs text-slate-300">
          <Eye size={13} />
          Observadores
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 tabular-nums">
          {(observers ?? []).length}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-800">
          <div className="pt-2 space-y-1.5">
            {(observers ?? []).length === 0 ? (
              <p className="text-[11px] text-slate-500">Sem observadores.</p>
            ) : (
              observers.map((o) => {
                const isCreator = o.role === 'creator';
                const displayName = resolveUserName?.(o.user_id) || o.user_id;
                return (
                  <div
                    key={`${entity}-${entityId}-${o.user_id}`}
                    className="flex items-center justify-between gap-2 text-xs bg-slate-800/50 border border-slate-700 rounded px-2 py-1.5"
                  >
                    <span className="text-slate-200 truncate">{displayName}</span>
                    <div className="inline-flex items-center gap-1.5 shrink-0">
                      {isCreator ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          <Crown size={10} />
                          Criador
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700 text-slate-300 border border-slate-600">
                          Seguindo
                        </span>
                      )}
                      {!isCreator && canEdit && (
                        <button
                          type="button"
                          onClick={() => onRemove(o.user_id)}
                          className="p-1 rounded text-slate-500 hover:text-red-300 hover:bg-red-500/10"
                          title="Remover observador"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {canEdit && (
            <div className="pt-1 flex items-center gap-2">
              <input
                list={`observers-${entity}-${entityId}`}
                value={candidate}
                onChange={(e) => setCandidate(e.target.value)}
                placeholder="Adicionar observador..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-slate-600"
              />
              <datalist id={`observers-${entity}-${entityId}`}>
                {addableUsers.map((u) => (
                  <option key={u.id} value={u.label} />
                ))}
              </datalist>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!candidate.trim() || (!resolvedCandidateId && !usersById.has(normalizedCandidate))}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white"
              >
                <UserPlus size={12} />
                Adicionar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
