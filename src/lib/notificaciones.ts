import { db } from './db';
import { etiquetaFecha, hora12 } from './fechas';
import { supabase } from './supabase';
import { nombrePrioridad, type Prioridad } from './tipos';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC as string | undefined;

export const soportaNotificaciones = () => 'Notification' in window && 'serviceWorker' in navigator;
export const soportaPush = () => soportaNotificaciones() && 'PushManager' in window && !!VAPID && !!supabase;

export function esIosSinInstalar(): boolean {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return ios && !window.matchMedia('(display-mode: standalone)').matches;
}

function claveABytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** Guarda la suscripción en el servidor; se repite al abrir porque el navegador puede renovarla. */
export async function asegurarSuscripcion(): Promise<boolean> {
  if (!soportaPush() || Notification.permission !== 'granted') return false;
  const { data } = await supabase!.auth.getSession();
  if (!data.session) return false;
  const registro = await navigator.serviceWorker.ready;
  const sub =
    (await registro.pushManager.getSubscription()) ??
    (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(VAPID!) }));
  const json = sub.toJSON();
  const { error } = await supabase!.from('suscripciones_push').upsert(
    { endpoint: sub.endpoint, p256dh: json.keys!.p256dh, auth: json.keys!.auth },
    { onConflict: 'endpoint' },
  );
  if (error) throw error;
  return true;
}

export async function activarNotificaciones(): Promise<NotificationPermission> {
  const permiso = await Notification.requestPermission();
  if (permiso === 'granted') await asegurarSuscripcion();
  return permiso;
}

export function cuerpoAviso(t: { fecha: string | null; hora: string | null; prioridad: Prioridad }): string {
  const cuando = t.fecha ? `${etiquetaFecha(t.fecha)}${t.hora ? ` · ${hora12(t.hora)}` : ''}` : '';
  return [cuando, `Prioridad ${nombrePrioridad(t.prioridad).toLowerCase()}`].filter(Boolean).join(' · ');
}

/**
 * Respaldo con la app abierta, para lo que el servidor aún no conoce:
 * modo local, sin sesión o cambios sin subir.
 */
async function revisarAvisosLocales(conSesion: boolean) {
  if (!soportaNotificaciones() || Notification.permission !== 'granted') return;
  const ahora = Date.now();
  const tareas = await db.tareas.where('estado').equals('pendiente').toArray();
  const vencen = tareas.filter(
    (t) =>
      !t.eliminado_en &&
      t.recordar_en &&
      Date.parse(t.recordar_en) <= ahora &&
      Date.parse(t.recordar_en) > ahora - 3_600_000 &&
      t.avisado_local !== t.recordar_en &&
      (!conSesion || t.sucio === 1),
  );
  if (!vencen.length) return;
  const registro = await navigator.serviceWorker.ready;
  for (const t of vencen) {
    await registro.showNotification(t.titulo, {
      body: cuerpoAviso(t),
      tag: t.id,
      icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
      data: { id: t.id },
    });
    await db.tareas.update(t.id, { avisado_local: t.recordar_en });
  }
}

export function iniciarAvisosLocales(conSesion: () => boolean): () => void {
  const revisar = () => void revisarAvisosLocales(conSesion());
  revisar();
  const intervalo = setInterval(revisar, 30_000);
  return () => clearInterval(intervalo);
}
