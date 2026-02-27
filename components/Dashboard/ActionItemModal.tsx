import React, { useState, useEffect } from 'react';
import { ActionItem, ItemStatus, UrgencyLevel } from '../../types';
import { Modal } from '../Shared/Modal';
import { MapPin, User, Calendar, FileText } from 'lucide-react';

interface ActionItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ActionItem | null;
  initialStatus?: ItemStatus;
  onSave: (data: Omit<ActionItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (id: string, data: Partial<ActionItem>) => void;
  defaultEmpresa?: string;
  empresaSuggestions?: string[];
}

const emptyForm = (): Omit<ActionItem, 'id' | 'createdAt' | 'updatedAt'> => ({
  what: '',
  why: '',
  where: '',
  when: new Date().toISOString().split('T')[0],
  who: '',
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
}) => {
  const isEdit = item !== null;
  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    if (item) {
      setForm({
        what: item.what,
        why: item.why,
        where: item.where,
        when: item.when,
        who: item.who,
        how: item.how,
        status: item.status,
        urgency: item.urgency,
        notes: item.notes ?? '',
        empresa: item.empresa ?? '',
      });
    } else {
      setForm({
        ...emptyForm(),
        status: initialStatus ?? ItemStatus.ACTIVE,
        empresa: defaultEmpresa ?? '',
      });
    }
  }, [item, initialStatus, isOpen, defaultEmpresa]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Editar iniciativa' : 'Nova iniciativa'}
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              O quê?
            </label>
            <input
              type="text"
              value={form.what}
              onChange={(e) => update('what', e.target.value)}
              placeholder="Descrição da ação"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600"
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Por quê?
            </label>
            <textarea
              value={form.why}
              onChange={(e) => update('why', e.target.value)}
              placeholder="Justificativa estratégica"
              rows={2}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-300 placeholder:text-slate-500 outline-none focus:border-slate-600 resize-none"
            />
          </div>
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
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-slate-600"
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
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-slate-600"
                autoComplete="off"
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
          <div>
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Quem?
            </label>
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={form.who}
                onChange={(e) => update('who', e.target.value)}
                placeholder="Responsável"
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-slate-600"
              />
            </div>
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
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Status
            </label>
            <select
              value={form.status}
              onChange={(e) => update('status', e.target.value as ItemStatus)}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600 cursor-pointer"
            >
              {Object.values(ItemStatus).map((s) => (
                <option key={s} value={s} className="bg-slate-900">
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Urgência
            </label>
            <select
              value={form.urgency}
              onChange={(e) => update('urgency', e.target.value as UrgencyLevel)}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600 cursor-pointer"
            >
              {Object.values(UrgencyLevel).map((u) => (
                <option key={u} value={u} className="bg-slate-900">
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Como?
            </label>
            <textarea
              value={form.how}
              onChange={(e) => update('how', e.target.value)}
              placeholder="Plano de execução"
              rows={3}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-300 placeholder:text-slate-500 outline-none focus:border-slate-600 resize-none"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Notas
            </label>
            <div className="relative">
              <FileText size={14} className="absolute left-3 top-3 text-slate-500" />
              <textarea
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="Observações adicionais"
                rows={2}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-400 placeholder:text-slate-500 outline-none focus:border-slate-600 resize-none"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-4 py-2.5 min-h-[44px] text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors touch-manipulation"
          >
            {isEdit ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
