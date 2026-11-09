/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { etiquetaFecha, hora12 } from './lib/fechas';
import { nombrePrioridad, type Prioridad } from './lib/tipos';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | { url: string; revision: string | null })[];
};

interface DatosAviso {
  id: string;
  titulo: string;
  fecha: string | null;
  hora: string | null;
  prioridad: Prioridad;
}

const BASE = import.meta.env.BASE_URL;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL(`${BASE}index.html`)));

self.addEventListener('push', (evento) => {
  if (!evento.data) return;
  const t = evento.data.json() as DatosAviso;
  const cuando = t.fecha ? `${etiquetaFecha(t.fecha)}${t.hora ? ` · ${hora12(t.hora)}` : ''}` : '';
  const opciones: NotificationOptions & { actions: { action: string; title: string }[] } = {
    body: [cuando, `Prioridad ${nombrePrioridad(t.prioridad).toLowerCase()}`].filter(Boolean).join(' · '),
    tag: t.id,
    icon: `${BASE}icons/icon-192.png`,
    badge: `${BASE}icons/icon-192.png`,
    data: { id: t.id },
    actions: [
      { action: 'hecha', title: 'Hecha' },
      { action: 'posponer', title: 'En 1 hora' },
    ],
  };
  evento.waitUntil(self.registration.showNotification(t.titulo, opciones));
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const id = (evento.notification.data as { id?: string } | null)?.id;
  const accion = evento.action || 'abrir';
  const destino = new URL(BASE, self.location.origin);
  if (id) {
    destino.searchParams.set('accion', accion);
    destino.searchParams.set('id', id);
  }
  evento.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const v of ventanas) {
        try {
          const navegada = await v.navigate(destino.href);
          await (navegada ?? v).focus();
          return;
        } catch {
          // Esa ventana no se dejó controlar: se abre una nueva.
        }
      }
      await self.clients.openWindow(destino.href);
    })(),
  );
});
