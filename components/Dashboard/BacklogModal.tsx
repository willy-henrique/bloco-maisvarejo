import React, { useState, useEffect } from 'react';
import { BacklogItem, BacklogStatus } from '../../types';
import { Modal } from '../Shared/Modal';

interface BacklogModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: BacklogItem | null;
  onSave: (data: Omit<BacklogItem, 'id'>) => void;
  onUpdate: (id: string, data: Partial<BacklogItem>) => void;
}

const emptyForm = (): Omit<BacklogItem, 'id'> => ({
  titulo: '',
  descricao: '',
  origem: '',
  data_criacao: Date.now(),
  status_backlog: BacklogStatus.ABERTO,
});

export const BacklogModal: React.FC<BacklogModalProps> = ({
  isOpen,
  onClose,
  item,
  onSave,
  onUpdate,
}) => {
  const isEdit = item !== null;
  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    if (item) {
      setForm({
        titulo: item.titulo,
        descricao: item.descricao,
        origem: item.origem,
        data_criacao: item.data_criacao,
        prioridade_sugerida: item.prioridade_sugerida,
        status_backlog: item.status_backlog,
      });
    } else {
      setForm({ ...emptyForm(), data_criacao: Date.now() });
    }
  }, [item, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit && item) {
      onUpdate(item.id, { ...form });
    } else {
      onSave(form);
    }
    onClose();
  };

  const update = (field: keyof typeof form, value: string | number | BacklogStatus | undefined) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Editar item do backlog' : 'Novo item no backlog'}
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Título
            </label>
            <input
              type="text"
              value={form.titulo}
              onChange={(e) => update('titulo', e.target.value)}
              placeholder="Demanda ou ideia"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600"
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Descrição
            </label>
            <textarea
              value={form.descricao}
              onChange={(e) => update('descricao', e.target.value)}
              placeholder="Detalhe da demanda"
              rows={2}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-300 placeholder:text-slate-500 outline-none focus:border-slate-600 resize-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Origem
            </label>
            <input
              type="text"
              value={form.origem}
              onChange={(e) => update('origem', e.target.value)}
              placeholder="cliente, interno, parceiro..."
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Status
            </label>
            <select
              value={form.status_backlog}
              onChange={(e) => update('status_backlog', e.target.value as BacklogStatus)}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600 cursor-pointer"
            >
              {Object.values(BacklogStatus).map((s) => (
                <option key={s} value={s} className="bg-slate-900">
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Prioridade sugerida (opcional)
            </label>
            <input
              type="text"
              value={form.prioridade_sugerida ?? ''}
              onChange={(e) => update('prioridade_sugerida', e.target.value || undefined)}
              placeholder="Ex.: alta, média"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600"
            />
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
