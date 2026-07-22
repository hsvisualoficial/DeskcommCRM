/**
 * Campos customizados por segmento — SDR/Pré-vendas Fase 1
 * (B2C + Prestadores de Serviço: Imobiliárias, Corretores, Oficinas, Serviços).
 *
 * Conjunto default usado pelos modais de edição (card do Kanban e contato)
 * quando o pipeline ainda não tem `settings.fields` configurado. Os valores
 * persistem em `crm_leads.custom_fields` / `contacts.custom_fields` (jsonb).
 *
 * Tipagem reutiliza `CustomFieldDef` do CustomFieldsEditor (single source of
 * truth do renderer declarativo). Fase futura: dirigir por pipeline.settings.fields.
 */
import type { CustomFieldDef } from "@/components/contacts/CustomFieldsEditor";

export const SEGMENT_CUSTOM_FIELDS: CustomFieldDef[] = [
  {
    key: "orcamento",
    label: "Orçamento (R$)",
    type: "number",
  },
  {
    key: "segmento",
    label: "Tipo de Serviço/Imóvel",
    type: "select",
    options: [
      { value: "imovel", label: "Imóvel" },
      { value: "veiculo", label: "Veículo" },
      { value: "servico_local", label: "Serviço Local" },
      { value: "outro", label: "Outro" },
    ],
  },
  {
    key: "interesse",
    label: "Interesse / Detalhe",
    type: "text",
  },
];

/**
 * Resolve quais definições de campo usar: as do pipeline (se configuradas) ou o
 * default de segmento da Fase 1.
 */
export function resolveCustomFields(pipelineFields?: unknown): CustomFieldDef[] {
  if (Array.isArray(pipelineFields) && pipelineFields.length > 0) {
    return pipelineFields as CustomFieldDef[];
  }
  return SEGMENT_CUSTOM_FIELDS;
}
