import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Calendar, Plus, Loader2, LogIn, LogOut, X, ExternalLink, RefreshCw } from 'lucide-react';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPES = 'https://www.googleapis.com/auth/calendar';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

interface GCalCalendar {
  id: string;
  summary: string;
  primary?: boolean;
  selected?: boolean;
  hidden?: boolean;
  timeZone?: string;
  backgroundColor?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  htmlLink?: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  expires_in?: number;
}

interface GoogleTokenClient {
  requestAccessToken: () => void;
}

export interface GoogleCalendarEventInput {
  title: string;
  description?: string;
  start: string | number | Date;
  end?: string | number | Date;
  allDay?: boolean;
}

export interface GoogleCalendarController {
  scriptLoaded: boolean;
  isConnected: boolean;
  calendars: GCalCalendar[];
  events: GoogleCalendarEvent[];
  embedUrl: string | null;
  frameKey: number;
  loading: boolean;
  creating: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  connect: () => void;
  disconnect: () => void;
  refresh: () => Promise<void>;
  createEvent: (event: GoogleCalendarEventInput) => Promise<GoogleCalendarEvent>;
  updateEvent: (eventId: string, event: GoogleCalendarEventInput) => Promise<GoogleCalendarEvent>;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (resp: GoogleTokenResponse) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

function toInputDefault(offsetMs: number): string {
  const d = new Date(Date.now() + offsetMs);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
}

function getEmbeddableCalendars(calendars: GCalCalendar[]): GCalCalendar[] {
  const visible = calendars.filter((calendar) => !calendar.hidden);
  const selected = visible.filter((calendar) => calendar.primary || calendar.selected);
  if (selected.length > 0) return selected.slice(0, 12);
  return visible.slice(0, 1);
}

function buildEmbedUrl(calendars: GCalCalendar[]): string | null {
  const embeddableCalendars = getEmbeddableCalendars(calendars);
  if (embeddableCalendars.length === 0) return null;

  const url = new URL('https://calendar.google.com/calendar/embed');
  url.searchParams.set('height', '680');
  url.searchParams.set('wkst', '1');
  url.searchParams.set('ctz', embeddableCalendars.find((calendar) => calendar.timeZone)?.timeZone ?? browserTimeZone());
  url.searchParams.set('bgcolor', '#ffffff');
  url.searchParams.set('showTitle', '0');
  url.searchParams.set('showPrint', '0');
  url.searchParams.set('showTz', '0');
  url.searchParams.set('showTabs', '1');
  url.searchParams.set('showCalendars', '1');
  url.searchParams.set('mode', 'WEEK');

  for (const calendar of embeddableCalendars) {
    url.searchParams.append('src', calendar.id);
    if (calendar.backgroundColor) {
      url.searchParams.append('color', calendar.backgroundColor);
    }
  }

  return url.toString();
}

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function toDateOnly(value: string | number | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = toDate(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildGoogleEventBody(event: GoogleCalendarEventInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    summary: event.title.trim(),
    ...(event.description?.trim() && { description: event.description.trim() }),
  };

  if (event.allDay) {
    const startDate = toDateOnly(event.start);
    const rawEndDate = event.end ? toDateOnly(event.end) : addDays(startDate, 1);
    const endDate = rawEndDate > startDate ? rawEndDate : addDays(startDate, 1);
    body.start = { date: startDate };
    body.end = { date: endDate };
    return body;
  }

  const start = toDate(event.start);
  const end = event.end ? toDate(event.end) : new Date(start.getTime() + 60 * 60 * 1000);
  const safeEnd = end.getTime() > start.getTime() ? end : new Date(start.getTime() + 60 * 60 * 1000);
  const tz = browserTimeZone();
  body.start = { dateTime: start.toISOString(), timeZone: tz };
  body.end = { dateTime: safeEnd.toISOString(), timeZone: tz };
  return body;
}

function eventWindow(): { timeMin: string; timeMax: string } {
  const min = new Date();
  min.setDate(1);
  min.setHours(0, 0, 0, 0);
  min.setDate(min.getDate() - 14);

  const max = new Date();
  max.setDate(max.getDate() + 180);
  max.setHours(23, 59, 59, 999);

  return { timeMin: min.toISOString(), timeMax: max.toISOString() };
}

export function useGoogleCalendar(): GoogleCalendarController {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [tokenExpiry, setTokenExpiry] = useState(0);
  const [calendars, setCalendars] = useState<GCalCalendar[]>([]);
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [frameKey, setFrameKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenClientRef = useRef<GoogleTokenClient | null>(null);

  useEffect(() => {
    if (document.getElementById('gsi-script')) {
      setScriptLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.id = 'gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => setError('Falha ao carregar autenticação Google.');
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!scriptLoaded) return;
    const tryInit = () => {
      if (!window.google?.accounts?.oauth2) return false;
      if (!CLIENT_ID) {
        setError('Cliente Google não configurado.');
        return true;
      }
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp) => {
          if (resp.error || !resp.access_token) {
            setError('Falha na autenticação: ' + (resp.error ?? 'token não recebido'));
            return;
          }
          setToken(resp.access_token);
          setTokenExpiry(Date.now() + (resp.expires_in ?? 3600) * 1000 - 60000);
          setError(null);
        },
      });
      return true;
    };
    if (!tryInit()) {
      const t = setTimeout(() => tryInit(), 500);
      return () => clearTimeout(t);
    }
  }, [scriptLoaded]);

