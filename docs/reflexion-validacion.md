# Reflexión sobre validación y errores

Esta API separa la entrada HTTP, la validación de datos, el controlador y el servicio. Esa separación permite rechazar solicitudes inválidas antes de modificar las tareas y mantener las reglas de acceso a los datos en el servicio.

## Ejemplos de la API

### Actualizar el estado de una tarea

```http
PATCH /api/tasks/2/status HTTP/1.1
Content-Type: application/json

{"completed":true}
```

Respuesta exitosa:

```http
HTTP/1.1 200 OK
X-Request-Id: 7c5d6c0f-3b9a-4c2e-8e56-8f08a4f9c321
Content-Type: application/json

{
  "data": {
    "id": 2,
    "title": "Probar la API con Postman",
    "status": "completed",
    "createdAt": "2026-09-21T01:04:06.476Z"
  }
}
```

El valor `false` también es válido y cambia el estado a `pending`:

```http
PATCH /api/tasks/2/status HTTP/1.1
Content-Type: application/json

{"completed":false}
```

Un valor que no sea booleano produce `422`:

```http
PATCH /api/tasks/2/status HTTP/1.1
Content-Type: application/json

{"completed":"true"}
```

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "La solicitud contiene datos inválidos.",
    "details": [{ "field": "completed", "message": "Debe ser un booleano." }],
    "requestId": "7c5d6c0f-3b9a-4c2e-8e56-8f08a4f9c321"
  }
}
```

La ausencia de `Content-Type: application/json` produce `415 UNSUPPORTED_MEDIA_TYPE`. Si el JSON está mal formado, `express.json()` produce `400 INVALID_JSON`. Si el id no es un entero positivo, `validateTaskId` produce `400 INVALID_ID`; si el id es válido pero no existe, el servicio produce `404 TASK_NOT_FOUND`.

### Consultar una tarea

```http
GET /api/tasks/2 HTTP/1.1
```

```json
{
  "data": {
    "id": 2,
    "title": "Probar la API con Postman",
    "status": "pending",
    "createdAt": "2026-09-21T01:04:06.476Z"
  }
}
```

### Crear una tarea

```http
POST /api/tasks HTTP/1.1
Content-Type: application/json

{"title":"Documentar la API"}
```

El título se valida, se normaliza quitando espacios exteriores y se entrega al servicio mediante `res.locals`.

## Respuestas a las preguntas

### 1. ¿Qué diferencia existe entre validar el formato HTTP y proteger una regla del negocio?

Validar el formato HTTP comprueba que la solicitud pueda interpretarse: el método y la ruta corresponden, el `Content-Type` es `application/json` y el cuerpo contiene JSON válido. Es responsabilidad de la capa de entrada.

Proteger una regla del negocio comprueba que los datos tengan sentido para la aplicación, por ejemplo que `completed` sea booleano o que `title` sea texto no vacío y no supere 120 caracteres. Estas comprobaciones evitan estados inválidos y deben permanecer separadas de las búsquedas y modificaciones de tareas.

### 2. ¿Por qué conviene usar `router.param` para validar el id?

`router.param("id", validateTaskId)` aplica la misma validación a todas las rutas que contienen `:id`: obtener, actualizar y eliminar una tarea. Evita repetir middleware en cada ruta y garantiza que el controlador reciba un id entero positivo normalizado en `res.locals.taskId`.

### 3. ¿Qué ventaja ofrece guardar datos normalizados en `res.locals`?

El middleware puede transformar una entrada una sola vez, por ejemplo convertir el id a `number` o quitar espacios del título. El controlador recibe datos confiables y el servicio no necesita conocer detalles de HTTP ni repetir conversiones. Además, `res.locals` limita esos valores al ciclo de vida de la solicitud.

### 4. ¿Cuándo corresponde responder 400 y cuándo 422?

Se responde `400 Bad Request` cuando la solicitud no puede interpretarse correctamente, como un JSON mal formado o un id con sintaxis inválida para la ruta (`abc`).

Se responde `422 Unprocessable Entity` cuando la sintaxis HTTP y el JSON son válidos, pero el contenido no cumple el contrato de la API, como `{"completed":"true"}` o `{"title":""}`.

En este flujo, un `Content-Type` ausente o incompatible produce `415`, porque el problema es el tipo de representación enviada, no el contenido de un JSON ya aceptado.

### 5. ¿Por qué `notFound` delega el error en lugar de responder directamente?

`notFound` solo identifica que ninguna ruta atendió la solicitud y crea un `AppError` con código `ROUTE_NOT_FOUND`. Al delegarlo con `next`, el `errorHandler` centraliza el formato `{ "error": ... }`, incorpora el `requestId` y mantiene una respuesta uniforme con los demás errores.

### 6. ¿Qué información no debe enviarse al cliente en un error 500?

No deben enviarse el stack trace, nombres de archivos, consultas, credenciales, tokens, variables de entorno ni detalles internos de infraestructura. El cliente recibe un mensaje genérico como `Ocurrió un error interno` y un código estable (`INTERNAL_ERROR`). El detalle técnico se registra en el servidor junto con el `requestId`.

### 7. ¿Cómo ayuda `requestId` durante la depuración?

Cada solicitud recibe un identificador en `X-Request-Id`. Ese mismo valor aparece en la respuesta de error y en el registro del servidor, por lo que permite relacionar rápidamente una petición del cliente con sus logs, incluso cuando varias solicitudes se procesan de forma concurrente.

### 8. ¿Qué prueba demuestra que la refactorización no rompió la API anterior?

Hay que repetir las pruebas de las rutas que ya existían, especialmente:

```text
GET    /api/tasks
GET    /api/tasks/2
POST   /api/tasks              con {"title":"Nueva tarea"}
PATCH  /api/tasks/2/complete
DELETE /api/tasks/2
```

La prueba clave para la compatibilidad del cambio es que `PATCH /api/tasks/:id/complete` siga devolviendo `200` y dejando la tarea en `completed`, mientras la nueva funcionalidad usa la ruta independiente `PATCH /api/tasks/:id/status`. También deben conservarse las respuestas anteriores para `INVALID_ID`, `TASK_NOT_FOUND`, `UNSUPPORTED_MEDIA_TYPE` e `INVALID_JSON`.
