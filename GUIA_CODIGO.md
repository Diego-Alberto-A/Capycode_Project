# Guia rapida del codigo de CapyCode

Esta guia es un mapa corto para no perderte entre backend, frontend, base de datos, progreso, grupos y minijuego.

## Archivos principales

- `server.js`: backend Express. Aqui estan las rutas `/api/...`, queries SQL, login, grupos, progreso, recompensas, skins, mapa y ayuda Python.
- `src/db.js`: conexion MySQL. Todas las consultas pasan por `query()` o `transaction()`.
- `src/levels.js`: carga `data/levels.json`, limpia preguntas antes de enviarlas y valida respuestas.
- `schema.sql`: estructura de la base de datos desde cero.
- `public/app.js`: frontend principal. Maneja login, mundo 3D, HUD, dashboard profesor, progreso, minijuego, skins, tutorial y chat.
- `public/index.html`: estructura visual de pantallas y paneles.
- `public/style.css`: estilos de login, HUD, dashboard, progreso, minijuego, tienda y chat.
- `data/levels.json`: banco de preguntas por tema y dificultad.

## Flujo general

1. El usuario entra por `public/index.html`.
2. `public/app.js` revisa si hay token en `localStorage`.
3. Si inicia sesion, el frontend llama a `POST /api/login`.
4. `server.js` valida usuario/password en MySQL y devuelve `gameState`.
5. Si el role es `profesor`, se abre `teacherDashboard`.
6. Si el role es `jugador`, se abre el mundo 3D con Three.js.

## Base de datos

- `users`: alumnos y profesores.
- `grupos`: grupos creados por profesores; `join_code` es el codigo para unirse.
- `grupo_users`: relacion alumno-grupo.
- `user_stats`: monedas, XP, skin seleccionada y ultimo mapa.
- `progress`: avance principal por usuario, tema y dificultad.
- `question_progress`: avance granular por pregunta, correctas, intentos y fecha.
- `minigame_attempts`: resumen historico de intentos.
- `minigame_question_attempts`: detalle historico pregunta por pregunta.
- `skins` y `user_skins`: tienda y skins compradas.

## Donde buscar cada funcionalidad

- Login: buscar `API: login general` en `server.js` y `GUIA FRONTEND: login y registro` en `public/app.js`.
- Registro profesor: buscar `API: registrar profesor`.
- Grupos profesor: buscar `API: dashboard profesor - grupos propios`.
- Crear grupo: buscar `API: dashboard profesor - crear grupo`.
- Codigo de grupo: buscar `GUIA: codigos de grupo para alumnos`.
- Alumno unirse a grupo: buscar `API: alumno se une a grupo con codigo`.
- Inscribir alumno existente: buscar `API: dashboard profesor - inscribir alumnos existentes`.
- Crear alumno desde profesor: buscar `API: profesor crea alumno nuevo y lo inscribe`.
- Estadisticas del grupo: buscar `renderGroupStats` en `public/app.js`.
- Perfil detallado alumno: buscar `renderSelectedTeacherStudent`.
- Progreso alumno: buscar `API: panel de progreso del alumno` y `GUIA FRONTEND: panel de progreso del alumno`.
- Guardado de progreso: buscar `API: revisar una sola pregunta`.
- XP y monedas: buscar `RECOMPENSAS` en `server.js`.
- Preguntas: buscar `API: obtener preguntas del minijuego`.
- Validacion de respuestas: buscar `GUIA: validar respuesta del alumno` en `src/levels.js`.
- Tienda: buscar `API: tienda de skins`.
- Imagenes de skins: buscar `GUIA FRONTEND: imagenes PNG de skins en la tienda`.
- Mundo 3D: buscar `GUIA FRONTEND: Three.js y mundo 3D`.
- Portales: buscar `GUIA FRONTEND: navegacion por portales`.
- Tutorial: buscar `GUIA FRONTEND: tutorial del menu lateral`.

## Como se guarda el progreso

Cuando el alumno responde una pregunta y presiona `Revisar`, el frontend llama a:

```text
POST /api/minigame/check
```

En `server.js`, esa ruta:

- valida la respuesta con `isCorrect()` de `src/levels.js`;
- guarda/actualiza `question_progress`;
- sube `progress.current_index` si corresponde;
- guarda intento historico;
- da monedas y XP si era una pregunta nueva superada.

## Como funciona el dashboard profesor

El dashboard llama a:

- `GET /api/teacher/groups`: grupos del profesor actual.
- `POST /api/teacher/groups`: crea grupo y codigo.
- `GET /api/teacher/groups/:groupId/students`: alumnos, progreso y estadisticas del grupo.
- `GET /api/teacher/students`: alumnos existentes en la plataforma.
- `POST /api/teacher/groups/:groupId/students`: inscribe alumnos existentes.
- `POST /api/teacher/students`: crea alumno nuevo y lo inscribe.

En el frontend, la parte visual esta en:

- `openTeacherDashboard()`
- `loadTeacherGroups()`
- `loadTeacherStudents()`
- `renderGroupStats()`
- `renderTeacherStudents()`
- `renderSelectedTeacherStudent()`

## Como agregar preguntas

Edita `data/levels.json`.

Cada pregunta debe estar dentro de:

```text
temas -> nombre_del_tema -> facil/medio/dificil
```

La validacion depende del campo `tipo`. Los tipos actuales se validan en `src/levels.js`:

- `opcion_multiple`
- `seleccionar_lineas`
- `ordenar_lineas`
- `drag_and_drop`
- `respuesta_numerica`

## Como agregar skins

1. Agrega la skin en la tabla `skins` o en la semilla de `schema.sql`.
2. Coloca el modelo OBJ/MTL en `public/assets/objects/characters`.
3. Coloca el PNG en `public/assets/skins`.
4. Registra el PNG en `skinPreviewFiles` dentro de `public/app.js`.

## Palabras clave utiles para buscar

- `GUIA:`
- `GUIA SQL:`
- `GUIA FRONTEND:`
- `API:`
- `SQL:`
- `RECOMPENSAS`
- `DASHBOARD PROFESOR`
- `MINIJUEGO`
- `Three.js`
