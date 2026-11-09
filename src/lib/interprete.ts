import { aFecha, aHora, deFecha, sumarDias } from './fechas';
import type { Prioridad } from './tipos';

export interface Analisis {
  titulo: string;
  fecha: string | null;
  hora: string | null;
  prioridad: Prioridad;
  etiquetas: string[];
  recordar_min: number | null;
}

const LETRA = '\\p{L}\\p{N}';
const pal = (src: string) => new RegExp(`(?<![${LETRA}])(?:${src})(?![${LETRA}])`, 'iu');
const PREFIJO = '(?:para\\s+(?:el\\s+|este\\s+)?|el\\s+|este\\s+)?';
const MANANA = 'ma[ñn]ana';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const FRANJAS: Record<string, string> = { manana: '08:00', tarde: '15:00', noche: '20:00' };

const sinTildes = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const cantidad = (s: string) => (/^una?$/i.test(s) ? 1 : Number(s));
const horaTexto = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

function fechaValida(a: number, m: number, d: number): string | null {
  const f = new Date(a, m - 1, d);
  return f.getMonth() === m - 1 && f.getDate() === d ? aFecha(f) : null;
}

/** Sin año, una fecha ya pasada se entiende como la del año siguiente. */
function resolverAnio(m: number, d: number, anio: number | null, hoy: string): string | null {
  const actual = deFecha(hoy).getFullYear();
  const f = fechaValida(anio ?? actual, m, d);
  if (f && anio === null && f < hoy) return fechaValida(actual + 1, m, d);
  return f;
}

