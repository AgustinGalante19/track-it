# Planning de producto — No gastes de más

> Decisión vigente al 13 de octubre de 2026: se retiró el apartado de Transferencias, incluidos el formulario, la creación/edición por API y el registro de pagos de tarjeta. Los envíos que sean gastos se cargan en Gastos. Las cuentas no llevan saldos ni deuda. Se conserva el historial anterior y la compatibilidad con sus respaldos sin recalcular gastos. Las referencias a transferencias y saldos en el plan original que sigue son históricas y quedan reemplazadas por esta decisión y el README actual.

Fecha: 10 de octubre de 2026. Estado: boceto aprobado; Turso/SQLite elegido y operación sin conexión postergada. Primera implementación local funcional disponible. Este documento conserva el alcance de producto; consultar [estado de implementación](ESTADO_IMPLEMENTACION.md) para distinguir lo entregado y lo pendiente.

## 1. Objetivo y decisiones

Una web app responsive, compatible con PWA, para registrar un gasto en segundos, entender cuánto se gastó y anticipar pagos mensuales.

| Tema | Decisión | Estado |
| --- | --- | --- |
| Usuarios | Acceso público; cada cuenta tiene sus propios gastos privados | Confirmado |
| Monedas | Pesos argentinos (ARS) y dólares (USD) | Confirmado |
| Carga | Manual rápida | Confirmado |
| Dispositivos | Los mismos datos en celular y PC, con cuenta y base central consultada online | Confirmado |
| Navegación | Gastos (únicos y en cuotas), Suscripciones/Servicios y Transferencias; Cuentas como vista transversal | Confirmado |
| Experiencia | Rapidez, practicidad y cuidado visual | Confirmado |
| Operación sin conexión | Fuera del MVP; consultar y guardar datos requiere conexión | Postergado por el usuario |
| Base de datos | SQLite compatible mediante Turso Cloud/libSQL | Confirmado |
| Compras en cuotas | Incluidas desde la primera versión, dentro de Gastos | Confirmado |
| Saldos por cuenta | Incluidos desde la primera versión, con saldo inicial, ingresos y ajustes | Confirmado |
| Identidad visual | Emojis editables en servicios y categorías, conservando nombres visibles | Confirmado |

Las decisiones propuestas pueden ajustarse durante la definición técnica. La recomendación de tecnologías se documenta en [STACK_TECNOLOGICO.md](STACK_TECNOLOGICO.md).

## 2. Navegación y pantallas

Las tres secciones son el centro del producto. El resumen mensual se integra en la misma pantalla, sin sumar una cuarta sección principal.

**Celular:** encabezado compacto con mes y moneda; resumen breve; contenido de la sección; navegación inferior de tres destinos; acción “Agregar” siempre fácil de alcanzar. El formulario se abre como una hoja desde abajo y conserva sus campos mientras permanece abierto si falla una solicitud; no se promete persistencia al cerrar o recargar la app.

**PC:** navegación lateral, encabezado con período y moneda, resumen del mes y lista más densa. El formulario puede abrirse en un panel lateral, manteniendo visible el contexto.

**Elementos compartidos:** selector de mes, selector ARS/USD, gasto del mes, próximos pagos y botón contextual para agregar. Un bloque “Mis cuentas” muestra los saldos y abre el detalle de cada cuenta; su administración, categorías, preferencias y exportación se abren desde un menú secundario.

El primer ingreso pide crear una cuenta, indicar su moneda y su saldo inicial con fecha de referencia. Las cuentas representan banco, billetera o efectivo. Una institución puede tener una cuenta ARS y otra USD. Las tarjetas de crédito son un tipo separado: muestran cargos por pagar o saldo a favor, sin sumarse al dinero disponible.

### Gastos: únicos y en cuotas

Nombre en navegación: **Gastos**. Filtros locales: “Todos”, “Únicos” y “En cuotas”. Una compra financiada tiene un total y una cantidad finita de pagos; por eso pertenece a Gastos. Un servicio permanece en Recurrentes porque continúa hasta que se pausa o cancela.

