import Dexie, { type Table } from 'dexie';
import { calcularRecordarEn } from './fechas';
import type { Tarea } from './tipos';

class BaseAgenda extends Dexie {
  tareas!: Table<Tarea, string>;
  meta!: Table<{ clave: string; valor: string }, string>;

  constructor() {
    super('al-dia');
    this.version(1).stores({ tareas: 'id, estado, fecha, sucio', meta: 'clave' });
  }
}

export const db = new BaseAgenda();

let alCambiar: () => void = () => {};
/** La sincronización se registra aquí para enterarse de cada cambio local. */
export function escucharCambios(fn: () => void) {
  alCambiar = fn;
}

export type DatosNuevos = Pick<Tarea, 'titulo' | 'fecha' | 'hora' | 'prioridad' | 'etiquetas' | 'recordar_min'> &
  Partial<Pick<Tarea, 'descripcion'>>;

export async function crearTarea(datos: DatosNuevos): Promise<Tarea> {
  const ahora = new Date();
  const marca = ahora.toISOString();
  const tarea: Tarea = {
    id: crypto.randomUUID(),
    descripcion: '',
    ...datos,
    estado: 'pendiente',
    recordar_en: calcularRecordarEn(datos.fecha, datos.hora, datos.recordar_min, ahora),
    creado_en: marca,
    actualizado_en: marca,
    eliminado_en: null,
    sucio: 1,
    avisado_local: null,
  };
  await db.tareas.add(tarea);
  alCambiar();
  return tarea;
}

export async function actualizarTarea(id: string, cambios: Partial<Tarea>): Promise<void> {
  const actual = await db.tareas.get(id);
  if (!actual) return;
  const ahora = new Date();
  const final = { ...actual, ...cambios };
  const cambioAviso =
    final.fecha !== actual.fecha || final.hora !== actual.hora || final.recordar_min !== actual.recordar_min;
  if (cambioAviso && !('recordar_en' in cambios)) {
    final.recordar_en = calcularRecordarEn(final.fecha, final.hora, final.recordar_min, ahora);
  }
  await db.tareas.put({ ...final, actualizado_en: ahora.toISOString(), sucio: 1 });
  alCambiar();
}

export const eliminarTarea = (id: string) => actualizarTarea(id, { eliminado_en: new Date().toISOString() });
export const restaurarTarea = (id: string) => actualizarTarea(id, { eliminado_en: null });
export const cambiarEstado = (id: string, estado: Tarea['estado']) => actualizarTarea(id, { estado });
export const posponerUnaHora = (id: string) =>
  actualizarTarea(id, { recordar_en: new Date(Date.now() + 3_600_000).toISOString() });
