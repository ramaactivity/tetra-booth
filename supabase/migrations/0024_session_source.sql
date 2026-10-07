-- Photo Stage (#178, docs/PLAN-PHOTO-STAGE.md): sumber sesi (booth = photobooth, stage = fotografer pelaminan) dan
-- nama grup rombongan (boleh kosong, bisa diganti belakangan). Aditif; sesi lama = booth.
alter table sessions add column if not exists source text not null default 'booth'
  check (source in ('booth', 'stage'));
alter table sessions add column if not exists group_name text check (char_length(group_name) <= 120);
create index if not exists sessions_event_source on sessions (event_id, source, started_at);
