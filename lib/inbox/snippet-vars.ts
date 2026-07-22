/**
 * Variáveis de snippet: {{nome}}, {{servico}}, {{valor}} etc.
 *
 * Constrói o mapa de variáveis a partir do contato da conversa e aplica a
 * substituição no conteúdo do snippet. Variáveis desconhecidas são mantidas
 * literais (o atendente percebe e completa manualmente).
 */

interface ContactLike {
  display_name?: string | null;
  name?: string | null;
  phone_number?: string | null;
  custom_fields?: Record<string, unknown> | null;
}

function formatBRL(n: number): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
  } catch {
    return `R$ ${n.toFixed(2)}`;
  }
}

export function buildSnippetVariables(contact: ContactLike | null | undefined): Record<string, string> {
  const nome = (contact?.display_name?.trim() || contact?.name?.trim() || "").trim();
  const cf = (contact?.custom_fields ?? {}) as Record<string, unknown>;

  // Todos os custom_fields ficam acessíveis por chave ({{orcamento}}, {{segmento}}…).
  const rawFields: Record<string, string> = {};
  for (const [k, v] of Object.entries(cf)) {
    rawFields[k] = v == null ? "" : String(v);
  }

  const orcamento = cf.orcamento;
  const valor =
    typeof orcamento === "number"
      ? formatBRL(orcamento)
      : orcamento != null && orcamento !== ""
        ? String(orcamento)
        : "";

  return {
    ...rawFields,
    nome,
    primeiro_nome: nome.split(/\s+/)[0] ?? "",
    telefone: contact?.phone_number ?? "",
    servico: String(cf.interesse ?? cf.segmento ?? ""),
    valor,
  };
}

/** Substitui {{chave}} (tolera espaços internos) pelas variáveis; mantém o resto. */
export function applySnippetVariables(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    const v = vars[key];
    return v !== undefined && v !== "" ? v : match;
  });
}