/** Convierte "trabajo de campo mañana 8am urgente #obra" en una tarea. */
export function interpretar(texto: string, ahora = new Date()): Analisis {
  let t = texto;
  const quitar = (m: RegExpExecArray) => {
    t = `${t.slice(0, m.index)} ${t.slice(m.index + m[0].length)}`;
  };
  const tomar = (re: RegExp) => {
    const m = re.exec(t);
    if (m) quitar(m);
    return m;
  };

  const hoy = aFecha(ahora);
  let fecha: string | null = null;
  let hora: string | null = null;

  // Etiquetas
  const etiquetas: string[] = [];
  for (const m of t.matchAll(/(?<![\p{L}\p{N}])#([\p{L}\p{N}_-]+)/gu)) {
    const e = m[1].toLowerCase();
    if (!etiquetas.includes(e)) etiquetas.push(e);
  }
  t = t.replace(/(?<![\p{L}\p{N}])#[\p{L}\p{N}_-]+/gu, ' ');

  // Recordatorio explícito
  let recordar: number | null | undefined;
  const aviso = tomar(pal('(?:av[ií]same|recu[eé]rdame|recordar|aviso)\\s+(\\d+|una?)\\s*(min(?:uto)?s?|h(?:ora)?s?|d[ií]as?)\\s+antes'));
  if (aviso) {
    const n = cantidad(aviso[1]);
    const unidad = aviso[2].toLowerCase();
    recordar = unidad.startsWith('m') ? n : unidad.startsWith('h') ? n * 60 : n * 1440;
  } else if (tomar(pal('sin\\s+(?:aviso|recordatorio)'))) {
    recordar = null;
  }

  // Prioridad
  let prioridad: Prioridad = 'media';
  const explicita = tomar(pal('(?:prioridad\\s+|!)(urgente|alta|media|baja)'));
  if (explicita) prioridad = explicita[1].toLowerCase() as Prioridad;
  else if (tomar(/(?:^|\s)!{2,}(?=\s|$)/u)) prioridad = 'urgente';
  else if (tomar(pal('urgente'))) prioridad = 'urgente';
  else if (tomar(pal('importante'))) prioridad = 'alta';

  // Plazos relativos en minutos u horas: fijan fecha y hora
  const relativo = tomar(pal('(?:en|dentro\\s+de)\\s+(\\d+|una?|media)\\s+(minutos?|min|horas?|h)'));
  if (relativo) {
    const esHora = relativo[2].toLowerCase().startsWith('h');
    const base = relativo[1].toLowerCase() === 'media' ? 0.5 : cantidad(relativo[1]);
    const d = new Date(ahora.getTime() + base * (esHora ? 60 : 1) * 60_000);
    fecha = aFecha(d);
    hora = aHora(d);
  }

  // Hora con a. m. o p. m.
  if (!hora) {
    const m = pal('(?:a\\s+las?\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*([ap])\\.?\\s?m\\.?').exec(t);
    const h = m ? Number(m[1]) : 0;
    const min = m?.[2] ? Number(m[2]) : 0;
    if (m && h >= 1 && h <= 12 && min <= 59) {
      quitar(m);
      const pm = m[3].toLowerCase() === 'p';
      hora = horaTexto((h % 12) + (pm ? 12 : 0), min);
    }
  }

  // "3 de la tarde"
  if (!hora) {
    const m = pal(`(?:a\\s+las?\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s+de\\s+la\\s+(${MANANA}|tarde|noche)`).exec(t);
    const h = m ? Number(m[1]) : 0;
    const min = m?.[2] ? Number(m[2]) : 0;
    if (m && h >= 1 && h <= 12 && min <= 59) {
      quitar(m);
      const franja = m[3].toLowerCase();
      let h24 = h;
      if (franja === 'tarde' && h < 12) h24 = h + 12;
      if (franja === 'noche') h24 = h === 12 ? 0 : h >= 6 ? h + 12 : h;
      hora = horaTexto(h24, min);
    }
  }

  // "a las 3": entre 1 y 6 se entiende de la tarde
  if (!hora) {
    const m = pal('a\\s+las?\\s+(\\d{1,2})(?::(\\d{2}))?(\\s+y\\s+media)?').exec(t);
    const h = m ? Number(m[1]) : 99;
    const min = m ? (m[3] ? 30 : m[2] ? Number(m[2]) : 0) : 99;
    if (m && h <= 23 && min <= 59) {
      quitar(m);
      hora = horaTexto(h >= 1 && h <= 6 ? h + 12 : h, min);
    }
  }

  // "15:30"
  if (!hora) {
    const m = pal('(\\d{1,2}):(\\d{2})').exec(t);
    if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59) {
      quitar(m);
      hora = horaTexto(Number(m[1]), Number(m[2]));
    }
  }

  if (!hora && tomar(pal('(?:al\\s+|a\\s+)?mediod[ií]a'))) hora = '12:00';
  if (!hora && tomar(pal('(?:a\\s+)?medianoche'))) hora = '00:00';

  // Franjas del día
  const esta = tomar(pal(`esta\\s+(${MANANA}|tarde|noche)`));
  if (esta) {
    fecha ??= hoy;
    hora ??= FRANJAS[sinTildes(esta[1])];
  }
  const franja = tomar(pal(`(?:por|en)\\s+la\\s+(${MANANA}|tarde|noche)`));
  if (franja) hora ??= FRANJAS[sinTildes(franja[1])];

  // Fecha
  if (!fecha && tomar(pal(`${PREFIJO}pasado\\s+${MANANA}`))) fecha = sumarDias(hoy, 2);
  if (!fecha && tomar(pal(`${PREFIJO}${MANANA}`))) fecha = sumarDias(hoy, 1);
  if (!fecha && tomar(pal(`${PREFIJO}hoy`))) fecha = hoy;

  if (!fecha) {
    const m = pal(`${PREFIJO}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?`).exec(t);
    if (m) {
      const anio = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
      const f = resolverAnio(Number(m[2]), Number(m[1]), anio, hoy);
      if (f) {
        fecha = f;
        quitar(m);
      }
    }
  }

  if (!fecha) {
    const m = pal(`${PREFIJO}(\\d{1,2})\\s+de\\s+(${MESES.join('|')})(?:\\s+del?\\s+(\\d{4}))?`).exec(t);
    if (m) {
      const f = resolverAnio(MESES.indexOf(m[2].toLowerCase()) + 1, Number(m[1]), m[3] ? Number(m[3]) : null, hoy);
      if (f) {
        fecha = f;
        quitar(m);
      }
    }
  }

  if (!fecha) {
    const m = tomar(pal('(?:en|dentro\\s+de)\\s+(\\d+|una?)\\s+(d[ií]as?|semanas?|mes(?:es)?)'));
    if (m) {
      const n = cantidad(m[1]);
      const unidad = m[2].toLowerCase();
      if (unidad.startsWith('mes')) {
        const d = deFecha(hoy);
        d.setMonth(d.getMonth() + n);
        fecha = aFecha(d);
      } else {
        fecha = sumarDias(hoy, unidad.startsWith('s') ? n * 7 : n);
      }
    }
  }

  if (!fecha) {
    const m = tomar(pal(`${PREFIJO}(?:pr[oó]ximo\\s+)?(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)(?:\\s+(?:pr[oó]ximo|que\\s+viene))?`));
    if (m) {
      const objetivo = DIAS.indexOf(sinTildes(m[1]));
      const distancia = (objetivo - ahora.getDay() + 7) % 7 || 7;
      fecha = sumarDias(hoy, distancia);
    }
  }

  // Solo hora: hoy, o mañana si esa hora ya pasó
  if (hora && !fecha) fecha = deFecha(hoy, hora) > ahora ? hoy : sumarDias(hoy, 1);

  // Limpieza del título
  let titulo = t.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
  const colgante = /(?:^|\s)(?:para|el|la|los|las|a|de|del|en|por|y|con)\s*$|[,;:\-]\s*$/iu;
  while (colgante.test(titulo)) titulo = titulo.replace(colgante, '').trim();
  titulo = titulo.replace(/^(?:para\s+|[,;:\-]\s*)/iu, '').trim();
  titulo = titulo.charAt(0).toLocaleUpperCase('es') + titulo.slice(1);

  const recordar_min = recordar !== undefined ? recordar : fecha ? (hora ? 30 : 0) : null;
  return { titulo, fecha, hora, prioridad, etiquetas, recordar_min };
}
