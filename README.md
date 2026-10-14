# Track-It

Primera versión funcional de una app pública para controlar gastos, cuotas y servicios en ARS y USD, con datos privados por usuario. Interfaz responsive con apariencia clara/oscura y recursos de PWA.

## Marca e íconos de Track-It

El logo original está en `assets/brand/track-it-original.png`. Para regenerar los assets con Python y Pillow: `python scripts/generate-icons.py`.

Los archivos de `public/` incluyen íconos transparentes de 192 y 512 px, un ícono maskable de 512 px con fondo opaco y margen seguro, Apple Touch de 180 px, favicons PNG de 16 y 32 px y un ICO con varias resoluciones. El manifest, el acceso, la navegación y la pantalla sin conexión usan la marca Track-It. El identificador interno de los respaldos se conserva para poder restaurar archivos anteriores.

`pnpm build` genera el manifest y el service worker. La instalación de la PWA se debe comprobar desde HTTPS o localhost; las operaciones financieras siguen requiriendo conexión.

## Probar en esta PC

Desde PowerShell, en la carpeta del proyecto:

```powershell
.\scripts\start-local.ps1
```

Abrí **http://127.0.0.1:5173/**. Podés crear una cuenta local vacía o elegir **Explorar con datos de ejemplo** en el acceso. La demostración contiene información ficticia y conserva los cambios que hagas. No conecta bancos ni realiza pagos reales.

El script usa Node compatible del sistema o el runtime incluido con Codex. En esta PC, Node en `PATH` es 18 y no alcanza para Vite; el script resuelve esa diferencia sin modificar tu instalación. `Ctrl+C` detiene frontend y API.

## Instalación en otro entorno

Requisitos: **Node.js 22.12 o superior** (probado con 24.19) y **pnpm 11.25**.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

No hace falta `.env` para desarrollo local. La API aplica las migraciones al arrancar y crea SQLite en `.data/local.db`; el secreto de sesión persiste en `.data/auth-secret`. Ambos archivos quedan fuera de Git. No borres esa carpeta si querés conservar los datos locales.

Frontend y API usan el mismo origen mediante el proxy de Vite. La API escucha en `127.0.0.1:3001`, y la web en `127.0.0.1:5173`.

## Qué funciona

- **Gastos:** compras únicas, edición, duplicación, anulación con historial, búsqueda y filtros por cuenta/categoría.
- **Cuotas:** total financiado, reparto exacto en centavos, calendario, confirmación individual, cuotas ya pagadas de planes anteriores y cancelación de pendientes.
- **Recurrentes:** suscripciones y servicios mensuales, emojis, vencimientos, importes reales variables, períodos pagados/pendientes/omitidos, pausa y reanudación.
- **Cuentas:** bancos, billeteras, efectivo y tarjetas; nombre, tipo, moneda, emoji, historial y archivo desde Configuración.
- **Acceso:** registro público con Google o usuario/contraseña, sesiones y datos aislados por usuario en cada operación. Sin campo de email en el acceso ni en el registro local.
- **Respaldo:** exportación/restauración JSON con relaciones e historial, y exportación CSV.
- **Navegación:** sidebar plegable en desktop con estado persistido; barra inferior y menú lateral Sheet en mobile, con configuración y cierre de sesión. Los enlaces conservan el mes seleccionado. `Ctrl+B` (o `Cmd+B`) alterna el menú y `Escape` cierra el panel móvil.

La app es informativa: registra gastos, ingresos y compromisos, sin pedir ni calcular saldos bancarios o deuda de tarjetas. Las cuentas se administran desde Configuración y clasifican los movimientos por cuenta y moneda. Los envíos de dinero que representan un gasto se cargan desde Gastos. Los consumos con tarjeta cuentan al registrar el cargo y no requieren registrar el pago del resumen. Crear cuotas o recurrentes organiza compromisos; cada gasto se registra al confirmar el cargo o pago. ARS y USD tienen totales separados.

El apartado de Transferencias se retiró junto con sus formularios y API de creación/edición. Los registros anteriores conservan sus importes e impacto original en el historial de cuentas, los totales y las exportaciones; también pueden restaurarse desde respaldos antiguos. No se convierten automáticamente en nuevos gastos.

Los movimientos usan centavos enteros, transacciones, identificadores de operación para reintentos y versiones para detectar ediciones desactualizadas. Un formulario con error queda abierto; cerrarlo o recargarlo descarta lo que no se haya guardado.

## Conectar Turso y preparar acceso público

La integración libSQL está implementada. No hay una base remota ni un despliegue creados todavía. Usá una base de desarrollo distinta de la personal de producción.