- Lista por fecha, con concepto, categoría, cuenta e importe.
- Carga rápida: importe y concepto; cuenta, categoría y fecha con valores predeterminados editables.
- Moneda derivada de la cuenta; fecha de hoy por defecto; última cuenta utilizada recordada.
- Acciones: agregar, editar, eliminar con opción de deshacer y duplicar una compra frecuente.
- Búsqueda por concepto y filtros por categoría y cuenta, sin ocupar la pantalla permanentemente.

Ejemplos: supermercado, comida, transporte, farmacia, compra de un periférico.

#### Compras en cuotas

- En “Agregar gasto”, elegir “Pago único” o “En cuotas”.
- Para cuotas: concepto, total financiado, cantidad, cuenta o tarjeta, fecha de primera cuota y categoría. Guardar precio de contado opcional y cargos de financiación incluidos en el total; no asumir cuotas sin interés.
- Mostrar una sola compra con importe de la cuota del mes, avance “3 de 6”, total contratado, saldo del plan aún sin registrar y calendario de cuotas.
- Crear el plan organiza los pagos futuros; no descuenta el total del banco ni registra todas las cuotas como gasto inmediato.
- Cada cuota confirmada genera un único gasto del mes. Por defecto, el mes corresponde a la fecha en que se registra su cargo; el calendario previsto sigue disponible por separado.
- Dividir el total en centavos exactos y ajustar la última cuota para conservar el total. Permitir corregir importes del calendario si el acuerdo tiene cuotas desiguales.
- Modificar o cancelar cuotas futuras conserva el historial de cargos ya confirmados. Un reintegro requiere un movimiento de reversión, sin borrar la compra histórica.
- Al comenzar con un plan ya iniciado, registrar cuotas anteriores como historial incluido en el saldo inicial y generar las restantes; no volver a aplicar sus débitos.

**Ejemplo de la convención elegida para la app:** teclado de ARS 120.000 en 6 cuotas de ARS 20.000. Si octubre corresponde a la tercera cuota, octubre muestra ARS 20.000 de gasto cuando se confirma su cargo; las otras tres cuotas quedan como compromisos futuros por ARS 60.000.

**Si se usa tarjeta de crédito:** registrar la cuota aumenta los cargos por pagar de la tarjeta y el gasto del mes, sin cambiar el saldo bancario. Pagar la tarjeta desde el banco es una transferencia: reduce dinero del banco y cargos pendientes de la tarjeta, sin registrar un segundo gasto. Esta misma regla se aplica a compras únicas y servicios pagados con tarjeta. “Cargo registrado” y “tarjeta pagada” son estados diferentes.

El MVP incluye tarjeta básica, cargos, cuotas y pagos parciales o totales manuales. La importación y conciliación automática de resúmenes queda para otra etapa.

### Suscripciones / Servicios

Nombre corto en navegación: **Recurrentes**. La pantalla distingue suscripciones y servicios mediante su tipo.

- Lista ordenada por próximo vencimiento, con importe, moneda y estado.
- Suscripción: precio normalmente conocido, por ejemplo GPT Plus o YouTube Premium.
- Servicio: importe que puede cambiar cada mes, por ejemplo electricidad o internet.
- Recurrencia mensual en el MVP: fecha inicial y día habitual de vencimiento.
- Estados del período: pendiente, pagado y omitido. “Vencido” se deriva de la fecha y del estado pendiente.
- Acciones: confirmar pago, ajustar importe del período, editar la regla futura, pausar o finalizar.
- Emoji editable por concepto: 📶 Internet, ⚡ Electricidad, ▶️ YouTube Premium o 🧠 GPT Plus.

**Regla central:** crear una recurrencia o alcanzar un vencimiento no registra un pago. La confirmación genera un único movimiento de gasto, asociado a ese período. Si se imputa a una tarjeta, la acción se llama “Registrar cargo” y aumenta los cargos por pagar; su cancelación bancaria se registra después.

El monto estimado ayuda a planificar; el importe efectivamente registrado como débito o cargo alimenta el gasto. Modificar el precio futuro no cambia cargos o pagos históricos. Pausar detiene períodos futuros y mantiene los anteriores. Para vencimientos del día 29, 30 o 31, usar el último día del mes cuando corresponda, conservando el día originalmente elegido para los meses siguientes.

