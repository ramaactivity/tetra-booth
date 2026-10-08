-- Cetak foto tamu Guest Cam di printer booth (#223): satu tamu satu cetak, antrean per event, diambil booth.
-- Aditif.
create table if not exists guest_prints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  event_id uuid not null references events(id) on delete cascade,
  -- Satu cetak per tamu (sesi Guest Cam).
  session_id text not null unique references sessions(id) on delete cascade,
  -- Nomor antrean di event ini (ditampilkan ke tamu & crew).
  number int not null,
  guest_name text,
  -- Frame yang dicetak: objek R2 strip_web tamu + layout potongnya (untuk menyusun lembar di booth).
  r2_key text not null,
  layout jsonb not null,
  paper text not null,
  status text not null default 'queued' check (status in ('queued', 'claimed', 'printed', 'failed')),
  device_id uuid references devices(id),
  claimed_at timestamptz,
  printed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists guest_prints_queue on guest_prints (event_id, status, created_at);
alter table guest_prints enable row level security;
create policy read on guest_prints for select using (is_member(organization_id));

-- Booth mengambil job berikutnya secara atomik (beberapa booth satu event tidak mencetak ganda). Kertas setengah
-- lembar (strip 2R, polaroid) dipasangkan dua tamu per lembar; job tunggal baru dilepas setelah menunggu 30 dtk.
-- Klaim yang macet > 3 menit (booth mati di tengah) dikembalikan ke antrean.
create or replace function claim_guest_prints(p_event uuid, p_device uuid, p_half boolean)
returns setof guest_prints
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[];
begin
  update guest_prints set status = 'queued', device_id = null, claimed_at = null
    where event_id = p_event and status = 'claimed' and claimed_at < now() - interval '3 minutes';
  select array_agg(id) into ids from (
    select id from guest_prints
      where event_id = p_event and status = 'queued'
      order by created_at
      limit case when p_half then 2 else 1 end
      for update skip locked
  ) q;
  if ids is null then return; end if;
  if p_half and array_length(ids, 1) = 1 and exists (
    select 1 from guest_prints where id = ids[1] and created_at > now() - interval '30 seconds'
  ) then return; end if;
  return query
    update guest_prints set status = 'claimed', device_id = p_device, claimed_at = now()
      where id = any(ids)
      returning *;
end;
$$;
revoke all on function claim_guest_prints(uuid, uuid, boolean) from public, anon, authenticated;
