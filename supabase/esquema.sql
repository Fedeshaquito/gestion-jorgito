-- Pegar esto completo en Supabase > SQL Editor > New query > Run

create table if not exists public.registros (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  tabla text not null,
  id text not null,
  data jsonb,
  borrado boolean not null default false,
  actualizado bigint not null,            -- hora del dispositivo que hizo el cambio (ms)
  modificado timestamptz not null default clock_timestamp(), -- hora del servidor
  primary key (user_id, tabla, id)
);

create index if not exists registros_modificado on public.registros (user_id, modificado);

alter table public.registros enable row level security;

drop policy if exists "cada usuario ve lo suyo" on public.registros;
create policy "cada usuario ve lo suyo" on public.registros
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Marca la hora del servidor y no deja que un cambio viejo pise uno más nuevo
create or replace function public.registros_antes_de_guardar() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.actualizado < old.actualizado then
    return null;
  end if;
  new.modificado := clock_timestamp();
  return new;
end $$;

drop trigger if exists registros_antes_de_guardar on public.registros;
create trigger registros_antes_de_guardar before insert or update on public.registros
  for each row execute function public.registros_antes_de_guardar();
