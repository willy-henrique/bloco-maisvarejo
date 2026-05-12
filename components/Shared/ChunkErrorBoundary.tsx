/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';

function isChunkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Load failed')
  );
}

interface State { hasError: boolean }

// Error boundary para capturar falha de lazy-load quando o Vite reinicia
export class ChunkErrorBoundary extends (React.Component as any) {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: isChunkError(error) };
  }

  componentDidCatch(error: unknown) {
    if (isChunkError(error)) window.location.reload();
  }

  render() {
    if ((this as any).state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-slate-950 text-slate-400 text-sm">
          <p>Reconectando ao servidor...</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
          >
            Recarregar
          </button>
        </div>
      );
    }
    return (this as any).props?.children ?? null;
  }
}
