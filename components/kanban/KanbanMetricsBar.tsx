"use client";
/**
 * KPI bar do Kanban (dashboard SDR): taxa de conversão, média de 1ª resposta
 * (SLA) e conversão por motivo de perda.
 */
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMetrics } from "@/hooks/kanban/useMetrics";

const LOSS_LABELS: Record<string, string> = {
  price: "Preço",
  no_profile: "Sem perfil",
  bought_competitor: "Comprou em outra",
  no_response: "Sem resposta",
  requested_by_customer: "Cliente cancelou",
  product_unavailable: "Produto indisponível",
  cancelled_by_store: "Cancelado pela loja",
  cancelled_by_customer: "Cancelado pelo cliente",
  payment_failed: "Falha no pagamento",
  other: "Outro",
  "não informado": "Não informado",
};

function lossLabel(reason: string): string {
  return LOSS_LABELS[reason] ?? reason;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="flex flex-col justify-center p-3">
      <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</span>
      <span className="mt-0.5 text-xl font-semibold tabular-nums text-text">{value}</span>
      {sub && <span className="text-[11px] text-text-muted">{sub}</span>}
    </Card>
  );
}

export function KanbanMetricsBar({ pipelineId }: { pipelineId: string }) {
  const { data, isLoading, isError } = useMetrics(pipelineId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }
  if (isError || !data) return null;

  const topLosses = data.loss_reasons.slice(0, 4);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
      <Tile
        label="Conversão"
        value={`${Math.round(data.conversion_rate * 100)}%`}
        sub={`${data.won} ganhos · ${data.lost} perdidos`}
      />
      <Tile label="Média 1ª resposta" value={formatDuration(data.avg_first_response_seconds)} sub="últimos 30 dias" />
      <Tile label="Em aberto" value={String(data.open)} />
      <Tile label="Ganhos" value={String(data.won)} />

      <Card className="col-span-2 flex flex-col justify-center p-3 md:col-span-4 xl:col-span-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Perdas por motivo</span>
        {topLosses.length === 0 ? (
          <span className="mt-1 text-xs text-text-muted">Sem perdas registradas.</span>
        ) : (
          <div className="mt-1 flex flex-wrap gap-1">
            {topLosses.map((l) => (
              <Badge key={l.reason} variant="neutral" className="h-5 px-1.5 text-[10px]">
                {lossLabel(l.reason)} · {l.count}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
