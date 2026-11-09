export type Prioridad = 'baja' | 'media' | 'alta' | 'urgente';
export type Estado = 'pendiente' | 'hecha';

export interface Tarea {
  id: string;
  titulo: string;
  descripcion: string;
  /** Fecha local 'YYYY-MM-DD'. Se guarda sin hora para que no cambie con la zona horaria. */
  fecha: string | null;
  /** Hora local 'HH:mm'; null significa todo el día. */
  hora: string | null;
  prioridad: Prioridad;
  etiquetas: string[];
  estado: Estado;
  /** Minutos antes de la hora; null significa sin recordatorio. */
  recordar_min: number | null;
  /** Instante exacto del aviso; es el campo que usa el servidor. */
  recordar_en: string | null;
  creado_en: string;
  actualizado_en: string;
  eliminado_en: string | null;
  /** 1 mientras haya cambios sin subir. */
  sucio: 0 | 1;
  /** Último recordar_en avisado desde este dispositivo. No se sincroniza. */
  avisado_local: string | null;
}

export const PRIORIDADES: { valor: Prioridad; nombre: string }[] = [
  { valor: 'urgente', nombre: 'Urgente' },
  { valor: 'alta', nombre: 'Alta' },
  { valor: 'media', nombre: 'Media' },
  { valor: 'baja', nombre: 'Baja' },
];

export const PESO_PRIORIDAD: Record<Prioridad, number> = { urgente: 0, alta: 1, media: 2, baja: 3 };

export function nombrePrioridad(p: Prioridad): string {
  return PRIORIDADES.find((x) => x.valor === p)!.nombre;
}
