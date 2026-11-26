-- Shared workspaces use their own storage and permissions. Private decks keep their owner-only policies.
create table public.forma_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  title text not null,
  snapshot jsonb,
  revision integer not null default 0,
  last_save_id uuid,
  token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  link_role text check (link_role in ('viewer', 'commenter', 'editor')),
  updated_at timestamptz not null default now()
);
create table public.forma_room_invites (
  room_id uuid not null references public.forma_rooms on delete cascade,
  email text not null,
  role text not null check (role in ('viewer', 'commenter', 'editor')),
  joined_at timestamptz,
  last_sent_at timestamptz,
  primary key (room_id, email)
);
create table public.forma_room_guests (
  room_id uuid not null references public.forma_rooms on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  token text not null,
  alias uuid not null default gen_random_uuid(),
  primary key (room_id, user_id)
);
create table public.forma_room_presence (
  room_id uuid not null references public.forma_rooms on delete cascade,
  connection uuid not null,
  user_id uuid not null references auth.users on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (room_id, connection)
);
create table public.forma_room_versions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.forma_rooms on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  snapshot jsonb not null
);
create index forma_room_owner_idx on public.forma_rooms (owner_id, updated_at desc);
create index forma_room_invite_email_idx on public.forma_room_invites (email);
create index forma_room_versions_idx on public.forma_room_versions (room_id, created_at desc);
alter table public.forma_rooms enable row level security;
alter table public.forma_room_invites enable row level security;
alter table public.forma_room_guests enable row level security;
alter table public.forma_room_presence enable row level security;
alter table public.forma_room_versions enable row level security;
revoke all on public.forma_rooms, public.forma_room_invites, public.forma_room_guests,
  public.forma_room_presence, public.forma_room_versions from public, anon, authenticated;

-- Anonymous Auth is used for link guests, with a separate session in the browser.
create policy "Permanent users own private decks" on public.presentations
  as restrictive for all to authenticated
  using (not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false))
  with check (not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false));
create policy "Permanent users read private deck files" on storage.objects
  as restrictive for select to authenticated
  using (bucket_id <> 'forma-parts' or not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false));
create policy "Permanent users upload private deck files" on storage.objects
  as restrictive for insert to authenticated
  with check (bucket_id <> 'forma-parts' or not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false));

