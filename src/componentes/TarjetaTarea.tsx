import { useState } from 'react';
import { IconBell, IconCheck } from '@tabler/icons-react';
import { aFecha, etiquetaFecha, hora12 } from '../lib/fechas';
import { nombrePrioridad, type Tarea } from '../lib/tipos';

interface Props {
  tarea: Tarea;
  ahora: Date;
  onAlternar: () => void;
  onAbrir: () => void;
}

export function TarjetaTarea({ tarea: t, ahora, onAlternar, onAbrir }: Props) {
  const [saliendo, setSaliendo] = useState(false);
  const hecha = t.estado === 'hecha';
  const atrasada = !hecha && !!t.fecha && t.fecha < aFecha(ahora);

  function marcar() {
    setSaliendo(true);
    setTimeout(onAlternar, 260);
  }

  return (
    <article className={`tarjeta p-${t.prioridad} ${hecha ? 'hecha' : ''} ${saliendo ? 'saliendo' : ''}`}>
      <button
        className="casilla"
        role="checkbox"
        aria-checked={hecha}
        aria-label={`Marcar “${t.titulo}” como ${hecha ? 'pendiente' : 'hecho'}`}
        onClick={marcar}
      >
        <IconCheck size={16} stroke={3} aria-hidden />
      </button>
      <button className="tarjeta-cuerpo" onClick={onAbrir}>
        <span className="tarjeta-titulo">{t.titulo}</span>
        {t.descripcion && <span className="tarjeta-desc">{t.descripcion}</span>}
        <span className="tarjeta-meta">
          <span className="pildora">{nombrePrioridad(t.prioridad)}</span>
          {t.fecha && (
            <span className={atrasada ? 'fecha atrasada' : 'fecha'}>
              {etiquetaFecha(t.fecha, ahora)}{t.hora ? ` · ${hora12(t.hora)}` : ''}
            </span>
          )}
          {t.recordar_en && !hecha && <IconBell size={14} aria-label="Con recordatorio" />}
          {t.etiquetas.map((e) => <span key={e} className="etiqueta">#{e}</span>)}
        </span>
      </button>
    </article>
  );
}
