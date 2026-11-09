-- Esquema de Al Día: tareas por usuario, suscripciones Web Push y reclamo atómico de recordatorios.

create table public.tareas (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 500),
  descripcion text not null default '',
  fecha date,
  hora time,
  prioridad text not null default 'media' check (prioridad in ('baja', 'media', 'alta', 'urgente')),
  etiquetas text[] not null default '{}',
  estado text not null default 'pendiente' check (estado in ('pendiente', 'hecha')),
  recordar_min integer check (recordar_min >= 0),
  recordar_en timestamptz,
  creado_en timestamptz not null,
  actualizado_en timestamptz not null,
  eliminado_en timestamptz,
  sincronizado_en timestamptz not null default clock_timestamp(),
  recordatorio_enviado_en timestamptz
);

create index tareas_sincronizacion on public.tareas (user_id, sincronizado_en, id);
create index tareas_por_avisar on public.tareas (recordar_en)
  where recordatorio_enviado_en is null and estado = 'pendiente' and eliminado_en is null;

create function public.preparar_tarea() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- Última edición gana: un dispositivo atrasado no pisa un cambio más nuevo.
    if new.actualizado_en < old.actualizado_en then
      return null;
    end if;
    if new.recordar_en is distinct from old.recordar_en then
      new.recordatorio_enviado_en := null;
    end if;
  end if;
  new.sincronizado_en := clock_timestamp();
  return new;
end;
$$;

create trigger tareas_preparar before insert or update on public.tareas
  for each row execute function public.preparar_tarea();

alter table public.tareas enable row level security;

create policy "tareas propias" on public.tareas
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.tareas to authenticated;

create table public.suscripciones_push (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  creado_en timestamptz not null default now()
);

create index suscripciones_por_usuario on public.suscripciones_push (user_id);

alter table public.suscripciones_push enable row level security;

create policy "suscripciones propias" on public.suscripciones_push
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.suscripciones_push to authenticated;

-- SKIP LOCKED evita avisos dobles si dos ejecuciones se cruzan.
create function public.reclamar_recordatorios()
returns table (id uuid, user_id uuid, titulo text, fecha date, hora time, prioridad text)
language sql
security definer
set search_path = ''
as $$
  with por_avisar as (
    select t.id
    from public.tareas t
    where t.recordatorio_enviado_en is null
      and t.estado = 'pendiente'
      and t.eliminado_en is null
      and t.recordar_en <= now()
      and t.recordar_en > now() - interval '3 days'
    order by t.recordar_en
    limit 200
    for update skip locked
  )
  update public.tareas t
  set recordatorio_enviado_en = now()
  from por_avisar
  where t.id = por_avisar.id
  returning t.id, t.user_id, t.titulo, t.fecha, t.hora, t.prioridad;
$$;

revoke execute on function public.reclamar_recordatorios() from public, anon, authenticated;
grant execute on function public.reclamar_recordatorios() to service_role;
