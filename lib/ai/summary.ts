/**
 * Resumo de atendimento com IA (EPIC-SDR wave 2).
 *
 * Lê o histórico recente da conversa e produz um resumo estruturado em 3
 * tópicos para o vendedor/corretor: Dor/Necessidade, Detalhes/Orçamento e
 * Próximo passo recomendado.
 *
 * Roteamento de modelo: preferimos o provedor Anthropic DIRETO quando
 * `ANTHROPIC_API_KEY` existe (caso do self-host). Se só houver Vercel AI
 * Gateway (`AI_GATEWAY_API_KEY`), usamos a string `anthropic/...` que o SDK
 * roteia pelo gateway. Se nenhum estiver configurado, o chamador degrada com
 * 503 (a UI mostra "IA não configurada").
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

import { env } from "@/lib/env";
import { gatewayConfig, gatewayHeaders } from "./gateway";

const MODEL_DIRECT = "claude-sonnet-4-6";
const MODEL_GATEWAY = "anthropic/claude-sonnet-4-6";

export function isSummaryConfigured(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY) || Boolean(env.AI_GATEWAY_API_KEY);
}

export const summarySchema = z.object({
  dor: z.string().describe("A dor ou necessidade principal do cliente."),
  detalhes: z
    .string()
    .describe("Detalhes e orçamento mencionados (valores, produto/serviço, prazos). 'Não informado' se nada foi dito."),
  proximo_passo: z.string().describe("A próxima ação recomendada para o vendedor/corretor."),
});
export type ConversationSummary = z.infer<typeof summarySchema>;

const SYSTEM_PROMPT = `Você é um assistente de pré-vendas (SDR) que resume atendimentos de WhatsApp para o vendedor/corretor.
Leia o histórico e produza um resumo objetivo em português do Brasil, em 3 tópicos curtos:
1) dor: a dor ou necessidade principal do cliente.
2) detalhes: detalhes e orçamento mencionados (valores, produto/serviço, prazos). Se nada foi dito, escreva "Não informado".
3) proximo_passo: a próxima ação recomendada para o vendedor/corretor avançar a venda.
Seja conciso (1-2 frases por tópico). Baseie-se SOMENTE no histórico — não invente informações.`;

export async function summarizeConversation(input: {
  organizationId: string;
  contactName?: string | null;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<ConversationSummary> {
  const transcript = input.messages
    .map((m) => `${m.role === "user" ? "Cliente" : "Atendente"}: ${m.content}`)
    .join("\n");

  const prompt = `Contato: ${input.contactName?.trim() || "—"}\n\nHistórico da conversa:\n${transcript}`;

  const directKey = env.ANTHROPIC_API_KEY;
  const model: LanguageModel = directKey
    ? createAnthropic({ apiKey: directKey })(MODEL_DIRECT)
    : MODEL_GATEWAY;

  // Headers do gateway só quando roteando por ele (sem chave direta).
  const cfg = gatewayConfig();
  const headers = !directKey && cfg ? gatewayHeaders({ organizationId: input.organizationId }) : undefined;

  const { object } = await generateObject({
    model,
    schema: summarySchema,
    system: SYSTEM_PROMPT,
    prompt,
    headers,
  });

  return object;
}

/** Formata o resumo como texto de nota interna (salvável na conversa). */
export function formatSummaryNote(s: ConversationSummary): string {
  return [
    "🧠 Resumo do atendimento (IA)",
    `• Dor/Necessidade: ${s.dor}`,
    `• Detalhes/Orçamento: ${s.detalhes}`,
    `• Próximo passo: ${s.proximo_passo}`,
  ].join("\n");
}
