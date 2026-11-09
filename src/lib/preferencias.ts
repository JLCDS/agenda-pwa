export const ACENTOS = [
  { valor: 'coral', nombre: 'Coral' },
  { valor: 'verde', nombre: 'Verde' },
  { valor: 'azul', nombre: 'Azul' },
  { valor: 'violeta', nombre: 'Violeta' },
  { valor: 'miel', nombre: 'Miel' },
] as const;

export type Acento = (typeof ACENTOS)[number]['valor'];
export type Tema = 'auto' | 'claro' | 'oscuro';

export interface Preferencias {
  nombre: string;
  acento: Acento;
  tema: Tema;
}

const CLAVE = 'al-dia:preferencias';
const INICIALES: Preferencias = { nombre: '', acento: 'coral', tema: 'auto' };

export function leerPreferencias(): Preferencias {
  try {
    return { ...INICIALES, ...JSON.parse(localStorage.getItem(CLAVE) ?? '{}') };
  } catch {
    return INICIALES;
  }
}

export function guardarPreferencias(p: Preferencias) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(p));
  } catch {
    // Sin almacenamiento disponible la preferencia dura solo esta sesión.
  }
  aplicarPreferencias(p);
}

export function aplicarPreferencias(p: Preferencias) {
  document.documentElement.dataset.acento = p.acento;
  document.documentElement.dataset.tema = p.tema;
}
