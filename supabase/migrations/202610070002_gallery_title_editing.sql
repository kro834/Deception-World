-- Title edits are interactive: replenish burst capacity continuously rather
-- than locking a visitor out for the remainder of a one-hour window.
begin;
create table public.gallery_title_buckets (
  bucket_key text primary key,
  tokens numeric not null check (tokens between 0 and 120),
  updated_at timestamptz not null
);
alter table public.gallery_title_buckets enable row level security;
revoke all on public.gallery_title_buckets from public,anon,authenticated;
grant select,insert,update,delete on public.gallery_title_buckets to service_role;
create index gallery_title_buckets_expiry on public.gallery_title_buckets(updated_at);

-- Called under the same advisory lock as title mutation. Check both buckets
-- before consuming either, so a global rejection does not drain user capacity.
create function public.gallery_take_title_rate(p_user uuid)
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare v_now timestamptz; v_user numeric; v_global numeric; v_wait integer;
begin
  perform pg_advisory_xact_lock(623409211);
  v_now:=clock_timestamp();
  with expired as (
    select bucket_key from public.gallery_title_buckets where updated_at<v_now-interval '7 days'
    order by updated_at limit 128 for update skip locked
  ) delete from public.gallery_title_buckets b using expired e where b.bucket_key=e.bucket_key;
  insert into public.gallery_title_buckets(bucket_key,tokens,updated_at)
  values(p_user::text,20,v_now),('global',120,v_now) on conflict do nothing;
  select least(20,tokens+greatest(0,extract(epoch from v_now-updated_at))/3)
    into v_user from public.gallery_title_buckets where bucket_key=p_user::text;
  select least(120,tokens+greatest(0,extract(epoch from v_now-updated_at))*2)
    into v_global from public.gallery_title_buckets where bucket_key='global';
  v_wait:=greatest(0,ceil((1-v_user)*3),ceil((1-v_global)/2))::integer;
  if v_wait>0 then return v_wait; end if;
  update public.gallery_title_buckets set tokens=v_user-1,updated_at=v_now where bucket_key=p_user::text;
  update public.gallery_title_buckets set tokens=v_global-1,updated_at=v_now where bucket_key='global';
  return 0;
end $$;

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
  -- A lost successful HTTP reply can be retried using its old version without
  -- consuming another token or creating a duplicate audit record.
  if v_row.title=btrim(p_title) then return jsonb_build_object('title',v_row.title,'version',v_row.version); end if;
  if v_row.version<>p_expected then
    return jsonb_build_object('error','conflict','current',jsonb_build_object('title',v_row.title,'version',v_row.version));
  end if;
  v_wait:=public.gallery_take_title_rate(p_user);
  if v_wait>0 then return jsonb_build_object('error','title_rate','retry_after',v_wait); end if;
  -- Preserve the existing bounded, audited recovery history and permissions.
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

-- Legacy upload/delete/restore rate counters are intentionally untouched.
revoke all on function public.gallery_take_title_rate(uuid),public.gallery_set_title(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.gallery_set_title(uuid,text,text,integer) to service_role;
commit;
