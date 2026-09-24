-- Fase 2 (N3): bundle event untuk booth. Sampai editor template admin (Fase 3), config bundle
-- (format EventBundleSchema, tanpa id) + hash aset disimpan utuh di sini (DECISIONS #57).
alter table events add column bundle jsonb;
