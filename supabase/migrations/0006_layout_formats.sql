-- Format polaroid (3x4, dua per lembar 4R, disobek crew). DECISIONS #78.
alter table layouts drop constraint layouts_paper_check;
alter table layouts add constraint layouts_paper_check check (paper in ('4R','2x6x2','3x4x2'));
