-- Daftar Event & Photobox admin (DECISIONS #156): transaksi lunas per event dan ringkasan per bulan per mode,
-- dihitung di database (PostgREST membatasi 1000 baris). Sesi tes (#153) & sesi terhapus tidak dihitung.
-- security invoker: RLS tetap berlaku untuk pemanggil.
create or replace function event_payment_stats(org uuid)
returns table (event_id uuid, paid bigint, revenue bigint)
language sql stable security invoker
set search_path = public
as $$
  select p.event_id, count(*), coalesce(sum(p.amount_idr), 0)
  from payments p
  where p.organization_id = org and p.status = 'paid'
  group by p.event_id
$$;

-- Ringkasan rentang tanggal (WIB, [from, to)) per mode event: sesi & lembar menurut started_at, transaksi menurut
-- paid_at, hari aktif = tanggal yang punya sesi.
create or replace function org_period_stats(org uuid, d_from date, d_to date)
returns table (mode text, sessions bigint, prints bigint, active_days bigint, paid bigint, revenue bigint)
language sql stable security invoker
set search_path = public
as $$
  with s as (
    select e.mode, count(*) n, coalesce(sum(s.print_count), 0) p,
      count(distinct (s.started_at at time zone 'Asia/Jakarta')::date) d
    from sessions s join events e on e.id = s.event_id
    where s.organization_id = org and not s.is_test and s.deleted_at is null
      and (s.started_at at time zone 'Asia/Jakarta')::date >= d_from
      and (s.started_at at time zone 'Asia/Jakarta')::date < d_to
    group by e.mode
  ), p as (
    select e.mode, count(*) n, coalesce(sum(p.amount_idr), 0) r
    from payments p join events e on e.id = p.event_id
    where p.organization_id = org and p.status = 'paid'
      and (p.paid_at at time zone 'Asia/Jakarta')::date >= d_from
      and (p.paid_at at time zone 'Asia/Jakarta')::date < d_to
    group by e.mode
  )
  select coalesce(s.mode, p.mode), coalesce(s.n, 0), coalesce(s.p, 0), coalesce(s.d, 0),
    coalesce(p.n, 0), coalesce(p.r, 0)
  from s full join p on p.mode = s.mode
$$;
