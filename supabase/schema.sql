-- 脚本棚のDB。新しい Supabase プロジェクトの SQL Editor で1回だけ流す

-- テーブル

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 30),
  created_at   timestamptz not null default now()
);

create table public.scripts (
  id               uuid primary key default gen_random_uuid(),
  -- アカウントを消しても脚本は残す
  owner_id         uuid default auth.uid() references public.profiles (id) on delete set null,
  title            text not null check (char_length(btrim(title)) between 1 and 100),
  author_name      text not null check (char_length(btrim(author_name)) between 1 and 50),
  synopsis         text not null default '' check (char_length(synopsis) <= 2000),
  genres           text[] not null check (cardinality(genres) between 1 and 3),
  length_category  text not null check (length_category in ('short', 'medium', 'long')),
  runtime_minutes  integer check (runtime_minutes between 1 and 600),
  status           text not null default 'open'
                   check (status in ('open', 'unselected', 'in_production', 'completed')),
  usage_permission text not null default 'ask'
                   check (usage_permission in ('free', 'ask', 'read_only')),
  visibility       text not null default 'members'
                   check (visibility in ('public', 'members')),
  pdf_path         text not null unique,
  pdf_filename     text not null default 'script.pdf' check (char_length(pdf_filename) <= 200),
  pdf_size         integer check (pdf_size >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index scripts_created_at_idx on public.scripts (created_at desc);
create index scripts_owner_idx      on public.scripts (owner_id);

-- トリガー

-- 登録時に profiles を作る
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name   text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
begin
  if v_name = '' then
    v_name := 'ユーザー';
  end if;

  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(v_name, 30)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 列単位の権限
-- Supabase は新しいテーブルに全権限を付けるので、一度外して必要な分だけ付け直す。

revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

revoke insert, update, delete on public.scripts from anon, authenticated;
grant insert (title, author_name, synopsis, genres, length_category, runtime_minutes,
              status, usage_permission, visibility, pdf_path, pdf_filename, pdf_size)
  on public.scripts to authenticated;

-- RLS

alter table public.profiles        enable row level security;
alter table public.scripts         enable row level security;

create policy "profiles: read all" on public.profiles
  for select using (true);
create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- メンバー限定はログインした人だけ
create policy "scripts: read" on public.scripts
  for select using (
    visibility = 'public'
    or (select auth.uid()) is not null
    or owner_id = (select auth.uid())
  );
create policy "scripts: insert by member" on public.scripts
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

revoke execute on function public.handle_new_user()          from public, anon, authenticated;

-- PDF置き場: scripts/<ユーザーID>/<ランダム>.pdf
-- 非公開バケット。画面からは期限つきの署名URLで読む

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scripts', 'scripts', false, 20971520, array['application/pdf'])  -- 20MB
on conflict (id) do nothing;

create policy "script pdf: upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'scripts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- その PDF を使っている脚本を読める人（scripts の RLS がそのまま効く）
create policy "script pdf: read" on storage.objects
  for select using (
    bucket_id = 'scripts'
    and (
      exists (select 1 from public.scripts s where s.pdf_path = objects.name)
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

create policy "script pdf: delete own or admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'scripts'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );
