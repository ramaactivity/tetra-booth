-- Voucher photobox: kode yang memotong harga paket; sisa dibayar QRIS, voucher 100% melewati QRIS. Aditif.
-- Pemakaian = baris payments ber-voucher_id yang lunas atau masih menunggu bayar (belum kedaluwarsa), jadi voucher
-- dari QR yang ditinggal tamu kembali bisa dipakai setelah QR-nya habis.
create table if not exists vouchers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  -- Huruf besar & angka saja: diketik tamu di keypad layar booth.
  code text not null check (code ~ '^[A-Z0-9]{3,20}$'),
  kind text not null check (kind in ('amount', 'percent')),
  value int not null check (value > 0 and (kind = 'amount' or value <= 100)),
  -- null = tanpa batas pemakaian.
  max_uses int check (max_uses > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  -- null = semua event photobox organisasi (yang menyalakan "Terima voucher").
  event_id uuid references events(id) on delete cascade,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);
alter table vouchers enable row level security;
create policy read on vouchers for select using (is_member(organization_id));
create policy write on vouchers for all
  using (is_member(organization_id, array['owner', 'admin']))
  with check (is_member(organization_id, array['owner', 'admin']));

alter table payments add column if not exists voucher_id uuid references vouchers(id);
alter table payments add column if not exists discount_idr int not null default 0 check (discount_idr >= 0);
create index if not exists payments_voucher on payments (voucher_id, status) where voucher_id is not null;

-- Tukar voucher secara atomik: kunci baris voucher (dua booth tidak bisa memakai sisa kuota terakhir bersamaan),
-- cek berlaku/kuota, lalu catat payment paket. Idempotent per sesi: panggilan ulang sesi yang sama mengembalikan
-- payment yang masih hidup. Nominal dihitung server (lib/vouchers.ts); kind/value dicocokkan supaya voucher yang
-- diubah admin di tengah jalan ditolak, bukan dipakai dengan harga lama.
create or replace function redeem_voucher(
  p_org uuid, p_voucher uuid, p_kind text, p_value int,
  p_event uuid, p_device uuid, p_session text, p_layout text,
  p_amount int, p_discount int, p_provider text, p_expires timestamptz
)
returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v vouchers;
  p payments;
  used int;
begin
  select * into v from vouchers where id = p_voucher and organization_id = p_org for update;
  if not found or not v.active or v.kind <> p_kind or v.value <> p_value
     or (v.event_id is not null and v.event_id <> p_event) then
    raise exception 'voucher_invalid';
  end if;
  if (v.starts_at is not null and now() < v.starts_at) or (v.ends_at is not null and now() >= v.ends_at) then
    raise exception 'voucher_expired';
  end if;
  -- Tagihan pending masih bisa lunas sesaat setelah kedaluwarsa (lib/payments.ts memberi jeda 15 dtk).
  select * into p from payments
    where voucher_id = v.id and session_id = p_session
      and (status = 'paid' or (status = 'pending' and expires_at > now() - interval '1 minute'))
    order by created_at desc limit 1;
  if found then return p; end if;
  select count(*) into used from payments
    where voucher_id = v.id
      and (status = 'paid' or (status = 'pending' and expires_at > now() - interval '1 minute'));
  if v.max_uses is not null and used >= v.max_uses then
    raise exception 'voucher_used_up';
  end if;
  insert into payments (organization_id, event_id, device_id, layout_key, kind, prints, amount_idr,
                        discount_idr, voucher_id, provider, session_id, status, expires_at, paid_at)
  values (p_org, p_event, p_device, p_layout, 'package', 1, p_amount, p_discount, v.id, p_provider, p_session,
          case when p_amount = 0 then 'paid' else 'pending' end, p_expires,
          case when p_amount = 0 then now() end)
  returning * into p;
  return p;
end;
$$;
revoke all on function redeem_voucher(uuid, uuid, text, int, uuid, uuid, text, text, int, int, text, timestamptz)
  from public, anon, authenticated;
