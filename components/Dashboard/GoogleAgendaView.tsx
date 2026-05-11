import React, { useMemo, useState } from 'react';
import { CalendarDays, ExternalLink, RefreshCw } from 'lucide-react';

const DEFAULT_GOOGLE_CALENDAR_URL = 'https://calendar.google.com/calendar/u/0/r';

type EnvKey = 'VITE_GOOGLE_CALENDAR_URL' | 'VITE_GOOGLE_CALENDAR_EMBED_URL';

function getEnvValue(key: EnvKey): string {
  return ((import.meta.env[key] as string | undefined) ?? '').trim();
}

function buildDefaultEmbedUrl(): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  const params = new URLSearchParams({
    src: 'primary',
    ctz: timeZone,
    mode: 'WEEK',
    showTitle: '0',
    showPrint: '0',
    showTabs: '1',
    showCalendars: '1',
    showTz: '1',
  });

  return `https://calendar.google.com/calendar/embed?${params.toString()}`;
}

export const GoogleAgendaView: React.FC = () => {
  const calendarUrl = getEnvValue('VITE_GOOGLE_CALENDAR_URL') || DEFAULT_GOOGLE_CALENDAR_URL;
  const embedUrl = getEnvValue('VITE_GOOGLE_CALENDAR_EMBED_URL') || buildDefaultEmbedUrl();
  const [reloadKey, setReloadKey] = useState(0);
  const iframeSrc = useMemo(() => {
    const separator = embedUrl.includes('?') ? '&' : '?';
    return `${embedUrl}${separator}mavoReload=${reloadKey}`;
  }, [embedUrl, reloadKey]);

  return (
    <div className="h-full min-h-[calc(100vh-7rem)] flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-blue-600/15 text-blue-400 flex items-center justify-center border border-blue-500/20 shrink-0">
            <CalendarDays size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-100 truncate">Google Agenda</h1>
            <p className="text-xs text-slate-500 truncate">
              Visualização integrada da agenda Google do usuário logado no navegador.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setReloadKey((v) => v + 1)}
            className="inline-flex items-center justify-center gap-2 px-3 py-2.5 min-h-[40px] rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 text-sm font-medium transition-colors"
          >
            <RefreshCw size={15} />
            Recarregar
          </button>
          <a
            href={calendarUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 px-3 py-2.5 min-h-[40px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors shrink-0"
          >
            <ExternalLink size={15} />
            Abrir Google Agenda
          </a>
        </div>
      </div>

      <iframe
        key={reloadKey}
        title="Google Agenda"
        src={iframeSrc}
        className="w-full flex-1 min-h-[620px] rounded-lg border border-slate-800 bg-white"
        loading="lazy"
      />
    </div>
  );
};
