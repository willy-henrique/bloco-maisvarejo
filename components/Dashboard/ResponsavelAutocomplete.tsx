import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Responsavel } from '../../types';
import {
  filterResponsaveisByPrefix,
  resolveResponsavelDisplay,
  sameResponsavelReference,
} from './responsavelSearchUtils';

function normStr(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

export type ResponsavelAutocompleteVariant = 'default' | 'compact' | 'inline';

type MenuPos = { top: number; left: number; width: number };

export const ResponsavelAutocomplete: React.FC<{
  responsaveis: Responsavel[];
  valueId: string;
  onCommit: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  variant?: ResponsavelAutocompleteVariant;
}> = ({
  responsaveis,
  valueId,
  onCommit,
  disabled = false,
  placeholder = 'Buscar responsável...',
  variant = 'default',
}) => {
  const resolved = useMemo(
    () => resolveResponsavelDisplay(responsaveis, valueId),
    [responsaveis, valueId],
  );
  const [query, setQuery] = useState(() => resolved.nome);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Evita closure obsoleta no blur após o pai atualizar `valueId`. */
  const valueIdRef = useRef(valueId);
  valueIdRef.current = valueId;
  /** Evita que o sync rode com `valueId` ainda antigo e apague o nome recém-escolhido antes do pai re-renderizar. */
  const pendingCommitIdRef = useRef<string | null>(null);
  const pendingClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueIdForSyncRef = useRef(valueId);
  const responsaveisForSyncRef = useRef(responsaveis);
  valueIdForSyncRef.current = valueId;
  responsaveisForSyncRef.current = responsaveis;
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);

  const markCommittedId = useCallback((id: string) => {
    const t = id.trim();
    if (!t) return;
    pendingCommitIdRef.current = t;
    if (pendingClearTimerRef.current) clearTimeout(pendingClearTimerRef.current);
    pendingClearTimerRef.current = setTimeout(() => {
      pendingClearTimerRef.current = null;
      pendingCommitIdRef.current = null;
      const el = inputRef.current;
      if (document.activeElement === el) return;
      setQuery(
        resolveResponsavelDisplay(responsaveisForSyncRef.current, valueIdForSyncRef.current).nome,
      );
    }, 4000);
  }, []);

  // Sincroniza com o dado persistido quando NÃO está editando (não sobrescreve digitação/seleção imediata).
  useEffect(() => {
    const el = inputRef.current;
    if (document.activeElement === el) return;
    const pending = pendingCommitIdRef.current;
    if (pending !== null) {
      if (sameResponsavelReference(responsaveis, pending, valueId)) {
        pendingCommitIdRef.current = null;
        if (pendingClearTimerRef.current) {
          clearTimeout(pendingClearTimerRef.current);
          pendingClearTimerRef.current = null;
        }
        setQuery(resolveResponsavelDisplay(responsaveis, valueId).nome);
      }
      return;
    }
    setQuery(resolveResponsavelDisplay(responsaveis, valueId).nome);
  }, [valueId, responsaveis]);

  useEffect(() => {
    return () => {
      if (blurResetTimer.current) clearTimeout(blurResetTimer.current);
      if (pendingClearTimerRef.current) clearTimeout(pendingClearTimerRef.current);
    };
  }, []);

  const options = useMemo(
    () => filterResponsaveisByPrefix(responsaveis, query),
    [responsaveis, query],
  );

  const updateMenuPos = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 200);
    let left = r.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    setMenuPos({
      top: r.bottom + 4,
      left,
      width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPos();
  }, [open, options.length, query, updateMenuPos]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updateMenuPos();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updateMenuPos]);

  const inputCls =
    variant === 'compact'
      ? 'bg-transparent border-b border-transparent focus:border-slate-600 outline-none text-xs text-slate-200 placeholder:text-slate-600 w-full min-w-[140px] max-w-[220px] py-0.5'
      : variant === 'inline'
        ? 'w-full bg-transparent text-sm text-slate-200 outline-none border-b border-transparent focus:border-slate-600 transition-colors py-0.5 placeholder:text-slate-700'
        : 'w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 sm:py-2 text-sm text-slate-200 outline-none focus:border-slate-600 placeholder:text-slate-600';

  const showMenu = open && menuPos !== null;

  if (disabled) {
    return (
      <span
        className={
          variant === 'compact'
            ? 'text-xs text-slate-400 truncate max-w-[120px] inline-block'
            : 'text-sm text-slate-400'
        }
      >
        {resolved.nome || '—'}
      </span>
    );
  }

  const listbox =
    showMenu &&
    createPortal(
      <div
        className="fixed max-h-48 overflow-auto rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl"
        style={{
          top: menuPos!.top,
          left: menuPos!.left,
          width: menuPos!.width,
          maxWidth: 'min(100vw - 1rem, 320px)',
          zIndex: 10000,
        }}
        role="listbox"
      >
        {responsaveis.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-500">Nenhum responsável cadastrado.</p>
        ) : options.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-500">Nenhum nome coincide. Continue digitando.</p>
        ) : (
          options.map((r) => (
            <button
              key={r.id}
              type="button"
              role="option"
              className="w-full px-3 py-2 text-left text-[13px] text-slate-100 transition-colors hover:bg-slate-800"
              onMouseDown={(e) => {
                e.preventDefault();
                if (blurResetTimer.current) {
                  clearTimeout(blurResetTimer.current);
                  blurResetTimer.current = null;
                }
                markCommittedId(r.id);
                onCommit(r.id);
                setQuery(r.nome);
                setOpen(false);
              }}
            >
              {r.nome}
            </button>
          ))
        )}
      </div>,
      document.body,
    );

  return (
    <>
      <div
        ref={anchorRef}
        className={variant === 'compact' || variant === 'inline' ? 'min-w-0 w-full' : 'relative w-full'}
      >
        <input
          ref={inputRef}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            setOpen(true);
            const exact = responsaveis.find((r) => normStr(r.nome) === normStr(v));
            if (exact) {
              markCommittedId(exact.id);
              onCommit(exact.id);
            }
          }}
          onFocus={() => {
            setOpen(true);
            queueMicrotask(() => updateMenuPos());
          }}
          onBlur={() => {
            if (blurResetTimer.current) clearTimeout(blurResetTimer.current);
            blurResetTimer.current = setTimeout(() => {
              blurResetTimer.current = null;
              setOpen(false);
              setQuery((q) => {
                const exact = responsaveis.find((r) => normStr(r.nome) === normStr(q));
                if (exact) {
                  markCommittedId(exact.id);
                  onCommit(exact.id);
                  return exact.nome;
                }
                return resolveResponsavelDisplay(responsaveis, valueIdRef.current).nome;
              });
            }, 200);
          }}
          className={inputCls}
          aria-autocomplete="list"
          aria-expanded={open}
        />
      </div>
      {listbox}
    </>
  );
};
