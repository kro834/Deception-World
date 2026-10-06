-- Add static artwork IDs g80 through g113 without changing existing title data,
-- anonymous access, quotas, history retention, concurrency or RPC privileges.
begin;

lock table public.gallery_titles in access exclusive mode;

-- Only replace the original domain or this migration's already-expanded domain.
-- A same-named custom constraint must be reviewed before changing its rules.
do $$
declare v_expression text; v_validated boolean; v_noinherit boolean;
begin
  select pg_get_expr(conbin, conrelid), convalidated, connoinherit
  into v_expression, v_validated, v_noinherit
  from pg_constraint
  where conrelid = 'public.gallery_titles'::regclass
    and conname = 'gallery_titles_artwork_id_check' and contype = 'c';
  if not found or not v_validated or v_noinherit or v_expression not in (
    format('((artwork_id ~ %L::text) OR (artwork_id ~ %L::text))',
      '^g(0[1-9]|[1-6][0-9]|7[0-9])$',
      '^u-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
    format('((artwork_id ~ %L::text) OR (artwork_id ~ %L::text))',
      '^g(0[1-9]|[1-9][0-9]|10[0-9]|11[0-3])$',
      '^u-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  ) then
    raise exception 'Unexpected gallery artwork ID constraint; inspect the live schema before applying this migration';
  end if;
end $$;

alter table public.gallery_titles drop constraint gallery_titles_artwork_id_check;
alter table public.gallery_titles add constraint gallery_titles_artwork_id_check
  check (artwork_id ~ '^g(0[1-9]|[1-9][0-9]|10[0-9]|11[0-3])$' or artwork_id ~ '^u-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');

create or replace function public.gallery_set_title(p_user uuid, p_artwork text, p_title text, p_expected integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_row public.gallery_titles; v_previous text;
begin
  if not exists(select 1 from auth.users where id = p_user) then return jsonb_build_object('error', 'auth'); end if;
  perform pg_advisory_xact_lock(623409211);
  if p_artwork !~ '^g(0[1-9]|[1-9][0-9]|10[0-9]|11[0-3])$' then
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

commit;
