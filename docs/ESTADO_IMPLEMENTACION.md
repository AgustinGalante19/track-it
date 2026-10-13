# Primera implementación

Estado vigente: ver las actualizaciones al final. El apartado de Transferencias se retiró el 13 de octubre de 2026; las referencias anteriores describen entregas históricas.

10 de octubre de 2026. Aplicación local funcional; publicación y conexión con una base Turso personal pendientes de configuración.

## Entrega

Se implementaron las tres secciones aprobadas y la vista transversal de cuentas. Los formularios guardan en una API Hono autenticada, con SQLite/libSQL y migraciones Drizzle. La misma integración permite sustituir el archivo local por Turso mediante variables privadas.

La apariencia sigue el boceto compacto: acento verde azulado, resumen mensual, saldos por cuenta, importes alineados y emojis editables. Incluye navegación inferior en celular, lateral en escritorio, formularios modales y temas claro/oscuro.

Los pagos son registros manuales. La aplicación no tiene integraciones bancarias ni mueve dinero.

## Verificaciones realizadas

- TypeScript estricto y build Vite/PWA correctos.
- 22 pruebas Vitest: importes, fechas, reparto de cuotas, pago de tarjeta sin doble gasto, cambio de moneda y comisión, transferencias atómicas, reintentos, versiones, autorización, sesiones y respaldo/restauración.
- API probada con dos sesiones y SQLite real en memoria con claves foráneas activas.
- Flujos de interfaz probados con datos ficticios: acceso demo, alta de gasto con decimales, confirmación de servicio, historial y pago de tarjeta, navegación y preferencias.
- Revisión visual de escritorio y tamaños móviles 360/390 px. El rendimiento en un teléfono físico todavía no se midió.
- PWA compilada: recarga con service worker activo y pantalla de conexión requerida al apagar el servidor. Capturas guardadas en `docs/previews/`.

## Decisiones de esta entrega

- El saldo actual se calcula independientemente del mes consultado.
- El gasto se imputa a la fecha efectiva del registro. El vencimiento previsto conserva su propia fecha.
- El precio de una regla recurrente solo cambia períodos futuros; el mes en curso conserva su estimación y permite confirmar otro importe real.
- Una cuota cancelada no vuelve a quedar pendiente si se anula después su cargo histórico.
- Localmente se permite crear usuarios para probar aislamiento. Producción exige un propietario y deshabilita el registro.
- API y autenticación quedan fuera de caché. La PWA no mantiene movimientos offline ni una cola de sincronización.
- Botón y diálogo se implementaron como componentes locales sobre Radix, con Tailwind y CSS propio, siguiendo la composición de shadcn/ui.

## Próximas iteraciones

1. Ajustar la experiencia a partir del uso del propietario y limpiar datos demo si se solicita.
2. Configurar Turso, cuenta propietaria y hosting; verificar sesiones HTTPS y acceso desde PC/celular.
3. Probar instalación PWA, teclado virtual, accesibilidad y velocidad en teléfonos reales.
4. Completar detalles del planning: cuotas desiguales/editables, contado/intereses, moneda original de suscripciones, vínculo compra/pago, deshacer anulación y recuperación de contraseña.

No se considera validado todavía el despliegue Vercel ni la instalación física de la PWA. No se crearon cuentas externas ni se utilizaron credenciales personales.

## Actualización del 11 de octubre de 2026

Se agregó la integración opcional con Better Auth Infrastructure: `BETTER_AUTH_API_KEY` activa `dash()` y su ruta de validación autenticada. `BETTER_AUTH_URL` determina también los orígenes permitidos y el hostname exacto admitido por Vite para usar ngrok. El router Hono admite los métodos de administración del plugin.

25 pruebas pasan, incluidas validación con JWT firmado, rechazo de otra API key y acceso desde un origen HTTPS de túnel simulado. Las pruebas del dashboard usan claves ficticias, una base en memoria y respuestas JWKS simuladas; no envían datos a Better Auth. La validación del proyecto real debe reintentarse desde el panel después de reiniciar la app.

## Actualización del 12 de octubre de 2026

