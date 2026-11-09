import { useSyncExternalStore } from 'react';
import { db, escucharCambios } from './db';
import { supabase } from './supabase';
import type { Tarea } from './tipos';

export type FilaRemota = Omit<Tarea, 'sucio' | 'avisado_local'> & { sincronizado_en?: string };

/** Lo que la sincronización necesita del servidor; en las pruebas se reemplaza por uno en memoria. */
export interface Remoto {
  subir(filas: FilaRemota[]): Promise<void>;
  bajar(desde: string | null, posicion: number, cantidad: number): Promise<FilaRemota[]>;
}

const LOTE = 200;
const PAGINA = 500;
/** Se repite un margen al bajar para no perder filas confirmadas justo al leer el cursor. */
const SOLAPE_MS = 30_000;

function aFila(t: Tarea): FilaRemota {
  const { sucio: _s, avisado_local: _a, ...fila } = t;
  return fila;
}

/** Última edición gana. Devuelve la tarea a guardar, o null si se conserva la local. */
export function fusionar(local: Tarea | undefined, fila: FilaRemota): Tarea | null {
  if (local?.sucio && Date.parse(local.actualizado_en) >= Date.parse(fila.actualizado_en)) return null;
  const { sincronizado_en: _c, ...datos } = fila;
  return {
    ...datos,
    fecha: fila.fecha,
    hora: fila.hora ? fila.hora.slice(0, 5) : null,
    sucio: 0,
    avisado_local: local?.avisado_local ?? null,
  };
}

export async function sincronizarCon(remoto: Remoto): Promise<void> {
  const sucias = await db.tareas.where('sucio').equals(1).toArray();
  for (let i = 0; i < sucias.length; i += LOTE) {
    const lote = sucias.slice(i, i + LOTE);
    await remoto.subir(lote.map(aFila));
    // Si se editó mientras subía, sigue marcada para el siguiente ciclo.
    await db.transaction('rw', db.tareas, async () => {
      for (const enviada of lote) {
        const actual = await db.tareas.get(enviada.id);
        if (actual && actual.actualizado_en === enviada.actualizado_en) {
          await db.tareas.update(enviada.id, { sucio: 0 });
        }
      }
    });
  }

  const cursor = (await db.meta.get('cursor'))?.valor ?? null;
  const desde = cursor ? new Date(Date.parse(cursor) - SOLAPE_MS).toISOString() : null;
  let ultimo = cursor;
  for (let posicion = 0; ; posicion += PAGINA) {
    const filas = await remoto.bajar(desde, posicion, PAGINA);
    await db.transaction('rw', db.tareas, async () => {
      for (const fila of filas) {
        const fusionada = fusionar(await db.tareas.get(fila.id), fila);
        if (fusionada) await db.tareas.put(fusionada);
      }
    });
    for (const f of filas) {
      if (f.sincronizado_en && (!ultimo || Date.parse(f.sincronizado_en) > Date.parse(ultimo))) ultimo = f.sincronizado_en;
    }
    if (filas.length < PAGINA) break;
  }
  if (ultimo) await db.meta.put({ clave: 'cursor', valor: ultimo });
}

const remotoSupabase: Remoto = {
  async subir(filas) {
    const { error } = await supabase!.from('tareas').upsert(filas, { onConflict: 'id' });
    if (error) throw error;
  },
  async bajar(desde, posicion, cantidad) {
    let q = supabase!
      .from('tareas')
      .select('id,titulo,descripcion,fecha,hora,prioridad,etiquetas,estado,recordar_min,recordar_en,creado_en,actualizado_en,eliminado_en,sincronizado_en')
      .order('sincronizado_en')
      .order('id')
      .range(posicion, posicion + cantidad - 1);
    if (desde) q = q.gte('sincronizado_en', desde);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as FilaRemota[];
  },
};

export type EstadoSync = 'local' | 'sin-sesion' | 'sincronizando' | 'al-dia' | 'sin-conexion' | 'error';

let estado: EstadoSync = supabase ? 'sin-sesion' : 'local';
const oyentes = new Set<() => void>();
function fijar(e: EstadoSync) {
  estado = e;
  oyentes.forEach((o) => o());
}

export function useEstadoSync(): EstadoSync {
  return useSyncExternalStore(
    (o) => {
      oyentes.add(o);
      return () => oyentes.delete(o);
    },
    () => estado,
  );
}

let enCurso = false;
let repetir = false;

export async function sincronizar(): Promise<void> {
  if (!supabase) return;
  if (enCurso) {
    repetir = true;
    return;
  }
  if (!navigator.onLine) return fijar('sin-conexion');
  const { data } = await supabase.auth.getSession();
  if (!data.session) return fijar('sin-sesion');

  enCurso = true;
  fijar('sincronizando');
  try {
    await sincronizarCon(remotoSupabase);
    fijar('al-dia');
  } catch (e) {
    console.error('Error al sincronizar', e);
    fijar(navigator.onLine ? 'error' : 'sin-conexion');
  } finally {
    enCurso = false;
    if (repetir) {
      repetir = false;
      void sincronizar();
    }
  }
}

let temporizador: ReturnType<typeof setTimeout> | undefined;
function programar() {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => void sincronizar(), 800);
}

export function iniciarSincronizacion() {
  escucharCambios(programar);
  window.addEventListener('online', () => void sincronizar());
  window.addEventListener('offline', () => {
    if (supabase) fijar('sin-conexion');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sincronizar();
  });
  setInterval(() => void sincronizar(), 60_000);
  void sincronizar();
}
