-- Sprynt – schemat bazy w Supabase. Uruchom raz: Supabase → SQL Editor → New query → wklej → Run.
-- Każdy użytkownik widzi i zmienia WYŁĄCZNIE swoje dane (Row Level Security).

-- 1) Dane przestrzeni roboczej (jeden dokument JSON na użytkownika, z numerem wersji)
create table if not exists public.workspaces (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  rev        integer     not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.workspaces enable row level security;
-- Nowe projekty Supabase nie nadają domyślnie uprawnień do tabel – dajemy je tylko zalogowanym (RLS i tak ogranicza do własnych wierszy).
revoke all on table public.workspaces from anon;
grant select, insert, update, delete on table public.workspaces to authenticated;

drop policy if exists "workspaces: odczyt własnych" on public.workspaces;
drop policy if exists "workspaces: zapis własnych" on public.workspaces;
drop policy if exists "workspaces: zmiana własnych" on public.workspaces;
drop policy if exists "workspaces: usuwanie własnych" on public.workspaces;
create policy "workspaces: odczyt własnych"   on public.workspaces for select to authenticated using (auth.uid() = user_id);
create policy "workspaces: zapis własnych"    on public.workspaces for insert to authenticated with check (auth.uid() = user_id);
create policy "workspaces: zmiana własnych"   on public.workspaces for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "workspaces: usuwanie własnych" on public.workspaces for delete to authenticated using (auth.uid() = user_id);

-- 2) Zapis z kontrolą wersji: zwraca nowy numer wersji albo -aktualny, gdy ktoś (inne urządzenie) zapisał wcześniej.
create or replace function public.save_workspace(p_data jsonb, p_base integer)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  cur integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select rev into cur from public.workspaces where user_id = auth.uid() for update;
  if cur is null then
    insert into public.workspaces (user_id, data, rev) values (auth.uid(), p_data, 1);
    return 1;
  end if;
  if cur <> p_base then
    return -cur;
  end if;
  update public.workspaces set data = p_data, rev = cur + 1, updated_at = now() where user_id = auth.uid();
  return cur + 1;
end;
$$;
revoke all on function public.save_workspace(jsonb, integer) from public, anon;
grant execute on function public.save_workspace(jsonb, integer) to authenticated;

-- 3) Usunięcie własnego konta (dane w workspaces znikają kaskadowo)
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 4) Pliki: prywatny magazyn „files”, każdy użytkownik ma folder <user_id>/
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists "files: odczyt własnych"   on storage.objects;
drop policy if exists "files: zapis własnych"    on storage.objects;
drop policy if exists "files: zmiana własnych"   on storage.objects;
drop policy if exists "files: usuwanie własnych" on storage.objects;
create policy "files: odczyt własnych"   on storage.objects for select to authenticated using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "files: zapis własnych"    on storage.objects for insert to authenticated with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "files: zmiana własnych"   on storage.objects for update to authenticated using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "files: usuwanie własnych" on storage.objects for delete to authenticated using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
