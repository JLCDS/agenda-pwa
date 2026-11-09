# Al Día

PWA personal para agendar pendientes en segundos, buscarlos y recibir recordatorios. Funciona sin conexión y sincroniza al volver a tenerla.

```bash
npm install
npm run dev      # sin .env funciona en modo local
npm test
npm run build
```

## Cómo se escribe rápido

| Escribes | Entiende |
|---|---|
| `trabajo de campo mañana 8am urgente #obra` | Mañana 8:00 a. m., urgente, etiqueta obra |
| `reunión el viernes a las 3 con Pedro` | Viernes 3:00 p. m. |
| `pagar factura 15 de noviembre prioridad baja` | Todo el día, prioridad baja |
| `entregar informe 20/11 4:30pm avísame 1 hora antes` | Aviso una hora antes |
| `revisar planos en 2 horas` | Dentro de dos horas |

Prioridades: `urgente`, `importante` (alta), `!alta`, `prioridad baja`. Sin aviso: `sin aviso`.

La búsqueda acepta frases: `trabajo de campo pendientes`, `urgentes hoy`, `atrasadas`, `esta semana`, `sin fecha`, `#obra`.

## Puesta en marcha

Necesitas una cuenta de GitHub y una de Supabase (plan gratis). `<REF>` es el identificador del proyecto, el que aparece en su URL.

### 1. Supabase

1. Crea un proyecto y ejecuta `supabase/migrations/0001_agenda.sql` en el SQL Editor.
2. En Authentication → Users crea tu usuario con correo y contraseña (Auto Confirm).
3. En Authentication → Sign In / Providers desactiva **Allow new users to sign up**, para que nadie más pueda registrarse.

### 2. Claves y función de recordatorios

```bash
npm run vapid     # guarda las dos claves que imprime; corre una sola vez
npx supabase login
npx supabase secrets set --project-ref <REF> \
  CRON_SECRET="<texto-largo-aleatorio>" \
  VAPID_CONTACTO="mailto:<tu-correo>" \
  VAPID_KEYS='<JSON de VAPID_KEYS>'
npx supabase functions deploy enviar-recordatorios --no-verify-jwt --project-ref <REF>
```

La función valida `CRON_SECRET` por su cuenta, por eso se despliega con `--no-verify-jwt`.

Después copia `supabase/cron.example.sql`, reemplaza `TU-REF` y `TU-CRON-SECRET`, y ejecútalo en el SQL Editor.

### 3. GitHub

1. Sube este proyecto a un repositorio público en la rama `main`.
2. En Settings → Pages elige **GitHub Actions** como origen.
3. En Settings → Secrets and variables → Actions → Variables crea `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_VAPID_PUBLIC`.
4. Ejecuta el workflow **Publicar en GitHub Pages**. Cada push a `main` vuelve a publicar.

La URL pública y la clave anon pueden ir en la app: el acceso a los datos lo protege la seguridad por filas de Postgres. **La clave `VAPID_KEYS` y la `service_role` nunca van en el repositorio.**

### 4. En el teléfono

Abre la URL, instala la app (en iPhone: Compartir → Agregar a inicio), entra en Ajustes con tu cuenta y activa los recordatorios.

## Cómo funciona

- **Sin conexión:** todo se guarda primero en IndexedDB; el service worker sirve la app.
- **Sincronización:** se sube lo marcado como pendiente y se baja lo nuevo. En un conflicto gana la edición más reciente de cada tarea.
- **Recordatorios:** `pg_cron` revisa cada minuto; si algo vence, la función envía Web Push.

## Limitaciones

- Lo creado sin conexión llega al servidor cuando la app se vuelve a abrir con internet. Hasta entonces, ese recordatorio solo suena con la app abierta.
- GitHub desactiva los workflows programados tras 60 días sin actividad en el repositorio; si te avisa, reactiva **Mantener Supabase activo**.
