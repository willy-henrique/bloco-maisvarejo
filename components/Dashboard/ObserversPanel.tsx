import React, { useMemo, useState } from 'react';
import type { Observer } from '../../types';
import { Crown, Eye, UserPlus, X } from 'lucide-react';

export type ObserverUserInput = {
  id: string;
  label: string;
  workspace?: string;
  workspaces?: string[];
};

interface ObserversPanelProps {
  entity: 'prioridade' | 'plano' | 'tarefa';
  entityId: string;
  observers: Observer[];
  allUsers: ObserverUserInput[];
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
  canEdit: boolean;
  resolveUserName?: (userId: string) => string;
  /** Quando true, não renderiza o botão de olho interno e mostra o conteúdo direto. */
  hideTrigger?: boolean;
}

interface ObserverUserOption {
  id: string;
  label: string;
  displayName: string;
  meta: string;
  initials: string;
}

function toTitleName(value: string): string {
  const clean = value
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\.+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!clean) return '';
  return clean
    .split(' ')
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLocaleLowerCase('pt-BR');
      return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
    })
    .join(' ');
}

function initialsFromName(value: string): string {
  const parts = toTitleName(value).split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('pt-BR');
}

function workspaceLabel(user: ObserverUserInput): string {
  const values = [
    user.workspace,
    ...(Array.isArray(user.workspaces) ? user.workspaces : []),
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  const unique = Array.from(new Set(values));
  if (unique.length === 0) return 'Workspace não definido';
  if (unique.length <= 2) return unique.join(' / ');
  return `${unique[0]} +${unique.length - 1} workspaces`;
}

function buildUserOption(user: ObserverUserInput): ObserverUserOption | null {
  const id = String(user.id ?? '').trim();
  const label = String(user.label ?? '').trim();
  if (!id) return null;
  const rawName = label || id;
  const displayName = toTitleName(rawName) || rawName;
  const meta = workspaceLabel(user);
  return {
    id,
    label: rawName,
    displayName,
    meta,
    initials: initialsFromName(rawName),
  };
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
  hideTrigger = false,
}) => {
  const [open, setOpen] = useState(hideTrigger);
  const [candidate, setCandidate] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const normalizedCandidate = candidate.trim().toLowerCase();
  const selectedIds = useMemo(
    () => new Set((observers ?? []).map((o) => String(o.user_id ?? '').trim().toLowerCase()).filter(Boolean)),
    [observers],
  );

  const usersById = useMemo(() => {
    const map = new Map<string, ObserverUserOption>();
    for (const u of allUsers) {
      const option = buildUserOption(u);
      if (!option) continue;
      map.set(option.id.toLowerCase(), option);
    }
    return map;
  }, [allUsers]);

  const addableUsers = useMemo(() => {
    const out: ObserverUserOption[] = [];
    for (const u of allUsers) {
      const option = buildUserOption(u);
      if (!option || selectedIds.has(option.id.toLowerCase())) continue;
      out.push(option);
    }
    return out.sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
  }, [allUsers, selectedIds]);

  const filteredUsers = useMemo(() => {
    const query = normalizedCandidate;
    if (!query) return addableUsers;
    return addableUsers
      .filter((u) =>
        `${u.displayName} ${u.label} ${u.meta}`.toLowerCase().includes(query),
      );
  }, [addableUsers, normalizedCandidate]);

  const resolvedCandidateId = useMemo(() => {
    if (!normalizedCandidate) return '';
    const byId = usersById.get(normalizedCandidate);
    if (byId) return byId.id;
    const byLabel = addableUsers.find((u) => u.label.trim().toLowerCase() === normalizedCandidate);
    if (byLabel) return byLabel.id;
    const byDisplayName = addableUsers.find((u) => u.displayName.trim().toLowerCase() === normalizedCandidate);
    if (byDisplayName) return byDisplayName.id;
    if (filteredUsers.length === 1) return filteredUsers[0].id;
    return '';
  }, [normalizedCandidate, usersById, addableUsers, filteredUsers]);

  const addUser = (userId: string) => {
    const id = userId.trim();
    if (!id || selectedIds.has(id.toLowerCase())) return;
    onAdd(id);
    setCandidate('');
    setPickerOpen(false);
  };

  const handleAdd = () => {
    if (!resolvedCandidateId) return;
    addUser(resolvedCandidateId);
  };

  const renderObserverName = (userId: string) => {
    const existing = usersById.get(String(userId).toLowerCase());
    const resolved = resolveUserName?.(userId) || existing?.label || userId;
    const option = existing
      ? {
          ...existing,
          displayName: toTitleName(resolved) || existing.displayName,
          initials: initialsFromName(resolved),
        }
      : buildUserOption({ id: userId, label: resolved });
    return option ?? {
      id: userId,
      label: userId,
      displayName: userId,
      meta: 'Workspace não definido',
      initials: initialsFromName(userId),
    };
  };

  return (
    <div className="mt-2">
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 px-2 py-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
          title="Observadores"
        >
          <Eye size={13} />
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 tabular-nums">
            {(observers ?? []).length}
          </span>
        </button>
      )}
      {(hideTrigger || open) && (
        <div className="mt-2 px-3 pb-3 pt-2 space-y-2 border border-slate-800 rounded-lg bg-slate-900/40">
          <div className="pt-2 space-y-1.5">
            {(observers ?? []).length === 0 ? (
              <p className="text-[11px] text-slate-500">Sem observadores.</p>
            ) : (
              observers.map((o) => {
                const isCreator = o.role === 'creator';
                const observer = renderObserverName(o.user_id);
                return (
                  <div
                    key={`${entity}-${entityId}-${o.user_id}`}
                    className="flex items-center justify-between gap-2 text-xs bg-slate-800/50 border border-slate-700 rounded-lg px-2 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-blue-500/25 bg-blue-500/10 text-[10px] font-semibold text-blue-200">
                        {observer.initials}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-100">{observer.displayName}</span>
                        <span className="block truncate text-[10px] text-slate-500">{observer.meta}</span>
                      </span>
                    </div>
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
            <div className="relative pt-1 flex items-center gap-2">
              <div
                className="relative flex-1"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setPickerOpen(false);
                  }
                }}
              >
                <input
                  value={candidate}
                  onChange={(e) => {
                    setCandidate(e.target.value);
                    setPickerOpen(true);
                  }}
                  onFocus={() => setPickerOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAdd();
                    }
                    if (e.key === 'Escape') setPickerOpen(false);
                  }}
                  placeholder="Adicionar observador..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-blue-500/60"
                />
                {pickerOpen && (
                  <div className="absolute bottom-full left-0 z-40 mb-2 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-1.5 shadow-2xl shadow-black/40">
                    {filteredUsers.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-slate-500">Nenhum usuário disponível.</p>
                    ) : (
                      filteredUsers.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addUser(u.id)}
                          tabIndex={0}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-800/80"
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-blue-500/25 bg-blue-500/10 text-[10px] font-semibold text-blue-200">
                            {u.initials}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-slate-100">{u.displayName}</span>
                            <span className="block truncate text-[10px] text-slate-500">{u.meta}</span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!resolvedCandidateId}
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white"
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
