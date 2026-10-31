# Reflexión sobre autenticación y JWT (EC3 F1 A9)

## Respuestas

### 1. ¿Por qué un hash de contraseña no debe poder descifrarse?

El hash se usa para comprobar una contraseña, no para recuperarla. Al registrarse se almacena el resultado de bcrypt; durante el login, `bcrypt.compare` verifica si la contraseña enviada corresponde a ese resultado. Como el proceso no es reversible, una filtración de la base de datos no revela directamente las contraseñas originales. Además, bcrypt incorpora una sal aleatoria y un costo de cálculo que dificultan probar contraseñas candidatas a gran escala.

### 2. ¿Qué diferencia existe entre una sal aleatoria y la clave usada para firmar HS256?

La sal de bcrypt es un valor aleatorio distinto para cada contraseña. Se almacena junto con el hash y permite que contraseñas iguales produzcan hashes diferentes; no es necesario mantenerla en secreto.

La clave de HS256, en cambio, es un secreto compartido por la API para firmar y verificar JWT. Debe mantenerse confidencial: quien la obtenga podría crear tokens que la API acepte. No es la sal de bcrypt ni debe almacenarse junto al hash de la contraseña.

### 3. ¿Por qué `passwordHash` tiene `select: false` y aun así el login puede recuperarlo?

`select: false` hace que Mongoose excluya el hash de las consultas ordinarias, reduciendo el riesgo de exponerlo accidentalmente al devolver un usuario. El login lo necesita para verificar la contraseña y lo solicita de forma explícita con `query.select("+passwordHash")` cuando llama al repositorio con `includePasswordHash: true`. La respuesta pública del usuario no incluye ese campo.

### 4. ¿Por qué `unique` no sustituye la validación HTTP del correo?

`unique: true` configura un índice único en MongoDB; no comprueba que la entrada sea un correo con formato aceptable ni normaliza el valor para el contrato HTTP. La validación de la solicitud debe rechazar correos mal formados antes de ejecutar la operación.

Además, el índice protege la integridad frente a registros duplicados incluso si dos solicitudes concurrentes pasan primero la consulta de existencia. Por eso se necesitan ambas capas: validación HTTP para entradas inválidas y el índice para garantizar unicidad en la base de datos.

### 5. ¿Qué riesgo evita rechazar el campo `role` durante el registro?

Evita la asignación masiva de privilegios y la escalada de privilegios. Si el cliente pudiera enviar `{"role":"admin"}` y ese valor se aceptara, cualquier persona podría intentar crear una cuenta administrativa. La validación rechaza campos no permitidos y el servicio asigna explícitamente el rol `"user"` al registrar.

### 6. ¿Por qué correo inexistente y contraseña incorrecta devuelven el mismo mensaje?

Una respuesta distinta permitiría averiguar qué correos tienen una cuenta y facilitar ataques dirigidos. El login devuelve el mismo estado `401` y el mismo mensaje para ambos casos: «El correo o la contraseña son incorrectos». También compara la contraseña con un hash ficticio cuando el correo no existe, para reducir diferencias de tiempo que pudieran ayudar a distinguir los casos.

### 7. ¿Qué información contiene el JWT de esta actividad y qué información se excluye?

El token incluye el rol como claim propio (`role`) y los claims registrados `sub` (id del usuario), `iss` (emisor), `aud` (audiencia), `iat` (momento de emisión) y `exp` (vencimiento). El encabezado declara `alg: "HS256"` y `typ: "JWT"`.

No incluye la contraseña ni su hash, el correo, el nombre ni el documento completo del usuario. Un JWT firmado no cifra sus claims: quien tenga el token puede leer su contenido, por lo que no se deben incluir secretos ni datos que deban permanecer confidenciales.

### 8. ¿Qué validan `issuer`, `audience`, `algorithms` y `exp`?

- `issuer` comprueba que el token fue emitido por el emisor esperado por esta API.
- `audience` comprueba que el token está destinado a esta aplicación o servicio.
- `algorithms` limita la verificación a `HS256`, el algoritmo configurado, y evita aceptar tokens firmados con un algoritmo no permitido.
- `exp` establece el instante de vencimiento. La verificación rechaza el token después de esa hora.

Estas comprobaciones se complementan con la validación de `sub` y `role` antes de usar la identidad y los permisos del token.

### 9. ¿Cómo llega un error de MongoDB desde el repositorio hasta `errorHandler` en Express 5?

El repositorio ejecuta las operaciones de Mongoose dentro de `execute`. Si una operación falla, captura el rechazo y lo convierte en un `AppError` con un código y estado HTTP adecuados, por ejemplo `DATABASE_UNAVAILABLE` o `PERSISTENCE_VALIDATION_ERROR`. El servicio y el controlador, al ser funciones `async`, propagan el error rechazando sus promesas. Express 5 reenvía automáticamente ese rechazo al flujo de errores, sin necesitar un `catch(next)` manual en cada controlador. Finalmente, `errorHandler`, montado después de las rutas, formatea la respuesta e incluye el `requestId`. Los errores inesperados que no sean `AppError` se registran en el servidor y reciben una respuesta genérica `500`.

### 10. ¿Por qué las rutas de tareas permanecen públicas en A9 y qué cambiará en A10?

A9 incorpora el registro, el inicio de sesión y la emisión/verificación de tokens; las rutas existentes de tareas siguen montadas sin un middleware de autenticación, así que todavía son públicas. Mantenerlas así conserva el comportamiento del CRUD mientras se desarrolla la autenticación por separado.

En A10 se aplicará la autenticación a las rutas de tareas: el cliente deberá enviar un JWT válido como `Bearer` en `Authorization`, y un middleware verificará el token antes de permitir el acceso. Así, las operaciones podrán asociarse a una identidad autenticada y dejarán de estar disponibles anónimamente.
