const dos = (n: number) => String(n).padStart(2, '0');

export function aFecha(d: Date): string {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

export function aHora(d: Date): string {
  return `${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

export function deFecha(fecha: string, hora = '00:00'): Date {
  const [a, m, d] = fecha.split('-').map(Number);
  const [h, mi] = hora.split(':').map(Number);
  return new Date(a, m - 1, d, h, mi);
}

export function sumarDias(fecha: string, dias: number): string {
  const d = deFecha(fecha);
  d.setDate(d.getDate() + dias);
  return aFecha(d);
}

export function etiquetaFecha(fecha: string, ahora = new Date()): string {
  const hoy = aFecha(ahora);
  if (fecha === hoy) return 'Hoy';
  if (fecha === sumarDias(hoy, 1)) return 'Mañana';
  if (fecha === sumarDias(hoy, -1)) return 'Ayer';
  const d = deFecha(fecha);
  const opciones: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== ahora.getFullYear()) opciones.year = 'numeric';
  const texto = d.toLocaleDateString('es-CO', opciones).replace(/\./g, '').replace(',', '');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function hora12(hora: string): string {
  const [h, m] = hora.split(':').map(Number);
  const sufijo = h < 12 ? 'a. m.' : 'p. m.';
  return `${h % 12 === 0 ? 12 : h % 12}:${dos(m)} ${sufijo}`;
}

const HORA_TODO_EL_DIA = '08:00';

/** Calcula cuándo avisar. Si la antelación ya pasó, avisa a la hora misma; si la hora pasó, no avisa. */
export function calcularRecordarEn(
  fecha: string | null,
  hora: string | null,
  minutos: number | null,
  ahora = new Date(),
): string | null {
  if (!fecha || minutos === null) return null;
  const objetivo = deFecha(fecha, hora ?? HORA_TODO_EL_DIA);
  if (objetivo <= ahora) return null;
  const aviso = new Date(objetivo.getTime() - minutos * 60_000);
  return (aviso > ahora ? aviso : objetivo).toISOString();
}

export function textoAviso(minutos: number | null): string {
  if (minutos === null) return 'Sin aviso';
  if (minutos === 0) return 'Aviso a la hora';
  if (minutos < 60) return `Aviso ${minutos} min antes`;
  if (minutos < 1440) return `Aviso ${minutos / 60} h antes`;
  const dias = minutos / 1440;
  return `Aviso ${dias} ${dias === 1 ? 'día' : 'días'} antes`;
}
