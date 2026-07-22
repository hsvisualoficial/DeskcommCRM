/**
 * Zod schemas para /api/v1/snippets/* e notas de conversa (EPIC-SDR wave 2).
 *
 *  - snippetCreateSchema / snippetUpdateSchema → CRUD de respostas rápidas
 *  - conversationNoteCreateSchema              → POST /conversations/[id]/notes
 */
import { z } from "zod";

const SHORTCUT_REGEX = /^[a-z0-9_-]{1,40}$/;

/** Normaliza o atalho: minúsculo, sem "/" ou espaços nas bordas. */
export function normalizeShortcut(raw: string): string {
  return raw.trim().replace(/^\/+/, "").toLowerCase();
}

export const snippetCreateSchema = z.object({
  shortcut: z
    .string()
    .transform(normalizeShortcut)
    .pipe(z.string().regex(SHORTCUT_REGEX, "Atalho: letras minúsculas, números, hífen ou underscore (até 40).")),
  content: z.string().min(1).max(4000),
  title: z.string().max(120).nullable().optional(),
  category: z.string().max(60).nullable().optional(),
  is_active: z.boolean().optional().default(true),
});
export type SnippetCreateInput = z.infer<typeof snippetCreateSchema>;

export const snippetUpdateSchema = z.object({
  shortcut: z
    .string()
    .transform(normalizeShortcut)
    .pipe(z.string().regex(SHORTCUT_REGEX))
    .optional(),
  content: z.string().min(1).max(4000).optional(),
  title: z.string().max(120).nullable().optional(),
  category: z.string().max(60).nullable().optional(),
  is_active: z.boolean().optional(),
});
export type SnippetUpdateInput = z.infer<typeof snippetUpdateSchema>;

export const conversationNoteCreateSchema = z.object({
  body: z.string().min(1).max(8000),
  source: z.enum(["manual", "ai_summary"]).optional().default("manual"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ConversationNoteCreateInput = z.infer<typeof conversationNoteCreateSchema>;
