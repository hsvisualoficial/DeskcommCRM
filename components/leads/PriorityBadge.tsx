"use client";
/**
 * PriorityBadge — badge visual de prioridade do lead (HOT/WARM/COLD).
 * Reutilizado no Kanban (card), Inbox (lista) e detalhe/modais de contato.
 *
 *   🔥 Quente (vermelho) · 🟡 Morno (amarelo) · ❄️ Frio (azul/cinza)
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { priorityMeta, type PriorityTag } from "@/lib/leads/priority";

interface Props {
  tag: PriorityTag | null | undefined;
  /** `sm` = pílula compacta (lista do inbox / card). `md` = padrão. */
  size?: "sm" | "md";
  /** Só o emoji + label curto (default) ou label completo ("Lead Quente"). */
  showLabel?: boolean;
  className?: string;
}

export function PriorityBadge({ tag, size = "md", showLabel = true, className }: Props) {
  if (!tag) return null;
  const meta = priorityMeta(tag);
  return (
    <Badge
      variant={meta.variant}
      title={meta.hint}
      aria-label={`Prioridade: ${meta.label}`}
      className={cn(size === "sm" && "h-4 px-1.5 text-[10px]", className)}
    >
      <span aria-hidden>{meta.emoji}</span>
      {showLabel && <span>{meta.label}</span>}
    </Badge>
  );
}
