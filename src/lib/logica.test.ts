import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { buscar, interpretarConsulta } from './busqueda';
import { actualizarTarea, crearTarea, db, type DatosNuevos } from './db';
import { calcularRecordarEn } from './fechas';
import { interpretar } from './interprete';
import { fusionar, sincronizarCon, type FilaRemota, type Remoto } from './sincronizacion';
import type { Tarea } from './tipos';

// Domingo 8 de noviembre de 2026, 10:00 a. m.
const AHORA = new Date(2026, 10, 8, 10, 0);

describe('interpretar', () => {
  const casos: [string, Partial<ReturnType<typeof interpretar>>][] = [
    ['trabajo de campo mañana 8am urgente #obra', { titulo: 'Trabajo de campo', fecha: '2026-11-09', hora: '08:00', prioridad: 'urgente', etiquetas: ['obra'], recordar_min: 30 }],
    ['Reunión el viernes a las 3 con Pedro', { titulo: 'Reunión con Pedro', fecha: '2026-11-13', hora: '15:00' }],
    ['llamar a Ana mañana por la mañana', { titulo: 'Llamar a Ana', fecha: '2026-11-09', hora: '08:00' }],
    ['pagar factura 15 de noviembre prioridad baja', { titulo: 'Pagar factura', fecha: '2026-11-15', hora: null, prioridad: 'baja', recordar_min: 0 }],
    ['entregar informe 20/11 a las 4:30 pm avísame 1 hora antes', { titulo: 'Entregar informe', fecha: '2026-11-20', hora: '16:30', recordar_min: 60 }],
    ['cita a las 9', { titulo: 'Cita', fecha: '2026-11-09', hora: '09:00' }],
    ['comprar cemento', { titulo: 'Comprar cemento', fecha: null, hora: null, prioridad: 'media', recordar_min: null }],
    ['revisar planos en 2 horas', { titulo: 'Revisar planos', fecha: '2026-11-08', hora: '12:00' }],
    ['pago arriendo 3/1', { titulo: 'Pago arriendo', fecha: '2027-01-03' }],
    ['ir al banco mañana a las 3 de la tarde !alta', { titulo: 'Ir al banco', fecha: '2026-11-09', hora: '15:00', prioridad: 'alta' }],
    ['visita el domingo sin aviso', { titulo: 'Visita', fecha: '2026-11-15', recordar_min: null }],
    ['cierre 31/02', { titulo: 'Cierre 31/02', fecha: null }],
    ['informe esta noche', { titulo: 'Informe', fecha: '2026-11-08', hora: '20:00' }],
  ];
  it.each(casos)('%s', (entrada, esperado) => {
    expect(interpretar(entrada, AHORA)).toMatchObject(esperado);
  });
});

function tarea(p: Partial<Tarea>): Tarea {
  return {
    id: crypto.randomUUID(), titulo: 'x', descripcion: '', fecha: null, hora: null, prioridad: 'media', etiquetas: [], estado: 'pendiente',
    recordar_min: null, recordar_en: null, creado_en: '2026-11-01T00:00:00.000Z', actualizado_en: '2026-11-01T00:00:00.000Z', eliminado_en: null, sucio: 0, avisado_local: null, ...p,
  };
}

describe('buscar', () => {
  const lista = [
    tarea({ titulo: 'Trabajo de campo vereda', etiquetas: ['obra'] }),
    tarea({ titulo: 'Trabajo de campo puente', estado: 'hecha' }),
    tarea({ titulo: 'Informe', descripcion: 'datos del trabajo en campo', prioridad: 'urgente', fecha: '2026-11-08' }),
    tarea({ titulo: 'Compras', fecha: '2026-11-01' }),
    tarea({ titulo: 'Borrada campo', eliminado_en: '2026-11-02T00:00:00Z' }),
  ];
  const titulos = (q: string) => buscar(lista, interpretarConsulta(q), AHORA).map((t) => t.titulo);

  it('entiende "trabajo de campo pendientes"', () => {
    expect(titulos('trabajo de campo pendientes')).toEqual(['Informe', 'Trabajo de campo vereda']);
  });
  it('ignora tildes y plurales', () => expect(titulos('TRABAJOS púente')).toEqual(['Trabajo de campo puente']));
  it('filtra hechas', () => expect(titulos('campo hechas')).toEqual(['Trabajo de campo puente']));
  it('filtra urgentes de hoy', () => expect(titulos('urgentes hoy')).toEqual(['Informe']));
  it('filtra vencidas', () => expect(titulos('atrasadas')).toEqual(['Compras']));
  it('filtra por etiqueta', () => expect(titulos('#obra')).toEqual(['Trabajo de campo vereda']));
});