Si una suscripción está expresada en USD pero se debita o factura en ARS, guardar precio original e importe real por separado. El gasto corresponde al importe y moneda del débito o cargo; no se suma también el precio original en USD. Si el cargo sigue en USD y se cancela luego con ARS, conservar el gasto original en USD y registrar el pago de tarjeta con ambos importes. Impuestos y cargos adicionales se registran manualmente una sola vez.

### Transferencias

- Lista con origen, destino, fecha, moneda e importe.
- Transferencia entre cuentas propias: dos lados de una misma operación, sin gasto de consumo.
- Cambio de moneda entre cuentas propias: importe entregado e importe recibido; tipo de cambio derivado de esos valores.
- Cuenta externa: contraparte y dirección de la transferencia, sin necesidad de crearla como cuenta propia.
- Comisión opcional, vinculada a la operación y registrada como gasto una sola vez.

Al intervenir una cuenta externa, indicar si el movimiento es gasto, ingreso o movimiento neutral. Transferir dinero a otra persona no permite deducir automáticamente el motivo. El MVP no lleva saldos de préstamos entre personas; sí contempla cargos pendientes de tarjetas.

Ejemplos:

| Operación | Efecto sobre gasto del mes |
| --- | --- |
| Banco ARS → billetera ARS, ARS 50.000 | ARS 0 |
| Banco ARS → cuenta USD, entregar ARS 140.000 y recibir USD 100 | ARS 0 y USD 0; conservar ambos importes |
| Banco → persona, ARS 15.000 por una compra | ARS 15.000, si se clasifica como gasto |
| Transferencia con comisión ARS 500 | ARS 500 por la comisión |
| Una compra ya registrada se pagó mediante transferencia | Se vincula el pago; no se registra otro gasto |
| Banco → tarjeta, ARS 20.000 para cancelar cargos ya registrados | ARS 0 de nuevo gasto; baja el banco y la deuda de tarjeta |

### Cuentas y balance

“Mis cuentas” es una vista transversal accesible desde las tres secciones. Mantener los tres destinos principales; cada tarjeta de cuenta abre una vista de detalle con historial, entradas/salidas y acciones.

- Mostrar saldo actual por banco, billetera y efectivo; total disponible por moneda.
- Mostrar tarjetas aparte, con cargos por pagar y cuotas futuras diferenciados.
- Registrar ingresos desde la cuenta o mediante la acción global “Registrar ingreso”; no hace falta una cuarta sección principal.
- Agregar, editar y archivar cuentas; preservar su historial.
- Mostrar tanto movimientos que afectan el saldo como los pendientes que todavía no lo afectan.
- Ajustar saldo con fecha y motivo, conservando la diferencia como un movimiento de ajuste. Un ajuste no es automáticamente un ingreso ni un gasto.
- Identificar la última revisión manual del saldo. Etiqueta: “Saldo según tus registros”, ya que la sincronización celular/PC no implica conexión con bancos.

**Cálculo para cuentas de dinero:** saldo inicial + ingresos + transferencias recibidas − gastos debitados − transferencias enviadas ± ajustes. Los movimientos previos a la fecha del saldo inicial no se vuelven a aplicar.

**Dinero disponible:** suma de bancos, billeteras y efectivo en la moneda elegida. Los compromisos futuros y cargos de tarjetas se muestran separados; no se descuentan del saldo actual antes de pagarse. El saldo de cuentas es actual y no cambia al seleccionar otro mes; un eventual saldo histórico debe etiquetar explícitamente su fecha.

Una transferencia entre cuentas propias de la misma moneda cambia ambos saldos y conserva el disponible conjunto, salvo comisiones. Un cambio ARS↔USD modifica los dos totales por separado. Al pagar una tarjeta baja el dinero disponible y baja la deuda.

## 3. Reglas para que los números sean claros

