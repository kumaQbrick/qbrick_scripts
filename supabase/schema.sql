-- 脚本棚のDB。新しい Supabase プロジェクトの SQL Editor で1回だけ流す

-- テーブル

create table public.app_secrets (
  key   text primary key,
  value text not null
);

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 30),
  is_member    boolean not null default false,
  is_admin     boolean not null default false,
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
  like_count       integer not null default 0,
  comment_count    integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index scripts_created_at_idx on public.scripts (created_at desc);
create index scripts_owner_idx      on public.scripts (owner_id);
create index scripts_genres_idx     on public.scripts using gin (genres);

create table public.likes (
  script_id  uuid not null references public.scripts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (script_id, user_id)
);

create index likes_user_idx on public.likes (user_id);

create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  script_id    uuid not null references public.scripts (id) on delete cascade,
  -- 匿名なら null。本当の投稿者は comment_authors に入る
  author_id    uuid references public.profiles (id) on delete set null,
  is_anonymous boolean not null default false,
  body         text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at   timestamptz not null default now()
);

create index comments_script_idx on public.comments (script_id, created_at);

create table public.comment_authors (
  comment_id uuid primary key references public.comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade
);

create index comment_authors_user_idx on public.comment_authors (user_id);

-- 判定用（RLS の中で使う）

create function public.is_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.is_member or p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- トリガー

-- 登録時に profiles を作る。招待コードが合っていればメンバー
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name   text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  v_code   text := btrim(coalesce(new.raw_user_meta_data ->> 'invite_code', ''));
  v_secret text;
begin
  select s.value into v_secret from public.app_secrets s where s.key = 'invite_code';

  if v_name = '' then
    v_name := 'ユーザー';
  end if;

  insert into public.profiles (id, display_name, is_member)
  values (
    new.id,
    left(v_name, 30),
    v_secret is not null and v_code <> '' and v_code = v_secret
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- いいね・コメント数の変化では updated_at を動かさない
create function public.touch_script_updated_at()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'like_count' - 'comment_count' - 'updated_at')
     is distinct from
     (to_jsonb(old) - 'like_count' - 'comment_count' - 'updated_at') then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger scripts_touch_updated_at
  before update on public.scripts
  for each row execute function public.touch_script_updated_at();

create function public.update_script_counters()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_script uuid := coalesce(new.script_id, old.script_id);
begin
  if tg_table_name = 'likes' then
    update public.scripts
       set like_count = (select count(*) from public.likes l where l.script_id = v_script)
     where id = v_script;
  else
    update public.scripts
       set comment_count = (select count(*) from public.comments c where c.script_id = v_script)
     where id = v_script;
  end if;
  return null;
end;
$$;

create trigger likes_counter
  after insert or delete on public.likes
  for each row execute function public.update_script_counters();

create trigger comments_counter
  after insert or delete on public.comments
  for each row execute function public.update_script_counters();

-- 列単位の権限
-- Supabase は新しいテーブルに全権限を付けるので、一度外して必要な分だけ付け直す。

revoke all on public.app_secrets from anon, authenticated;

revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

revoke insert, update, delete on public.scripts from anon, authenticated;
grant insert (title, author_name, synopsis, genres, length_category, runtime_minutes,
              status, usage_permission, visibility, pdf_path, pdf_filename, pdf_size)
  on public.scripts to authenticated;
grant update (title, author_name, synopsis, genres, length_category, runtime_minutes,
              status, usage_permission, visibility, pdf_path, pdf_filename, pdf_size)
  on public.scripts to authenticated;
grant delete on public.scripts to authenticated;

revoke insert, update, delete on public.likes from anon, authenticated;
grant insert (script_id) on public.likes to authenticated;
grant delete on public.likes to authenticated;

-- コメントは post_comment() 経由でしか書けない（匿名でも投稿者を記録するため）
revoke insert, update, delete on public.comments from anon, authenticated;
grant delete on public.comments to authenticated;

revoke all on public.comment_authors from anon;
revoke insert, update, delete on public.comment_authors from authenticated;

-- RLS

alter table public.app_secrets     enable row level security;  -- ポリシーなし = 誰も読めない
alter table public.profiles        enable row level security;
alter table public.scripts         enable row level security;
alter table public.likes           enable row level security;
alter table public.comments        enable row level security;
alter table public.comment_authors enable row level security;

create policy "profiles: read all" on public.profiles
  for select using (true);
create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- メンバー限定はメンバーと本人だけ
create policy "scripts: read" on public.scripts
  for select using (
    visibility = 'public'
    or (select public.is_member())
    or owner_id = (select auth.uid())
  );
create policy "scripts: insert by member" on public.scripts
  for insert to authenticated
  with check ((select public.is_member()) and owner_id = (select auth.uid()));
create policy "scripts: update by owner or admin" on public.scripts
  for update to authenticated
  using (
    (owner_id = (select auth.uid()) and (select public.is_member()))
    or (select public.is_admin())
  )
  with check (
    (owner_id = (select auth.uid()) and (select public.is_member()))
    or (select public.is_admin())
  );
create policy "scripts: delete by owner or admin" on public.scripts
  for delete to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));

-- 誰が押したかは本人にしか見えない。数は scripts.like_count
create policy "likes: read own" on public.likes
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "likes: insert by member" on public.likes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.is_member())
    -- 読める脚本だけ。自分の脚本は不可
    and exists (select 1 from public.scripts s
                 where s.id = likes.script_id
                   and s.owner_id is distinct from (select auth.uid()))
  );
