import React, { useState, useMemo } from 'react';
import { Plus, Trash2, CalendarDays, Clock, ChevronRight } from 'lucide-react';
import type { AgendaItem, AgendaStatus } from '../../types';

interface AgendaViewProps {
  items: AgendaItem[];
  loading: boolean;
  onAdd: (item: Omit<AgendaItem, 'id' | 'status' | 'created_at'>) => void;
  onCycleStatus: (id: string) => void;
  onDelete: (id: string) => void;
}

const STATUS_CFG: Record<AgendaStatus, { label: string; cls: string; dot: string }> = {
  pendente:     { label: 'Pendente',     cls: 'text-slate-400 bg-slate-700/60 border-slate-600',   dot: 'bg-slate-400' },
  em_andamento: { label: 'Em andamento', cls: 'text-blue-300 bg-blue-500/10 border-blue-500/30',   dot: 'bg-blue-400 animate-pulse' },
  concluido:    { label: 'Concluído',    cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400' },
};

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short',
  });
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit',
  });
}

function toLocalISOString(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function isToday(ts: number): boolean { return dayKey(ts) === dayKey(Date.now()); }
function isTomorrow(ts: number): boolean { return dayKey(ts) === dayKey(Date.now() + 86400000); }
function isPast(ts: number): boolean { return ts < Date.now() && !isToday(ts); }

function dayLabel(ts: number): string {
  if (isToday(ts)) return 'Hoje';
  if (isTomorrow(ts)) return 'Amanhã';
  return fmtDate(ts);
}

type Tab = 'pendente' | 'em_andamento' | 'concluido';

export const AgendaView: React.FC<AgendaViewProps> = ({
  items, loading, onAdd, onCycleStatus, onDelete,
}) => {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataHora, setDataHora] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return toLocalISOString(d.getTime());
  });
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<Tab>('pendente');

  const byStatus = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.data_hora - b.data_hora);
    return {
      pendente:     sorted.filter((i) => i.status === 'pendente'),
      em_andamento: sorted.filter((i) => i.status === 'em_andamento'),
      concluido:    sorted.filter((i) => i.status === 'concluido').reverse(),
    };
  }, [items]);

  const activeItems = byStatus[tab];

  const grouped = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const item of (tab !== 'concluido' ? activeItems : [])) {
      const k = dayKey(item.data_hora);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(item);
    }
    return map;
  }, [activeItems, tab]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !dataHora) return;
    onAdd({ titulo: titulo.trim(), descricao: descricao.trim() || undefined, data_hora: new Date(dataHora).getTime() });
    setTitulo('');
    setDescricao('');
    setShowForm(false);
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'pendente',     label: `Pendente (${byStatus.pendente.length})` },
    { id: 'em_andamento', label: `Em andamento (${byStatus.em_andamento.length})` },
    { id: 'concluido',    label: `Concluído (${byStatus.concluido.length})` },
  ];

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays size={20} className="text-blue-400" />
          <h1 className="text-xl font-bold text-slate-100">Minha Agenda</h1>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          <Plus size={15} /> Novo evento
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
            placeholder="Título do evento *"
            autoFocus
            required
          />
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 resize-none"
            placeholder="Anotação / descrição (opcional)"
            rows={2}
          />
          <input
            type="datetime-local"
            value={dataHora}
            onChange={(e) => setDataHora(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
            required
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(false)}
              className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm">
              Cancelar
            </button>
            <button type="submit"
              className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">
              Salvar
            </button>
          </div>
        </form>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === t.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && items.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-8">Carregando...</p>
      )}

      {/* Pendente / Em andamento — agrupados por dia */}
      {tab !== 'concluido' && (
        <div className="space-y-6">
          {grouped.size === 0 && !loading && (
            <div className="text-center py-12 text-slate-500">
              <CalendarDays size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum evento neste status.</p>
            </div>
          )}
          {Array.from(grouped.entries()).map(([key, dayItems]) => {
            const ts = dayItems[0].data_hora;
            return (
              <div key={key}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-semibold uppercase tracking-wider ${
                    isToday(ts) ? 'text-blue-400' : isPast(ts) ? 'text-red-400' : 'text-slate-400'
                  }`}>
                    {dayLabel(ts)}
                  </span>
                  <div className="flex-1 h-px bg-slate-800" />
                </div>
                <div className="space-y-2">
                  {dayItems.map((item) => (
                    <AgendaCard key={item.id} item={item} onCycleStatus={onCycleStatus} onDelete={onDelete} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Concluídos — lista simples */}
      {tab === 'concluido' && (
        <div className="space-y-2">
          {activeItems.length === 0 && !loading && (
            <p className="text-center text-sm text-slate-500 py-8">Nenhum evento concluído.</p>
          )}
          {activeItems.map((item) => (
            <AgendaCard key={item.id} item={item} onCycleStatus={onCycleStatus} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
};

interface AgendaCardProps {
  item: AgendaItem;
  onCycleStatus: (id: string) => void;
  onDelete: (id: string) => void;
}

const AgendaCard: React.FC<AgendaCardProps> = ({ item, onCycleStatus, onDelete }) => {
  const overdue = item.status !== 'concluido' && isPast(item.data_hora);
  const cfg = STATUS_CFG[item.status] ?? STATUS_CFG.pendente;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
      item.status === 'concluido'
        ? 'bg-slate-800/30 border-slate-800/60 opacity-60'
        : overdue
          ? 'bg-red-900/10 border-red-800/30'
          : 'bg-slate-800/50 border-slate-700/60 hover:border-slate-600'
    }`}>
      {/* Status badge clicável */}
      <button
        type="button"
        onClick={() => onCycleStatus(item.id)}
        title="Clique para avançar o status"
        className={`mt-0.5 shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-all hover:opacity-80 ${cfg.cls}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
        <ChevronRight size={10} />
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${item.status === 'concluido' ? 'line-through text-slate-400' : 'text-slate-100'}`}>
          {item.titulo}
        </p>
        {item.descricao && (
          <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">{item.descricao}</p>
        )}
        <div className="flex items-center gap-1.5 mt-1">
          <Clock size={11} className={overdue ? 'text-red-400' : 'text-slate-600'} />
          <span className={`text-[11px] ${overdue ? 'text-red-400' : 'text-slate-500'}`}>
            {fmtTime(item.data_hora)}
            {!isToday(item.data_hora) && !isTomorrow(item.data_hora) && (
              <span className="ml-1">· {fmtDate(item.data_hora)}</span>
            )}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDelete(item.id)}
        className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
};
