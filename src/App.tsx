import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  IconBell, IconCalendarEvent, IconChecks, IconCloudCheck, IconCloudOff, IconCloudUp, IconAlertTriangle,
  IconDeviceMobile, IconListDetails, IconSearch, IconSettings, IconSun, IconX,
} from '@tabler/icons-react';
import { Ajustes } from './componentes/Ajustes';
import { BarraRapida } from './componentes/BarraRapida';
import { Editor, type DatosEditor } from './componentes/Editor';
import { TarjetaTarea } from './componentes/TarjetaTarea';
import { buscar, compararTareas, consultaVacia, interpretarConsulta, type Consulta } from './lib/busqueda';
import { cambiarEstado, db, eliminarTarea, posponerUnaHora, restaurarTarea } from './lib/db';
import { aFecha, etiquetaFecha, sumarDias } from './lib/fechas';
import { asegurarSuscripcion, activarNotificaciones, iniciarAvisosLocales, soportaNotificaciones } from './lib/notificaciones';
import { leerPreferencias, type Preferencias } from './lib/preferencias';
import { sincronizar, useEstadoSync, type EstadoSync } from './lib/sincronizacion';
import { useSesion } from './lib/supabase';
import { PRIORIDADES, nombrePrioridad, type Tarea } from './lib/tipos';

type Vista = 'hoy' | 'proximos' | 'todas' | 'hechas';
interface Seccion { titulo: string; tareas: Tarea[]; alerta?: boolean }
interface Aviso { texto: string; deshacer?: () => void }

const VISTAS: { id: Vista; nombre: string; Icono: typeof IconSun }[] = [
  { id: 'hoy', nombre: 'Hoy', Icono: IconSun },
  { id: 'proximos', nombre: 'Próximos', Icono: IconCalendarEvent },
  { id: 'todas', nombre: 'Todos', Icono: IconListDetails },
  { id: 'hechas', nombre: 'Hechos', Icono: IconChecks },
];

const RAPIDOS = ['pendientes hoy', 'urgentes', 'atrasadas', 'esta semana', 'sin fecha'];

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function saludo(ahora: Date, nombre: string) {
  const h = ahora.getHours();
  const base = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  return nombre ? `${base}, ${nombre}` : base;
}

function resumenDia(pendientes: Tarea[], hoy: string) {
  const deHoy = pendientes.filter((t) => t.fecha === hoy);
  const atrasadas = pendientes.filter((t) => t.fecha && t.fecha < hoy).length;
  const urgentes = deHoy.filter((t) => t.prioridad === 'urgente').length;
  if (!deHoy.length && !atrasadas) return 'Hoy tienes el día despejado.';
  const partes: string[] = [];
  if (deHoy.length) partes.push(`${plural(deHoy.length, 'pendiente', 'pendientes')} para hoy${urgentes ? ` (${urgentes} ${urgentes === 1 ? 'urgente' : 'urgentes'})` : ''}`);
  if (atrasadas) partes.push(plural(atrasadas, 'atrasado', 'atrasados'));
  return `Tienes ${partes.join(' y ')}.`;
}

function agruparPorFecha(tareas: Tarea[], ahora: Date): Seccion[] {
  const grupos = new Map<string, Tarea[]>();
  for (const t of tareas) grupos.set(t.fecha!, [...(grupos.get(t.fecha!) ?? []), t]);
  return [...grupos].map(([f, lista]) => ({ titulo: etiquetaFecha(f, ahora), tareas: lista }));
}