create policy "likes: delete own" on public.likes
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "comments: read" on public.comments
  for select using (exists (select 1 from public.scripts s where s.id = comments.script_id));
create policy "comments: delete own or admin" on public.comments
  for delete to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.comment_authors ca
                where ca.comment_id = comments.id and ca.user_id = (select auth.uid()))
  );

-- 本人と管理者だけ
create policy "comment_authors: read own or admin" on public.comment_authors
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- 画面から呼ぶ関数

create function public.post_comment(p_script_id uuid, p_body text, p_anonymous boolean)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_anon boolean := coalesce(p_anonymous, false);
  v_id   uuid;
begin
  if v_uid is null or not public.is_member() then
    raise exception 'コメントできるのはメンバーだけです' using errcode = '42501';
  end if;
  if not exists (select 1 from public.scripts s where s.id = p_script_id) then
    raise exception '脚本が見つかりません' using errcode = 'P0002';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 2000 then
    raise exception 'コメントは1〜2000文字で入力してください' using errcode = '22023';
  end if;

  insert into public.comments (script_id, author_id, is_anonymous, body)
  values (p_script_id, case when v_anon then null else v_uid end, v_anon, v_body)
  returning id into v_id;

  insert into public.comment_authors (comment_id, user_id) values (v_id, v_uid);
  return v_id;
end;
$$;

create function public.redeem_invite(p_code text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_secret text;
begin
  if v_uid is null then
    raise exception 'ログインしてください' using errcode = '42501';
  end if;
  select s.value into v_secret from public.app_secrets s where s.key = 'invite_code';
  if v_secret is null or btrim(coalesce(p_code, '')) <> v_secret then
    return false;
  end if;
  update public.profiles set is_member = true where id = v_uid;
  return true;
end;
$$;

create function public.admin_list_users()
returns table (
  id uuid, display_name text, email text,
  is_member boolean, is_admin boolean, created_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '管理者だけが使えます' using errcode = '42501';
  end if;
  return query
    select p.id, p.display_name, u.email::text, p.is_member, p.is_admin, p.created_at
      from public.profiles p
      join auth.users u on u.id = p.id
     order by p.created_at;
end;
$$;

create function public.admin_set_member(p_user_id uuid, p_value boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '管理者だけが使えます' using errcode = '42501';
  end if;
  update public.profiles set is_member = coalesce(p_value, false) where id = p_user_id;
end;
$$;

-- 管理者を0人にはできない
create function public.admin_set_admin(p_user_id uuid, p_value boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '管理者だけが使えます' using errcode = '42501';
  end if;
  if not coalesce(p_value, false)
     and (select count(*) from public.profiles where is_admin) <= 1
     and exists (select 1 from public.profiles where id = p_user_id and is_admin) then
    raise exception '管理者が0人になるため外せません。先に別の人を管理者にしてください'
      using errcode = '22023';
  end if;
  update public.profiles
     set is_admin  = coalesce(p_value, false),
         is_member = is_member or coalesce(p_value, false)
   where id = p_user_id;
end;
$$;

create function public.admin_get_invite_code()
returns text
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '管理者だけが使えます' using errcode = '42501';
  end if;
  return (select s.value from public.app_secrets s where s.key = 'invite_code');
end;
$$;

create function public.admin_set_invite_code(p_code text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := btrim(coalesce(p_code, ''));
begin
  if not public.is_admin() then
    raise exception '管理者だけが使えます' using errcode = '42501';
  end if;
  if char_length(v_code) < 8 then
    raise exception '招待コードは8文字以上にしてください' using errcode = '22023';
  end if;
  insert into public.app_secrets (key, value) values ('invite_code', v_code)
  on conflict (key) do update set value = excluded.value;
end;
$$;

revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.touch_script_updated_at()  from public, anon, authenticated;
revoke execute on function public.update_script_counters()   from public, anon, authenticated;
-- 未ログインでは呼べないようにする
revoke execute on function public.post_comment(uuid, text, boolean) from public, anon;
revoke execute on function public.redeem_invite(text)               from public, anon;
revoke execute on function public.admin_list_users()                from public, anon;
revoke execute on function public.admin_set_member(uuid, boolean)   from public, anon;
revoke execute on function public.admin_set_admin(uuid, boolean)    from public, anon;
revoke execute on function public.admin_get_invite_code()           from public, anon;
revoke execute on function public.admin_set_invite_code(text)       from public, anon;
grant execute on function public.post_comment(uuid, text, boolean) to authenticated;
grant execute on function public.redeem_invite(text)               to authenticated;
grant execute on function public.admin_list_users()                to authenticated;
grant execute on function public.admin_set_member(uuid, boolean)   to authenticated;
grant execute on function public.admin_set_admin(uuid, boolean)    to authenticated;
grant execute on function public.admin_get_invite_code()           to authenticated;
grant execute on function public.admin_set_invite_code(text)       to authenticated;

-- PDF置き場: scripts/<ユーザーID>/<ランダム>.pdf
-- 非公開バケット。画面からは期限つきの署名URLで読む

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scripts', 'scripts', false, 20971520, array['application/pdf'])  -- 20MB
on conflict (id) do nothing;

create policy "script pdf: upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'scripts'
    and (select public.is_member())
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
      or (select public.is_admin())
    )
  );
