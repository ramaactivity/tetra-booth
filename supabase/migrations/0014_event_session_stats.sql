-- Daftar event admin (DECISIONS #156): jumlah sesi & lembar cetak per event tanpa menarik semua baris sesi
-- (PostgREST membatasi 1000 baris). Sesi tes (#153) dan sesi terhapus tidak dihitung.
-- security invoker: RLS sessions tetap berlaku untuk pemanggil.
create or replace function event_session_stats(org uuid)
returns table (event_id uuid, sessions bigint, prints bigint)
language sql stable security invoker
set search_path = public
as $$
  select s.event_id, count(*), coalesce(sum(s.print_count), 0)
  from sessions s
  where s.organization_id = org and not s.is_test and s.deleted_at is null
  group by s.event_id
$$;
