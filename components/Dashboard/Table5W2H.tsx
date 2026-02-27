
import React, { useMemo, useState, useEffect } from 'react';
import { ActionItem, ItemStatus, UrgencyLevel } from '../../types';
import { formatDateOnlyPtBr } from '../../utils/date';
import { Trash2, Pencil, ShieldAlert, Calendar, User, Info, MapPin, FileText, ChevronDown, ChevronRight, CheckCircle } from 'lucide-react';

interface Table5W2HProps {
  items: ActionItem[];
  onUpdate: (id: string, data: Partial<ActionItem>) => void;
  onDelete: (id: string) => void;
  onEditItem?: (item: ActionItem) => void;
  /** Quando true, força abrir a seção de concluidos. */
  forceOpenConcluidos?: boolean;
  /** Sugestões de empresas/workspaces já cadastrados */
  empresaSuggestions?: string[];
}

export const Table5W2H: React.FC<Table5W2HProps> = ({
  items,
  onUpdate,
  onDelete,
  onEditItem,
  forceOpenConcluidos,
  empresaSuggestions,
}) => {
  const [concluidosOpen, setConcluidosOpen] = useState(false);

  useEffect(() => {
    if (forceOpenConcluidos) {
      setConcluidosOpen(true);
    }
  }, [forceOpenConcluidos]);

  const { activeItems, completedItems } = useMemo(() => {
    const completed = items.filter((i) => i.status === ItemStatus.COMPLETED);
    const active = items.filter((i) => i.status !== ItemStatus.COMPLETED);
    completed.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return { activeItems: active, completedItems: completed };
  }, [items]);

  return (
    <div className="space-y-6">
      <div className="w-full overflow-x-auto overflow-touch rounded-lg border border-slate-800 bg-slate-900/50 -mx-1 px-1 max-lg:scroll-px-2">
      <table className="w-full text-left border-collapse min-w-[1400px]">
        <thead>
          <tr className="bg-slate-900/80 text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
            <th className="px-4 py-3 font-semibold">O quê?</th>
            <th className="px-4 py-3 font-semibold">Por quê?</th>
            <th className="px-4 py-3 font-semibold">Onde?</th>
            <th className="px-4 py-3 font-semibold">Empresa</th>
            <th className="px-4 py-3 font-semibold">Quem?</th>
            <th className="px-4 py-3 font-semibold">Quando?</th>
            <th className="px-4 py-3 font-semibold">Como?</th>
            <th className="px-4 py-3 font-semibold">Urgência</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Notas</th>
            <th className="px-4 py-3 font-semibold text-center w-20">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {activeItems.map(item => (
            <tr key={`${item.id}-${item.updatedAt}`} className="hover:bg-slate-800/30 transition-colors group">
              <td className="px-4 py-3 min-w-[200px]">
                <div className="flex flex-col gap-1">
                  <input 
                    defaultValue={item.what}
                    onBlur={(e) => onUpdate(item.id, { what: e.target.value })}
                    className="bg-transparent border-b border-transparent focus:border-slate-500 rounded-none p-0 text-sm font-medium w-full text-slate-100 outline-none transition-colors placeholder:text-slate-600"
                    placeholder="Descrição..."
                  />
                  <div className="flex items-center gap-1 text-slate-500 text-[10px]">
                    <Info size={10} />
                    <span>{item.id.slice(0,8)}</span>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 min-w-[180px]">
                <textarea 
                  defaultValue={item.why}
                  onBlur={(e) => onUpdate(item.id, { why: e.target.value })}
                  rows={2}
                  className="bg-slate-800/30 border border-transparent focus:border-slate-600 focus:bg-slate-800/50 rounded p-2 text-xs text-slate-300 w-full outline-none resize-none transition-colors placeholder:text-slate-600"
                  placeholder="Justificativa..."
                />
              </td>
              <td className="px-4 py-3 min-w-[120px]">
                <div className="relative">
                  <MapPin size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input 
                    defaultValue={item.where}
                    onBlur={(e) => onUpdate(item.id, { where: e.target.value })}
                    className="bg-slate-800/30 border border-transparent focus:border-slate-600 rounded py-2 pl-8 pr-2 text-xs font-medium text-slate-200 w-full outline-none transition-colors"
                    placeholder="Onde..."
                  />
                </div>
              </td>
              <td className="px-4 py-3 min-w-[160px]">
                {(() => {
                  const listId = `empresa-matriz-${item.id}`;
                  return (
                    <>
                      <input
                        list={listId}
                        defaultValue={item.empresa ?? ''}
                        onBlur={(e) => onUpdate(item.id, { empresa: e.target.value })}
                        className="bg-slate-800/30 border border-transparent focus:border-slate-600 rounded py-2 px-3 text-xs font-medium text-slate-200 w-full outline-none transition-colors placeholder:text-slate-600"
                        placeholder="Cliente / unidade / grupo"
                      />
                      {empresaSuggestions && empresaSuggestions.length > 0 && (
                        <datalist id={listId}>
                          {empresaSuggestions.map((nome) => (
                            <option key={nome} value={nome} />
                          ))}
                        </datalist>
                      )}
                    </>
                  );
                })()}
              </td>
              <td className="px-4 py-3 min-w-[100px]">
                <div className="relative">
                  <User size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input 
                    defaultValue={item.who}
                    onBlur={(e) => onUpdate(item.id, { who: e.target.value })}
                    className="bg-slate-800/30 border border-transparent focus:border-slate-600 rounded py-2 pl-8 pr-2 text-xs font-medium text-slate-200 w-full outline-none transition-colors"
                    placeholder="Responsável"
                  />
                </div>
              </td>
              <td className="px-4 py-3 min-w-[110px]">
                <div className="relative">
                  <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input 
                    type="date"
                    defaultValue={item.when}
                    onChange={(e) => onUpdate(item.id, { when: e.target.value })}
                    className="bg-slate-800/30 border border-transparent focus:border-slate-600 rounded py-2 pl-8 pr-2 text-xs font-medium text-slate-200 w-full outline-none transition-colors appearance-none cursor-pointer"
                  />
                </div>
              </td>
              <td className="px-4 py-3 min-w-[180px]">
                <textarea 
                  defaultValue={item.how}
                  onBlur={(e) => onUpdate(item.id, { how: e.target.value })}
                  rows={2}
                  className="bg-slate-800/30 border border-transparent focus:border-slate-600 focus:bg-slate-800/50 rounded p-2 text-xs text-slate-400 w-full outline-none resize-none transition-colors placeholder:text-slate-600"
                  placeholder="Plano de execução..."
                />
              </td>
              <td className="px-4 py-3 min-w-[100px]">
                <select
                  value={item.urgency}
                  onChange={(e) => onUpdate(item.id, { urgency: e.target.value as UrgencyLevel })}
                  className="bg-slate-800/50 border border-slate-700 text-xs font-medium rounded py-2 px-2 outline-none text-slate-200 focus:border-slate-500 w-full cursor-pointer"
                >
                  {Object.values(UrgencyLevel).map(u => <option key={u} value={u} className="bg-slate-900">{u}</option>)}
                </select>
              </td>
              <td className="px-4 py-3 min-w-[130px]">
                <select
                  value={item.status}
                  onChange={(e) => onUpdate(item.id, { status: e.target.value as ItemStatus })}
                  className="bg-slate-800/50 border border-slate-700 text-xs font-medium rounded py-2 px-2 outline-none text-slate-200 focus:border-slate-500 w-full cursor-pointer"
                >
                  {Object.values(ItemStatus).map(s => <option key={s} value={s} className="bg-slate-900">{s}</option>)}
                </select>
              </td>
              <td className="px-4 py-3 min-w-[160px]">
                <div className="relative">
                  <FileText size={12} className="absolute left-2.5 top-2.5 text-slate-500" />
                  <textarea 
                    defaultValue={item.notes ?? ''}
                    onBlur={(e) => onUpdate(item.id, { notes: e.target.value })}
                    rows={2}
                    className="bg-slate-800/30 border border-transparent focus:border-slate-600 focus:bg-slate-800/50 rounded p-2 pl-8 text-xs text-slate-400 w-full outline-none resize-none transition-colors placeholder:text-slate-600"
                    placeholder="Notas..."
                  />
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-center gap-1">
                  {onEditItem && (
                    <button
                      type="button"
                      onClick={() => onEditItem(item)}
                      className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                      title="Abrir para editar"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  <button 
                    type="button"
                    onClick={() => onDelete(item.id)}
                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                    title="Excluir"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {activeItems.length === 0 && (
        <div className="py-16 text-center flex flex-col items-center gap-4">
          <div className="p-4 bg-slate-800/50 rounded-full">
            <ShieldAlert size={32} className="text-slate-600" />
          </div>
          <p className="text-slate-400 text-sm font-medium">Nenhum item em andamento. Use &quot;Nova Iniciativa&quot; ou abra um concluído para reativar.</p>
        </div>
      )}
      </div>

      {/* Concluídos: abrir para ver detalhes e editar */}
      {completedItems.length > 0 && (
        <section className="bg-slate-900/30 border border-slate-800/80 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setConcluidosOpen((o) => !o)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-2 text-slate-400">
              {concluidosOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <CheckCircle size={16} className="text-emerald-500/80" />
              <span className="text-sm font-medium text-slate-300">Concluídos</span>
              <span className="text-[11px] text-slate-500">— abrir para ver detalhes e editar</span>
            </div>
            <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded tabular-nums">
              {completedItems.length}
            </span>
          </button>
          {concluidosOpen && (
            <div className="border-t border-slate-800/80 overflow-x-auto overflow-touch">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-800/80 bg-slate-900/60">
                    <th className="px-3 py-2.5 font-semibold">O quê?</th>
                    <th className="px-3 py-2.5 font-semibold">Quem / Quando</th>
                    <th className="px-3 py-2.5 font-semibold text-right w-24">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {completedItems.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-3 py-2.5 text-sm font-medium text-slate-200">
                        {item.what || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500">
                        {item.who || '—'} · {item.when ? formatDateOnlyPtBr(item.when) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {onEditItem && (
                          <button
                            type="button"
                            onClick={() => onEditItem(item)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                          >
                            <Pencil size={12} />
                            Abrir detalhes
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDelete(item.id)}
                          className="ml-1 p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={14} />
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
