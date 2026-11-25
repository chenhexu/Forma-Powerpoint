create table public.presentations (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 1000),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and snapshot @> '{"version":1}'),
  revision integer not null default 1,
  last_save_id uuid not null,
  updated_at timestamptz not null default now(),
  trashed_at timestamptz
);

create index presentations_owner_updated_idx
  on public.presentations (owner_id, updated_at desc);

create function public.bump_presentation_revision()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger advance_presentation_revision
before update on public.presentations
for each row execute function public.bump_presentation_revision();

alter table public.presentations enable row level security;
revoke all on public.presentations from public, anon, authenticated;
grant select on public.presentations to authenticated;
grant insert (id, owner_id, title, snapshot, last_save_id) on public.presentations to authenticated;
grant update (title, snapshot, last_save_id, trashed_at) on public.presentations to authenticated;

create policy "Read own presentations" on public.presentations
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "Create own presentations" on public.presentations
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Update own presentations" on public.presentations
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('forma-parts', 'forma-parts', false, 5242880, array['application/octet-stream']);

create policy "Read own deck parts" on storage.objects
  for select to authenticated
  using (bucket_id = 'forma-parts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Upload own deck parts" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'forma-parts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and cardinality(storage.foldername(name)) = 2
    and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    and storage.filename(name) ~ '^[0-9a-f]{64}$'
  );
