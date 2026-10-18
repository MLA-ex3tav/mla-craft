# MCSR Co-op en MLA Craft

Activa **MCSR Co-op** al crear un servidor nuevo. El modo queda persistido como
`mcsrCoop` en `instance.json`; las instancias anteriores siguen arrancando con Java.
Requiere Node.js 18 o posterior disponible como `node` en el PATH del proceso de
la app. Si acabas de instalar Node, vuelve a abrir MLA Craft.

## Integración

- `src/mcsr.rs::prepare(instance, dir, java, args)` genera `server.js` y
  `mcsr-launch.json`, configura las tres propiedades requeridas y conserva las
  demás propiedades. Nunca elimina un mundo durante la preparación.
- `src/process.rs::build_command` utiliza `node server.js` para este modo. El
  wrapper ejecuta Java sin shell con la misma memoria, JVM y argumentos del
  cargador que usaría la app normalmente.
- Se prepara al instalar y al arrancar. Los archivos generados pertenecen a la
  aplicación; un `server.js` ajeno no se sobrescribe.

## Ciclo de una partida

1. Antes del arranque, impone `spawn-protection=0`, `allow-flight=true`,
   `level-name=world` y un `level-seed` aleatorio de 64 bits.
2. Espera el mensaje de arranque completado del logger de Minecraft y envía
   `save-off` por stdin una sola vez. Los comandos de consola se envían sin `/`.
3. `stop` o `/stop` en la consola se reenvía a Minecraft. `/stop` desde el juego
   requiere los permisos normales de operador. No se interpreta el texto de chat
   como un comando privilegiado.
4. Después de la terminación de Java y del vaciado de sus logs, comprueba que
   arrancó, anunció `Stopping server` y terminó con código 0. Entonces elimina
   exclusivamente `world` y repite el ciclo con otra semilla.
5. Los fallos de arranque, los crashes o errores de limpieza detienen el bucle y
   conservan lo que quede del mundo. No se relanza Java tras una limpieza fallida.

**Detener** desde la app envía `__MLA_MCSR_SHUTDOWN__`: apaga Java sin reset ni
borrado. **Reiniciar** desde la app también conserva el mundo. Para una nueva
partida, usa `/stop`. `__MLA_MCSR_FORCE_STOP__` termina Java sin reiniciar.
Cerrar la entrada del wrapper o recibir SIGINT/SIGTERM inicia una detención
ordenada; tras 25 segundos sin terminar, fuerza el cierre de Java.

El wrapper publica `STARTING` en cada ciclo para que la app actualice su estado.
La consola conserva los logs de todas las partidas.

## Alcance y archivos

- Compatible con el arranque estándar de Vanilla, Fabric, Forge y NeoForge.
  No instala mods ni certifica reglas de clasificación de speedrunning.
- Paper/Spigot no se permiten: separan dimensiones en otras carpetas. Los mods
  que guarden mundos fuera de `world` requieren una integración específica.
- El mapa inicial puede guardarse al arrancar; `save-off` desactiva el guardado
  automático durante la partida, no todos los accesos al disco.
- Se rechazan enlaces/junctions en `world` y sus descendientes. El proceso debe
  tener permisos de escritura y borrado sobre la carpeta del servidor.
- `.mcsr.lock` impide wrappers simultáneos. Si Node es terminado externamente de
  forma abrupta, el bloqueo puede permanecer: comprueba que Node y Java ya no
  están ejecutándose antes de retirarlo. La app no retira bloqueos por su cuenta.
- EULA y mods se gestionan como en cualquier otro servidor. No se modifican las
  carpetas de mods, backups ni otros mapas durante el reset.

## Pruebas

Desde la raíz del proyecto:

```powershell
node --test src-tauri/mcsr/server.test.mjs
cargo test --offline --manifest-path src-tauri/Cargo.toml mcsr --lib
npm run build
```

Las pruebas usan un proceso Node que simula Java y carpetas temporales dentro de
este directorio. No arrancan servidores reales. La prueba de junctions se omite
cuando el sistema de archivos no permite crearlas.

Referencias de las APIs utilizadas: [child_process.spawn y close](https://nodejs.org/api/child_process.html)
y [fs.lstat, realpath y rm](https://nodejs.org/api/fs.html).