1. Copiá `.env.example` a `.env` y completá `DATABASE_URL=libsql://...` y `DATABASE_AUTH_TOKEN` con los valores de tu base Turso.
2. Definí `BETTER_AUTH_URL` con el origen definitivo y `BETTER_AUTH_SECRET` aleatorio de al menos 32 caracteres. Ninguna variable privada usa el prefijo `VITE_`. No se necesita configurar un propietario.
3. Ejecutá `pnpm db:migrate` apuntando a esa base.
4. Para Google, configurá las credenciales OAuth siguiendo [Acceso con Google y usuario](docs/AUTENTICACION.md). Cada persona obtiene su propia cuenta al ingresar por primera vez. También puede registrarse desde el formulario con usuario y contraseña.
5. En el hosting configurá las variables privadas, `NODE_ENV=production` y Node compatible. El registro permanece público en producción; la demo está deshabilitada. Las variables `OWNER_*` anteriores no limitan quién puede ingresar.

`vercel.json` y `api/index.ts` preparan el frontend estático y la función Hono bajo `/api`. Antes de usar datos reales, falta probar ese despliegue con tus credenciales: acceso, cookies HTTPS, rutas directas, escritura/lectura y respaldo. Las migraciones remotas se ejecutan explícitamente; el build no modifica la base.

La cuenta y la base central permiten usar los mismos datos en PC y celular una vez publicado. Las vistas se actualizan al guardar, cambiar de mes, reconectar o pulsar actualizar. Al recuperar el foco o volver del segundo plano se actualizan si pasó al menos un minuto desde la última carga; los eventos simultáneos se agrupan y se espera a cerrar formularios antes de actualizar por reconexión. Cambiar entre secciones del mismo mes reutiliza los datos en memoria. No hay una conexión en tiempo real.

Si ya tenías una cuenta con email/contraseña, la migración conserva el acceso y los datos, y asigna un usuario a partir de la parte anterior al `@` (con sufijo si hay coincidencias). Entrá con ese usuario y tu contraseña habitual; en **Configuración → Formas de acceso → Conectar Google** podés vincular Google al mismo espacio. [Detalles y configuración](docs/AUTENTICACION.md).

## Dashboard opcional de Better Auth y ngrok

El inicio de sesión funciona con Better Auth instalado en la propia aplicación; el dashboard de Better Auth Infrastructure es una integración opcional.

Para conectarlo, configurá `BETTER_AUTH_API_KEY` en `.env`. Esa clave activa el plugin `dash()` del servidor, que registra `/api/auth/dash/validate` y las APIs de administración del dashboard. La clave se mantiene exclusivamente en el servidor. No se activó seguimiento de actividad que requiera columnas o migraciones adicionales.

Si usás ngrok para el entorno de desarrollo:

```sh
ngrok http 5173
```

Configurá `BETTER_AUTH_URL` con el origen HTTPS que entrega ngrok, **sin** `/api/auth` al final, por ejemplo `https://tu-dominio.ngrok-free.dev`. Reiniciá `pnpm dev` después de cambiar `.env` y reintentá la validación en el dashboard. Vite permite el hostname exacto de esa variable, tanto en desarrollo como en vista previa. Accedé a la app mediante ese origen mientras esté configurado; para volver al uso local, restaurá `http://localhost:5173` y reiniciá.

Abrir `/api/auth/dash/validate` directamente devuelve **401** porque requiere el JWT firmado del dashboard. La validación del panel devuelve **200** con `{ "valid": true }` cuando la firma y el hash de la API key coinciden. Un **404** indica que el plugin no está activo o que se está accediendo al servidor/ruta incorrectos.