  const fetchCalendars = useCallback(async (accessToken: string) => {
    const resp = await fetch(`${CALENDAR_API}/users/me/calendarList?minAccessRole=reader&maxResults=50`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (resp.status === 401) {
      setToken(null);
      throw new Error('Sessão expirada. Conecte novamente.');
    }
    if (!resp.ok) throw new Error(`Erro ${resp.status}`);
    const data = (await resp.json()) as { items?: GCalCalendar[] };
    setCalendars(data.items ?? []);
  }, []);

  const fetchEvents = useCallback(async (accessToken: string) => {
    const { timeMin, timeMax } = eventWindow();
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      maxResults: '250',
      singleEvents: 'true',
      orderBy: 'startTime',
    });
    const resp = await fetch(`${CALENDAR_API}/calendars/primary/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (resp.status === 401) {
      setToken(null);
      throw new Error('Sessão expirada. Conecte novamente.');
    }
    if (!resp.ok) throw new Error(`Erro ${resp.status}`);
    const data = (await resp.json()) as { items?: GoogleCalendarEvent[] };
    setEvents(data.items ?? []);
  }, []);

  const fetchGoogleData = useCallback(async (accessToken: string) => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchCalendars(accessToken), fetchEvents(accessToken)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar Google Calendar.');
    } finally {
      setLoading(false);
    }
  }, [fetchCalendars, fetchEvents]);

  useEffect(() => {
    if (token && Date.now() < tokenExpiry) {
      void fetchGoogleData(token);
    }
  }, [token, tokenExpiry, fetchGoogleData]);

  const connect = useCallback(() => {
    if (!CLIENT_ID) {
      setError('Cliente Google não configurado.');
      return;
    }
    if (!tokenClientRef.current) {
      setError('Autenticação não inicializada. Aguarde ou recarregue a página.');
      return;
    }
    tokenClientRef.current.requestAccessToken();
  }, []);

  const disconnect = useCallback(() => {
    setToken(null);
    setCalendars([]);
    setEvents([]);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    await fetchGoogleData(token);
    setFrameKey((current) => current + 1);
  }, [fetchGoogleData, token]);

  const createEvent = useCallback(async (event: GoogleCalendarEventInput) => {
    if (!token || Date.now() >= tokenExpiry) {
      throw new Error('Conecte o Google Calendar antes de salvar no Google.');
    }

    setCreating(true);
    setError(null);
    try {
      const resp = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildGoogleEventBody(event)),
      });
      if (resp.status === 401) {
        setToken(null);
        throw new Error('Sessão expirada. Conecte novamente.');
      }
      if (!resp.ok) throw new Error(`Erro ${resp.status}`);
      const created = (await resp.json()) as GoogleCalendarEvent;
      await fetchGoogleData(token);
      setFrameKey((current) => current + 1);
      return created;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro ao criar evento.';
      setError(message);
      throw e;
    } finally {
      setCreating(false);
    }
  }, [fetchGoogleData, token, tokenExpiry]);

  const updateEvent = useCallback(async (eventId: string, event: GoogleCalendarEventInput) => {
    if (!token || Date.now() >= tokenExpiry) {
      throw new Error('Conecte o Google Calendar antes de editar no Google.');
    }

    setCreating(true);
    setError(null);
    try {
      const resp = await fetch(`${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildGoogleEventBody(event)),
      });
      if (resp.status === 401) {
        setToken(null);
        throw new Error('Sessão expirada. Conecte novamente.');
      }
      if (!resp.ok) throw new Error(`Erro ${resp.status}`);
      const updated = (await resp.json()) as GoogleCalendarEvent;
      await fetchGoogleData(token);
      setFrameKey((current) => current + 1);
      return updated;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro ao editar evento.';
      setError(message);
      throw e;
    } finally {
      setCreating(false);
    }
  }, [fetchGoogleData, token, tokenExpiry]);

  const isConnected = !!token && Date.now() < tokenExpiry;
  const embedUrl = useMemo(() => buildEmbedUrl(calendars), [calendars]);

  return {
    scriptLoaded,
    isConnected,
    calendars,
    events,
    embedUrl,
    frameKey,
    loading,
    creating,
    error,
    setError,
    connect,
    disconnect,
    refresh,
    createEvent,
    updateEvent,
  };
}

interface GoogleCalendarPanelProps {
  calendar: GoogleCalendarController;
}

