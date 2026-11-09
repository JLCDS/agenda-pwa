-- Copia este archivo, reemplaza TU-REF y TU-CRON-SECRET y ejecútalo en el SQL Editor de Supabase.
-- No lo subas con los valores reales.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'enviar-recordatorios',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://TU-REF.supabase.co/functions/v1/enviar-recordatorios',
      headers := jsonb_build_object('x-cron-secret', 'TU-CRON-SECRET'),
      body := '{}'::jsonb
    )
    where exists (
      select 1 from public.tareas
      where recordatorio_enviado_en is null
        and estado = 'pendiente'
        and eliminado_en is null
        and recordar_en <= now()
        and recordar_en > now() - interval '3 days'
    );
  $$
);
