# Reflexión sobre el CRUD con MongoDB

En este proyecto, las rutas de tareas delegan en `task.service.ts`, que usa `TaskModel` como acceso a la colección persistente. Las respuestas HTTP exponen `id` en lugar del `_id` interno de MongoDB.

## 1. ¿Qué operación de Mongoose corresponde a cada letra de CRUD?

- **Create (crear):** `TaskModel.create(...)`. Por ejemplo, `POST /api/tasks` crea una tarea con el título recibido y estado inicial `pending`.
- **Read (leer):** `TaskModel.find()` lista las tareas y `TaskModel.findById(id)` busca una tarea. Corresponden a `GET /api/tasks` y `GET /api/tasks/:id`.
- **Update (actualizar):** `TaskModel.findByIdAndUpdate(...)`. `PATCH /api/tasks/:id` actualiza los campos enviados.
- **Delete (eliminar):** `TaskModel.findByIdAndDelete(id)`. `DELETE /api/tasks/:id` elimina la tarea identificada.

Estas operaciones viven en el servicio, no directamente en las rutas; así las rutas HTTP comparten una misma fuente de datos: MongoDB.

## 2. ¿Por qué se usa `PATCH` y no un reemplazo completo del documento?

`PATCH` comunica que se modifica solo una parte del recurso. En esta API se puede enviar, por ejemplo, `{"status":"completed"}` para cambiar el estado sin volver a mandar el título. Los otros campos existentes —como el título y las fechas— se conservan.

Un reemplazo completo exigiría que el cliente conociera y enviara todos los campos del documento. Si omitiera accidentalmente uno, podría perderse información o sería necesario rechazar la solicitud. Para el cambio parcial que admite esta ruta, `PATCH` expresa mejor la intención.

## 3. ¿Qué problema evita `$set`?

`$set` indica a MongoDB que asigne únicamente los campos incluidos en el objeto de cambios, en vez de tratar la actualización como una sustitución del documento. En `updateTask`, Mongoose recibe `{ $set: changes }`; por eso actualizar el `status` no borra el `title` ni otros datos existentes.

Por ejemplo, al enviar `{"status":"completed"}`, `$set` cambia `status` y deja el resto del documento intacto.

## 4. ¿Qué efecto tienen `new: true` y `runValidators: true`?

En las opciones de `findByIdAndUpdate`:

- `new: true` hace que Mongoose devuelva el documento **después** de aplicar el cambio. El controlador puede responder con el estado actualizado, por ejemplo `status: "completed"`.
- `runValidators: true` ejecuta las reglas del esquema para los valores actualizados. En el modelo de tareas, por ejemplo, `status` debe pertenecer a `pending` o `completed`, y `title` no puede superar 120 caracteres.

Sin la primera opción, la respuesta podría contener los valores anteriores; sin la segunda, una actualización no aplicaría las validaciones del esquema del mismo modo que una creación.

## 5. ¿Por qué un cuerpo vacío debe rechazarse?

Un `PATCH` vacío no solicita ningún cambio. Aceptarlo como actualización exitosa podría confundir al cliente haciéndole pensar que modificó la tarea cuando no envió dato alguno. Por eso `validateTaskUpdate` exige al menos `title` o `status` y responde `422 VALIDATION_ERROR` si el objeto no contiene campos.

Por ejemplo, `PATCH /api/tasks/:id` con `{}` se rechaza; `{"status":"completed"}` sí contiene un cambio solicitado.

## 6. ¿Qué diferencia existe entre `INVALID_ID` y `TASK_NOT_FOUND`?

`INVALID_ID` (`400`) indica que el parámetro de ruta no tiene un formato válido de MongoDB `ObjectId`. El middleware `validateTaskId` detecta el problema antes de ejecutar la operación de base de datos. Por ejemplo, `/api/tasks/no-es-un-id`.

`TASK_NOT_FOUND` (`404`) significa que el identificador sí tiene formato válido, pero no existe una tarea con ese valor. El servicio informa este caso cuando `findById`, `findByIdAndUpdate` o `findByIdAndDelete` no encuentran un documento.

En resumen: el primero es un identificador mal formado; el segundo, una búsqueda válida sin resultado.

## 7. ¿Qué responsabilidad cumple `validateTaskUpdate` y cuál cumple `TaskModel`?

`validateTaskUpdate` valida la solicitud HTTP antes de llegar al servicio. Comprueba que el cuerpo sea un objeto, rechaza propiedades no admitidas, exige al menos un campo y valida/normaliza `title` y `status`. Los campos permitidos son `title` y `status`; el middleware deja el resultado validado en `res.locals.taskUpdate`.

`TaskModel`, definido con el esquema de Mongoose, protege la forma de los datos que se guardan: establece que `title` es obligatorio y tiene un máximo de 120 caracteres, y restringe `status` a `pending` o `completed`. La validación del middleware ofrece errores claros para las entradas de la API; la del modelo mantiene las reglas en la capa de persistencia. `runValidators: true` hace que esas reglas del esquema se apliquen también a la actualización.

## 8. ¿Cómo llega un error de `updateTask` al `errorHandler` de Express 5?

`patchTask` es un controlador `async` y espera `updateTask`. Si el servicio detecta que no existe la tarea o transforma un error de persistencia en un `AppError`, la promesa del controlador termina rechazada. Express 5 propaga automáticamente los rechazos de controladores asíncronos al middleware de errores; no hace falta capturarlos en cada controlador para llamar manualmente a `next`.

En `app.ts`, `errorHandler` está registrado después de las rutas. Reconoce el `AppError`, responde con su estado, código y mensaje, y añade el `requestId`. Por ejemplo, un `TASK_NOT_FOUND` conserva el estado `404` y el código correspondiente, en lugar de convertirse en un error interno genérico.

## 9. ¿Por qué `DELETE` responde `204` sin cuerpo?

`204 No Content` indica que la solicitud se procesó correctamente y que no hay un cuerpo de respuesta que enviar. Después de que `deleteTask` confirma que encontró y eliminó el documento, `removeTask` responde con `res.status(204).send()`. Si el identificador es válido pero no existe la tarea, el servicio devuelve `404` en lugar de responder `204`.

## 10. ¿Qué prueba demuestra que el CRUD es persistente y no solo funcional en memoria?

La comprobación más convincente es crear una tarea, reiniciar el proceso de la API y luego recuperar esa misma tarea desde MongoDB —por ejemplo, con `GET /api/tasks/:id`— y comparar su identificador y campos. Si sobrevive al reinicio y la API la vuelve a leer desde la base de datos, el resultado no depende de una lista que solo vive en la memoria del proceso.

La evidencia del proyecto registra el documento antes y después de actualizarlo en Atlas, además de la consulta después de reiniciar. Está descrita en [pruebas-crud-mongodb.md](./pruebas-crud-mongodb.md); [pruebas-persistencia-mongodb.md](./pruebas-persistencia-mongodb.md) también documenta la verificación tras reiniciar. Un `201` aislado en la respuesta del `POST` no basta para probar persistencia: solo confirma que la solicitud recibió una respuesta de creación.
