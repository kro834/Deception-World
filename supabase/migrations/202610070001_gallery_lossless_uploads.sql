-- Apply before deploying uploadProtocol 2. All browser writes remain signed-only.
begin;
alter table public.gallery_posts drop constraint gallery_posts_width_check;
alter table public.gallery_posts drop constraint gallery_posts_height_check;
alter table public.gallery_posts drop constraint gallery_posts_bytes_check;
alter table public.gallery_posts add constraint gallery_posts_dimensions_check
  check (width > 0 and height > 0 and width::bigint * height::bigint <= 40000000);
alter table public.gallery_posts add constraint gallery_posts_bytes_check check (bytes between 1 and 19922944);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('gallery-images','gallery-images',false,19922944,array['image/jpeg','image/png','image/webp']),
       ('gallery-upload-staging','gallery-upload-staging',false,19922944,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy gallery_server_only on storage.objects;
create policy gallery_server_only on storage.objects as restrictive for all to anon,authenticated
using (bucket_id not in ('gallery-images','gallery-upload-staging'))
with check (bucket_id not in ('gallery-images','gallery-upload-staging'));

create table public.gallery_uploads (
  id text primary key check (id ~ '^u-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  owner_id uuid not null references auth.users(id),
  stage_path text not null unique check (stage_path = id || '/source'),
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  reserved_bytes integer not null default 19922944 check (reserved_bytes in (0,19922944)),
  state text not null default 'waiting' check(state in ('waiting','processing','failed','ready')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null default (now() + interval '135 minutes'),
  lease_id uuid,
  lease_until timestamptz,
  cleanup_id uuid,
  cleanup_until timestamptz,
  post_id text unique references public.gallery_posts(id),
  digest text check (digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index gallery_uploads_expiry on public.gallery_uploads(expires_at) where reserved_bytes > 0;
create index gallery_uploads_owner on public.gallery_uploads(owner_id) where reserved_bytes > 0;
alter table public.gallery_uploads enable row level security;
revoke all on public.gallery_uploads from public,anon,authenticated;
grant select,insert,update,delete on public.gallery_uploads to service_role;

-- The old five-argument API remains available, but shares the staging-aware lock.
create or replace function public.gallery_reserve_upload(p_user uuid,p_id text,p_width integer,p_height integer,p_bytes integer,p_format text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_row public.gallery_posts; v_count bigint; v_bytes bigint;
begin
  if not exists(select 1 from auth.users where id=p_user) then return jsonb_build_object('error','auth'); end if;
  if p_format is null or p_format not in ('jpeg','png','webp') or p_width is null or p_height is null or p_bytes is null
    or p_width<=0 or p_height<=0 or p_width::bigint*p_height::bigint>40000000 or p_bytes not between 1 and 19922944
    then return jsonb_build_object('error','input'); end if;
  perform pg_advisory_xact_lock(623409210);
  select count(*),coalesce(sum(bytes),0) into v_count,v_bytes from public.gallery_posts;
  if v_count>=1000 or v_bytes+p_bytes+(select coalesce(sum(reserved_bytes),0) from public.gallery_uploads)>524288000
    then return jsonb_build_object('error','global_quota'); end if;
  select count(*),coalesce(sum(bytes),0) into v_count,v_bytes from public.gallery_posts where owner_id=p_user;
  if v_count>=50 or v_bytes+p_bytes>104857600 then return jsonb_build_object('error','user_quota'); end if;
  insert into public.gallery_posts(id,owner_id,object_path,width,height,bytes)
  values(p_id,p_user,p_id||'.'||p_format,p_width,p_height,p_bytes) returning * into v_row;
  return jsonb_build_object('post',to_jsonb(v_row));
end $$;
create or replace function public.gallery_reserve_upload(p_user uuid,p_id text,p_width integer,p_height integer,p_bytes integer)
returns jsonb language sql security definer set search_path=pg_catalog as $$
  select public.gallery_reserve_upload(p_user,p_id,p_width,p_height,p_bytes,'webp');
$$;

create function public.gallery_upload_init(p_user uuid,p_id text,p_type text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_result jsonb; v_row public.gallery_uploads;
begin
  if p_type is null or p_type not in ('image/jpeg','image/png','image/webp') then return jsonb_build_object('error','input'); end if;
  v_result:=public.gallery_begin_upload(p_user);
  if v_result ? 'error' then return v_result; end if;
  perform pg_advisory_xact_lock(623409210);
  if (select count(*) from public.gallery_uploads where owner_id=p_user and reserved_bytes>0)>=10
    then return jsonb_build_object('error','rate'); end if;
  if (select count(*) from public.gallery_uploads where reserved_bytes>0)>=100
    or (select coalesce(sum(bytes),0) from public.gallery_posts)+(select coalesce(sum(reserved_bytes),0) from public.gallery_uploads)+19922944>524288000
    then return jsonb_build_object('error','global_quota'); end if;
  if (select count(*) from public.gallery_posts where owner_id=p_user)>=50
    or (select coalesce(sum(bytes),0) from public.gallery_posts where owner_id=p_user)>=104857600
    then return jsonb_build_object('error','user_quota'); end if;
  insert into public.gallery_uploads(id,owner_id,stage_path,content_type)
  values(p_id,p_user,p_id||'/source',p_type) returning * into v_row;
  return jsonb_build_object('upload',to_jsonb(v_row));
end $$;

create function public.gallery_upload_claim(p_user uuid,p_id text,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_row public.gallery_uploads; v_post public.gallery_posts;
begin
  select * into v_row from public.gallery_uploads where id=p_id and owner_id=p_user for update;
  if not found then return jsonb_build_object('error','not_found'); end if;
  if v_row.state='ready' then
    select * into v_post from public.gallery_posts where id=v_row.post_id;
    return jsonb_build_object('post',to_jsonb(v_post),'ready',true);
  end if;
  if v_row.expires_at<=now() or v_row.state='failed' or v_row.reserved_bytes=0 then return jsonb_build_object('error','expired'); end if;
  if v_row.lease_until>now() then return jsonb_build_object('error','busy'); end if;
  if v_row.attempts>=5 then return jsonb_build_object('error','rate'); end if;
  update public.gallery_uploads set state='processing',attempts=attempts+1,lease_id=p_lease,lease_until=now()+interval '3 minutes'
    where id=p_id returning * into v_row;
  return jsonb_build_object('upload',to_jsonb(v_row));
end $$;

-- Bind the immutable final path AND exact bytes before any Storage write. A
-- resumed worker can only upload that same digest, never overwrite or delete it.
create function public.gallery_upload_prepare(p_user uuid,p_id text,p_lease uuid,p_width integer,p_height integer,p_bytes integer,p_format text,p_digest text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_row public.gallery_uploads; v_post public.gallery_posts; v_result jsonb;
begin
  perform pg_advisory_xact_lock(623409210);
  select * into v_row from public.gallery_uploads where id=p_id and owner_id=p_user for update;
  if not found then return jsonb_build_object('error','not_found'); end if;
  if v_row.state<>'processing' or v_row.lease_id is distinct from p_lease or v_row.lease_until<=now() or v_row.expires_at<=now()
    then return jsonb_build_object('error','busy'); end if;
  if p_digest is null or p_digest !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','input'); end if;
  if v_row.post_id is not null then
    select * into v_post from public.gallery_posts where id=v_row.post_id;
    if v_row.digest<>p_digest or v_post.bytes<>p_bytes or v_post.width<>p_width or v_post.height<>p_height or v_post.object_path<>p_id||'.'||p_format
      then return jsonb_build_object('error','upload_conflict'); end if;
    return jsonb_build_object('post',to_jsonb(v_post));
  end if;
  v_result:=public.gallery_reserve_upload(p_user,p_id,p_width,p_height,p_bytes,p_format);
  if v_result ? 'error' then return v_result; end if;
  update public.gallery_uploads set post_id=p_id,digest=p_digest where id=p_id;
  return v_result;
end $$;

create function public.gallery_upload_finish(p_user uuid,p_id text,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_row public.gallery_uploads; v_post public.gallery_posts;
begin
  select * into v_row from public.gallery_uploads where id=p_id and owner_id=p_user for update;
  if not found then return jsonb_build_object('error','not_found'); end if;
  if v_row.state='ready' then
    select * into v_post from public.gallery_posts where id=v_row.post_id;
    return jsonb_build_object('post',to_jsonb(v_post),'ready',true);
  end if;
  if v_row.state<>'processing' or v_row.lease_id is distinct from p_lease or v_row.lease_until<=now() or v_row.post_id is null
    then return jsonb_build_object('error','busy'); end if;
  update public.gallery_posts set state='ready' where id=v_row.post_id returning * into v_post;
  update public.gallery_uploads set state='ready',lease_id=null,lease_until=null where id=p_id;
  return jsonb_build_object('post',to_jsonb(v_post));
end $$;

create function public.gallery_upload_release(p_user uuid,p_id text,p_lease uuid,p_failed boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
  update public.gallery_uploads set state=case when p_failed then 'failed' else 'waiting' end,lease_id=null,lease_until=null
  where id=p_id and owner_id=p_user and state='processing' and lease_id=p_lease;
  return jsonb_build_object('ok',true);
end $$;

-- Tombstone objects outlive the two-hour upload token. Removing them earlier
-- would allow token replay to recreate an unaccounted object after deletion.
create function public.gallery_upload_cleanup_claim(p_lease uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_rows jsonb;
begin
  with candidates as (
    select id from public.gallery_uploads where reserved_bytes>0 and expires_at<=now()
      and (lease_until is null or lease_until<=now()) and (cleanup_until is null or cleanup_until<=now())
    order by expires_at limit 4 for update skip locked
  ), claimed as (
    update public.gallery_uploads u set cleanup_id=p_lease,cleanup_until=now()+interval '3 minutes'
    from candidates c where u.id=c.id returning u.id,u.stage_path
  ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into v_rows from claimed;
  return jsonb_build_object('uploads',v_rows);
end $$;
create function public.gallery_upload_cleanup_finish(p_id text,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform pg_advisory_xact_lock(623409210);
  update public.gallery_uploads set reserved_bytes=0,cleanup_id=null,cleanup_until=null
    where id=p_id and cleanup_id=p_lease and expires_at<=now();
  delete from public.gallery_uploads where id=p_id and reserved_bytes=0 and post_id is null;
  return jsonb_build_object('ok',true);
end $$;

create function public.gallery_upload_protocol_ready()
returns boolean language sql security definer set search_path=pg_catalog as $$
  select count(*)=2 from storage.buckets where id in ('gallery-images','gallery-upload-staging')
    and not public and file_size_limit=19922944
    and allowed_mime_types @> array['image/jpeg','image/png','image/webp']
    and allowed_mime_types <@ array['image/jpeg','image/png','image/webp']
    and exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='gallery_uploads' and c.relrowsecurity)
    and exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='storage' and c.relname='objects' and c.relrowsecurity);
$$;

revoke all on function public.gallery_reserve_upload(uuid,text,integer,integer,integer,text),public.gallery_upload_init(uuid,text,text),public.gallery_upload_claim(uuid,text,uuid),public.gallery_upload_prepare(uuid,text,uuid,integer,integer,integer,text,text),public.gallery_upload_finish(uuid,text,uuid),public.gallery_upload_release(uuid,text,uuid,boolean),public.gallery_upload_cleanup_claim(uuid),public.gallery_upload_cleanup_finish(text,uuid),public.gallery_upload_protocol_ready() from public,anon,authenticated;
grant execute on function public.gallery_reserve_upload(uuid,text,integer,integer,integer,text),public.gallery_upload_init(uuid,text,text),public.gallery_upload_claim(uuid,text,uuid),public.gallery_upload_prepare(uuid,text,uuid,integer,integer,integer,text,text),public.gallery_upload_finish(uuid,text,uuid),public.gallery_upload_release(uuid,text,uuid,boolean),public.gallery_upload_cleanup_claim(uuid),public.gallery_upload_cleanup_finish(text,uuid),public.gallery_upload_protocol_ready() to service_role;
commit;
