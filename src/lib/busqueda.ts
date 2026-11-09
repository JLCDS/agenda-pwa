import { aFecha, sumarDias } from './fechas';
import { PESO_PRIORIDAD } from './tipos';
import type { Estado, Prioridad, Tarea } from './tipos';

export type Periodo = 'hoy' | 'manana' | 'semana' | 'vencidas' | 'sin-fecha';

export interface Consulta {
  terminos: string[];
  etiquetas: string[];
  estado?: Estado;
  prioridad?: Prioridad;
  periodo?: Periodo;
}

export const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'en', 'y', 'a', 'para', 'por', 'con', 'que', 'hay', 'mis', 'mi', 'tengo', 'un', 'una', 'unos', 'unas', 'ver', 'buscar', 'todo', 'todos', 'todas', 'lo', 'esta', 'este']);
const raiz = (p: string) => (p.length > 3 && p.endsWith('s') ? p.slice(0, -1) : p);

/** Separa una frase como "trabajo de campo pendientes" en filtros y palabras a buscar. */
export function interpretarConsulta(texto: string): Consulta {
  const c: Consulta = { terminos: [], etiquetas: [] };
  let t = normalizar(texto);

  const extraer = (re: RegExp, accion: (m: RegExpMatchArray) => void) => {
    const m = t.match(re);
    if (m) {
      accion(m);
      t = t.replace(re, ' ');
    }
  };

  extraer(/\bpor hacer\b/, () => (c.estado = 'pendiente'));
  extraer(/\bprioridad (urgente|alta|media|baja)\b/, (m) => (c.prioridad = m[1] as Prioridad));
  extraer(/\bsin fecha\b/, () => (c.periodo = 'sin-fecha'));

  for (const palabra of t.split(/\s+/).filter(Boolean)) {
    if (palabra.startsWith('#') && palabra.length > 1) c.etiquetas.push(palabra.slice(1));
    else if (/^pendientes?$/.test(palabra)) c.estado = 'pendiente';
    else if (/^(hech[ao]s?|completad[ao]s?|terminad[ao]s?)$/.test(palabra)) c.estado = 'hecha';
    else if (/^urgentes?$/.test(palabra)) c.prioridad = 'urgente';
    else if (/^importantes?$/.test(palabra)) c.prioridad = 'alta';
    else if (palabra === 'hoy') c.periodo = 'hoy';
    else if (palabra === 'manana') c.periodo = 'manana';
    else if (palabra === 'semana') c.periodo = 'semana';
    else if (/^(vencid[ao]s?|atrasad[ao]s?)$/.test(palabra)) c.periodo = 'vencidas';
    else if (!VACIAS.has(palabra)) c.terminos.push(raiz(palabra));
  }
  return c;
}

export function consultaVacia(c: Consulta): boolean {
  return !c.terminos.length && !c.etiquetas.length && !c.estado && !c.prioridad && !c.periodo;
}

function cumplePeriodo(t: Tarea, periodo: Periodo, hoy: string): boolean {
  switch (periodo) {
    case 'hoy':
      return t.fecha === hoy;
    case 'manana':
      return t.fecha === sumarDias(hoy, 1);
    case 'semana':
      return !!t.fecha && t.fecha >= hoy && t.fecha <= sumarDias(hoy, 7);
    case 'vencidas':
      return !!t.fecha && t.fecha < hoy && t.estado === 'pendiente';
    case 'sin-fecha':
      return !t.fecha;
  }
}

/** Orden común: pendientes primero, luego por fecha, hora y prioridad. */
export function compararTareas(a: Tarea, b: Tarea): number {
  if (a.estado !== b.estado) return a.estado === 'pendiente' ? -1 : 1;
  const fa = a.fecha ?? '9999-12-31';
  const fb = b.fecha ?? '9999-12-31';
  if (fa !== fb) return fa < fb ? -1 : 1;
  const ha = a.hora ?? '99:99';
  const hb = b.hora ?? '99:99';
  if (ha !== hb) return ha < hb ? -1 : 1;
  return PESO_PRIORIDAD[a.prioridad] - PESO_PRIORIDAD[b.prioridad];
}

export function buscar(tareas: Tarea[], c: Consulta, ahora = new Date()): Tarea[] {
  const hoy = aFecha(ahora);
  return tareas
    .filter((t) => {
      if (t.eliminado_en) return false;
      if (c.estado && t.estado !== c.estado) return false;
      if (c.prioridad && t.prioridad !== c.prioridad) return false;
      if (c.periodo && !cumplePeriodo(t, c.periodo, hoy)) return false;
      const etiquetas = t.etiquetas.map(normalizar);
      if (!c.etiquetas.every((e) => etiquetas.includes(e))) return false;
      const texto = normalizar(`${t.titulo} ${t.descripcion} ${t.etiquetas.join(' ')}`);
      return c.terminos.every((p) => texto.includes(p));
    })
    .sort(compararTareas);
}
