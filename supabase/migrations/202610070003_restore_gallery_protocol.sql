-- Repair an upgraded installation with legacy settings/function bodies after
-- the four gallery migrations. Restore settings/functions only; retain every post,
-- title, history entry, quota and permission. Safe to repeat on that installation.
begin;
do $$
begin
  if to_regclass('public.gallery_uploads') is null
    or to_regclass('public.gallery_title_buckets') is null
    or to_regprocedure('public.gallery_take_title_rate(uuid)') is null
    or to_regprocedure('public.gallery_set_title(uuid,text,text,integer)') is null
    or to_regprocedure('public.gallery_reserve_upload(uuid,text,integer,integer,integer)') is null
    or to_regprocedure('public.gallery_reserve_upload(uuid,text,integer,integer,integer,text)') is null
    or to_regprocedure('public.gallery_upload_protocol_ready()') is null then
    raise exception 'Apply the four gallery migrations in order before this repair';
  end if;
  if (select count(*) from storage.buckets where id in ('gallery-images','gallery-upload-staging')) <> 2 then
    raise exception 'Both existing gallery buckets are required; repair does not create or replace storage';
  end if;
end $$;

update storage.buckets
set public=false, file_size_limit=19922944,
  allowed_mime_types=array['image/jpeg','image/png','image/webp']
where id in ('gallery-images','gallery-upload-staging');

-- The legacy entry point must use the same staging-aware quota transaction.
create or replace function public.gallery_reserve_upload(p_user uuid,p_id text,p_width integer,p_height integer,p_bytes integer)
returns jsonb language sql security definer set search_path=pg_catalog as $$
  select public.gallery_reserve_upload(p_user,p_id,p_width,p_height,p_bytes,'webp');
$$;

create or replace function public.gallery_set_title(p_user uuid,p_artwork text,p_title text,p_expected integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_row public.gallery_titles; v_previous text; v_wait integer;
begin
  if not exists(select 1 from auth.users where id=p_user) then return jsonb_build_object('error','auth'); end if;
  perform pg_advisory_xact_lock(623409211);
  if p_artwork is null then return jsonb_build_object('error','input'); end if;
  if p_artwork !~ '^g(0[1-9]|[1-9][0-9]|10[0-9]|11[0-3])$' then
    perform 1 from public.gallery_posts where id=p_artwork and state='ready' and deleted_at is null for share;
    if not found then return jsonb_build_object('error','not_found'); end if;
  end if;
  if p_title is null or char_length(p_title)>120 or p_title ~ '[[:cntrl:]]' or p_expected is null or p_expected<0
    then return jsonb_build_object('error','input'); end if;
  insert into public.gallery_titles(artwork_id) values(p_artwork) on conflict do nothing;
  select * into v_row from public.gallery_titles where artwork_id=p_artwork for update;
  if v_row.title=btrim(p_title) then return jsonb_build_object('title',v_row.title,'version',v_row.version); end if;
  if v_row.version<>p_expected then
    return jsonb_build_object('error','conflict','current',jsonb_build_object('title',v_row.title,'version',v_row.version));
  end if;
  v_wait:=public.gallery_take_title_rate(p_user);
  if v_wait>0 then return jsonb_build_object('error','title_rate','retry_after',v_wait); end if;
  with cutoff as (select id from public.gallery_title_history order by id desc offset 19999 limit 1),
  expired as (
    select id from public.gallery_title_history
    where edited_at<now()-interval '30 days' or id<=(select id from cutoff)
    order by id limit 500 for update skip locked
  ) delete from public.gallery_title_history h using expired e where h.id=e.id;
  if (select count(*) from public.gallery_title_history)>=20000 then return jsonb_build_object('error','history_quota'); end if;
  v_previous:=v_row.title;
  update public.gallery_titles set title=btrim(p_title),version=version+1,updated_by=p_user,updated_at=now()
    where artwork_id=p_artwork returning * into v_row;
  insert into public.gallery_title_history(artwork_id,title,previous_title,version,edited_by)
    values(p_artwork,v_row.title,v_previous,v_row.version,p_user);
  return jsonb_build_object('title',v_row.title,'version',v_row.version);
end $$;

-- CREATE OR REPLACE retains the existing grants; do not broaden browser roles.
do $$
begin
  if public.gallery_upload_protocol_ready() is not true then
    raise exception 'Gallery upload prerequisites are incomplete; no repair was committed';
  end if;
end $$;
commit;
