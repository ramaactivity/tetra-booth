-- Fase 2 (N1/N2): API booth. Token & kode pairing unik, rate limit endpoint publik.

-- Token device disimpan sebagai sha256 (TSD §5); lookup per request harus unik dan cepat.
create unique index devices_token_hash on devices (token_hash) where token_hash is not null;
-- Kode pairing 6 digit aktif tidak boleh dobel (pairing mencari device berdasarkan kode saja).
create unique index devices_pairing_code on devices (pairing_code) where pairing_code is not null;
create unique index devices_short_code on devices (organization_id, short_code);

-- Rate limit jendela tetap untuk endpoint publik (pair, track, halaman tamu). Data infrastruktur, bukan
-- data tenant: tanpa organization_id (DECISIONS #55). RLS aktif tanpa policy = hanya service role.
create table rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits int not null
);
alter table rate_limits enable row level security;

-- true = masih boleh; false = melebihi `max_hits` dalam `window_s` detik terakhir (jendela tetap).
create function rate_hit(k text, window_s int, max_hits int) returns boolean
language sql volatile
set search_path = public
as $$
  insert into rate_limits as r (key, window_start, hits)
  values (k, now(), 1)
  on conflict (key) do update set
    window_start = case when r.window_start < now() - make_interval(secs => window_s) then now() else r.window_start end,
    hits = case when r.window_start < now() - make_interval(secs => window_s) then 1 else r.hits + 1 end
  returning hits <= max_hits;
$$;
revoke execute on function rate_hit(text, int, int) from public, anon, authenticated;
