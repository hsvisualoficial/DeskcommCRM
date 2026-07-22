/**
 * Qualificação de lead SDR via structured output (EPIC-SDR wave 4).
 *
 * Lê o histórico da conversa e extrai, de forma estruturada, os dados de
 * qualificação (intenção, orçamento, tipo de serviço, urgência), um score 0-100
 * e a recomendação de handoff. Reusa o roteamento de modelo do resumo (Anthropic
 * direto quando ANTHROPIC_API_KEY existe; senão AI Gateway).
 *
 * NÃO inventa preços/condições — o prompt instrui a basear-se só no histórico.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

import { env } from "@/lib/env";
import { gatewayConfig, gatewayHeaders } from "@/lib/ai/gateway";

const MODEL_DIRECT = "claude-sonnet-4-6";
const MODEL_GATEWAY = "anthropic/claude-sonnet-4-6";

export function isQualifyConfigured(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY) || Boolean(env.AI_GATEWAY_API_KEY);
}

export const qualificationSchema = z.object({
  score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Pontuação de qualificação 0-100 (intenção clara, orçamento compatível, urgência e fit aumentam o score)."),
  intencao: z.string().describe("O que o cliente quer, em 1 frase curta. 'Não informado' se não deu pra saber."),
  orcamento: z.string().describe("Orçamento/faixa de valor mencionada pelo cliente. 'Não informado' se não mencionou."),
  tipo_servico: z.string().describe("Tipo de imóvel/serviço/produto de interesse. 'Não informado' se não deu pra saber."),
  urgencia: z.enum(["alta", "media", "baixa", "indefinida"]).describe("Urgência/prazo do cliente."),
  resumo_qualificacao: z.string().describe("Resumo objetivo (2-3 frases) da qualificação para o vendedor."),
  handoff_recomendado: z
    .boolean()
    .describe("true se o lead está quente e pronto para um atendente humano (pediu atendente, quer agendar/negociar, ou muito interessado)."),
  motivo_handoff: z.string().describe("Se handoff_recomendado=true, o motivo em poucas palavras; senão string vazia."),
});
export type LeadQualification = z.infer<typeof qualificationSchema>;

const SYSTEM_PROMPT = `Você é um analista de pré-vendas (SDR) que qualifica leads de WhatsApp para segmentos B2C e de serviços (imobiliárias, corretores, oficinas, locação, esquadrias, serviços locais).
Leia o histórico da conversa e extraia os dados de qualificação de forma objetiva, em português do Brasil.

Regras:
- Baseie-se SOMENTE no que está no histórico. NUNCA invente orçamento, preços, tipo de serviço ou intenção que o cliente não expressou — use "Não informado".
- score 0-100: quanto mais clara a intenção, mais compatível o orçamento e maior a urgência/fit, maior o score.
  Referência: sem intenção clara ~0-30 (frio); intenção definida mas faltam dados ~40-65 (morno); intenção + tipo + (orçamento OU urgência alta) ou pedido de atendente/agendamento ~70-100 (quente).
- handoff_recomendado=true quando o cliente pede atendente humano, quer agendar/negociar, ou está claramente quente (score alto).`;

export async function qualifyLead(input: {
  organizationId: string;
  contactName?: string | null;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<LeadQualification> {
  const transcript = input.messages
    .map((m) => `${m.role === "user" ? "Cliente" : "Atendente"}: ${m.content}`)
    .join("\n");
  const prompt = `Contato: ${input.contactName?.trim() || "—"}\n\nHistórico da conversa:\n${transcript}`;

  const directKey = env.ANTHROPIC_API_KEY;
  const model: LanguageModel = directKey
    ? createAnthropic({ apiKey: directKey })(MODEL_DIRECT)
    : MODEL_GATEWAY;
  const cfg = gatewayConfig();
  const headers = !directKey && cfg ? gatewayHeaders({ organizationId: input.organizationId }) : undefined;

  const { object } = await generateObject({
    model,
    schema: qualificationSchema,
    system: SYSTEM_PROMPT,
    prompt,
    headers,
  });
  return object;
}

/** custom_fields extraídos da qualificação (para mesclar em contacts.custom_fields). */
export function qualificationCustomFields(q: LeadQualification): Record<string, unknown> {
  return {
    intencao: q.intencao,
    orcamento: q.orcamento,
    tipo_servico: q.tipo_servico,
    urgencia: q.urgencia,
  };
}

/** Nota interna formatada com a qualificação. */
export function formatQualificationNote(q: LeadQualification): string {
  return [
    `🎯 Qualificação SDR (IA) — Score ${q.score}/100`,
    `• Intenção: ${q.intencao}`,
    `• Tipo de serviço/imóvel: ${q.tipo_servico}`,
    `• Orçamento: ${q.orcamento}`,
    `• Urgência: ${q.urgencia}`,
    "",
    q.resumo_qualificacao,
  ].join("\n");
}
