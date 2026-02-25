/**
 * Formata string de data apenas (YYYY-MM-DD) para exibição em pt-BR (DD/MM/YYYY)
 * sem deslocamento de fuso: new Date("2026-02-25") é meia-noite UTC e vira 24/02 no Brasil.
 */
export function formatDateOnlyPtBr(dateStr: string | undefined): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

/**
 * Formata timestamp (ms) para data em pt-BR (DD/MM/YYYY) usando fuso local.
 */
export function formatTimestampPtBr(ms: number | undefined): string {
  if (ms == null || typeof ms !== 'number') return '';
  return new Date(ms).toLocaleDateString('pt-BR');
}
