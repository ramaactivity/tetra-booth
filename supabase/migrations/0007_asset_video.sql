-- Video hitung mundur sebagai aset sesi (DECISIONS #117). Aditif: data lama tetap valid.
alter table assets drop constraint if exists assets_kind_check;
alter table assets add constraint assets_kind_check
  check (kind in ('strip','strip_web','original','thumb_strip','thumb_original','animation','video'));
