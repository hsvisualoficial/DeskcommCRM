-- Migration 0028: Bucket privado whatsapp-media (mídia recebida/enviada via WAHA)
-- Referenciado por storage_redaction_queue (fn_lgpd_cascade_redact) mas nunca
-- criado por nenhuma migration/baseline anterior. Acesso é via URLs assinadas
-- geradas server-side (service_role) — README §Stack "Storage" — por isso não
-- precisa de policy de leitura direta pro client, só o bucket privado existir.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('whatsapp-media', 'whatsapp-media', false, null, null)
on conflict (id) do nothing;
