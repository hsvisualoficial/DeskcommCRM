/**
 * SLA de atendimento (EPIC-SDR wave 3).
 *
 * Mede o tempo desde a última mensagem do cliente (inbound) que ainda NÃO foi
 * respondida pelo atendente (outbound). Se a última resposta é mais recente que
 * a última mensagem do cliente, não há SLA pendente.
 *
 *   < 5 min   → normal (sem alerta)
 *   5–15 min  → atenção (amarelo ⚠️)
 *   > 15 min  → estagnado (vermelho 🚨)
 */
export type SlaLevel = "none" | "warn" | "stale";

export interface SlaState {
  level: SlaLevel;
  minutes: number;
}

export const SLA_WARN_MIN = 5;
export const SLA_STALE_MIN = 15;

export function computeSla(
  lastInboundAt: string | null | undefined,
  lastOutboundAt: string | null | undefined,
  nowMs: number,
): SlaState {
  if (!lastInboundAt) return { level: "none", minutes: 0 };
  const inbound = new Date(lastInboundAt).getTime();
  if (Number.isNaN(inbound)) return { level: "none", minutes: 0 };
  const outbound = lastOutboundAt ? new Date(lastOutboundAt).getTime() : 0;

  // Já respondido: a última resposta é igual/mais recente que a última entrada.
  if (outbound >= inbound) return { level: "none", minutes: 0 };

  const minutes = Math.max(0, Math.floor((nowMs - inbound) / 60_000));
  if (minutes < SLA_WARN_MIN) return { level: "none", minutes };
  if (minutes < SLA_STALE_MIN) return { level: "warn", minutes };
  return { level: "stale", minutes };
}

export function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${m}` : `${h}h`;
}
