# Base de datos de Track It en CachyOS

La API desplegada usa `libsql://track-it-db:8080?tls=0` desde la red `track-it_default`. El servidor libSQL valida un JWT Ed25519 y Docker conserva la base en el volumen externo `track-it-libsql-data`. El servicio de respaldos usa un token de solo lectura y se conecta desde otra red Docker.

El checkout de la aplicación está en `~/Proyectos/track-it`. El stack de la base se administra por separado desde `~/.local/state/track-it-db`. Los despliegues de la aplicación pueden seguir usando su `compose.yaml` y el `.env` del servidor.

```sh
state="$HOME/.local/state/track-it-db"
sudo docker compose -p track-it-db --env-file "$state/.env.libsql" \
  -f "$state/compose.libsql.yaml" ps
```

## Respaldos

El servicio `backup` crea un SQLite por día UTC en `$state/backups`. Verifica la integridad y las claves foráneas antes de publicar cada archivo. Conserva 14 días de respaldos diarios en el servidor. Los archivos `turso-cutover-*.db` conservan la copia de origen tomada durante el corte y quedan fuera de la rotación.

Para comprobar un respaldo existente:

```sh
backup="$state/backups/track-it-$(date -u +%F).db"
sqlite3 -readonly "$backup" 'PRAGMA integrity_check; PRAGMA foreign_key_check;'
```

El resultado esperado es `ok` seguido de cero filas de `foreign_key_check`. Para restaurar, detener las escrituras de la API, validar el respaldo y copiarlo a `data.sqld/dbs/default/data` dentro de un volumen Docker nuevo. Configurar `TRACK_IT_LIBSQL_VOLUME` con el nombre del nuevo volumen en `.env.libsql` y recrear el servicio de la base. Antes de reabrir la API, generar un respaldo desde la instancia restaurada y comparar ambos archivos con `sqlite3 -readonly ARCHIVO '.sha3sum --schema'`.

El archivo `$state/app.env.turso` guarda la configuración anterior de la API. Turso conserva la copia de origen. Si ya se registraron cambios en Docker, reconciliarlos antes de volver a conectar la aplicación a Turso.
