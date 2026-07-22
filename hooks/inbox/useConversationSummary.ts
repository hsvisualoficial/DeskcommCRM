"use client";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

export interface ConversationSummaryResult {
  dor: string;
  detalhes: string;
  proximo_passo: string;
  /** Texto pronto pra salvar como nota interna. */
  text: string;
}

/**
 * Gera (sem salvar) o resumo do atendimento com IA. Timeout estendido: a
 * geração pode levar alguns segundos.
 */
export function useConversationSummary(conversationId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ data: ConversationSummaryResult }>(
        `/api/v1/conversations/${conversationId}/summary`,
        {},
        { timeoutMs: 60_000 },
      );
      return res.data;
    },
    onError: showApiError,
  });
}
