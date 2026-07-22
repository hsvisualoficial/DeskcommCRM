"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface Snippet {
  id: string;
  organization_id: string;
  shortcut: string;
  title: string | null;
  content: string;
  category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Lista as respostas rápidas da org (cache 5min — mudam pouco). */
export function useSnippets(enabled = true) {
  return useQuery({
    queryKey: ["snippets"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await apiClient.get<{ data: Snippet[] }>("/api/v1/snippets");
      return res.data;
    },
  });
}
