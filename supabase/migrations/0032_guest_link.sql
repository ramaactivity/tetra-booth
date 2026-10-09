-- Alamat Snapbook yang mudah dibaca (#231): /c/rafi-dinda. Alias dari guest_token: link aktif selama guest_token terisi,
-- dan QR lama (token acak) tetap jalan. Unik lintas event. Aditif.
alter table events add column if not exists guest_link text unique;