1. **ARS y USD se muestran por separado.** Nunca sumar monedas distintas como si fueran una sola.
2. **Gasto del mes:** compras únicas registradas + cuotas confirmadas + recurrentes confirmados + transferencias externas clasificadas como gasto + comisiones, sin duplicar operaciones vinculadas. En tarjeta, el cargo cuenta como gasto; pagar la tarjeta después no vuelve a contarlo.
3. **Pendiente del mes:** recurrentes y cuotas previstos aún sin confirmar, agrupados por moneda. Separar además “Tarjetas por pagar”: son cargos ya incluidos en gasto y no deben volver a sumarse como futuros gastos.
4. **Fecha del resumen:** fecha efectiva del débito o cargo confirmado. Vencimientos y cuotas previstas pertenecen a la planificación. Agrupar por mes calendario y mostrar pendientes anteriores vencidos aparte.
5. **Movimiento único:** las secciones son vistas sobre registros relacionados; confirmar un servicio o vincular una transferencia no crea copias del mismo gasto.
6. **Historial:** editar una recurrencia afecta períodos futuros; corregir un pago pasado requiere editar ese movimiento explícitamente.
7. **Precisión:** representar dinero en centavos enteros o decimal exacto, con código de moneda; evitar cálculos monetarios con coma flotante binaria.
8. **Fechas:** registrar la fecha elegida como fecha calendario; guardar por separado los instantes de creación y edición para auditoría.

9. **Saldo y gasto son medidas distintas.** Un ingreso aumenta saldo sin reducir gasto; transferir entre cuentas no crea gasto; un cargo con tarjeta crea gasto antes de la salida de dinero del banco.
10. **Planes finitos:** la suma de cuotas coincide con el total financiado y cada cuota se registra una sola vez. No sumar el total de la compra y sus cuotas simultáneamente.

Los saldos dependen de los movimientos cargados manualmente. Un ajuste conserva trazabilidad y permite corregir diferencias sin alterar el gasto del mes artificialmente.

Un total convertido a una moneda de referencia queda para otra etapa. De incluirse, debe indicar cotización, fecha y origen, además de conservar siempre los importes originales.

## 4. Alcance de la primera versión

### Necesario para lanzar

- Cuenta personal y acceso a los mismos datos desde celular y PC.
- Cuentas ARS/USD y categorías editables.
- Saldos iniciales con fecha, ingresos, ajustes con motivo e historial por cuenta.
- Bloque de balance por banco/billetera/efectivo y total disponible por moneda; tarjetas separadas.
- Alta, edición y eliminación de gastos; duplicación de una compra frecuente.
- Compras en cuotas, calendario finito, avance y compromisos futuros.
- Tarjetas básicas: cargos registrados, pagos manuales parciales/totales y separación de deuda frente a efectivo.
- Recurrentes mensuales de importe fijo o variable; vencimientos y confirmación manual de pago.
- Transferencias propias, externas y entre monedas; comisiones opcionales.
- Resumen mensual por moneda, con gasto registrado, cuotas/recurrentes pendientes y cargos de tarjeta por pagar diferenciados.
- Emojis personalizables en categorías, servicios y suscripciones.
- Búsqueda y filtros básicos.
- Diseño responsive e instalación PWA; consulta y guardado de datos con conexión.
- Estados de carga, guardado y error comprensibles; reintentos de solicitudes sin duplicados.
- Exportación de respaldo estructurada y restauración validada; exportación CSV para consulta.
- Estados vacíos, validaciones, errores recuperables y navegación accesible.

### Segunda etapa propuesta

- Evaluar consulta/carga sin conexión y sincronización posterior, fuera del alcance inicial.
- Conciliación e importación de resúmenes de tarjetas; automatización de cierres y vencimientos.
- Saldo proyectado e informes históricos de patrimonio.
- Presupuestos, metas e informes avanzados.
- Recordatorios y notificaciones push.
- Importación de extractos, lectura de comprobantes e integración bancaria.
- Conversión a moneda de referencia y cotizaciones automáticas.
- Seguimiento de préstamos, reintegros y gastos compartidos.
- Frecuencias semanales, anuales o personalizadas.

## 5. Dirección visual y objetivos de experiencia

Se propone una estética sobria con más personalidad: superficies neutras, un acento verde azulado, tipografía legible, importes alineados y emojis en servicios y categorías. Usar un emoji por concepto, editable y siempre acompañado por su nombre; conservar iconos simples para navegación y acciones. Priorizar listas útiles y acciones claras. Los gráficos se incorporan cuando respondan una pregunta concreta.

- Diseñar primero para celular y adaptar densidad y disposición a PC.
- Ofrecer apariencia clara y oscura siguiendo la preferencia del dispositivo.
- Identificar estados con texto además de color.
- Evitar formularios largos: mostrar notas, comisión y otros campos secundarios bajo demanda.
- Recordar valores frecuentes; mantener visible la moneda en cada importe.
- Respetar áreas seguras, teclado virtual, reducción de movimiento y navegación con teclado.

