"use client";
/**
 * Badge de SLA de atendimento (tempo sem resposta ao cliente).
 *   ⚠️ amarelo (5–15 min) · 🚨 vermelho (> 15 min). Nada abaixo de 5 min.
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatElapsed, type SlaState } from "@/lib/inbox/sla";

interface Props {
  state: SlaState;
  size?: "sm" | "md";
  className?: string;
}

export function SlaBadge({ state, size = "md", className }: Props) {
  if (state.level === "none") return null;
  const warn = state.level === "warn";
  const label = `${warn ? "⚠️" : "🚨"} ${formatElapsed(state.minutes)}`;
  return (
    <Badge
      variant={warn ? "warning" : "error"}
      title={
        warn
          ? "Aguardando resposta há mais de 5 min"
          : "Estagnado — sem resposta há mais de 15 min. Atenção urgente."
      }
      aria-label={`SLA sem resposta: ${formatElapsed(state.minutes)}`}
      className={cn(size === "sm" && "h-4 px-1.5 text-[10px]", "tabular-nums", className)}
    >
      {label}
    </Badge>
  );
}
