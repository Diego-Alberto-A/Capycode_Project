# CapyCode

Proyecto web en JavaScript/HTML con Three.js, Node.js y MySQL.

## Guia del codigo

Si quieres ubicar rapido donde vive cada funcionalidad, revisa `GUIA_CODIGO.md`.
Tambien puedes buscar dentro del codigo palabras clave como `GUIA:`, `GUIA SQL:`,
`GUIA FRONTEND:`, `API:`, `SQL:` o `RECOMPENSAS`.

## Instalar

```bash
npm install
mysql -u root -p < schema.sql
cp .env.example .env
npm start
```

En Windows puedes copiar `.env.example` como `.env` manualmente o usar:

```bat
copy .env.example .env
```

Abrir:

```text
http://localhost:3000
```

## Qué incluye esta versión

- Login y registro.
- Mundo 3D con Three.js usando los OBJ/MTL/texturas de `public/assets/objects`.
- Mapa principal con portales hacia mapas por tema.
- Mapas por tema usando `scene1.obj` a `scene8.obj`.
- Portales de dificultad usando `facil.obj`, `medio.obj` y `dificil.obj`.
- Preguntas leídas desde `data/levels.json`, no hardcodeadas en JS.
- Cinco tipos de minijuego: opción múltiple, ordenar líneas, drag/drop por select, seleccionar líneas y respuesta numérica.
- Progreso por tema/dificultad y progreso granular por pregunta del JSON.
- Historial de intentos por pregunta en base de datos.
- Monedas, XP, compra y selección de 11 skins de capibara usando los modelos de `characters`.
- Persistencia del último mapa visitado.

## Rutas principales

```text
POST /api/register
POST /api/login
GET /api/game/state
GET /api/questions?tema=algoritmos&dificultad=facil&limit=5
POST /api/minigame/submit
POST /api/skins/buy
POST /api/skins/select
POST /api/map/last
```

## Notas de base de datos

`schema.sql` ya contiene las tablas nuevas:

- `question_progress`: guarda el estado acumulado de cada pregunta del JSON por usuario, tema y dificultad.
- `minigame_question_attempts`: guarda el historial por intento y por pregunta.
- `minigame_attempts.start_index` y `minigame_attempts.end_index`: guardan qué bloque del JSON se jugó.
- `skins.model_code`: conecta cada skin con su OBJ en `public/assets/objects/characters`.
- `user_stats.last_map_code` y `user_stats.last_theme_slug`: recuerdan el último mapa.

El servidor también intenta crear/agregar estas columnas/tablas al arrancar para no romper una base ya existente, pero lo más limpio para probar desde cero es correr de nuevo `schema.sql`.

## Cambios recientes

### Alineación de mapas con el suelo
- `addMapModel` ahora aplica un ajuste vertical configurable por mapa
  (`MAP_GROUND_OFFSET_RATIO` en `public/app.js`). El mapa principal (`main_map`)
  venía levantado ~25 %; ahora se baja esa fracción para quedar pegado al piso.
  Si algún otro escenario necesita ajuste, basta con añadir su código y ratio.

### Validación por pregunta y progreso ligado a la base de datos
- Nuevo endpoint `POST /api/minigame/check` que valida **una** pregunta al pulsar
  **Continuar**. Solo se avanza al siguiente nivel si la respuesta es correcta.
- Funciona para respuestas estáticas (opción múltiple, seleccionar líneas,
  respuesta numérica) y para respuestas de orden variable (ordenar líneas,
  drag & drop), reutilizando `isCorrect` de `src/levels.js`.
- El progreso por nivel (`progress.current_index`) **solo sube, nunca baja**
  (se actualiza con `GREATEST`). Regresar a preguntas anteriores es conceptual:
  no reduce el progreso guardado en MySQL.
- Cada intento se guarda en `question_progress` y `minigame_question_attempts`;
  `correct` también es monótono (`GREATEST`).
- Las recompensas (monedas/XP) se otorgan solo la primera vez que se supera
  cada pregunta nueva.

### Campo `post` en las preguntas
- Todas las preguntas de `data/levels.json` incluyen ahora un campo `post` con
  una breve explicación que se muestra al acertar.

### Audio ambiental por escena
- Nueva carpeta `public/audio/` (servida en `/audio`).
- Se reproduce automáticamente al entrar a cada escena, en bucle.
- Nombres: `main` (hub) y `audio1`–`audio8` (escenarios 1–8). Formatos probados
  en orden: opus, ogg, mp3, wav, m4a, aac.
- El escenario 9 está reservado: muestra el aviso "Sera anadido pronto" hasta
  que agregues `audio9`.
- Coloca los archivos según `public/audio/README.txt`.

## Rutas nuevas

```text
POST /api/minigame/check   (valida y guarda una sola pregunta)
GET  /audio/<archivo>       (audio ambiental estático)
```
