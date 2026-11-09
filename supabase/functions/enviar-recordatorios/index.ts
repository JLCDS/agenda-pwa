import { createClient } from 'npm:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';

interface Recordatorio {
  id: string;
  user_id: string;
  titulo: string;
  fecha: string | null;
  hora: string | null;
  prioridad: string;
}

interface Suscripcion {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
}

const SUSCRIPCION_VENCIDA = new Set([404, 410]);

Deno.serve(async (peticion) => {
  if (peticion.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('No autorizado', { status: 401 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  /** Devuelve a la cola lo que no se pudo entregar; el siguiente minuto lo reintenta. */
  const liberar = async (ids: string[]) => {
    if (!ids.length) return;
    const { error } = await supabase.from('tareas').update({ recordatorio_enviado_en: null }).in('id', ids);
    if (error) console.error('liberar', error);
  };

  const { data: reclamados, error } = await supabase.rpc('reclamar_recordatorios');
  if (error) {
    console.error('reclamar_recordatorios', error);
    return new Response('Error', { status: 500 });
  }
  const recordatorios = (reclamados ?? []) as Recordatorio[];
  if (!recordatorios.length) return Response.json({ enviados: 0 });

  const usuarios = [...new Set(recordatorios.map((r) => r.user_id))];
  const { data: filas, error: errorSubs } = await supabase.from('suscripciones_push').select('*').in('user_id', usuarios);
  if (errorSubs) {
    console.error('suscripciones_push', errorSubs);
    await liberar(recordatorios.map((r) => r.id));
    return new Response('Error', { status: 500 });
  }
  const suscripciones = (filas ?? []) as Suscripcion[];

  const servidor = await webpush.ApplicationServer.new({
    contactInformation: Deno.env.get('VAPID_CONTACTO')!,
    vapidKeys: await webpush.importVapidKeys(JSON.parse(Deno.env.get('VAPID_KEYS')!)),
  });

  let enviados = 0;
  const reintentar: string[] = [];

  for (const r of recordatorios) {
    const destinos = suscripciones.filter((s) => s.user_id === r.user_id);
    let entregado = false;
    let fallaTemporal = false;

    await Promise.all(destinos.map(async (s) => {
      try {
        await servidor
          .subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
          .pushTextMessage(
            JSON.stringify({ id: r.id, titulo: r.titulo, fecha: r.fecha, hora: r.hora?.slice(0, 5) ?? null, prioridad: r.prioridad }),
            { urgency: webpush.Urgency.High, ttl: 86_400 },
          );
        entregado = true;
        enviados++;
      } catch (e) {
        if (e instanceof webpush.PushMessageError && SUSCRIPCION_VENCIDA.has(e.response.status)) {
          await supabase.from('suscripciones_push').delete().eq('endpoint', s.endpoint);
        } else {
          fallaTemporal = true;
          console.error('Fallo al enviar', String(e));
        }
      }
    }));

    if (!entregado && fallaTemporal) reintentar.push(r.id);
  }

  await liberar(reintentar);
  return Response.json({ enviados, reintentar: reintentar.length });
});
