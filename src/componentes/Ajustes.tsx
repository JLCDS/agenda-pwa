import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { esIosSinInstalar, soportaNotificaciones, soportaPush } from '../lib/notificaciones';
import { ACENTOS, guardarPreferencias, type Preferencias, type Tema } from '../lib/preferencias';
import { sincronizar } from '../lib/sincronizacion';
import { supabase } from '../lib/supabase';
import type { Tarea } from '../lib/tipos';
import { Hoja } from './Hoja';

interface Props {
  prefs: Preferencias;
  onPrefs: (p: Preferencias) => void;
  permiso: NotificationPermission;
  onPedirPermiso: () => Promise<void>;
  sesion: Session | null;
  tareas: Tarea[];
  onCerrar: () => void;
}

interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
}

const TEMAS: { valor: Tema; nombre: string }[] = [
  { valor: 'auto', nombre: 'Automático' },
  { valor: 'claro', nombre: 'Claro' },
  { valor: 'oscuro', nombre: 'Oscuro' },
];

let eventoInstalar: EventoInstalar | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  eventoInstalar = e as EventoInstalar;
});

export function Ajustes({ prefs, onPrefs, permiso, onPedirPermiso, sesion, tareas, onCerrar }: Props) {
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [instalable, setInstalable] = useState(!!eventoInstalar);

  useEffect(() => {
    const alInstalar = () => setInstalable(false);
    window.addEventListener('appinstalled', alInstalar);
    return () => window.removeEventListener('appinstalled', alInstalar);
  }, []);

  function cambiar(p: Partial<Preferencias>) {
    const nuevas = { ...prefs, ...p };
    guardarPreferencias(nuevas);
    onPrefs(nuevas);
  }

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError('');
    const { error: fallo } = await supabase!.auth.signInWithPassword({ email: correo.trim(), password: clave });
    setEnviando(false);
    if (fallo) setError(navigator.onLine ? 'Correo o contraseña incorrectos.' : 'Necesitas conexión para entrar.');
    else {
      setClave('');
      void sincronizar();
    }
  }

  function exportar() {
    const blob = new Blob([JSON.stringify(tareas, null, 2)], { type: 'application/json' });
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(blob);
    enlace.download = `al-dia-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  }

  return (
    <Hoja titulo="Ajustes" onCerrar={onCerrar}>
      <div className="formulario">
        <label>¿Cómo te llamo?
          <input value={prefs.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} placeholder="Tu nombre" maxLength={40} />
        </label>

        <fieldset className="selector-color">
          <legend>Color</legend>
          {ACENTOS.map((a) => (
            <label key={a.valor} data-acento={a.valor} title={a.nombre}>
              <input type="radio" name="acento" aria-label={a.nombre} checked={prefs.acento === a.valor} onChange={() => cambiar({ acento: a.valor })} />
              <span />
            </label>
          ))}
        </fieldset>

        <fieldset className="segmentado">
          <legend>Apariencia</legend>
          {TEMAS.map((t) => (
            <label key={t.valor}>
              <input type="radio" name="tema" checked={prefs.tema === t.valor} onChange={() => cambiar({ tema: t.valor })} />
              <span>{t.nombre}</span>
            </label>
          ))}
        </fieldset>

        <section className="bloque">
          <h3>Recordatorios</h3>
          {!soportaNotificaciones() ? (
            <p>Este navegador no permite notificaciones.{esIosSinInstalar() ? ' En iPhone, primero agrega la app a la pantalla de inicio desde Compartir.' : ''}</p>
          ) : permiso === 'granted' ? (
            <p>{soportaPush() && sesion ? 'Activos. Te llegan aunque la app esté cerrada.' : 'Activos mientras la app esté abierta. Conecta tu cuenta para recibirlos con la app cerrada.'}</p>
          ) : permiso === 'denied' ? (
            <p>Están bloqueados. Actívalos desde los permisos del navegador para este sitio.</p>
          ) : (
            <button type="button" className="btn-primario" onClick={() => void onPedirPermiso()}>Activar recordatorios</button>
          )}
        </section>

        <section className="bloque">
          <h3>Cuenta</h3>
          {!supabase ? (
            <p>Modo local: tus pendientes están solo en este dispositivo.</p>
          ) : sesion ? (
            <>
              <p>Conectado como {sesion.user.email}</p>
              <div className="acciones">
                <button type="button" className="btn-secundario" onClick={() => void supabase!.auth.signOut()}>Cerrar sesión</button>
                <button type="button" className="btn-secundario" onClick={() => void sincronizar()}>Sincronizar ahora</button>
              </div>
            </>
          ) : (
            <form className="formulario" onSubmit={(e) => void entrar(e)}>
              <label>Correo
                <input type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
              </label>
              <label>Contraseña
                <input type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} required />
              </label>
              {error && <p className="error" role="alert">{error}</p>}
              <button className="btn-primario" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
            </form>
          )}
        </section>

        <section className="bloque">
          <h3>Esta app</h3>
          <div className="acciones">
            {instalable && (
              <button
                type="button"
                className="btn-secundario"
                onClick={() => {
                  void eventoInstalar?.prompt();
                  setInstalable(false);
                }}
              >
                Instalar
              </button>
            )}
            <button type="button" className="btn-secundario" onClick={exportar}>Descargar respaldo</button>
          </div>
        </section>
      </div>
    </Hoja>
  );
}