El acceso permite Google como opción principal cuando están configuradas sus credenciales OAuth y usuario/contraseña como alternativa. Se eliminó el campo de email del acceso y del registro local. La migración `0002_username-auth` agrega el usuario único y completa cuentas anteriores sin cambiar IDs, contraseñas, sesiones ni datos financieros.

Preferencias permite conectar Google explícitamente a una cuenta existente y agregar usuario/contraseña a una cuenta creada con Google. No se vinculan cuentas automáticamente por email. El acceso es público y Google exige email verificado; `OWNER_EMAIL` y `OWNER_USERNAME` ya no restringen el ingreso. Cada sesión opera sobre los datos de su propio usuario. Habilitar una contraseña exige una sesión iniciada hace menos de diez minutos y conserva las contraseñas existentes.

35 pruebas automatizadas y TypeScript estricto pasan, junto con el build Vite/PWA. Las nuevas pruebas usan SQLite en memoria y JWT de Google firmados con claves ficticias para verificar selección de cuenta, callback y PKCE, rechazo de cuentas ajenas o sin verificar, migración, preservación de saldos, vinculación y alternativa local. Se revisó la nueva pantalla de acceso a 1440 px y 390 px; capturas en `docs/previews/auth-desktop.png` y `docs/previews/auth-mobile.png`.

En Chrome se verificaron registro sin email, acceso con usuario sin distinguir mayúsculas, cierre de sesión, contraseña incorrecta y redirección a Google. La comprobación utilizó una base en memoria y credenciales ficticias, con la navegación externa interceptada.

