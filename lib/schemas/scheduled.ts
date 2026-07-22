/**
 * Zod schemas para /api/v1/scheduled-messages/* (EPIC-SDR wave 3).
 */
import { z } from "zod";

const futureTimestamp = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "Data/hora inválida.");

export const scheduledMessageCreateSchema = z.object({
  contact_id: z.string().uuid(),
  body: z.string().min(1).max(4000),
  scheduled_for: futureTimestamp,
  conversation_id: z.string().uuid().nullable().optional(),
  lead_id: z.string().uuid().nullable().optional(),
});
export type ScheduledMessageCreateInput = z.infer<typeof scheduledMessageCreateSchema>;

/** Ativar régua: sequência de passos {delay_hours, body} a partir de agora. */
export const cadenceActivateSchema = z.object({
  contact_id: z.string().uuid(),
  lead_id: z.string().uuid().nullable().optional(),
  steps: z
    .array(
      z.object({
        delay_hours: z.number().finite().min(0).max(24 * 90),
        body: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(10),
});
export type CadenceActivateInput = z.infer<typeof cadenceActivateSchema>;