function construirSecciones(vista: Vista, tareas: Tarea[], ahora: Date): Seccion[] {
  const hoy = aFecha(ahora);
  const pendientes = tareas.filter((t) => t.estado === 'pendiente').sort(compararTareas);
  switch (vista) {
    case 'hoy':
      return [
        { titulo: 'Atrasados', alerta: true, tareas: pendientes.filter((t) => t.fecha && t.fecha < hoy) },
        { titulo: 'Para hoy', tareas: pendientes.filter((t) => t.fecha === hoy) },
      ];
    case 'proximos':
      return agruparPorFecha(pendientes.filter((t) => t.fecha && t.fecha > hoy), ahora);
    case 'todas':
      return PRIORIDADES.map((p) => ({ titulo: p.nombre, tareas: pendientes.filter((t) => t.prioridad === p.valor) }));
    case 'hechas':
      return [{
        titulo: 'Terminados',
        tareas: tareas.filter((t) => t.estado === 'hecha').sort((a, b) => b.actualizado_en.localeCompare(a.actualizado_en)).slice(0, 100),
      }];
  }
}

const VACIOS: Record<Vista, { titulo: string; texto: string }> = {
  hoy: { titulo: 'Nada pendiente por hoy', texto: 'Escribe abajo lo que tengas en mente y yo te lo recuerdo.' },
  proximos: { titulo: 'Sin fechas por delante', texto: 'Prueba con “visita a obra el viernes 8am”.' },
  todas: { titulo: 'Tu lista está vacía', texto: 'Cuando agendes algo, aparecerá aquí ordenado por prioridad.' },
  hechas: { titulo: 'Aún no hay terminados', texto: 'Lo que marques como hecho quedará guardado aquí.' },
};

function EstadoNube({ estado, sinSubir }: { estado: EstadoSync; sinSubir: number }) {
  let icono: ReactNode = <IconCloudCheck size={15} />;
  let texto = 'Sincronizado';
  if (estado === 'local') { icono = <IconDeviceMobile size={15} />; texto = 'En este dispositivo'; }
  if (estado === 'sin-sesion') { icono = <IconCloudOff size={15} />; texto = 'Sin cuenta conectada'; }
  if (estado === 'sincronizando') { icono = <IconCloudUp size={15} />; texto = 'Sincronizando…'; }
  if (estado === 'sin-conexion') { icono = <IconCloudOff size={15} />; texto = sinSubir ? `Sin conexión · ${sinSubir} por subir` : 'Sin conexión'; }
  if (estado === 'error') { icono = <IconAlertTriangle size={15} />; texto = 'No se pudo sincronizar'; }
  return <span className={`nube nube-${estado}`} role="status">{icono}{texto}</span>;
}

function describirConsulta(c: Consulta): string[] {
  const chips: string[] = [];
  if (c.estado) chips.push(c.estado === 'pendiente' ? 'Pendientes' : 'Hechos');
  if (c.prioridad) chips.push(`Prioridad ${nombrePrioridad(c.prioridad).toLowerCase()}`);
  if (c.periodo) chips.push({ hoy: 'Hoy', manana: 'Mañana', semana: 'Próximos 7 días', vencidas: 'Atrasados', 'sin-fecha': 'Sin fecha' }[c.periodo]);
  c.etiquetas.forEach((e) => chips.push(`#${e}`));
  if (c.terminos.length) chips.push(`“${c.terminos.join(' ')}”`);
  return chips;
}

