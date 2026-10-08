# Reflexión sobre el modelado con MongoDB

## 1. ¿Qué diferencia existe entre un documento, un esquema y un modelo?

Un documento es un registro concreto guardado en MongoDB; por ejemplo, una tarea con título, estado y fechas. El esquema describe la forma y las reglas que esos documentos deben respetar. En `src/models/tasks.ts`, `taskSchema` declara que `title` es obligatorio, limita `description` a 300 caracteres y restringe `status` a `pending` o `completed`.

El modelo es la interfaz de Mongoose que se crea a partir del esquema. En este proyecto, `TaskModel` se usa en `src/services/task.service.ts` para crear tareas con `TaskModel.create()`, buscarlas con `find()` o `findById()` y eliminarlas con `findByIdAndDelete()`.

## 2. ¿Por qué la API devuelve `id` en lugar de `_id`?

`_id` es el nombre que MongoDB y Mongoose usan para la clave del documento. La conversión `toTask` del servicio la transforma en `id` mediante `document._id.toString()`. Así la respuesta HTTP ofrece un identificador sencillo y estable para quien consume la API, sin exponer directamente la convención interna de persistencia. Por ejemplo, la respuesta contiene `"id": "..."` y el cliente usa ese valor en `GET /api/tasks/:id`.

## 3. ¿Qué problema evita migrar todas las operaciones a una sola fuente de datos?

Evita que unas rutas lean de una fuente y otras escriban en otra. Si, por ejemplo, `POST` guardara en MongoDB pero `GET` siguiera consultando una lista en memoria, la tarea recién creada no aparecería al consultarla; también se perdería la coherencia después de reiniciar el proceso. En este proyecto, crear, listar, consultar, completar y eliminar tareas pasan por `task.service.ts` y `TaskModel`, por lo que MongoDB es la fuente de datos de esas operaciones.

## 4. ¿Qué reglas aplica el middleware y cuáles repite el esquema?

El middleware `validateTaskTitle` valida la entrada HTTP antes de llamar al servicio. Para `title`, exige texto no vacío y un máximo de 120 caracteres. Para `description`, permite que el campo no exista; si se envía, exige texto y un máximo de 300 caracteres. También elimina espacios externos de ambos valores. Si `description` es inválido, la respuesta señala ese campo en `details`.

El esquema repite reglas importantes como protección en la persistencia: `title` obligatorio y limitado a 120, y `description` opcional y limitado a 300. Además, usa `trim` para normalizar y restringe `status` a los valores permitidos. La validación HTTP da errores claros al cliente; la del esquema protege los datos aunque otro flujo intente guardarlos sin pasar por ese middleware.

## 5. ¿Qué diferencia existe entre `INVALID_ID` y `TASK_NOT_FOUND`?

`INVALID_ID` significa que el valor de la ruta ni siquiera tiene el formato de un `ObjectId` válido. El middleware `validateTaskId` detecta ese caso antes de entrar al controlador y responde `400`. Por ejemplo, `GET /api/tasks/no-es-un-id` es inválido.

`TASK_NOT_FOUND` significa que el identificador sí tiene formato válido, pero la búsqueda no encuentra un documento con ese valor. El servicio responde `404`. Por ejemplo, un `ObjectId` bien formado que no corresponde a ninguna tarea.

## 6. ¿Qué hacen `timestamps` y `versionKey: false`?

La opción `timestamps: true` hace que Mongoose mantenga `createdAt` y `updatedAt`: la primera fecha registra cuándo se creó la tarea y la segunda se actualiza cuando cambia. El servicio incluye ambas en la respuesta pública.

Mongoose normalmente agrega un campo interno `__v` para control de versión. `versionKey: false` desactiva ese campo porque este modelo no lo usa; así se evita almacenar y devolver un metadato que no forma parte del contrato de la API.

## 7. ¿Por qué los controladores deben usar `async` y `await`?

Las consultas a MongoDB y las operaciones de Mongoose son asíncronas y devuelven promesas. Declarar el controlador `async` y usar `await` permite esperar el resultado antes de enviar la respuesta: por ejemplo, `postTask` espera `createTask` antes de contestar `201`, y `getTasks` espera `listTasks` antes de responder. También hace que los errores rechazados sigan el flujo de errores de Express en vez de dejar la solicitud sin una respuesta controlada.

## 8. ¿Cómo llega un `AppError` asíncrono al `errorHandler` de Express 5?

Si un controlador `async` espera una operación que lanza un `AppError`, su promesa se rechaza. Express 5 detecta automáticamente ese rechazo y lo pasa al middleware de error registrado después de las rutas en `src/app.ts`. No se necesita envolver cada controlador en un `try/catch` solo para llamar a `next(error)`.

En las operaciones de tareas, el servicio también captura fallos de persistencia: conserva los `AppError` que ya describen una condición conocida y convierte los errores de validación de Mongoose o de acceso a la base de datos en errores de la API. El `errorHandler` centraliza la respuesta y adjunta el `requestId`.

## 9. ¿Qué prueba demuestra realmente que una tarea es persistente?

No basta con que `POST` devuelva `201`: eso solo demuestra que la solicitud obtuvo una respuesta satisfactoria. Una prueba más sólida crea la tarea, consulta su documento en MongoDB o la recupera después mediante `GET`, y comprueba que los campos esperados —por ejemplo `title` y `description`— coinciden.

La evidencia más clara de persistencia entre ejecuciones consiste en crear la tarea, reiniciar el proceso de la API y recuperarla de nuevo desde MongoDB. Al iniciar, el servidor establece la conexión antes de aceptar solicitudes; la tarea debe seguir ahí tras el reinicio porque no depende de la memoria del proceso. Las pruebas de Postman y las evidencias de este proyecto documentan la creación, lectura y comprobación después de reiniciar.

## 10. ¿Qué información de Mongoose o Atlas nunca debe aparecer en la respuesta HTTP?

La respuesta no debe revelar la URI de conexión, usuarios o contraseñas de MongoDB, variables de entorno, tokens, datos del clúster, ni detalles internos como trazas de pila, nombres de archivos, consultas o mensajes sin filtrar de Mongoose. Esos datos pueden facilitar el acceso o el reconocimiento de la infraestructura.

Ante un fallo inesperado, el cliente recibe un mensaje genérico como `Ocurrió un error interno` y un código estable (`INTERNAL_ERROR`); el detalle técnico se registra en el servidor asociado al `requestId`. Cuando la base no está disponible, la API comunica `DATABASE_UNAVAILABLE` sin exponer credenciales ni la URI de Atlas.
