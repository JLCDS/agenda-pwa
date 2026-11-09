import { useEffect, useRef, type ReactNode } from 'react';
import { IconX } from '@tabler/icons-react';

export function Hoja({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="hoja"
      aria-label={titulo}
      onClose={onCerrar}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="hoja-interior">
        <header className="hoja-cabecera">
          <h2>{titulo}</h2>
          <button type="button" className="icono-btn" aria-label="Cerrar" onClick={() => ref.current?.close()}><IconX size={22} /></button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