**Objetivos verificables, todavía no medidos:**

| Objetivo | Criterio propuesto |
| --- | --- |
| Carga diaria | Registrar una compra habitual en menos de 10 segundos tras configurar cuentas |
| Claridad | Identificar disponible por cuenta, gasto del mes y próximos compromisos, distinguiendo cargos de tarjeta |
| Responsive | Flujos completos desde 360 px hasta escritorio, sin desplazamiento horizontal accidental |
| Conexión y errores | Mostrar cuándo se requiere conexión; un fallo de red no se presenta como guardado exitoso |
| Datos entre dispositivos | Consultar la misma base central desde celular y PC; reintentar sin duplicados y detectar ediciones desactualizadas |
| Rendimiento | Medir arranque e interacción en un celular de gama media antes de fijar el presupuesto final |
| Accesibilidad | Controles con etiquetas, foco visible, contraste suficiente y acciones utilizables con teclado |

## 6. Arquitectura y datos, a nivel de planning

Turso/SQLite queda elegido para la base de datos. Stack ajustado recomendado: React + TypeScript + Vite, Tailwind/shadcn para la interfaz, API Hono, Drizzle para consultas/migraciones y Better Auth para acceso. La propuesta completa, validación y costos están en [STACK_TECNOLOGICO.md](STACK_TECNOLOGICO.md).

**Propuesta:** cliente web responsive → API autenticada → base central Turso. Consultar y guardar requiere conexión. Celular y PC acceden a los mismos datos; no hay base local, cola offline ni protocolo de réplica en el MVP.

- Identificadores estables por operación y solicitudes idempotentes para evitar duplicados si se repite una solicitud o se pierde su respuesta.
- Una transferencia se guarda de forma atómica: ambos lados y su comisión, si existe.
- Una confirmación de pago es única por período recurrente, incluso si se realiza desde dos dispositivos.
- Una cuota tiene identidad propia dentro de su plan; confirmar su cargo y pagar la tarjeta son operaciones diferentes.
- Los saldos se derivan del saldo inicial y movimientos posteriores; evitar saldos editables independientes que puedan desincronizarse.
- Versiones de registros para detectar ediciones simultáneas: rechazar un guardado desactualizado e indicar que se recargue antes de volver a editar.
- Actualizar consultas después de guardar, al recuperar el foco cuando corresponda y mediante actualización manual. No se exige actualización en tiempo real.
- Confirmar guardado después de la respuesta exitosa del servidor. Si falla, conservar el formulario abierto en memoria para reintentar, sin garantizar persistencia tras cierre o recarga.
- Datos separados por usuario y autorización comprobada en cada operación de la API; credenciales de Turso únicamente en servidor.
- Al cerrar sesión, invalidar la sesión y vaciar los datos privados en memoria. Si caduca mientras se carga un formulario, solicitar acceso antes de guardar.

| Entidad | Responsabilidad |
| --- | --- |
| Usuario | Identidad, preferencias, moneda predeterminada y zona horaria |
| Cuenta | Nombre, moneda, tipo, saldo inicial con fecha y estado archivado; tarjeta separada de cuentas de dinero |
| Categoría | Clasificación editable de gastos y emoji |
| Movimiento | Compra, cuota, cargo recurrente, ingreso, ajuste o transferencia; importes, fecha, notas e impacto |
| Lado de movimiento | Cuenta afectada, moneda, entrada/salida e importe; permite transferencias con dos monedas |
| Regla recurrente | Concepto, tipo, importe estimado, moneda, día mensual y vigencia |
| Período recurrente | Vencimiento, estado, estimación propia y vínculo al pago confirmado |
| Plan de cuotas | Concepto, total financiado, cantidad, cuenta/tarjeta, categoría y fecha inicial |
| Cuota | Número, importe exacto, fecha prevista, estado y vínculo al cargo confirmado |
| Revisión de saldo | Cuenta, fecha, motivo y movimiento de ajuste si corresponde |
| Identificador de operación / versión | Reintentos seguros y detección de ediciones desactualizadas, sin cola offline |

