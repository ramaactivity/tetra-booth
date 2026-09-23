-- Seed organisasi Tetra. Idempotent.
insert into organizations (name, slug)
values ('Tetra Photobooth', 'tetra')
on conflict (slug) do nothing;

-- Owner: akun tetrabooth.app@gmail.com harus sudah ada di Supabase Auth (buat lewat dashboard).
insert into members (organization_id, user_id, role)
select o.id, u.id, 'owner'
from organizations o, auth.users u
where o.slug = 'tetra' and u.email = 'tetrabooth.app@gmail.com'
on conflict (organization_id, user_id) do nothing;