export default function App() {
  const tareas = useLiveQuery(() => db.tareas.toArray().then((l) => l.filter((t) => !t.eliminado_en)), [], undefined);
  const sinSubir = useLiveQuery(() => db.tareas.where('sucio').equals(1).count(), [], 0);
  const estadoSync = useEstadoSync();
  const sesion = useSesion();

  const [vista, setVista] = useState<Vista>('hoy');
  const [texto, setTexto] = useState('');
  const [prefs, setPrefs] = useState<Preferencias>(leerPreferencias);
  const [editor, setEditor] = useState<DatosEditor | null>(null);
  const [ajustes, setAjustes] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ahora, setAhora] = useState(() => new Date());
  const [permiso, setPermiso] = useState(() => (soportaNotificaciones() ? Notification.permission : 'denied'));
  const [invitacionCerrada, setInvitacionCerrada] = useState(false);
  const entradaRapida = useRef<HTMLInputElement>(null);
  const sesionRef = useRef(sesion);
  sesionRef.current = sesion;

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  useEffect(() => iniciarAvisosLocales(() => !!sesionRef.current), []);

  useEffect(() => {
    if (!sesion) return;
    void sincronizar();
    asegurarSuscripcion().catch((e) => console.error('No se pudo registrar la suscripción', e));
  }, [sesion]);

  // Acciones que llegan desde una notificación o un acceso directo
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const accion = p.get('accion');
    const id = p.get('id');
    const nueva = p.get('nueva');
    if (!accion && !nueva) return;
    history.replaceState(null, '', location.pathname);
    if (nueva) entradaRapida.current?.focus();
    if (!accion || !id) return;
    void (async () => {
      await sincronizar();
      const t = await db.tareas.get(id);
      if (!t) return;
      if (accion === 'hecha') {
        await cambiarEstado(id, 'hecha');
        setAviso({ texto: `¡Listo! “${t.titulo}” quedó hecho.`, deshacer: () => void cambiarEstado(id, 'pendiente') });
      } else if (accion === 'posponer') {
        await posponerUnaHora(id);
        setAviso({ texto: 'Te lo recuerdo en una hora.' });
      } else {
        setEditor({ id, inicial: t });
      }
    })();
  }, []);

  const consulta = useMemo(() => interpretarConsulta(texto), [texto]);
  const buscando = !consultaVacia(consulta);
  const resultados = useMemo(() => (tareas && buscando ? buscar(tareas, consulta, ahora) : []), [tareas, consulta, buscando, ahora]);
  const secciones = useMemo(
    () => (tareas ? construirSecciones(vista, tareas, ahora).filter((s) => s.tareas.length) : []),
    [tareas, vista, ahora],
  );
  const etiquetasUsadas = useMemo(() => {
    const cuenta = new Map<string, number>();
    tareas?.filter((t) => t.estado === 'pendiente').forEach((t) => t.etiquetas.forEach((e) => cuenta.set(e, (cuenta.get(e) ?? 0) + 1)));
    return [...cuenta].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([e]) => e);
  }, [tareas]);

  const hoy = aFecha(ahora);
  const pendientes = tareas?.filter((t) => t.estado === 'pendiente') ?? [];
  const contadores: Record<Vista, number> = {
    hoy: pendientes.filter((t) => t.fecha && t.fecha <= hoy).length,
    proximos: pendientes.filter((t) => t.fecha && t.fecha > hoy && t.fecha <= sumarDias(hoy, 365)).length,
    todas: pendientes.length,
    hechas: 0,
  };
  const invitarAvisos = permiso === 'default' && !invitacionCerrada && pendientes.some((t) => t.recordar_en);

  async function alternar(t: Tarea) {
    if (t.estado === 'pendiente') {
      await cambiarEstado(t.id, 'hecha');
      setAviso({ texto: `¡Bien! “${t.titulo}” quedó hecho.`, deshacer: () => void cambiarEstado(t.id, 'pendiente') });
    } else {
      await cambiarEstado(t.id, 'pendiente');
    }
  }

  async function borrar(id: string, titulo: string) {
    await eliminarTarea(id);
    setEditor(null);
    setAviso({ texto: `Eliminé “${titulo}”.`, deshacer: () => void restaurarTarea(id) });
  }

  async function pedirPermiso() {
    try {
      setPermiso(await activarNotificaciones());
    } catch (e) {
      console.error(e);
      setAviso({ texto: 'No pude activar los avisos en este dispositivo.' });
    }
  }

  const tarjeta = (t: Tarea) => (
    <TarjetaTarea key={t.id} tarea={t} ahora={ahora} onAlternar={() => void alternar(t)} onAbrir={() => setEditor({ id: t.id, inicial: t })} />
  );
  const vacio = VACIOS[vista];

  return (
    <div className="app">
      <header className="cabecera">
        <div className="cabecera-fila">
          <div>
            <h1>{saludo(ahora, prefs.nombre)}</h1>
            <p className="resumen">{resumenDia(pendientes, hoy)}</p>
          </div>
          <button className="icono-btn" aria-label="Ajustes" onClick={() => setAjustes(true)}><IconSettings size={22} /></button>
        </div>
        <EstadoNube estado={estadoSync} sinSubir={sinSubir} />
      </header>

      <div className="buscador">
        <label className="campo-busqueda">
          <IconSearch size={19} aria-hidden />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar: trabajo de campo pendientes"
            aria-label="Buscar pendientes"
            enterKeyHint="search"
          />
          {texto && <button className="limpiar" aria-label="Limpiar búsqueda" onClick={() => setTexto('')}><IconX size={17} /></button>}
        </label>
        <div className="atajos" onPointerDown={(e) => e.preventDefault()}>
          {RAPIDOS.map((r) => <button key={r} className="chip" onClick={() => setTexto(r)}>{r}</button>)}
          {etiquetasUsadas.map((e) => <button key={e} className="chip" onClick={() => setTexto(`#${e}`)}>#{e}</button>)}
        </div>
      </div>

      <main className="contenido">
        {invitarAvisos && (
          <div className="invitacion">
            <IconBell size={20} aria-hidden />
            <p>¿Te aviso cuando se acerque la hora de tus pendientes?</p>
            <button className="btn-primario" onClick={() => void pedirPermiso()}>Activar</button>
            <button className="icono-btn" aria-label="Ahora no" onClick={() => setInvitacionCerrada(true)}><IconX size={18} /></button>
          </div>
        )}

        {buscando ? (
          <section aria-live="polite">
            <div className="filtros-activos">
              <strong>{plural(resultados.length, 'resultado', 'resultados')}</strong>
              {describirConsulta(consulta).map((c) => <span key={c} className="chip chip-fijo">{c}</span>)}
            </div>
            {resultados.length ? <div className="lista">{resultados.map(tarjeta)}</div> : (
              <div className="vacio"><h2>No encontré nada con eso</h2><p>Prueba con menos palabras o con otra etiqueta.</p></div>
            )}
          </section>
        ) : tareas === undefined ? null : secciones.length ? (
          secciones.map((s) => (
            <section key={s.titulo}>
              <h2 className={`titulo-seccion ${s.alerta ? 'alerta' : ''}`}>{s.titulo}<span>{s.tareas.length}</span></h2>
              <div className="lista">{s.tareas.map(tarjeta)}</div>
            </section>
          ))
        ) : (
          <div className="vacio"><h2>{vacio.titulo}</h2><p>{vacio.texto}</p></div>
        )}
      </main>

      <div className="pie">
        {aviso && (
          <div className="toast" role="status">
            <span>{aviso.texto}</span>
            {aviso.deshacer && <button onClick={() => { aviso.deshacer!(); setAviso(null); }}>Deshacer</button>}
          </div>
        )}
        <BarraRapida
          entrada={entradaRapida}
          onCreada={(t) => setAviso({ texto: t.fecha ? `Agendado para ${etiquetaFecha(t.fecha, new Date()).toLowerCase()}.` : 'Agendado sin fecha.' })}
          onDetalles={(inicial) => setEditor({ inicial })}
        />
        <nav className="navegacion" aria-label="Vistas">
          {VISTAS.map(({ id, nombre, Icono }) => (
            <button key={id} aria-current={!buscando && vista === id ? 'page' : undefined} onClick={() => { setVista(id); setTexto(''); }}>
              <Icono size={22} aria-hidden />
              {nombre}
              {contadores[id] > 0 && <span className="contador">{contadores[id]}</span>}
            </button>
          ))}
        </nav>
      </div>

      {editor && <Editor datos={editor} onCerrar={() => setEditor(null)} onEliminar={(id, titulo) => void borrar(id, titulo)} />}
      {ajustes && <Ajustes prefs={prefs} onPrefs={setPrefs} permiso={permiso} onPedirPermiso={pedirPermiso} sesion={sesion} tareas={tareas ?? []} onCerrar={() => setAjustes(false)} />}
    </div>
  );
}
