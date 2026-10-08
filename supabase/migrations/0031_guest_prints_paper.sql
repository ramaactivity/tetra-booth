-- #223: booth hanya mengambil cetak tamu dengan kertas yang terpasang di printernya. Setengah lembar (2x6x2 strip,
-- 3x4x2 polaroid) dipasangkan dua tamu per lembar; 4R satu per lembar.
drop function if exists claim_guest_prints(uuid, uuid, boolean);
create or replace function claim_guest_prints(p_event uuid, p_device uuid, p_paper text)
returns setof guest_prints
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[];
  half boolean := p_paper <> '4R';
begin
  update guest_prints set status = 'queued', device_id = null, claimed_at = null
    where event_id = p_event and status = 'claimed' and claimed_at < now() - interval '3 minutes';
  select array_agg(id) into ids from (
    select id from guest_prints
      where event_id = p_event and status = 'queued' and paper = p_paper
      order by created_at
      limit case when half then 2 else 1 end
      for update skip locked
  ) q;
  if ids is null then return; end if;
  if half and array_length(ids, 1) = 1 and exists (
    select 1 from guest_prints where id = ids[1] and created_at > now() - interval '30 seconds'
  ) then return; end if;
  return query
    update guest_prints set status = 'claimed', device_id = p_device, claimed_at = now()
      where id = any(ids)
      returning *;
end;
$$;
revoke all on function claim_guest_prints(uuid, uuid, text) from public, anon, authenticated;