La autorización real con Google requiere `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y el callback autorizado en Google Cloud. Las instrucciones de acceso público y el procedimiento para conservar una cuenta anterior están en [Autenticación](AUTENTICACION.md).

## Cuentas informativas y Configuración · 12 de octubre de 2026

La aplicación ya no pide ni calcula saldos iniciales, saldos disponibles o deuda de tarjetas. Se quitaron los ajustes de saldo y sus validaciones acumuladas; las operaciones conservan sus importes y siguen clasificando gastos por cuenta y moneda. El resumen mantiene gasto mensual y compromisos pendientes.

Las cuentas se administran desde Configuración, que reemplaza el nombre Preferencias. Se retiraron las tarjetas de saldo del inicio y el listado de cuentas del menú lateral. El historial sigue accesible desde Configuración y conserva el mes seleccionado. Las cuotas históricas se muestran como pagadas anteriormente, sin depender de una fecha inicial de la cuenta.

La migración `0004_remove-account-balances` elimina las columnas de saldo y fecha inicial sin borrar cuentas, movimientos ni relaciones. Los respaldos anteriores siguen admitidos: sus campos de saldo se descartan y los ajustes históricos se conservan como registros. Las migraciones remotas se aplican explícitamente; no se ejecutan durante el build.

Verificación de esta actualización: 53 pruebas Vitest, TypeScript estricto y build Vite/PWA correctos. Se verificaron con SQLite las relaciones tras migrar datos existentes y con jsdom la creación de cuentas, navegación desde Configuración y acceso al historial.

## Categorías personales · 13 de octubre de 2026

Las categorías tienen una sección propia en `/categorias`, accesible desde la navegación lateral y móvil. Se retiró su formulario de Configuración. La vista permite buscar, alternar entre galería y tabla, consultar los gastos de una categoría y comparar el mes seleccionado con el anterior por moneda. Incluye alta, edición de nombre/emoji y eliminación con reasignación opcional. Los movimientos anulados se excluyen; cuotas y recurrentes cuentan al registrar su cargo. Las transferencias aportan solo su importe clasificado como gasto o comisión.

Cada categoría pertenece al usuario autenticado. El cambio de nombre actualiza sus referencias en movimientos, planes, reglas y períodos en una transacción. La eliminación conserva los registros y los asigna al destino elegido o a “Sin categoría”. Los emojis anteriores se conservan y las versiones evitan sobrescribir ediciones desactualizadas. Los gastos de categorías antiguas que no están en el catálogo se incluyen en “Sin categoría”, conservando su nombre original en el detalle.

Los presupuestos son mensuales, opcionales y separados para ARS y USD; 0 significa sin presupuesto. Son importes fijos para todos los meses, sin historial de presupuestos por período. Los respaldos incluyen presupuestos y versiones y siguen aceptando archivos anteriores. Restaurar una lista vacía conserva esa elección.

La migración `0005_cool_paladin` agrega presupuestos, versiones y el registro de inicialización. Conserva las categorías existentes e impide que las predeterminadas reaparezcan tras eliminarlas o renombrarlas. Se aplica con `pnpm db:migrate`; el servidor local también ejecuta migraciones al iniciar. La base configurada es remota: esta entrega no aplicó la migración en Turso.

Validación: 76 pruebas automatizadas, TypeScript y build Vite/PWA. Incluyen API autenticada con dos usuarios, conflictos, reasignación, conservación del historial, migración de categorías existentes, respaldos, totales y formularios. Revisión del build con Edge en 1440, 768, 390, 360 y 320 px, sin errores de página ni desborde horizontal. Las capturas `categories-desktop.png`, `categories-table.png`, `categories-mobile.png` y `categories-mobile-form.png` en `docs/previews/` usan datos ficticios y API interceptada.

## Retiro de Transferencias · 13 de octubre de 2026

Se retiraron la sección, la ruta específica, los enlaces de escritorio y móvil, el formulario y la API de creación/edición de transferencias. La navegación móvil tiene cuatro opciones: Gastos, Recurrentes, Categorías y Más. Los enlaces antiguos a la sección llegan a Gastos mediante la redirección general de rutas desconocidas.

Los envíos de dinero que representen un gasto se cargan desde Gastos con su cuenta, moneda y categoría. También se retiró el botón de pago de tarjeta del historial: los consumos ya cuentan al registrar el cargo. Los ejemplos nuevos no generan transferencias.

Los registros anteriores conservan sus importes y el gasto originalmente contabilizado. Siguen disponibles en el historial de cuentas, los totales, las exportaciones y la restauración de respaldos antiguos; pueden anularse, pero ya no editarse como transferencias. No se eliminan datos ni se requiere una migración de base de datos.

Validación: 73 pruebas Vitest, TypeScript estricto y build Vite/PWA correctos. Las pruebas de interfaz en jsdom verifican ambas navegaciones, el registro de un envío como gasto y la conservación del historial de tarjeta sin accesos al formulario retirado. La API rechaza las rutas eliminadas con 404 sin modificar los datos.

## Rendimiento y loaders — 13 de octubre de 2026

- Arranque con `/api/bootstrap`: una validación de sesión y una respuesta con usuario y datos; mantiene autorización por usuario y `Cache-Control: no-store`.
- Reutilización del snapshot entre secciones del mismo mes. Guardar, cambiar de mes y actualizar manualmente siguen consultando la API.
- Al recuperar foco/visibilidad se agrupan eventos y se revalida si los datos tienen al menos un minuto. Reconectar fuerza actualización; se pospone durante formularios, confirmaciones y navegaciones pendientes.
- El HTML inicial y los chunks se precachean juntos con actualización confirmada. La API queda fuera de caché. Los assets con hash reciben caché HTTP inmutable en Vercel.
- Código de autenticación y configuración separado del inicio. Entrada JavaScript: 440,94 → 402,34 kB, sin comprimir.
- Lecturas de snapshot agrupadas en un batch libSQL y generación de recurrentes sin reinsertar períodos ya existentes.
- Loader inicial desde HTML y React, más barra de progreso e indicador durante navegación/revalidación. Las solicitudes de una navegación abandonada se cancelan.
- Verificación: TypeScript, build, 93 pruebas y Chrome en viewport móvil. Recarga controlada por SW: sólo `/api/bootstrap` en el servidor, cero HTML/JS; navegación entre secciones sin repetir snapshot; API ausente de Cache Storage y error de conexión al iniciar offline. Capturas temporales y resultados en `.data/performance/`.

Los cambios están preparados en el repositorio. Falta medir en el despliegue real y en un teléfono físico; los resultados de red locales no constituyen una medición del tiempo de respuesta de producción.