describe('calcularRecordarEn', () => {
  it('resta la antelación', () => {
    expect(calcularRecordarEn('2026-11-08', '12:00', 30, AHORA)).toBe(new Date(2026, 10, 8, 11, 30).toISOString());
  });
  it('avisa a la hora si la antelación ya pasó', () => {
    expect(calcularRecordarEn('2026-11-08', '10:10', 30, AHORA)).toBe(new Date(2026, 10, 8, 10, 10).toISOString());
  });
  it('no avisa si la hora ya pasó', () => expect(calcularRecordarEn('2026-11-08', '09:00', 0, AHORA)).toBeNull());
  it('todo el día avisa a las 8', () => {
    expect(calcularRecordarEn('2026-11-09', null, 0, AHORA)).toBe(new Date(2026, 10, 9, 8, 0).toISOString());
  });
});

describe('sincronización', () => {
  const nueva: DatosNuevos = { titulo: 'A', fecha: null, hora: null, prioridad: 'media', etiquetas: [], recordar_min: null };
  const fila = (id: string, p: Partial<FilaRemota>): FilaRemota => {
    const { sucio: _s, avisado_local: _a, ...f } = tarea({ id, ...p });
    return f;
  };
  const memoria = (filas: FilaRemota[] = []) => {
    const subidas: FilaRemota[][] = [];
    const remoto: Remoto = {
      subir: async (l) => void subidas.push(l),
      bajar: async (_d, pos, n) => filas.slice(pos, pos + n),
    };
    return { remoto, subidas };
  };

  beforeEach(async () => {
    await db.tareas.clear();
    await db.meta.clear();
  });

  it('conserva la edición local más reciente', () => {
    const local = tarea({ sucio: 1, actualizado_en: '2026-11-02T00:00:00Z' });
    expect(fusionar(local, fila(local.id, { actualizado_en: '2026-11-01T00:00:00+00:00' }))).toBeNull();
  });
  it('aplica la remota más reciente y recorta la hora', () => {
    const local = tarea({ sucio: 1, avisado_local: 'z' });
    const r = fusionar(local, fila(local.id, { actualizado_en: '2026-11-05T00:00:00Z', hora: '08:30:00', titulo: 'Nuevo' }));
    expect(r).toMatchObject({ titulo: 'Nuevo', hora: '08:30', sucio: 0, avisado_local: 'z' });
  });
  it('sube lo pendiente y lo marca limpio', async () => {
    const t = await crearTarea(nueva);
    const { remoto, subidas } = memoria();
    await sincronizarCon(remoto);
    expect(subidas[0][0].id).toBe(t.id);
    expect(subidas[0][0]).not.toHaveProperty('sucio');
    expect((await db.tareas.get(t.id))!.sucio).toBe(0);
  });
  it('no pierde una edición hecha mientras subía', async () => {
    const t = await crearTarea(nueva);
    const { remoto } = memoria();
    const subir = remoto.subir;
    remoto.subir = async (l) => {
      await subir(l);
      await new Promise((r) => setTimeout(r, 2));
      await actualizarTarea(t.id, { titulo: 'Editada' });
    };
    await sincronizarCon(remoto);
    expect(await db.tareas.get(t.id)).toMatchObject({ titulo: 'Editada', sucio: 1 });
  });
  it('baja tareas nuevas y guarda el cursor', async () => {
    const id = crypto.randomUUID();
    const { remoto } = memoria([fila(id, { titulo: 'Remota', sincronizado_en: '2026-11-08T10:00:00.123456+00:00' })]);
    await sincronizarCon(remoto);
    expect((await db.tareas.get(id))!.titulo).toBe('Remota');
    expect((await db.meta.get('cursor'))!.valor).toBe('2026-11-08T10:00:00.123456+00:00');
  });
});
