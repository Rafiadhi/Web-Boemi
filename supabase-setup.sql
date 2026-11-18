-- =====================================================================
--  TATAKAS - Setup database Supabase (jalankan SEKALI)
--  Cara: Supabase > project kamu > SQL Editor > New query > paste semua > Run
--
--  Desain keamanan:
--  * Tabel "records" dikunci (RLS aktif, tanpa policy) -> tidak bisa dibaca
--    langsung lewat API publik.
--  * Akses hanya lewat 2 fungsi (rec_pull & rec_push) yang mewajibkan
--    "ID ruang kerja" = hash SHA-256 dari KODE AKSES kamu (64 karakter hex).
--    Tanpa kode akses yang benar, data tidak bisa ditebak / di-list.
--  * Tiap catatan disimpan per-baris (bukan 1 file besar), jadi HP dan
--    laptop yang mengedit data berbeda tidak saling menimpa.
-- =====================================================================

create table if not exists public.records (
  ws         text        not null,               -- hash kode akses
  kind       text        not null,               -- bahan | produk | penjualan | ...
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (ws, kind, id)
);

create index if not exists records_ws_updated_idx
  on public.records (ws, updated_at);

alter table public.records enable row level security;
revoke all on table public.records from anon, authenticated;

-- ---------------------------------------------------------------------
--  Ambil perubahan sejak waktu tertentu (null = ambil semua)
-- ---------------------------------------------------------------------
create or replace function public.rec_pull(
  p_ws    text,
  p_since timestamptz default null,
  p_limit int         default 500
)
returns table (kind text, id text, data jsonb, deleted boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ws is null or p_ws !~ '^[0-9a-f]{64}$' then
    raise exception 'Kode ruang kerja tidak valid';
  end if;

  return query
    select r.kind, r.id, r.data, r.deleted, r.updated_at
    from public.records r
    where r.ws = p_ws
      and (p_since is null or r.updated_at > p_since)
    order by r.updated_at asc
    limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end;
$$;

-- ---------------------------------------------------------------------
--  Simpan / ubah banyak catatan sekaligus
-- ---------------------------------------------------------------------
create or replace function public.rec_push(p_ws text, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  n int := 0;
begin
  if p_ws is null or p_ws !~ '^[0-9a-f]{64}$' then
    raise exception 'Kode ruang kerja tidak valid';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Format data salah';
  end if;
  if jsonb_array_length(p_rows) > 200 then
    raise exception 'Terlalu banyak baris dalam satu kiriman';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    insert into public.records (ws, kind, id, data, deleted, updated_at)
    values (
      p_ws,
      left(r->>'kind', 30),
      left(r->>'id', 64),
      coalesce(r->'data', '{}'::jsonb),
      coalesce((r->>'deleted')::boolean, false),
      clock_timestamp()
    )
    on conflict (ws, kind, id) do update
      set data       = excluded.data,
          deleted    = excluded.deleted,
          updated_at = excluded.updated_at;
    n := n + 1;
  end loop;

  return n;
end;
$$;

-- Hanya dua fungsi ini yang boleh dipanggil dari web
revoke all on function public.rec_pull(text, timestamptz, int) from public;
revoke all on function public.rec_push(text, jsonb)            from public;
grant execute on function public.rec_pull(text, timestamptz, int) to anon, authenticated;
grant execute on function public.rec_push(text, jsonb)            to anon, authenticated;

-- Selesai. Lanjut: salin Project URL + anon/publishable key ke file config.js
