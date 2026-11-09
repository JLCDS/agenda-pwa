import { useMemo, useState, type FormEvent, type RefObject } from 'react';
import { IconAdjustmentsHorizontal, IconArrowUp } from '@tabler/icons-react';
import { crearTarea } from '../lib/db';
import { etiquetaFecha, hora12, textoAviso } from '../lib/fechas';
import { interpretar, type Analisis } from '../lib/interprete';
import { nombrePrioridad, type Tarea } from '../lib/tipos';

interface Props {
  entrada: RefObject<HTMLInputElement | null>;
  onCreada: (t: Tarea) => void;
  onDetalles: (inicial: Analisis) => void;
}

export function BarraRapida({ entrada, onCreada, onDetalles }: Props) {
  const [texto, setTexto] = useState('');
  const analisis = useMemo(() => interpretar(texto), [texto]);
  const hayTitulo = analisis.titulo.length > 0;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!hayTitulo) return;
    setTexto('');
    onCreada(await crearTarea(analisis));
    entrada.current?.focus();
  }

  return (
    <form className="rapida" onSubmit={(e) => void enviar(e)}>
      {texto.trim() && (
        <div className="vista-previa" aria-live="polite">
          <span className={`pildora p-${analisis.prioridad}`}>{nombrePrioridad(analisis.prioridad)}</span>
          {analisis.fecha && <span className="chip chip-fijo">{etiquetaFecha(analisis.fecha)}{analisis.hora ? ` · ${hora12(analisis.hora)}` : ''}</span>}
          {analisis.fecha && <span className="chip chip-fijo">{textoAviso(analisis.recordar_min)}</span>}
          {analisis.etiquetas.map((t) => <span key={t} className="chip chip-fijo">#{t}</span>)}
        </div>
      )}
      <div className="rapida-fila">
        <button
          type="button"
          className="icono-btn"
          aria-label="Agregar con más detalles"
          onClick={() => {
            onDetalles(analisis);
            setTexto('');
          }}
        >
          <IconAdjustmentsHorizontal size={22} />
        </button>
        <input
          ref={entrada}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ej: visita a obra mañana 8am urgente"
          aria-label="Agendar un pendiente"
          enterKeyHint="send"
          autoComplete="off"
        />
        <button className="enviar" disabled={!hayTitulo} aria-label="Agendar"><IconArrowUp size={22} stroke={2.5} /></button>
      </div>
    </form>
  );
}
