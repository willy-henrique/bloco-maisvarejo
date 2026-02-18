/**
 * Fase 3: Alertas de prazo — vencida ou vence em N dias.
 */

const DIAS_ALERTA = 7;

/**
 * Retorna 'vencida' se a data já passou, 'vence-em-N' se vence em até DIAS_ALERTA dias, ou null.
 */
export function getPrazoAlerta(
  dataStr: string | undefined,
  diasAlerta: number = DIAS_ALERTA
): 'vencida' | string | null {
  if (!dataStr) return null;
  const data = new Date(dataStr);
  if (isNaN(data.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  data.setHours(0, 0, 0, 0);
  const diffMs = data.getTime() - hoje.getTime();
  const diffDias = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (diffDias < 0) return 'vencida';
  if (diffDias <= diasAlerta) return diffDias === 0 ? 'vence-hoje' : `vence-em-${diffDias}`;
  return null;
}

/**
 * Label curto para exibição (ex: "Vencida", "Vence em 3 dias").
 */
export function getPrazoAlertaLabel(
  dataStr: string | undefined,
  diasAlerta: number = DIAS_ALERTA
): string | null {
  const alerta = getPrazoAlerta(dataStr, diasAlerta);
  if (!alerta) return null;
  if (alerta === 'vencida') return 'Vencida';
  if (alerta === 'vence-hoje') return 'Vence hoje';
  const n = alerta.replace('vence-em-', '');
  return `Vence em ${n} dia${n === '1' ? '' : 's'}`;
}

export { DIAS_ALERTA };
