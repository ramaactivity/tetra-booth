-- Event tampil di semua booth organisasi (bawaan), atau hanya booth yang dipilih di event_devices (DECISIONS #127).
alter table events add column if not exists all_devices boolean not null default true;
-- Event lama yang sudah punya penugasan tetap seperti sebelumnya (hanya booth terpilih).
update events set all_devices = false
  where exists (select 1 from event_devices ed where ed.event_id = events.id);
