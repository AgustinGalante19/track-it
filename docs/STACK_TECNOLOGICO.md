# Stack tecnológico propuesto

Fecha: 10 de octubre de 2026. Estado: Turso/SQLite elegido y funcionamiento sin conexión postergado por decisión del usuario. El stack se implementó en una primera versión local funcional. El despliegue y la base Turso personal siguen pendientes; ver [estado de implementación](ESTADO_IMPLEMENTACION.md).

## 1. Selección

| Capa | Tecnología | Uso en esta app |
| --- | --- | --- |
| Aplicación | React + TypeScript estricto + Vite | Interfaz responsive, componentes reutilizables y tipos para movimientos, cuentas y monedas. |
| Navegación y consultas | React Router en modo Data + fetch | Rutas, carga de datos y actualización de las vistas después de guardar. |
| Diseño | Tailwind CSS + shadcn/ui | Implementar el boceto aprobado con componentes personalizables. |
| Iconos | Lucide + emojis editables | Acciones y navegación consistentes; personalidad en servicios y categorías. |
| Formularios | React Hook Form + Zod | Carga rápida y validación de entradas, también comprobada en servidor. |
| API | Hono sobre Node.js | Endpoints pequeños para consultar y modificar datos con autorización. |
| Base de datos | SQLite compatible mediante Turso Cloud/libSQL | Una base central para celular y PC, con relaciones, índices, restricciones y transacciones. |
| Acceso a datos | Drizzle ORM + Drizzle Kit + cliente libSQL | Esquema tipado, consultas y migraciones SQL versionadas. |
| Autenticación | Better Auth con Google y plugin de usuario, adaptador Drizzle/SQLite | Google como opción principal y usuario/contraseña como alternativa; sesiones y tablas de autenticación en la misma base de Turso. |
| PWA | vite-plugin-pwa | Manifiesto, iconos, instalación y pantalla de conexión requerida. |
| Pruebas | Vitest + React Testing Library + Playwright | Reglas monetarias, formularios críticos y flujos completos en navegador. |
| Despliegue | Vercel: frontend estático y funciones para la API | Un proyecto con rutas `/api`, HTTPS y frontend/API bajo el mismo origen. |

Herramientas: Node.js LTS compatible, pnpm, ESLint, formateador y Git. Fijar versiones estables compatibles y guardar el archivo de bloqueo al comenzar. Usar la integración estable de Drizzle con libSQL; no adoptar un adaptador experimental solo por ser más nuevo.

SQLite cubre las consultas y el volumen esperados. Las reglas del producto requieren transacciones e integridad de datos, capacidades disponibles también con esta elección. Mantener React/Vite conserva la propuesta de interfaz; Hono y Better Auth cubren API y acceso, que Turso por sí solo no reemplaza.

