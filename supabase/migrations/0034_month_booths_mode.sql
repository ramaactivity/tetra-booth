-- 0033 tanpa mode: daftar Event dan Photobox masing-masing butuh rekap booth modenya sendiri. Fungsi lama belum dipakai.
drop function if exists org_month_booths(uuid, date, date);
create or replace function org_month_booths(org uuid, m text, d_from date, d_to date)
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
  where s.organization_id = org and not s.is_test and s.deleted_at is null and e.mode = m
    and s.source = 'booth' and s.device_id is not null and e.status <> 'archived'
    and (s.started_at at time zone 'Asia/Jakarta')::date >= d_from
    and (s.started_at at time zone 'Asia/Jakarta')::date < d_to
  group by s.device_id
$$;