-- Match the verified Google identity against the current email on the Auth account.
create function public.forma_google_email(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select lower(u.email)
  from auth.users u
  where u.id = p_user and u.email_confirmed_at is not null
    and exists (
      select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google'
        and lower(i.identity_data->>'email') = lower(u.email)
        and i.identity_data->>'email_verified' = 'true'
    );
$$;

create function public.forma_room_member_role(p_id uuid, p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when r.owner_id = p_user then 'owner' else coalesce(i.role,
    case when g.token = r.token then r.link_role end) end
  from public.forma_rooms r
  left join public.forma_room_invites i
    on i.room_id = r.id and i.email = public.forma_google_email(p_user)
  left join public.forma_room_guests g on g.room_id = r.id and g.user_id = p_user
  where r.id = p_id;
$$;

-- Use the hosted domain Google verified. An email suffix does not establish organization membership.
create function public.forma_google_workspace(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select nullif(lower(coalesce(identity_data #>> '{custom_claims,hd}', identity_data->>'hd')), '')
  from auth.identities
  where user_id = p_user and provider = 'google' and identity_data->>'email_verified' = 'true'
    and lower(identity_data->>'email') = public.forma_google_email(p_user)
  order by last_sign_in_at desc nulls last
  limit 1;
$$;

create function public.forma_room_part_access(p_path text, p_write boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when p_path ~ '^[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}/[a-f0-9]{64}$' then
    case when p_write then public.forma_room_member_role(split_part(p_path, '/', 1)::uuid, auth.uid()) in ('owner', 'editor')
    else public.forma_room_member_role(split_part(p_path, '/', 1)::uuid, auth.uid()) is not null end
  else false end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('forma-room-parts', 'forma-room-parts', false, 5242880, array['application/octet-stream']);
create policy "Room members read shared files" on storage.objects for select to authenticated
  using (bucket_id = 'forma-room-parts' and public.forma_room_part_access(name, false));
create policy "Room editors upload shared files" on storage.objects for insert to authenticated
  with check (bucket_id = 'forma-room-parts' and public.forma_room_part_access(name, true));

create function public.forma_room_create(p_title text, p_link_role text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Sign in to create a shared workspace.' using errcode = '42501';
  end if;
  insert into public.forma_rooms (owner_id, title, link_role)
  values (auth.uid(), left(p_title, 1000), p_link_role) returning id into v_id;
  return v_id;
end;
$$;

create function public.forma_room_join(p_id uuid, p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.forma_room_member_role(p_id, auth.uid()) is null then
    insert into public.forma_room_guests (room_id, user_id, token)
    select id, auth.uid(), token from public.forma_rooms
    where id = p_id and token = p_token and link_role is not null and snapshot is not null
    on conflict (room_id, user_id) do update set token = excluded.token;
  end if;
  if public.forma_room_member_role(p_id, auth.uid()) is null then
    raise exception 'This workspace is unavailable. For an invitation, sign in with the Google account that received it.' using errcode = '42501';
  end if;
  update public.forma_room_invites set joined_at = now()
    where room_id = p_id and email = public.forma_google_email(auth.uid()) and joined_at is null;
end;
$$;

create function public.forma_room_identity(p_id uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when r.owner_id = p_user or r.link_role is null or
    public.forma_google_workspace(p_user) = public.forma_google_workspace(r.owner_id) then
    jsonb_build_object('id', p_user, 'name',
      coalesce(nullif(left(btrim(u.raw_user_meta_data->>'full_name'), 100), ''), u.email, 'Owner'),
      'role', permission.role,
      'email', case when r.owner_id = auth.uid() then u.email end)
  else jsonb_build_object('id', coalesce(g.alias, md5(r.token || p_user::text)::uuid), 'role', permission.role)
  end
  from public.forma_rooms r
  join auth.users u on u.id = p_user
  left join public.forma_room_guests g on g.room_id = r.id and g.user_id = p_user
  cross join lateral (select public.forma_room_member_role(r.id, p_user) as role) permission
  where r.id = p_id and permission.role is not null;
$$;

create function public.forma_room_read(p_id uuid, p_revision integer, p_connection uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_room public.forma_rooms;
  v_self jsonb;
  v_people jsonb;
begin
  select * into v_room from public.forma_rooms where id = p_id;
  v_self := public.forma_room_identity(p_id, auth.uid());
  if v_self is null or v_room.snapshot is null then
    raise exception 'You no longer have access to this workspace.' using errcode = '42501';
  end if;
  delete from public.forma_room_presence where room_id = p_id and seen_at < now() - interval '30 seconds';
  insert into public.forma_room_presence (room_id, user_id, connection)
  values (p_id, auth.uid(), p_connection)
  on conflict (room_id, connection) do update set seen_at = now()
    where forma_room_presence.user_id = auth.uid();
  select coalesce(jsonb_agg(person order by person->>'name', person->>'id'), '[]') into v_people
  from (
    select distinct public.forma_room_identity(p_id, user_id) as person
    from public.forma_room_presence where room_id = p_id
  ) active where person is not null;
  return jsonb_build_object(
    'revision', v_room.revision, 'snapshot', case when p_revision <> v_room.revision then v_room.snapshot end,
    'lastSaveId', v_room.last_save_id, 'self', v_self, 'participants', v_people,
    'linkRole', v_room.link_role, 'token', case when v_room.owner_id = auth.uid() then v_room.token end,
    'versions', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id, 'name', v.name, 'date', extract(epoch from v.created_at) * 1000
    ) order by v.created_at), '[]') from public.forma_room_versions v where v.room_id = p_id),
    'invites', case when v_room.owner_id = auth.uid() then
      (select coalesce(jsonb_agg(jsonb_build_object('email', email, 'role', role, 'joined', joined_at is not null) order by email), '[]')
       from public.forma_room_invites where room_id = p_id) end
  );
end;
$$;

create function public.forma_room_leave(p_id uuid, p_connection uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.forma_room_presence
  where room_id = p_id and connection = p_connection and user_id = auth.uid();
$$;

create function public.forma_room_save(p_id uuid, p_revision integer, p_snapshot jsonb, p_save_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_room public.forma_rooms;
begin
  select * into v_room from public.forma_rooms where id = p_id for update;
  if coalesce(public.forma_room_member_role(p_id, auth.uid()), '') not in ('owner', 'editor') then
    raise exception 'Editing access is required.' using errcode = '42501';
  end if;
  if v_room.last_save_id = p_save_id then return v_room.revision; end if;
  if v_room.revision is distinct from p_revision then return null; end if;
  if p_save_id is null then raise exception 'A save identifier is required.'; end if;
  if not coalesce(p_snapshot @> '{"version":1}' and jsonb_typeof(p_snapshot->'deck'->'slides') = 'array'
      and jsonb_array_length(p_snapshot->'deck'->'slides') between 1 and 2000
      and octet_length(p_snapshot::text) <= 4000000, false) then
    raise exception 'This presentation is too large or cannot be shared.';
  end if;
  update public.forma_rooms set snapshot = p_snapshot, revision = revision + 1, last_save_id = p_save_id,
    title = left(coalesce(nullif(p_snapshot->'deck'->>'name', ''), 'Untitled presentation'), 1000),
    updated_at = now() where id = p_id;
  return v_room.revision + 1;
end;
$$;

create function public.forma_room_comment(
  p_id uuid, p_slide text, p_comment uuid, p_text text, p_reply text, p_resolved boolean
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_room public.forma_rooms;
  v_index integer;
  v_comments jsonb;
  v_path text[];
  v_person jsonb;
begin
  select * into v_room from public.forma_rooms where id = p_id for update;
  v_person := public.forma_room_identity(p_id, auth.uid());
  if coalesce(v_person->>'role', '') not in ('owner', 'editor', 'commenter') then
    raise exception 'Commenting access is required.' using errcode = '42501';
  end if;
  select ordinality - 1 into v_index
    from jsonb_array_elements(v_room.snapshot->'deck'->'slides') with ordinality item(slide, ordinality)
    where slide->>'id' = p_slide;
  if v_index is null then raise exception 'This slide is unavailable.'; end if;
  v_path := array['deck', 'slides', v_index::text];
  v_comments := coalesce(v_room.snapshot #> (v_path || array['comments']), '[]'::jsonb);
  if p_resolved is not null then
    if not exists (select 1 from jsonb_array_elements(v_comments) c where c->>'id' = p_comment::text) then
      raise exception 'This comment is unavailable.';
    end if;
    select jsonb_agg(case when c->>'id' = p_comment::text then
      c || jsonb_build_object('resolved', p_resolved) else c end order by ordinality)
    into v_comments from jsonb_array_elements(v_comments) with ordinality item(c, ordinality);
  else
    if p_comment is null or char_length(coalesce(btrim(p_text), '')) not between 1 and 10000
      or jsonb_array_length(v_comments) >= 500 then raise exception 'This comment could not be added.'; end if;
    if exists (select 1 from jsonb_array_elements(v_comments) c where c->>'id' = p_comment::text) then return; end if;
    if p_reply is not null and not exists (select 1 from jsonb_array_elements(v_comments) c where c->>'id' = p_reply) then
      raise exception 'This thread is unavailable.';
    end if;
    v_comments := v_comments || jsonb_strip_nulls(jsonb_build_object(
      'id', p_comment, 'text', btrim(p_text), 'author', coalesce(v_person->>'name',
        'Guest ' || (array['Circle','Triangle','Square','Diamond','Pentagon','Hexagon','Star','Crescent'])[
          1 + get_byte(uuid_send((v_person->>'id')::uuid), 0) % 8
        ]),
      'replyTo', p_reply, 'date', now()
    ));
  end if;
  update public.forma_rooms set snapshot =
    jsonb_set(snapshot, v_path, (snapshot #> v_path) ||
      jsonb_build_object('comments', v_comments, 'dirty', true, 'commentThreadsDirty', true)),
    revision = revision + 1, last_save_id = null, updated_at = now() where id = p_id;
end;
$$;

create function public.forma_room_access(p_id uuid, p_link_role text, p_rotate boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.forma_rooms set link_role = p_link_role, token =
    case when p_rotate or p_link_role is null then
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
    else token end
    where id = p_id and owner_id = auth.uid();
  if not found then raise exception 'Only the owner can change access.' using errcode = '42501'; end if;
end;
$$;

create function public.forma_room_invite(p_id uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.forma_rooms where id = p_id and owner_id = auth.uid() and snapshot is not null for update;
  if not found then raise exception 'Only the owner can invite people.' using errcode = '42501'; end if;
  p_email := lower(btrim(p_email));
  if p_email is null or length(p_email) > 254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid Google account email.';
  end if;
  if p_role is null then
    delete from public.forma_room_invites where room_id = p_id and email = p_email;
  else
    if not exists (select 1 from public.forma_room_invites where room_id = p_id and email = p_email)
       and (select count(*) from public.forma_room_invites where room_id = p_id) >= 100 then
      raise exception 'This workspace already has 100 invitations.';
    end if;
    insert into public.forma_room_invites (room_id, email, role) values (p_id, p_email, p_role)
    on conflict (room_id, email) do update set role = excluded.role;
  end if;
end;
$$;

-- Reserve email sends in the database to keep limits consistent across server instances.
create table public.forma_room_mail (
  owner_id uuid references auth.users on delete cascade,
  sent_at timestamptz not null default now()
);
create index forma_room_mail_owner_idx on public.forma_room_mail (owner_id, sent_at);
alter table public.forma_room_mail enable row level security;
revoke all on public.forma_room_mail from public, anon, authenticated;
create function public.forma_room_prepare_email(p_id uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_title text;
begin
  select title into v_title from public.forma_rooms where id = p_id and owner_id = auth.uid() and snapshot is not null;
  if not found then raise exception 'Only the owner can send invitations.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  delete from public.forma_room_mail where owner_id = auth.uid() and sent_at < now() - interval '1 day';
  if (select count(*) from public.forma_room_mail where owner_id = auth.uid()) >= 30 then
    raise exception 'You have reached the daily email limit. Copy the invitation link to share it.';
  end if;
  p_email := lower(btrim(p_email));
  update public.forma_room_invites set last_sent_at = now()
    where room_id = p_id and email = p_email and (last_sent_at is null or last_sent_at < now() - interval '1 minute');
  if not found then raise exception 'Add the invitation first or wait a minute before resending.'; end if;
  insert into public.forma_room_mail (owner_id) values (auth.uid());
  return jsonb_build_object('title', v_title, 'email', p_email);
end;
$$;

create function public.forma_room_checkpoint(p_id uuid, p_name text, p_restore uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_room public.forma_rooms;
  v_snapshot jsonb;
begin
  select * into v_room from public.forma_rooms where id = p_id for update;
  if coalesce(public.forma_room_member_role(p_id, auth.uid()), '') not in ('owner', 'editor') then
    raise exception 'Editing access is required.' using errcode = '42501';
  end if;
  if p_restore is not null then
    select snapshot into v_snapshot from public.forma_room_versions where room_id = p_id and id = p_restore;
    if not found then raise exception 'That version is unavailable.'; end if;
    update public.forma_rooms set snapshot = v_snapshot, revision = revision + 1, last_save_id = null,
      title = left(coalesce(nullif(v_snapshot->'deck'->>'name', ''), 'Untitled presentation'), 1000),
      updated_at = now() where id = p_id;
  elsif length(btrim(p_name)) between 1 and 100 and v_room.snapshot is not null then
    insert into public.forma_room_versions (room_id, name, snapshot) values (p_id, btrim(p_name), v_room.snapshot);
    delete from public.forma_room_versions where id in (
      select id from public.forma_room_versions where room_id = p_id order by created_at desc, id offset 8
    );
  end if;
end;
$$;

create function public.forma_room_list()
returns table (id uuid, title text, role text) language sql stable security definer set search_path = '' as $$
  select r.id, r.title, case when r.owner_id = auth.uid() then 'owner' else i.role end
  from public.forma_rooms r
  left join public.forma_room_invites i on i.room_id = r.id and i.email = public.forma_google_email(auth.uid())
  where r.snapshot is not null and (r.owner_id = auth.uid() or i.email is not null)
  order by r.updated_at desc;
$$;

revoke all on function public.forma_google_email(uuid), public.forma_google_workspace(uuid), public.forma_room_member_role(uuid, uuid),
  public.forma_room_identity(uuid, uuid), public.forma_room_part_access(text, boolean),
  public.forma_room_create(text, text), public.forma_room_join(uuid, text),
  public.forma_room_read(uuid, integer, uuid), public.forma_room_leave(uuid, uuid),
  public.forma_room_save(uuid, integer, jsonb, uuid), public.forma_room_comment(uuid, text, uuid, text, text, boolean),
  public.forma_room_access(uuid, text, boolean), public.forma_room_invite(uuid, text, text),
  public.forma_room_prepare_email(uuid, text), public.forma_room_checkpoint(uuid, text, uuid),
  public.forma_room_list() from public, anon, authenticated;
grant execute on function public.forma_room_part_access(text, boolean),
  public.forma_room_create(text, text), public.forma_room_join(uuid, text),
  public.forma_room_read(uuid, integer, uuid), public.forma_room_leave(uuid, uuid),
  public.forma_room_save(uuid, integer, jsonb, uuid), public.forma_room_comment(uuid, text, uuid, text, text, boolean),
  public.forma_room_access(uuid, text, boolean), public.forma_room_invite(uuid, text, text),
  public.forma_room_prepare_email(uuid, text), public.forma_room_checkpoint(uuid, text, uuid),
  public.forma_room_list() to authenticated;