Referencias oficiales: [Drizzle con Turso](https://orm.drizzle.team/docs/sqlite/connect-turso), [clientes TypeScript de Turso](https://docs.turso.tech/sdk/ts/reference), [Hono en Vercel](https://hono.dev/docs/getting-started/vercel), [Better Auth con Hono](https://better-auth.com/docs/integrations/hono), [adaptador Drizzle de Better Auth](https://better-auth.com/docs/adapters/drizzle) y [acciones de React Router](https://reactrouter.com/start/data/actions).

## 2. Arquitectura con conexión

```text
React en el navegador → API Hono → Drizzle / cliente libSQL → Turso
                           ↓
                       Better Auth
```

Turso es la fuente de datos central. Celular y PC consultan y guardan mediante la misma API autenticada. No habrá una segunda base en el navegador ni un protocolo de réplica entre dispositivos.

- Consultar los datos al entrar a una vista; volver a consultarlos después de guardar y al recuperar el foco cuando corresponda. Incluir actualización manual. No se requiere comunicación en tiempo real para el MVP.
- Mostrar estados de guardando, guardado y error. Confirmar que un movimiento quedó registrado después de la respuesta exitosa del servidor.
- Si falla la conexión, conservar el formulario abierto en memoria para poder reintentar. No prometer que un borrador sobrevive al cierre o recarga de la app.
- Si una solicitud se confirmó en servidor pero su respuesta se perdió, reutilizar su identificador al reintentar. La misma operación no debe aplicarse dos veces, incluso online.
- Si dos dispositivos editan el mismo registro, comparar una versión en servidor y rechazar una edición desactualizada con indicación de recargar. No hace falta construir una pantalla de combinación de versiones offline.

El token de Turso queda únicamente en el servidor. El navegador utiliza la sesión de Better Auth; nunca recibe credenciales generales de la base de datos. Todas las consultas comprueban la identidad y propiedad de las cuentas y movimientos. La biblioteca de autenticación resuelve sesiones, pero las autorizaciones del producto se implementan en la API.

## 3. Reglas técnicas que se mantienen

- Dinero en centavos enteros con moneda explícita: ARS 1.250,50 se guarda como `125050` y `ARS`. Usar `INTEGER` en SQLite y validar el rango seguro en JavaScript. Parsear decimales y repartir cuotas con aritmética entera.
- Los movimientos y sus asientos se guardan de forma atómica. Las transferencias de versiones anteriores se conservan únicamente para historial, exportación y restauración; ya no se crean ni editan.
- Restricciones únicas para confirmar una cuota o un período recurrente una sola vez.
- Claves foráneas e índices para relaciones y filtros habituales; comprobar su comportamiento con el cliente y entorno elegidos.
- Saldos calculados a partir de saldo inicial y movimientos; cargos de tarjeta y pagos bancarios conservan sus efectos distintos.
- Fechas calendario para movimientos y vencimientos, instantes UTC para auditoría.
- Validación en servidor, consultas parametrizadas, sesiones con cookies seguras y configuración explícita de orígenes permitidos.
- Uso personal: acceso restringido al propietario, sin registro público en el MVP. El proveedor concreto de acceso se define al configurar autenticación.

Referencia: [transacciones y cliente de Turso](https://docs.turso.tech/sdk/ts/reference).

## 4. PWA y alcance sin conexión

Se conserva el objetivo de aplicación instalable y responsive. Para el MVP, consultar y guardar datos requiere conexión. Si no hay red, mostrar una pantalla clara de conexión requerida; no cargar ni editar movimientos offline.

Configurar `vite-plugin-pwa` para manifiesto y caché de recursos estáticos/pantalla de conexión requerida. Excluir las respuestas de `/api` y de autenticación de la caché del service worker. Las actualizaciones no recargan automáticamente un formulario abierto.

Quedan postergados IndexedDB/Dexie, colas persistentes de operaciones, sincronización en segundo plano y resolución de conflictos entre copias offline. No se incorporan réplicas embebidas de Turso. Esto reduce alcance y permite validar antes los flujos cotidianos.

Referencias: [instalación PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) y [vite-plugin-pwa](https://vite-pwa-org.netlify.app/guide/).

## 5. Validación, costos y primera entrega

Pruebas centradas en precisión monetaria, cuotas, cargos de tarjeta, compatibilidad con historial y respaldos anteriores, autorizaciones y confirmaciones únicas. Probar fallos de red sin mostrar un guardado inexistente, reintentos sin duplicados y edición desde dos sesiones. No se exige un circuito de carga y sincronización offline.

Desarrollo y producción usan bases separadas, con datos ficticios en pruebas. Las vistas previas no se conectan a la base personal de producción. Validar frontend, rutas `/api`, autenticación y navegación directa en el mismo despliegue antes de sumar todas las pantallas.

Al 10 de octubre de 2026, **Turso Free** publica 5 GB de almacenamiento, 500 millones de filas leídas y 10 millones de filas escritas por mes. Estas cuotas son holgadas para el uso personal previsto; las lecturas se cuentan en filas, no en solicitudes HTTP. Vercel Hobby permite empezar sin costo para uso personal no comercial, dentro de sus propios límites. No se contrataron servicios ni se crearon cuentas.

Conservar exportación estructurada y CSV, y probar la restauración. Revisar los límites de recuperación del plan elegido antes de depender del registro cotidiano. Fuentes: [precios de Turso](https://turso.tech/pricing) y [Vercel Hobby](https://vercel.com/docs/plans/hobby).

Estado actual: esquema, migraciones, API, acceso y flujos principales implementados y probados localmente. Próximo paso: configurar Turso y validar el despliegue HTTPS desde celular y PC. Ver [README](../README.md) para arranque y configuración.
