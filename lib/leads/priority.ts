/**
 * Lead priority (SDR/Pré-vendas — Fase 1).
 *
 * `priority_tag` é uma coluna GERADA em `contacts` derivada de `score`.
 * A lógica de thresholds vive no DB (migration 0029); este módulo espelha os
 * mesmos limites pro cliente (fallback de exibição quando só temos o score) e
 * centraliza os metadados visuais do badge (emoji, label, variante do Badge).
 */
import type { badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

export type PriorityTag = "HOT" | "WARM" | "COLD";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

/** Thresholds — DEVEM bater com a coluna gerada em `contacts.priority_tag`. */
export const PRIORITY_THRESHOLDS = { hot: 70, warm: 40 } as const;

/** Deriva a prioridade a partir do score (espelha o DB). */
export function scoreToPriority(score: number | null | undefined): PriorityTag {
  const s = score ?? 0;
  if (s >= PRIORITY_THRESHOLDS.hot) return "HOT";
  if (s >= PRIORITY_THRESHOLDS.warm) return "WARM";
  return "COLD";
}

export interface PriorityMeta {
  tag: PriorityTag;
  label: string;
  emoji: string;
  variant: BadgeVariant;
  /** Descrição curta pra tooltip/hint. */
  hint: string;
}

const META: Record<PriorityTag, PriorityMeta> = {
  HOT: { tag: "HOT", label: "Quente", emoji: "🔥", variant: "error", hint: "Lead quente — priorize o contato" },
  WARM: { tag: "WARM", label: "Morno", emoji: "🟡", variant: "warning", hint: "Lead morno — em qualificação" },
  COLD: { tag: "COLD", label: "Frio", emoji: "❄️", variant: "info", hint: "Lead frio — ainda sem qualificação" },
};

export function priorityMeta(tag: PriorityTag | null | undefined): PriorityMeta {
  return META[tag ?? "COLD"];
}

/** Faixas legíveis pros hints de UI (ex.: no modal de contato). */
export const PRIORITY_RANGE_HINT = `0–${PRIORITY_THRESHOLDS.warm - 1} Frio · ${PRIORITY_THRESHOLDS.warm}–${PRIORITY_THRESHOLDS.hot - 1} Morno · ${PRIORITY_THRESHOLDS.hot}–100 Quente`;
