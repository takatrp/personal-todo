-- junkai-junbi と同じSupabaseプロジェクトへ追加しても、既存テーブルは削除しません。

create table if not exists public.todo_sync_states (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create or replace function public.set_todo_sync_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.revision = old.revision + 1;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_todo_sync_revision on public.todo_sync_states;
create trigger set_todo_sync_revision
before update on public.todo_sync_states
for each row execute function public.set_todo_sync_revision();

alter table public.todo_sync_states enable row level security;
alter table public.todo_sync_states replica identity full;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.todo_sync_states to authenticated;

drop policy if exists "todo_sync_states_select_own" on public.todo_sync_states;
create policy "todo_sync_states_select_own"
on public.todo_sync_states for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "todo_sync_states_insert_own" on public.todo_sync_states;
create policy "todo_sync_states_insert_own"
on public.todo_sync_states for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "todo_sync_states_update_own" on public.todo_sync_states;
create policy "todo_sync_states_update_own"
on public.todo_sync_states for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "todo_sync_states_delete_own" on public.todo_sync_states;
create policy "todo_sync_states_delete_own"
on public.todo_sync_states for delete
to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('todo-attachments', 'todo-attachments', false, 8388608)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "todo_attachments_select_own" on storage.objects;
create policy "todo_attachments_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'todo-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "todo_attachments_insert_own" on storage.objects;
create policy "todo_attachments_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'todo-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "todo_attachments_update_own" on storage.objects;
create policy "todo_attachments_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'todo-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'todo-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "todo_attachments_delete_own" on storage.objects;
create policy "todo_attachments_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'todo-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'todo_sync_states'
  ) then
    alter publication supabase_realtime add table public.todo_sync_states;
  end if;
end;
$$;
