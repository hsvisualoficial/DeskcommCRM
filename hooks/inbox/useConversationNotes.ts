"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

export interface ConversationNote {
  id: string;
  conversation_id: string;
  contact_id: string | null;
  body: string;
  source: "manual" | "ai_summary";
  author_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useConversationNotes(conversationId: string | null) {
  return useQuery({
    queryKey: ["conversation-notes", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const res = await apiClient.get<{ data: ConversationNote[] }>(
        `/api/v1/conversations/${conversationId}/notes`,
      );
      return res.data;
    },
  });
}

interface CreateNoteArgs {
  body: string;
  source?: "manual" | "ai_summary";
  metadata?: Record<string, unknown>;
}

export function useCreateNote(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: CreateNoteArgs) =>
      apiClient.post<{ data: ConversationNote }>(
        `/api/v1/conversations/${conversationId}/notes`,
        args,
      ),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversation-notes", conversationId] });
    },
  });
}
