-- Rekap bulanan (audit 27 Nov): per booth — event, sesi, lembar, sesi yang QR-nya dibuka tamu. Event arsip (#301,
-- dobel/uji) tidak dihitung, sama dengan daftar event. Hanya sesi booth (bukan Guest Cam/Photo Stage), bukan tes.
create or replace function org_month_booths(org uuid, d_from date, d_to date)
returns table (device_id uuid, events bigint, sessions bigint, prints bigint, qr_sessions bigint)
language sql stable security invoker
set search_path = public
as $$
  with qr as (
    select distinct a.session_id
    from analytics_events a
    where a.organization_id = org and a.type = 'qr_open'
  )
  select s.device_id, count(distinct s.event_id), count(*), coalesce(sum(s.print_count), 0),
    count(qr.session_id)
  from sessions s
  join events e on e.id = s.event_id
  left join qr on qr.session_id = s.id
  where s.organization_id = org and not s.is_test and s.deleted_at is null
    and s.source = 'booth' and s.device_id is not null and e.status <> 'archived'
    and (s.started_at at time zone 'Asia/Jakarta')::date >= d_from
    and (s.started_at at time zone 'Asia/Jakarta')::date < d_to
  group by s.device_id
$$;

-- Ringkasan bulan (#156): sesi & lembar event arsip (#301) tidak dihitung; transaksi lunas tetap.
create or replace function org_period_stats(org uuid, d_from date, d_to date)
returns table (mode text, sessions bigint, prints bigint, active_days bigint, paid bigint, revenue bigint)
language sql stable security invoker
set search_path = public
as $$
  with s as (
    select e.mode, count(*) n, coalesce(sum(s.print_count), 0) p,
      count(distinct (s.started_at at time zone 'Asia/Jakarta')::date) d
    from sessions s join events e on e.id = s.event_id
    where s.organization_id = org and not s.is_test and s.deleted_at is null and e.status <> 'archived'
      and (s.started_at at time zone 'Asia/Jakarta')::date >= d_from
      and (s.started_at at time zone 'Asia/Jakarta')::date < d_to
    group by e.mode
  ), p as (
    select e.mode, count(*) n, coalesce(sum(p.amount_idr), 0) r
    from payments p join events e on e.id = p.event_id
    -- Uang tetap dihitung walau eventnya diarsip.
    where p.organization_id = org and p.status = 'paid'
      and (p.paid_at at time zone 'Asia/Jakarta')::date >= d_from
      and (p.paid_at at time zone 'Asia/Jakarta')::date < d_to
    group by e.mode
  )
  select coalesce(s.mode, p.mode), coalesce(s.n, 0), coalesce(s.p, 0), coalesce(s.d, 0),
    coalesce(p.n, 0), coalesce(p.r, 0)
  from s full join p on p.mode = s.mode
$$;
