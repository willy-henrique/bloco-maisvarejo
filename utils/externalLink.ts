export function toExternalHttpUrl(raw: string | undefined | null): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