**PWA:** planear manifiesto, iconos, funcionamiento independiente y despliegue HTTPS; verificar instalación en los navegadores objetivo. La instalación se conserva; el trabajo con datos requiere conexión en esta versión. El service worker puede cachear recursos estáticos y mostrar una pantalla de conexión requerida, excluyendo API y autenticación. Referencia: [instalación PWA — MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

## 7. Secuencia de trabajo propuesta

1. **Cerrar producto:** cuotas y balance incluidos; validar la convención mensual propuesta, medios de pago y tratamiento de reintegros. Definir navegadores y dispositivos de prueba.
2. **Diseñar los flujos:** tres secciones, detalle de cuentas, ingresos/ajustes, carga rápida única/en cuotas, registro de recurrente, pago de tarjeta y transferencia ARS↔USD; estados vacío, guardando, error y conexión requerida.
3. **Cerrar arquitectura:** revisar el stack ajustado y definir esquema SQLite, autenticación y operaciones de la API; documentar modelo y reglas.
4. **Construir un flujo completo:** cuenta personal, cuentas con saldo inicial, ingresos, gastos y transferencias con persistencia central, acceso online desde ambos dispositivos y balance por moneda.
5. **Agregar recurrentes, cuotas y tarjetas:** reutilizar los movimientos y verificar que ni cargos ni pagos de tarjeta dupliquen gasto.
6. **Preparar lanzamiento:** PWA, respaldo/restauración, accesibilidad, rendimiento y pruebas en dispositivos reales.

Cada etapa debe producir algo revisable. No se estima calendario todavía: depende de cerrar el alcance y elegir las tecnologías.

## 8. Casos críticos para validar antes de lanzar

- Transferir entre cuentas propias no aumenta gasto del mes, incluso con distintas monedas; solo la comisión suma como gasto.
- Registrar ARS y USD no mezcla unidades en ningún total.
- Confirmar un recurrente dos veces o desde dos dispositivos produce un solo pago.
- Un servicio variable conserva el importe real pagado; cambiar la regla futura no lo modifica.
- Una suscripción con precio USD pero facturada/debitada en ARS suma únicamente el cargo real en ARS.
- Un cargo de tarjeta en USD cancelado después con ARS conserva el gasto en USD; el pago con cambio de moneda no crea un segundo gasto.
- Pagar este mes un vencimiento del mes anterior actualiza el gasto del mes de pago y el estado del período correspondiente.
- Una compra pagada por transferencia no se contabiliza dos veces.
- Una compra de ARS 120.000 en 6 cuotas genera seis importes que suman exactamente ARS 120.000; crear el plan no debita ese total del banco.
- Un cargo de ARS 20.000 en una tarjeta aumenta gasto y cargos por pagar; pagar esos ARS 20.000 después reduce banco y deuda, sin nuevo gasto.
- Una compra única con tarjeta sigue la misma separación entre cargo y pago bancario.
- Confirmar una cuota dos veces o desde dos dispositivos genera un solo cargo.
- Un ingreso modifica saldo sin reducir gasto; un ajuste modifica saldo sin clasificarse automáticamente como gasto/ingreso.
- Una transferencia propia conserva disponible conjunto en la misma moneda, salvo comisión.
- Una cuota futura o servicio pendiente no modifica el saldo actual.
- Cambiar el mes del resumen no cambia el saldo actual mostrado.
- Cargar un plan ya iniciado no vuelve a aplicar cuotas anteriores al saldo de apertura.
- Una pérdida de conexión muestra error o resultado incierto; reintentar con el mismo identificador no duplica un movimiento ya guardado.
- Un formulario sin conexión no simula un guardado exitoso ni crea una operación offline pendiente.
- Editar o borrar desde dos dispositivos detecta versiones desactualizadas y no restaura registros eliminados.
- Exportar y restaurar conserva monedas, relaciones y pagos recurrentes sin duplicarlos.

## 9. Boceto aprobado

El boceto aprobado permite recorrer las tres secciones y probar la jerarquía de información. Usa datos ficticios y cambios locales de demostración; todavía no representa la aplicación implementada ni una conexión a tus cuentas.

La dirección visual aprobada es una lista compacta con resumen mensual, bloque de cuentas con disponible y tarjetas diferenciados, emojis en conceptos y filtro de compras únicas/en cuotas. Los detalles de interacción y formularios se ajustan durante la implementación.
