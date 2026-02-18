import React, { useState, useEffect } from 'react';
import { PlanoDeAtaque, StatusPlano } from '../../types';
import { Modal } from '../Shared/Modal';
import { User, Calendar, MapPin, FileText } from 'lucide-react';

interface PlanoModalProps {
  isOpen: boolean;
  onClose: () => void;
  prioridadeId: string;
  item: PlanoDeAtaque | null;
  onSave: (data: Omit<PlanoDeAtaque, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (id: string, data: Partial<PlanoDeAtaque>) => void;
}

const emptyForm = (prioridadeId: string): Omit<PlanoDeAtaque, 'id' | 'createdAt' | 'updatedAt'> => ({
  prioridade_id: prioridadeId,
  titulo: '',
  what: '',
  why: '',
  who_id: '',
  when_inicio: new Date().toISOString().split('T')[0],
  when_fim: new Date().toISOString().split('T')[0],
  how: '',
  status_plano: StatusPlano.EXECUCAO,
});

export const PlanoModal: React.FC<PlanoModalProps> = ({
  isOpen,
  onClose,
  prioridadeId,
  item,
  onSave,
  onUpdate,
}) => {
  const isEdit = item !== null;
  const [form, setForm] = useState(() => emptyForm(prioridadeId));

  useEffect(() => {
    if (item) {
      setForm({
        prioridade_id: item.prioridade_id,
        titulo: item.titulo,
        what: item.what,
        why: item.why,
        who_id: item.who_id,
        where: item.where,
        when_inicio: item.when_inicio,
        when_fim: item.when_fim,
        how: item.how,
        how_much: item.how_much,
        status_plano: item.status_plano,
      });
    } else {
      setForm(emptyForm(prioridadeId));
    }
  }, [item, prioridadeId, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit && item) {
      onUpdate(item.id, { ...form });
    } else {
      onSave(form);
    }
    onClose();
  };

  const update = (field: keyof typeof form, value: string | StatusPlano | undefined) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Editar plano de ataque' : 'Novo plano de ataque'}
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Título do eixo
            </label>
            <input
              type="text"
              value={form.titulo}
              onChange={(e) => update('titulo', e.target.value)}
              placeholder="Eixo de ação"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600"
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              O quê?
            </label>
            <input
              type="text"
              value={form.what}
              onChange={(e) => update('what', e.target.value)}
              placeholder="O que será feito"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-slate-600"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Por quê?
            </label>
            <textarea
              value={form.why}
              onChange={(e) => update('why', e.target.value)}
              placeholder="Justificativa"
              rows={2}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-300 resize-none outline-none focus:border-slate-600"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Quem? (dono do plano)
            </label>
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={form.who_id}
                onChange={(e) => update('who_id', e.target.value)}
                placeholder="Responsável"
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Onde? (opcional)
            </label>
            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={form.where ?? ''}
                onChange={(e) => update('where', e.target.value || undefined)}
                placeholder="Local / setor"
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Quando início
            </label>
            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="date"
                value={form.when_inicio}
                onChange={(e) => update('when_inicio', e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Quando fim
            </label>
            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="date"
                value={form.when_fim}
                onChange={(e) => update('when_fim', e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Status
            </label>
            <select
              value={form.status_plano}
              onChange={(e) => update('status_plano', e.target.value as StatusPlano)}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600 cursor-pointer"
            >
              {Object.values(StatusPlano).map((s) => (
                <option key={s} value={s} className="bg-slate-900">
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Como? (estratégia do eixo — não liste tarefas aqui)
            </label>
            <textarea
              value={form.how}
              onChange={(e) => update('how', e.target.value)}
              placeholder="Descrição estratégica do eixo"
              rows={3}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-300 resize-none outline-none focus:border-slate-600"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Quanto? (opcional)
            </label>
            <div className="relative">
              <FileText size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={form.how_much ?? ''}
                onChange={(e) => update('how_much', e.target.value || undefined)}
                placeholder="Custo / esforço estimado"
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600"
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
