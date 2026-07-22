"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

export interface ScheduledMessage {
  id: string;
  contact_id: string;
  conversation_id: string | null;
  lead_id: string | null;
  body: string;
  scheduled_for: string;
  status: "pending" | "sent" | "failed" | "canceled";
  source: "manual" | "cadence";
  sent_message_id: string | null;
  last_error: string | null;
  created_at: string;
}

export function useScheduledMessages(contactId: string | null) {
  return useQuery({
    queryKey: ["scheduled-messages", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const res = await apiClient.get<{ data: ScheduledMessage[] }>(
        `/api/v1/scheduled-messages?contact_id=${contactId}`,
      );
      return res.data;
    },
  });
}

interface CreateArgs {
  contact_id: string;
  body: string;
  scheduled_for: string;
  lead_id?: string | null;
  conversation_id?: string | null;
}

export function useCreateScheduledMessage(contactId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: CreateArgs) =>
      apiClient.post<{ data: ScheduledMessage }>("/api/v1/scheduled-messages", args),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled-messages", contactId] }),
  });
}

export function useCancelScheduledMessage(contactId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      apiClient.delete<{ data: { id: string } }>(`/api/v1/scheduled-messages/${id}`),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled-messages", contactId] }),
  });
}

interface CadenceStep {
  delay_hours: number;
  body: string;
}

export function useActivateCadence(leadId: string, contactId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { contact_id: string; steps: CadenceStep[] }) =>
      apiClient.post<{ data: { scheduled: number } }>(`/api/v1/leads/${leadId}/cadence`, args),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled-messages", contactId] }),
  });
}
