# Acceso con Google y usuario

El acceso ofrece **Continuar con Google** cuando están configuradas las credenciales OAuth. La alternativa es **usuario y contraseña**, sin pedir email en pantalla. Better Auth gestiona ambas formas de acceso y las sesiones.

## Configurar Google

1. En [Google Cloud Console](https://console.cloud.google.com/auth/clients), configurá el consentimiento OAuth y creá un cliente de tipo **Aplicación web**. Para acceso público, configurá la audiencia como **External** y publicá la aplicación OAuth (**In production**). [Configuración de audiencia de Google](https://support.google.com/cloud/answer/15549945?hl=en).
2. Registrá como URI de redirección el origen de `BETTER_AUTH_URL` seguido de `/api/auth/callback/google`. Ejemplos:
   - Local: `http://localhost:5173/api/auth/callback/google`.
   - Ngrok: `https://tu-dominio.ngrok-free.dev/api/auth/callback/google`.
   - Publicado: `https://tu-dominio.com/api/auth/callback/google`.
3. Completá estas variables privadas en `.env` o en el hosting:

```dotenv
GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu-client-secret
BETTER_AUTH_URL=https://tu-dominio.ngrok-free.dev
```

4. Reiniciá `pnpm dev` y abrí la app desde `BETTER_AUTH_URL`. El botón de Google aparecerá al estar configurados ambos valores. Si cambia el dominio de ngrok, actualizá también el callback autorizado en Google.

El acceso es público: cualquier cuenta de Google con email verificado puede ingresar y tiene sus propios datos. `OWNER_EMAIL` y `OWNER_USERNAME` no restringen el acceso ni son obligatorios en producción. No hace falta conectar el dashboard de Better Auth para usar Google.

La primera entrada con Google crea el espacio personal si todavía no existe una cuenta. Después, desde **Configuración → Formas de acceso**, podés habilitar un usuario y contraseña como alternativa. Esa operación exige una sesión reciente y no reemplaza una contraseña existente.

Referencias: [Google en Better Auth](https://better-auth.com/docs/authentication/google), [configuración OAuth web de Google](https://developers.google.com/identity/protocols/oauth2/web-server).

## Conservar una cuenta anterior

La migración `0002_username-auth` agrega el usuario y un índice único sin reemplazar tablas. El comando `pnpm db:migrate` y el inicio de la API local también completan los usuarios que faltan. Conserva IDs, contraseñas, sesiones y datos financieros.

Para cuentas anteriores, el usuario se obtiene de la parte del email anterior al `@`, en minúsculas. Los caracteres no admitidos se reemplazan por `_`; se limita la longitud y se agrega un sufijo si coincide con otra cuenta. Por ejemplo, `agus@gmail.com` pasa a `agus`.

1. Aplicá `pnpm db:migrate` contra la misma base que ya usabas.
2. Ingresá con el usuario asignado y tu contraseña habitual.
3. Abrí **Configuración → Formas de acceso → Conectar Google**. La autorización vincula Google al mismo usuario, incluso si el email anterior era distinto. Las cuentas y movimientos se conservan.
4. Luego podés salir e ingresar con Google o con usuario y contraseña.

Si querés elegir el usuario de una cuenta anterior, configurá `OWNER_EMAIL` con el email guardado de esa cuenta, `OWNER_USERNAME` con el usuario elegido y ejecutá `pnpm account:create`. Si la cuenta ya existe, el comando actualiza solo el usuario; no cambia su contraseña ni necesita `OWNER_PASSWORD`.

Para conservar una cuenta local, conectá Google desde esa sesión antes de ingresar con Google. Si los emails son distintos y entrás directamente con Google, se crea un espacio vacío independiente. No se vinculan cuentas automáticamente por coincidencia de emails: la conexión se autoriza desde una sesión iniciada.

## Usar solo usuario y contraseña

Google es opcional. El formulario permite crear una cuenta con nombre, usuario y contraseña, también en producción. Los usuarios admiten de 3 a 30 letras, números, puntos o guion bajo, y no distinguen mayúsculas de minúsculas.

Para crear una cuenta desde la consola, opcionalmente:

```dotenv
OWNER_USERNAME=agus
OWNER_PASSWORD=una-contrasena-privada-de-al-menos-10-caracteres
OWNER_NAME=Agus
```

Ejecutá `pnpm account:create` y quitá `OWNER_PASSWORD` del entorno después. Si también definís `OWNER_EMAIL`, el registro interno conserva ese email para reconocer una cuenta anterior. Si no, se utiliza una dirección interna bajo `.invalid`, que no recibe correo ni verifica identidad. No se envían emails de registro ni de acceso. La recuperación de una contraseña local todavía no está implementada; Google permite volver a entrar si quedó vinculado.

El registro público permanece habilitado aunque existan variables `OWNER_*` de una instalación anterior. Producción deshabilita la demostración y exige URL pública y secreto privado de al menos 32 caracteres. Cada operación usa el ID del usuario autenticado para aislar cuentas, gastos y respaldos.

Referencia: [plugin de usuario de Better Auth](https://better-auth.com/docs/plugins/username).
