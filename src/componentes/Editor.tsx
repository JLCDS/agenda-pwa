import { useState, type FormEvent } from 'react';
import { IconTrash } from '@tabler/icons-react';
import { actualizarTarea, crearTarea } from '../lib/db';
import { textoAviso } from '../lib/fechas';
import { PRIORIDADES, type Prioridad, type Tarea } from '../lib/tipos';
import { Hoja } from './Hoja';

type Campos = Pick<Tarea, 'titulo' | 'fecha' | 'hora' | 'prioridad' | 'etiquetas' | 'recordar_min'> & Partial<Pick<Tarea, 'descripcion'>>;

export interface DatosEditor {
  id?: string;
  inicial: Campos;
}

interface Props {
  datos: DatosEditor;
  onCerrar: () => void;
  onEliminar: (id: string, titulo: string) => void;
}

const AVISOS = [0, 10, 30, 60, 1440];

export function Editor({ datos: { id, inicial }, onCerrar, onEliminar }: Props) {
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [descripcion, setDescripcion] = useState(inicial.descripcion ?? '');
  const [fecha, setFecha] = useState(inicial.fecha ?? '');
  const [hora, setHora] = useState(inicial.hora ?? '');
  const [prioridad, setPrioridad] = useState<Prioridad>(inicial.prioridad);
  const [etiquetas, setEtiquetas] = useState(inicial.etiquetas.join(', '));
  const [aviso, setAviso] = useState(inicial.recordar_min === null ? '' : String(inicial.recordar_min));

  const opcionesAviso = inicial.recordar_min !== null && !AVISOS.includes(inicial.recordar_min)
    ? [...AVISOS, inicial.recordar_min].sort((a, b) => a - b)
    : AVISOS;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const limpio = titulo.trim();
    if (!limpio) return;
    const campos = {
      titulo: limpio,
      descripcion: descripcion.trim(),
      fecha: fecha || null,
      hora: fecha && hora ? hora : null,
      prioridad,
      etiquetas: [...new Set(etiquetas.split(',').map((x) => x.trim().replace(/^#/, '').toLowerCase()).filter(Boolean))],
      recordar_min: fecha && aviso !== '' ? Number(aviso) : null,
    };
    if (id) await actualizarTarea(id, campos);
    else await crearTarea(campos);
    onCerrar();
  }

  return (
    <Hoja titulo={id ? 'Editar pendiente' : 'Nuevo pendiente'} onCerrar={onCerrar}>
      <form className="formulario" onSubmit={(e) => void guardar(e)}>
        <label>Qué hay que hacer
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={500} />
        </label>
        <label>Descripción
          <textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Dirección, contacto, materiales…" />
        </label>
        <div className="dos-columnas">
          <label>Fecha
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <label>Hora
            <input type="time" value={hora} disabled={!fecha} onChange={(e) => setHora(e.target.value)} />
          </label>
        </div>
        <fieldset className="selector-prioridad">
          <legend>Prioridad</legend>
          {PRIORIDADES.map((p) => (
            <label key={p.valor} className={`p-${p.valor}`}>
              <input type="radio" name="prioridad" checked={prioridad === p.valor} onChange={() => setPrioridad(p.valor)} />
              <span>{p.nombre}</span>
            </label>
          ))}
        </fieldset>
        <label>Recordatorio
          <select value={aviso} disabled={!fecha} onChange={(e) => setAviso(e.target.value)}>
            <option value="">Sin aviso</option>
            {opcionesAviso.map((m) => <option key={m} value={m}>{textoAviso(m)}</option>)}
          </select>
        </label>
        <label>Etiquetas
          <input value={etiquetas} onChange={(e) => setEtiquetas(e.target.value)} placeholder="obra, campo, cliente" autoCapitalize="none" />
        </label>
        <div className="acciones">
          {id && (
            <button type="button" className="btn-peligro" onClick={() => onEliminar(id, titulo)}>
              <IconTrash size={18} aria-hidden /> Eliminar
            </button>
          )}
          <button className="btn-primario">Guardar</button>
        </div>
      </form>
    </Hoja>
  );
}
