import React, { useState, useEffect } from 'react';
import { ActionItem, ItemStatus, UrgencyLevel, Responsavel } from '../../types';
import { Modal } from '../Shared/Modal';
import { MapPin, User, Calendar, ExternalLink } from 'lucide-react';
import { ResponsavelAutocomplete } from './ResponsavelAutocomplete';
import { resolveResponsavelDisplay } from './responsavelSearchUtils';
import { toExternalHttpUrl } from '../../utils/externalLink';

interface ActionItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ActionItem | null;
  initialStatus?: ItemStatus;
  onSave: (data: Omit<ActionItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (id: string, data: Partial<ActionItem>) => void;
  defaultEmpresa?: string;
  empresaSuggestions?: string[];
  /** Nome do usuário logado para preencher/lock do campo "Quem?" */
  loggedUserName?: string;
  /** Quando true, impede edição do "Quem?" e força o valor para o usuário logado */
  lockWhoToLoggedUser?: boolean;
  /** Quando true, esconde campos de local/empresa (modo Backlog) */
  hideWhereEmpresa?: boolean;
  /** Quando true, esconde Status/Urgência (ex.: Backlog simplificado) */
  hideStatusUrgency?: boolean;
  /** Quando true, permite editar o campo "Quem?" */
  canEditWho?: boolean;
  /** Lista de responsáveis para resolver/editar o campo "Quem?" (Tático/Operacional). */
  responsaveis?: Responsavel[];
  /** Somente leitura (permissão de edição negada) */
  readOnly?: boolean;
  /**
   * Estratégico (Kanban): mesmo formulário “slim” do Backlog (Título, Descrição, Quem?, Quando?),
   * com título de modal “Item Estratégico”.
   */
  itemModalContext?: 'default' | 'backlog' | 'estrategico';
}

const emptyForm = (whoDefault: string): Omit<ActionItem, 'id' | 'createdAt' | 'updatedAt'> => ({
  what: '',
  why: '',
  link: '',
  where: '',
  when: new Date().toISOString().split('T')[0],
  who: whoDefault,
  how: '',
  status: ItemStatus.ACTIVE,
  urgency: UrgencyLevel.MEDIUM,
  notes: '',
  empresa: '',
});