export const GoogleCalendarPanel: React.FC<GoogleCalendarPanelProps> = ({ calendar }) => {
  const [showForm, setShowForm] = useState(false);
  const [evtTitle, setEvtTitle] = useState('');
  const [evtStart, setEvtStart] = useState(() => toInputDefault(3600000));
  const [evtEnd, setEvtEnd] = useState(() => toInputDefault(7200000));
  const [evtDesc, setEvtDesc] = useState('');
  const [evtAllDay, setEvtAllDay] = useState(false);

  const handleDisconnect = () => {
    calendar.disconnect();
    setShowForm(false);
  };

  const handleCreateEvent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!evtTitle.trim()) return;
    try {
      await calendar.createEvent({
        title: evtTitle,
        description: evtDesc,
        start: evtStart,
        end: evtEnd,
        allDay: evtAllDay,
      });
      setShowForm(false);
      setEvtTitle('');
      setEvtDesc('');
      setEvtAllDay(false);
      setEvtStart(toInputDefault(3600000));
      setEvtEnd(toInputDefault(7200000));
    } catch {
      return;
    }
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-blue-400" />
          <span className="text-sm font-semibold text-slate-100">Google Calendar</span>
          {calendar.isConnected && (
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full px-2 py-0.5 font-medium">
              Conectado
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {calendar.isConnected ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setShowForm((v) => !v);
                  setEvtStart(toInputDefault(3600000));
                  setEvtEnd(toInputDefault(7200000));
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
              >
                <Plus size={13} /> Novo evento
              </button>
              <button
                type="button"
                onClick={() => void calendar.refresh()}
                disabled={calendar.loading}
                className="px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 text-sm transition-colors disabled:opacity-50"
                title="Atualizar"
              >
                <RefreshCw size={13} className={calendar.loading ? 'animate-spin' : undefined} />
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-red-300 hover:border-red-500/30 text-xs transition-colors"
                title="Desconectar"
              >
                <LogOut size={12} />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={calendar.connect}
              disabled={!calendar.scriptLoaded}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
            >
              <LogIn size={13} /> Conectar Google
            </button>
          )}
          <a
            href="https://calendar.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-slate-300 transition-colors"
            title="Abrir no Google Calendar"
          >
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

      {showForm && calendar.isConnected && (
        <form onSubmit={handleCreateEvent} className="px-4 py-4 border-b border-slate-800 space-y-3 bg-slate-950/40">
          <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Novo evento</p>
          <input
            type="text"
            placeholder="Título *"
            value={evtTitle}
            onChange={(e) => setEvtTitle(e.target.value)}
            required
            autoFocus
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 placeholder:text-slate-500"
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={evtAllDay}
              onChange={(e) => setEvtAllDay(e.target.checked)}
              className="accent-blue-500"
            />
            <span className="text-xs text-slate-400">Dia inteiro</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Início</label>
              <input
                type={evtAllDay ? 'date' : 'datetime-local'}
                value={evtAllDay ? evtStart.substring(0, 10) : evtStart}
                onChange={(e) => setEvtStart(e.target.value)}
                required
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Fim</label>
              <input
                type={evtAllDay ? 'date' : 'datetime-local'}
                value={evtAllDay ? evtEnd.substring(0, 10) : evtEnd}
                onChange={(e) => setEvtEnd(e.target.value)}
                required
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <textarea
            placeholder="Descrição (opcional)"
            value={evtDesc}
            onChange={(e) => setEvtDesc(e.target.value)}
            rows={2}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 resize-none placeholder:text-slate-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={calendar.creating || !evtTitle.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {calendar.creating && <Loader2 size={14} className="animate-spin" />}
              Criar evento
            </button>
          </div>
        </form>
      )}

      <div className="px-4 py-4 min-h-[160px]">
        {calendar.error && (
          <div className="flex items-start justify-between rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 mb-4 gap-2">
            <p className="text-xs text-red-300">{calendar.error}</p>
            <button type="button" onClick={() => calendar.setError(null)} className="shrink-0 text-red-400 hover:text-red-200">
              <X size={13} />
            </button>
          </div>
        )}

        {!calendar.isConnected && !calendar.loading && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Calendar size={32} className="text-slate-600" />
            <p className="text-sm text-slate-400">Conecte sua conta Google para abrir sua agenda aqui.</p>
            <button
              type="button"
              onClick={calendar.connect}
              disabled={!calendar.scriptLoaded}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {!calendar.scriptLoaded ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
              {calendar.scriptLoaded ? 'Entrar com Google' : 'Carregando...'}
            </button>
          </div>
        )}

        {calendar.isConnected && calendar.loading && !calendar.embedUrl && (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="text-slate-400 animate-spin" />
          </div>
        )}

        {calendar.isConnected && !calendar.loading && !calendar.embedUrl && (
          <p className="text-sm text-slate-500 text-center py-8">Nenhum calendário disponível na conta conectada.</p>
        )}

        {calendar.isConnected && calendar.embedUrl && (
          <div className="relative h-[560px] overflow-hidden rounded-lg border border-slate-800 bg-white sm:h-[680px]">
            {calendar.loading && (
              <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
                <Loader2 size={13} className="animate-spin" />
                Atualizando
              </div>
            )}
            <iframe
              key={`${calendar.frameKey}-${calendar.embedUrl}`}
              title="Google Calendar"
              src={calendar.embedUrl}
              className="h-full w-full border-0"
              loading="lazy"
            />
          </div>
        )}
      </div>
    </div>
  );
};
