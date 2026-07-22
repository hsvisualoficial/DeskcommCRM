"use client";
import { useEffect, useState } from "react";

/**
 * Relógio que re-renderiza em intervalo fixo — usado para atualizar os
 * indicadores de SLA (tempo transcorrido) sem depender de novos dados.
 */
export function useNowTick(intervalMs = 30_000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