export const ActionItemModal: React.FC<ActionItemModalProps> = ({
  isOpen,
  onClose,
  item,
  initialStatus,
  onSave,
  onUpdate,
  defaultEmpresa,
  empresaSuggestions,
  loggedUserName,
  lockWhoToLoggedUser = false,
  hideWhereEmpresa = false,
  hideStatusUrgency = false,
  canEditWho = false,
  responsaveis = [],
  readOnly = false,
  itemModalContext = 'default',
}) => {
  const isEdit = item !== null;
  const isBacklogItem =
    item?.status === ItemStatus.BACKLOG || initialStatus === ItemStatus.BACKLOG;
  const isEstrategicoKanban = itemModalContext === 'estrategico';
  const isBacklogLike =
    (hideWhereEmpresa && hideStatusUrgency) || isBacklogItem || isEstrategicoKanban;
  const effectiveHideWhereEmpresa = hideWhereEmpresa || isBacklogLike;
  const effectiveHideStatusUrgency = hideStatusUrgency || isBacklogLike;
  const isWhoLocked = lockWhoToLoggedUser && !!loggedUserName?.trim();
  // Em edição, mantém o "Quem?" original do item.
  const shouldLockWho = isWhoLocked && !isEdit;
  const lockWhoAndWhen = isBacklogLike;
  const isWhoReadOnly = lockWhoAndWhen || !canEditWho;
  const whoDefault = shouldLockWho ? loggedUserName!.trim() : '';
  const [form, setForm] = useState(emptyForm(whoDefault));
  const whoDisplay = resolveResponsavelDisplay(responsaveis, form.who || whoDefault).nome || (form.who || whoDefault || '');

  useEffect(() => {
    if (item) {
      const whoValue = item.who;
      setForm({
        what: item.what,
        why: item.why,
        link: item.link ?? '',
        where: item.where,
        when: item.when,
        who: whoValue,
        how: item.how,
        status: item.status,
        urgency: item.urgency,
        notes: item.notes ?? '',
        empresa: item.empresa ?? '',
      });
    } else {
      setForm({
        ...emptyForm(whoDefault),
        status: initialStatus ?? ItemStatus.ACTIVE,
        empresa: defaultEmpresa ?? '',
        who: whoDefault,
      });
    }
  }, [item, initialStatus, isOpen, defaultEmpresa, whoDefault]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (isEdit && item) {
      onUpdate(item.id, { ...form });
    } else {
      onSave(form);
    }
    onClose();
  };

  const update = (field: keyof typeof form, value: string | ItemStatus | UrgencyLevel) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const slimFormTitle =
    itemModalContext === 'estrategico'
      ? 'Item Estratégico'
      : isBacklogLike
      ? 'Item Backlog'
      : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={slimFormTitle ?? (isEdit ? 'Editar Iniciativa' : 'Novo')}
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {readOnly && (
          <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
            Você não tem permissão para editar este item. Os campos estão bloqueados.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              {isBacklogLike ? 'Titulo' : 'Descrição'}
            </label>
            <input
              type="text"
              value={form.what}
              onChange={(e) => update('what', e.target.value)}
              placeholder={isBacklogLike ? 'Titulo do backlog' : 'Descrição da ação'}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600 disabled:opacity-60"
              required
              readOnly={readOnly}
              disabled={readOnly}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              {isBacklogLike ? 'Descrição' : 'Por quê?'}
            </label>
            <textarea
              value={form.why}
              onChange={(e) => update('why', e.target.value)}
              placeholder={isBacklogLike ? 'Descrição do backlog' : 'Justificativa estratégica'}
              rows={isBacklogLike ? 6 : 3}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-300 placeholder:text-slate-500 outline-none focus:border-slate-600 resize-y min-h-[140px] md:min-h-[180px] disabled:opacity-60"
              readOnly={readOnly}
              disabled={readOnly}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Link (Google Docs, Drive, etc.)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={form.link ?? ''}
                onChange={(e) => update('link', e.target.value)}
                placeholder="docs.google.com/... ou https://..."
                className="flex-1 min-w-0 bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600 disabled:opacity-60"
                readOnly={readOnly}
                disabled={readOnly}
              />
              <button
                type="button"
                onClick={() => {
                  const url = toExternalHttpUrl(form.link);
                  if (!url) return;
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
                disabled={!toExternalHttpUrl(form.link)}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Abrir documento"
              >
                <ExternalLink size={14} />
                <span className="text-xs font-medium">Abrir</span>
              </button>
            </div>
          </div>
          {!effectiveHideWhereEmpresa && (
            <>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                  Onde?
                </label>
                <div className="relative">
                  <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={form.where}
                    onChange={(e) => update('where', e.target.value)}
                    placeholder="Setor / local"
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-slate-600 disabled:opacity-60"
                    readOnly={readOnly}
                    disabled={readOnly}
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                  Empresa / Workspace
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.empresa ?? ''}
                    onChange={(e) => update('empresa', e.target.value)}
                    placeholder="Cliente / unidade / grupo"
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-slate-600 disabled:opacity-60"
                    autoComplete="off"
                    readOnly={readOnly}
                    disabled={readOnly}
                  />
                  {form.empresa &&
                    (empresaSuggestions ?? [])
                      .filter((nome) =>
                        nome.toLowerCase().startsWith(form.empresa!.toLowerCase())
                      )
                      .slice(0, 6).length > 0 && (
                      <div className="absolute z-20 mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg shadow-lg max-h-40 overflow-auto">
                        {(empresaSuggestions ?? [])
                          .filter((nome) =>
                            nome.toLowerCase().startsWith(form.empresa!.toLowerCase())
                          )
                          .slice(0, 6)
                          .map((nome) => (
                            <button
                              key={nome}
                              type="button"
                              disabled={readOnly}
                              onClick={() => update('empresa', nome)}
                              className="w-full text-left px-3 py-1.5 text-[12px] text-slate-100 hover:bg-slate-800"
                            >
                              {nome}
                            </button>
                          ))}
                      </div>
                    )}
                </div>
              </div>
            </>
          )}
          <div>
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Quem?
            </label>
            {isWhoReadOnly ? (
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <div className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200">
                  {whoDisplay || '—'}
                </div>
              </div>
            ) : (
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <div className="pl-9">
                  <ResponsavelAutocomplete
                    responsaveis={responsaveis}
                    valueId={form.who}
                    onCommit={(id) => update('who', id)}
                    disabled={readOnly}
                    placeholder="Buscar responsável..."
                  />
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Quando?
            </label>
            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="date"
                value={form.when}
                onChange={(e) => update('when', e.target.value)}
                disabled={readOnly || lockWhoAndWhen}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600 disabled:opacity-70 disabled:cursor-not-allowed"
              />
            </div>
          </div>
          {!effectiveHideStatusUrgency && (
            <>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) => update('status', e.target.value as ItemStatus)}
                  disabled={readOnly}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600 cursor-pointer disabled:opacity-60"
                >
                  {Object.values(ItemStatus).map((s) => (
                    <option key={s} value={s} className="bg-slate-900">
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors"
          >
            {readOnly ? 'Fechar' : 'Cancelar'}
          </button>
          {!readOnly && (
            <button
              type="submit"
              className="px-4 py-2.5 min-h-[44px] text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors touch-manipulation"
            >
              {isEdit ? 'Salvar' : 'Criar'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
};
