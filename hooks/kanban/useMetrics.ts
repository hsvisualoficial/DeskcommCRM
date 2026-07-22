"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { PipelineMetrics } from "@/app/api/v1/pipelines/[id]/metrics/route";

export function useMetrics(pipelineId: string | null) {
  return useQuery({
    queryKey: ["pipeline-metrics", pipelineId],
    enabled: !!pipelineId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await apiClient.get<{ data: PipelineMetrics }>(
        `/api/v1/pipelines/${pipelineId}/metrics`,
      );
      return res.data;
    },
  });
}
