# Reflexión sobre MongoDB Atlas

## 1. Cuenta de Atlas y usuario de base de datos

La cuenta de Atlas sirve para entrar al panel y administrar proyectos, clústeres y usuarios. El usuario de base de datos es una identidad distinta: sus permisos permiten autenticarse ante MongoDB y consultar o modificar bases de datos. La API usa este segundo usuario mediante `MONGODB_URI`; no necesita las credenciales del panel de Atlas.

Por ejemplo, una persona puede administrar el clúster desde Atlas, mientras que la aplicación se conecta con un usuario de base de datos con permisos limitados a `MONGODB_DB_NAME`.

## 2. Por qué `MONGODB_URI` es un secreto

La URI puede incluir nombre de usuario y contraseña, además del clúster y la base de datos. Quien obtenga credenciales válidas podría acceder a los datos según los permisos de ese usuario. Que el repositorio sea privado reduce la exposición pública, pero no impide que accedan colaboradores, integraciones, registros de CI, copias locales o el historial de Git. Por eso `.env` debe mantenerse fuera del control de versiones y los secretos deben rotarse si se exponen.

Ejemplo: compartir `mongodb+srv://<usuario>:<contraseña>@<cluster>/...` en una captura o en un mensaje puede revelar credenciales. En documentación se deben usar marcadores como esos, nunca valores reales.

## 3. Riesgo de `0.0.0.0/0`

Esta regla permite conexiones desde cualquier dirección IPv4. No elimina la autenticación, pero expone el clúster a intentos de conexión desde Internet; si además se filtran credenciales, aumenta quién podría intentar utilizarlas. Conviene autorizar solo las IP necesarias y usar `0.0.0.0/0` únicamente cuando sea imprescindible, de forma temporal y con credenciales de mínimo privilegio.

## 4. Conectar antes de `app.listen`

En `src/server.ts`, `await connectDatabase(...)` se ejecuta antes de `app.listen(...)`. Así la API no empieza a aceptar solicitudes hasta confirmar la conexión requerida; si falla, el inicio se detiene en vez de anunciar un servicio listo que no puede cumplir sus operaciones dependientes de MongoDB.

La configuración se carga desde `MONGODB_URI` y `MONGODB_DB_NAME`; `connectDatabase` pasa ambos a Mongoose. El tiempo de selección del servidor está limitado a cinco segundos.

## 5. `readyState` y `ping`

`mongoose.connection.readyState === 1` indica que Mongoose considera abierta la conexión. Es una comprobación rápida del estado local, pero por sí sola no confirma que el servidor responda en ese momento. `database.admin().ping()` envía un comando a MongoDB y comprueba que el servidor puede responder.

En esta aplicación, `GET /health` solo informa que el proceso HTTP responde (`{"status":"ok"}`). `GET /health/database` comprueba además `readyState` y ejecuta `ping`; si ambos pasos son satisfactorios, responde `{"data":{"database":{"status":"connected"}}}`.

## 6. Error de infraestructura y no de validación HTTP

La validación HTTP comprueba si la solicitud del cliente tiene formato y datos aceptables, como el título no vacío de una tarea. Una caída o falta de conexión con MongoDB no depende de esos datos: es una dependencia de infraestructura no disponible. Por eso `checkDatabaseHealth` la representa con estado HTTP `503` y código `DATABASE_UNAVAILABLE`, no con un `400` o `422`.

## 7. Propagación de `AppError` en Express 5

`getDatabaseHealth` es una función `async` y espera `checkDatabaseHealth()`. Si este servicio lanza un `AppError`, la promesa del controlador se rechaza. Express 5 detecta ese rechazo en los controladores asíncronos y lo pasa al siguiente middleware de error; no hace falta un `try/catch` que llame manualmente a `next(error)`.

En `src/app.ts`, `errorHandler` está registrado después de las rutas. Reconoce `AppError` y entrega al cliente una respuesta controlada, por ejemplo:

```json
{
  "error": {
    "code": "DATABASE_UNAVAILABLE",
    "message": "La base de datos no está disponible.",
    "requestId": "<id-de-solicitud>"
  }
}
```

## 8. Pruebas de que Atlas no rompió la API anterior

La evidencia de `docs/pruebas-validaciones.md` y `docs/pruebas-conexion-mongodb.md` registra verificaciones positivas y negativas. Entre ellas: `GET /api/tasks` conserva su respuesta, `POST /api/tasks` acepta una tarea válida, un ID no numérico responde `400 INVALID_ID`, y enviar texto sin el tipo de contenido JSON responde `415 UNSUPPORTED_MEDIA_TYPE`. También se verifican `GET /health`, `GET /health/database`, `pnpm check` y `pnpm build`.

Ejemplos de las comprobaciones HTTP:

```text
GET   /api/tasks
POST  /api/tasks                 Content-Type: application/json
GET   /api/tasks/abc
GET   /health
GET   /health/database
```

Estas evidencias son comprobaciones manuales registradas y chequeos de tipos/compilación; no una suite automatizada. Actualmente `pnpm test` sigue siendo un marcador que termina con “no test specified”.

## 9. Por qué se conserva el arreglo en memoria

La conexión a Atlas y el endpoint de salud son el alcance de esta actividad; no se migra aquí la persistencia de tareas. `src/services/task.service.ts` todavía importa `src/data/tasks.ts`, por lo que crear, listar, actualizar y eliminar tareas continúa usando el arreglo en memoria. Mantener ese comportamiento permite comprobar que la integración de conexión no altera las rutas anteriores y evita mezclar dos cambios de alcance distinto.

Como consecuencia, los cambios en tareas no sobreviven al reinicio. Usar MongoDB para almacenarlas requeriría una actividad posterior que implemente y pruebe modelos y operaciones persistentes.

## 10. Información que no debe exponerse al cliente

No se deben enviar la URI completa, usuario o contraseña, cadenas de conexión, stack traces, mensajes internos del driver ni detalles innecesarios del clúster o de la red. El cliente necesita un estado y un código estables, no la configuración ni el diagnóstico interno.

En esta API, el fallo del chequeo se transforma en el mensaje genérico `La base de datos no está disponible.` con código `DATABASE_UNAVAILABLE` y un `requestId` para correlacionar la solicitud. El arranque también informa el fallo con un mensaje genérico sin imprimir la URI ni el stack.
