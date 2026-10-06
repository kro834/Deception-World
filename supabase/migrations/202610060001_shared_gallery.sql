-- Separate from the application's existing Grok/PGLite schema. Apply to the
-- connected Supabase project as an administrator before enabling gallery APIs.
begin;

create table if not exists public.gallery_posts (
  id text primary key check (id ~ '^u-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  sequence bigint generated always as identity unique,
  owner_id uuid not null references auth.users(id),
  object_path text not null unique,
  width integer not null check (width between 1 and 2400),
  height integer not null check (height between 1 and 2400),
  bytes integer not null check (bytes between 1 and 3145728),
  state text not null default 'pending' check (state in ('pending', 'ready')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists gallery_posts_owner on public.gallery_posts(owner_id, created_at);

create table if not exists public.gallery_titles (
  artwork_id text primary key check (artwork_id ~ '^g(0[1-9]|[1-6][0-9]|7[0-9])$' or artwork_id ~ '^u-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  title text not null default '' check (char_length(title) <= 120 and title !~ '[[:cntrl:]]'),
  version integer not null default 0 check (version >= 0),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.gallery_title_history (
  id bigint generated always as identity primary key,
  artwork_id text not null references public.gallery_titles(artwork_id),
  title text not null,
  previous_title text not null,
  version integer not null,
  edited_by uuid not null references auth.users(id),
  edited_at timestamptz not null default now(),
  unique (artwork_id, version)
);
create table if not exists public.gallery_rate_limits (
  user_id uuid not null references auth.users(id),
  action text not null check (action in ('upload', 'title', 'delete', 'restore')),
  window_start timestamptz not null,
  count integer not null check (count >= 0),
  primary key (user_id, action, window_start)
);
create index if not exists gallery_rate_limits_expiry on public.gallery_rate_limits(window_start);
create table if not exists public.gallery_global_limits (
  action text not null check (action in ('upload', 'title')),
  window_start timestamptz not null,
  count integer not null check (count >= 0),
  primary key (action, window_start)
);
create index if not exists gallery_global_limits_expiry on public.gallery_global_limits(window_start);
create index if not exists gallery_title_history_expiry on public.gallery_title_history(edited_at);

alter table public.gallery_posts enable row level security;
alter table public.gallery_titles enable row level security;
alter table public.gallery_title_history enable row level security;
alter table public.gallery_rate_limits enable row level security;
alter table public.gallery_global_limits enable row level security;
revoke all on public.gallery_posts, public.gallery_titles, public.gallery_title_history, public.gallery_rate_limits, public.gallery_global_limits from anon, authenticated;
grant select, insert, update, delete on public.gallery_posts, public.gallery_titles, public.gallery_title_history, public.gallery_rate_limits, public.gallery_global_limits to service_role;
grant usage, select on sequence public.gallery_posts_sequence_seq, public.gallery_title_history_id_seq to service_role;

-- No storage SELECT/INSERT policy is added for browser roles. Only the server
-- can sign a URL or write a sanitized image with its service role credential.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('gallery-images', 'gallery-images', false, 3145728, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- A restrictive rule also blocks any unrelated broad storage policies from
-- accidentally granting browser users access to this particular bucket.
do $$ begin
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects' and c.relrowsecurity) then
    raise exception 'Storage object row security must be enabled before installing the gallery';
  end if;
  if not exists(select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'gallery_server_only') then
    create policy gallery_server_only on storage.objects as restrictive for all to anon, authenticated
    using (bucket_id <> 'gallery-images') with check (bucket_id <> 'gallery-images');
  end if;
end $$;

create or replace function public.gallery_take_rate(p_user uuid, p_action text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare v_start timestamptz; v_count integer;
begin
  -- Keep at most seven days of inactive counters. An indexed, bounded batch
  -- avoids a cron dependency and skips rows locked by another server instance.
  with expired as (
    select user_id, action, window_start from public.gallery_rate_limits
    where window_start < now() - interval '7 days'
    order by window_start limit 128 for update skip locked
  )
  delete from public.gallery_rate_limits as limits using expired
  where limits.user_id = expired.user_id and limits.action = expired.action
    and limits.window_start = expired.window_start;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_seconds) * p_seconds);
  insert into public.gallery_rate_limits(user_id, action, window_start, count)
  values(p_user, p_action, v_start, 1)
  on conflict (user_id, action, window_start) do update
  set count = public.gallery_rate_limits.count + 1
  where public.gallery_rate_limits.count < p_limit
  returning count into v_count;
  return v_count is not null;
end $$;

create or replace function public.gallery_take_global_rate(p_action text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare v_start timestamptz; v_count integer;
begin
  with expired as (
    select action, window_start from public.gallery_global_limits
    where window_start < now() - interval '7 days'
    order by window_start limit 128 for update skip locked
  )
  delete from public.gallery_global_limits as limits using expired
  where limits.action = expired.action and limits.window_start = expired.window_start;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_seconds) * p_seconds);
  insert into public.gallery_global_limits(action, window_start, count)
  values(p_action, v_start, 1)
  on conflict (action, window_start) do update
  set count = public.gallery_global_limits.count + 1
  where public.gallery_global_limits.count < p_limit
  returning count into v_count;
  return v_count is not null;
end $$;

-- Count attempts before parsing/decoding an uploaded image so invalid files
-- cannot consume unbounded image processor work with a valid account.
create or replace function public.gallery_begin_upload(p_user uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if not exists(select 1 from auth.users where id = p_user) then return jsonb_build_object('error', 'auth'); end if;
  if not public.gallery_take_rate(p_user, 'upload', 10, 86400) then return jsonb_build_object('error', 'rate'); end if;
  if not public.gallery_take_global_rate('upload', 100, 86400) then return jsonb_build_object('error', 'rate'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.gallery_reserve_upload(p_user uuid, p_id text, p_width integer, p_height integer, p_bytes integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_row public.gallery_posts; v_count bigint; v_bytes bigint;
begin
  if not exists(select 1 from auth.users where id = p_user) then return jsonb_build_object('error', 'auth'); end if;
  -- One database lock covers concurrent requests across every server instance.
  perform pg_advisory_xact_lock(623409210);
  select count(*), coalesce(sum(bytes), 0) into v_count, v_bytes from public.gallery_posts;
  if v_count >= 1000 or v_bytes + p_bytes > 524288000 then return jsonb_build_object('error', 'global_quota'); end if;
  select count(*), coalesce(sum(bytes), 0) into v_count, v_bytes from public.gallery_posts where owner_id = p_user;
  if v_count >= 50 or v_bytes + p_bytes > 104857600 then return jsonb_build_object('error', 'user_quota'); end if;
  insert into public.gallery_posts(id, owner_id, object_path, width, height, bytes)
  values(p_id, p_user, p_id || '.webp', p_width, p_height, p_bytes)
  returning * into v_row;
  return jsonb_build_object('post', to_jsonb(v_row));
end $$;

create or replace function public.gallery_complete_upload(p_user uuid, p_id text, p_abort boolean default false)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_row public.gallery_posts;
begin
  select * into v_row from public.gallery_posts where id = p_id and owner_id = p_user and state = 'pending' for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if p_abort then
    delete from public.gallery_posts where id = p_id;
    return jsonb_build_object('ok', true);
  end if;
  update public.gallery_posts set state = 'ready' where id = p_id returning * into v_row;
  return jsonb_build_object('post', to_jsonb(v_row));
end $$;

create or replace function public.gallery_set_title(p_user uuid, p_artwork text, p_title text, p_expected integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_row public.gallery_titles; v_previous text;
begin
  if not exists(select 1 from auth.users where id = p_user) then return jsonb_build_object('error', 'auth'); end if;
  perform pg_advisory_xact_lock(623409211);
  if p_artwork !~ '^g(0[1-9]|[1-6][0-9]|7[0-9])$' then
    perform 1 from public.gallery_posts where id = p_artwork and state = 'ready' and deleted_at is null for share;
    if not found then return jsonb_build_object('error', 'not_found'); end if;
  end if;
  if p_title is null or char_length(p_title) > 120 or p_title ~ '[[:cntrl:]]' or p_expected is null or p_expected < 0 then return jsonb_build_object('error', 'input'); end if;
  insert into public.gallery_titles(artwork_id) values(p_artwork) on conflict do nothing;
  select * into v_row from public.gallery_titles where artwork_id = p_artwork for update;
  if v_row.version <> p_expected then return jsonb_build_object('error', 'conflict', 'current', jsonb_build_object('title', v_row.title, 'version', v_row.version)); end if;
  if v_row.title = btrim(p_title) then return jsonb_build_object('title', v_row.title, 'version', v_row.version); end if;
  if not public.gallery_take_rate(p_user, 'title', 20, 3600) then return jsonb_build_object('error', 'rate'); end if;
  if not public.gallery_take_global_rate('title', 120, 3600) then return jsonb_build_object('error', 'rate'); end if;
  -- Keep recent recovery history bounded by age and count. All title writers
  -- share the advisory lock above, so the 20,000-entry cap cannot race.
  with cutoff as (select id from public.gallery_title_history order by id desc offset 19999 limit 1),
  expired as (
    select id from public.gallery_title_history
    where edited_at < now() - interval '30 days' or id <= (select id from cutoff)
    order by id limit 500 for update skip locked
  )
  delete from public.gallery_title_history as history using expired where history.id = expired.id;
  if (select count(*) from public.gallery_title_history) >= 20000 then return jsonb_build_object('error', 'history_quota'); end if;
  v_previous := v_row.title;
  update public.gallery_titles set title = btrim(p_title), version = version + 1, updated_by = p_user, updated_at = now()
  where artwork_id = p_artwork returning * into v_row;
  insert into public.gallery_title_history(artwork_id, title, previous_title, version, edited_by)
  values(p_artwork, v_row.title, v_previous, v_row.version, p_user);
  return jsonb_build_object('title', v_row.title, 'version', v_row.version);
end $$;

create or replace function public.gallery_set_deleted(p_user uuid, p_id text, p_deleted boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_row public.gallery_posts;
begin
  if not exists(select 1 from auth.users where id = p_user) then return jsonb_build_object('error', 'auth'); end if;
  select * into v_row from public.gallery_posts where id = p_id and state = 'ready' for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if v_row.owner_id <> p_user then return jsonb_build_object('error', 'forbidden'); end if;
  if (v_row.deleted_at is not null) = p_deleted then return jsonb_build_object('ok', true); end if;
  if not public.gallery_take_rate(p_user, case when p_deleted then 'delete' else 'restore' end, 30, 3600) then return jsonb_build_object('error', 'rate'); end if;
  update public.gallery_posts set deleted_at = case when p_deleted then now() else null end where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.gallery_take_rate(uuid, text, integer, integer), public.gallery_take_global_rate(text, integer, integer), public.gallery_begin_upload(uuid), public.gallery_reserve_upload(uuid, text, integer, integer, integer), public.gallery_complete_upload(uuid, text, boolean), public.gallery_set_title(uuid, text, text, integer), public.gallery_set_deleted(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.gallery_begin_upload(uuid), public.gallery_reserve_upload(uuid, text, integer, integer, integer), public.gallery_complete_upload(uuid, text, boolean), public.gallery_set_title(uuid, text, text, integer), public.gallery_set_deleted(uuid, text, boolean) to service_role;
commit;
