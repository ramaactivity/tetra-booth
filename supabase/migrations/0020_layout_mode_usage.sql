-- Template per mode + statistik pemakaian photobox (DECISIONS #160).
-- layouts.mode: template untuk mode Event atau Photobox (dipilih saat membuat; bisa dipindah dari daftar Template).
-- Backfill: template yang dijual di event photobox (atau pernah dibayar di photobox) dan tidak dipakai event mode
-- event = photobox; sisanya event.
alter table layouts add column if not exists mode text not null default 'event'
  check (mode in ('event', 'photobox'));

update layouts l set mode = 'photobox'
where (
    exists (
      select 1 from events e
      cross join lateral jsonb_array_elements(
        case jsonb_typeof(e.settings -> 'photobox' -> 'layouts')
          when 'array' then e.settings -> 'photobox' -> 'layouts' else '[]'::jsonb end
      ) x
      where e.organization_id = l.organization_id and e.mode = 'photobox' and x ->> 'template' = l.id::text
    )
    or exists (select 1 from payments p where p.layout_key = 'tpl-' || l.id::text)
  )
  and not exists (
    select 1 from events e
    where e.organization_id = l.organization_id and e.mode = 'event'
      and (e.settings -> 'template' -> 'versions' ? l.id::text
        or e.settings -> 'template' ->> 'layoutId' = l.id::text)
  );

-- Pemakaian template editor di photobox = pembayaran paket lunas berkunci `tpl-<layoutId>` (#108).
-- Sesi tes (sessions.is_test) tidak dihitung. Lembar = paket + tambahan cetak (berkunci layout yang sama).
-- security_invoker: RLS payments/sessions (anggota organisasi) tetap berlaku.
create or replace view layout_usage with (security_invoker = true) as
select
  p.organization_id,
  substr(p.layout_key, 5)::uuid as layout_id,
  count(*) filter (where p.kind = 'package')::int as sessions,
  coalesce(sum(p.prints), 0)::int as prints,
  count(*) filter (
    where p.kind = 'package'
      and coalesce(p.paid_at, p.created_at)
        >= date_trunc('month', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'
  )::int as sessions_month,
  max(coalesce(p.paid_at, p.created_at)) as last_used_at
from payments p
left join sessions s on s.id = p.session_id
where p.status = 'paid'
  and p.layout_key ~ '^tpl-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and not coalesce(s.is_test, false)
group by 1, 2;