Referencia: [configuración oficial de Better Auth Infrastructure](https://better-auth.com/docs/infrastructure/getting-started).

## Compilación y PWA

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

La vista previa sirve el build y la API local en el mismo puerto 5173. En esta PC también podés usar `scripts/start-local.ps1 -Preview` después de compilar.

El build genera manifiesto, iconos y service worker con actualización confirmada por el usuario. Cachea el HTML de la aplicación y sus recursos estáticos como una misma versión; **API y autenticación nunca se cachean**. Después de instalar/aceptar la actualización del service worker, reabrir o recargar reutiliza el HTML y JavaScript locales. La interfaz puede arrancar sin red, pero muestra un error de conexión si no puede consultar los datos. Los archivos con hash de `assets/` tienen caché HTTP de un año en Vercel; `index.html` y `sw.js` se revalidan. Consultar o guardar movimientos requiere conexión, como definimos para esta etapa. La instalación real desde celular requiere un despliegue HTTPS y todavía no se probó en dispositivos físicos.

## Estructura

```text
src/         Interfaz, rutas y formularios
shared/      Tipos, validaciones, importes y fechas
server/      API, autenticación, operaciones y respaldos
server/db/   Cliente libSQL y esquema Drizzle
drizzle/     Migraciones SQL versionadas
api/         Entrada para Vercel
scripts/     Desarrollo, migración, demo y cuenta propietaria
tests/       Pruebas de dinero, reglas financieras y API autenticada
docs/        Planning, stack y estado de implementación
```

## Validación y alcance actual

TypeScript estricto y build de producción pasan. **93 pruebas automatizadas** cubren precisión, cuotas, tarjetas, categorías, reintentos, edición concurrente, aislamiento de usuarios, sesiones, restauración, validación JWT del dashboard y acceso por usuario/Google. Incluyen la gestión de cuentas desde Configuración, operaciones sin saldos, migración con historial existente y restauración de respaldos anteriores. También verifican la eliminación de los endpoints de transferencias, su ausencia en la navegación lateral y móvil, la carga de envíos desde Gastos y la conservación del historial antiguo. Las pruebas de Google usan JWT firmados con claves ficticias y JWKS simulados. Se probaron flujos en navegador de escritorio y tamaños móviles de 360/390 px con datos ficticios en entregas anteriores; los cambios de esta entrega se verificaron con pruebas de interfaz en jsdom. En entregas anteriores, la versión compilada se recargó con el service worker activo y mostró correctamente la pantalla sin conexión al detener el servidor. El consentimiento real de Google queda pendiente de configurar sus credenciales OAuth.

Es una base para iterar. Pendientes respecto del planning completo: cuotas desiguales/editables, precio de contado e intereses, precio original USD de un servicio debitado en ARS, vínculo explícito entre una compra y su pago externo, recuperación de contraseña local y pruebas en dispositivos reales. Los reintegros se registran por ahora como ingreso; no existe un flujo específico. La anulación conserva el historial, sin botón de deshacer en esta entrega.

Detalles y decisiones en [Estado de implementación](docs/ESTADO_IMPLEMENTACION.md), [Planning de producto](docs/PLAN_PRODUCTO.md) y [Stack tecnológico](docs/STACK_TECNOLOGICO.md).

## Rendimiento y carga (13 de octubre de 2026)

El arranque autenticado usa una sola solicitud `/api/bootstrap` para validar la sesión y entregar usuario y resumen. No guarda movimientos en almacenamiento persistente del navegador. Las siete lecturas del resumen usan un batch libSQL y los recurrentes sólo insertan períodos que faltan, en lugar de reintentar todos los períodos históricos en cada consulta.

Acceso y configuración cargan sus módulos cuando se necesitan. El JavaScript principal del build pasó de 440,94 a 402,34 kB (sin comprimir; aproximadamente 9 % menos). La pantalla inicial muestra progreso desde el HTML, antes de ejecutar React. Navegar o actualizar datos muestra una barra y un indicador sin ocultar el contenido actual; también se respetan las preferencias de movimiento reducido.

Verificación local con build de producción y Chrome a 390 × 844: una solicitud de arranque, ninguna descarga de HTML/JS al recargar con el service worker activo, ninguna consulta del resumen al cambiar de sección dentro del mismo mes o recuperar inmediatamente el foco, loaders al cambiar de mes y actualizar, y ninguna respuesta de API en Cache Storage. Base de prueba separada y sin errores de JavaScript. TypeScript, build y 93 pruebas pasan. El tiempo real en Turso/Vercel y el comportamiento del sistema operativo al suspender un teléfono físico quedan por medir después del despliegue.

Para probarlo en el teléfono, desplegá frontend y API juntos, aceptá **Actualizar app** si aparece y volvé a abrir. En DevTools dejá desmarcado **Disable cache** para comprobar el comportamiento habitual. Tras cargar una vez y activar la nueva versión, una recarga debe consultar `/api/bootstrap` y servir los recursos de la app desde el service worker. Una suspensión breve no debe repetir la consulta; después de un minuto se permite una actualización en segundo plano al regresar. Un navegador puede descartar una pestaña suspendida: en ese caso la app arranca de nuevo con archivos cacheados y una nueva consulta autenticada.

Referencias de implementación: [revalidación de rutas en React Router](https://api.reactrouter.com/v7/interfaces/react-router.ShouldRevalidateFunctionArgs.html) y [precaché de recursos en Vite PWA](https://vite-pwa-org.netlify.app/guide/service-worker-precache).


## Íconos de categorías y recurrentes

Las categorías usan un catálogo local de Lucide con selector y búsqueda. Los gastos
(incluidos pagos de recurrentes y cuotas) muestran siempre el ícono actual de su
categoría. Los recurrentes permiten elegir un logo propio o heredar la categoría;
los accesos rápidos abren el formulario sin crear pagos ni completar precios.
YouTube, Spotify y Netflix incluyen SVG locales de Simple Icons; las fuentes,
licencia y condiciones se conservan en `src/assets/brands/`.

Para desplegar esta versión, aplicar primero `pnpm db:migrate` con la migración
`0007_spicy_dreadnoughts`, desplegar el servidor y luego la interfaz. Las columnas
opcionales `icon_key` no eliminan los emojis anteriores. La API, sincronización y
respaldos transportan `iconKey`; los respaldos anteriores siguen siendo válidos.
No hace falta reescribir el historial: la representación se resuelve al mostrarlo.
