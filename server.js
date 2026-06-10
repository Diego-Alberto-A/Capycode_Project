require('dotenv').config();

const path = require('path');
const https = require('https');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, transaction } = require('./src/db');
const {
  difficultyMeta,
  title,
  themeSlugs,
  getQuestions,
  parseQuestionId,
  cleanQuestion,
  isCorrect,
  correctAnswer
} = require('./src/levels');

const app = express();
const port = Number(process.env.PORT || 3000);
const secret = process.env.JWT_SECRET || 'dev_secret';
const BLOCK_SIZE = 5;

function configuredOpenAIKey() {
  return process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY || process.env.OPENAI_KEY || '';
}

// GUIA: configuracion Express y archivos estaticos.
// Aqui se publica el frontend, Three.js, modelos 3D, texturas y audio ambiental.
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three', 'build')));
app.use('/vendor/three/examples', express.static(path.join(__dirname, 'node_modules', 'three', 'examples', 'jsm')));
app.use('/assets/objects', express.static(path.join(__dirname, 'public', 'assets', 'objects')));
app.use('/audio', express.static(path.join(__dirname, 'public', 'audio')));

// GUIA: autenticacion JWT.
// tokenFor crea la sesion; auth la valida en cada ruta protegida.
function tokenFor(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, secret, { expiresIn: '7d' });
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    req.user = jwt.verify(token, secret);
    next();
  } catch {
    res.status(401).json({ error: 'Sesión inválida' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ error: 'Acceso exclusivo para profesor' });
    }
    next();
  };
}

function toPositiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

// GUIA: codigos de grupo para alumnos.
// SQL: grupos.join_code. El profesor comparte este codigo y el alumno se une desde el menu lateral.
function generateJoinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function uniqueJoinCode() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const joinCode = generateJoinCode();
    const rows = await query('SELECT id FROM grupos WHERE join_code = :joinCode', { joinCode });
    if (!rows.length) return joinCode;
  }
  throw new Error('No se pudo generar codigo de grupo');
}

// GUIA: seguridad de grupos del profesor.
// Esta funcion evita que un profesor modifique o vea grupos que pertenecen a otra cuenta.
async function requireTeacherGroup(groupId, teacherId) {
  const rows = await query(
    `SELECT id, numero, name, description, join_code, max_students
     FROM grupos
     WHERE id = :groupId AND profesor_id = :teacherId`,
    { groupId, teacherId }
  );
  return rows[0] || null;
}

// GUIA: listado del dashboard profesor.
// SQL: carga solo los grupos creados por el profesor actual y cuenta sus alumnos inscritos.
async function teacherGroupsFor(teacherId) {
  const groups = await query(
    `SELECT g.id, g.numero, g.name, g.description, g.join_code, g.max_students,
            COUNT(DISTINCT gu.user_id) AS student_count
     FROM grupos g
     LEFT JOIN grupo_users gu ON gu.grupo_id = g.id
     WHERE g.profesor_id = :teacherId
     GROUP BY g.id, g.numero, g.name, g.description, g.join_code, g.max_students
     ORDER BY g.numero, g.name`,
    { teacherId }
  );

  return groups.map(group => ({
    id: group.id,
    numero: group.numero,
    name: group.name,
    description: group.description || '',
    joinCode: group.join_code,
    maxStudents: group.max_students,
    studentCount: Number(group.student_count || 0)
  }));
}

// GUIA: niveles/bloques de preguntas.
// Divide cada tema/dificultad en bloques de 5 para que el alumno avance por niveles.
function buildQuestionBlocks(total, currentIndex, questions = []) {
  const totalBlocks = Math.max(1, Math.ceil(total / BLOCK_SIZE));
  const unlockedBlock = total
    ? Math.min(totalBlocks, Math.floor(Math.min(currentIndex, total) / BLOCK_SIZE) + 1)
    : 1;

  return Array.from({ length: totalBlocks }, (_, blockIndex) => {
    const startIndex = blockIndex * BLOCK_SIZE;
    const endIndex = Math.min(startIndex + BLOCK_SIZE, total);
    const blockQuestions = questions.filter(question => question.index >= startIndex && question.index < endIndex);
    const correct = blockQuestions.filter(question => question.correct).length;
    const answered = blockQuestions.filter(question => question.answered).length;

    return {
      number: blockIndex + 1,
      name: `Nivel ${blockIndex + 1}`,
      startIndex,
      endIndex,
      startQuestion: startIndex + 1,
      endQuestion: endIndex,
      total: Math.max(0, endIndex - startIndex),
      answered,
      correct,
      locked: blockIndex + 1 > unlockedBlock,
      current: currentIndex >= startIndex && currentIndex < endIndex,
      completed: currentIndex >= endIndex && endIndex > startIndex
    };
  });
}

// GUIA: resumen de progreso por tema, dificultad y nivel.
// SQL entrada: filas de progress/question_progress. Salida: estructura que usa el panel de progreso y dashboard.
function buildProgressByLevel(progressRows = []) {
  const progressMap = new Map();
  for (const row of progressRows) {
    const key = `${row.tema}:${row.dificultad}`;
    if (!progressMap.has(key)) {
      progressMap.set(key, {
        current_index: Number(row.current_index || 0),
        answered_count: Number(row.answered_count || 0),
        correct_count: Number(row.correct_count || 0),
        questions: []
      });
    }

    const bucket = progressMap.get(key);
    bucket.current_index = Math.max(bucket.current_index, Number(row.current_index || 0));
    if (row.question_key || row.question_index !== null && row.question_index !== undefined) {
      bucket.questions.push({
        index: Number(row.question_index),
        answered: Boolean(row.answered),
        correct: Boolean(row.correct)
      });
    }
  }

  return themeSlugs().map(slug => {
    const difficulties = Object.entries(difficultyMeta).map(([difficultySlug, meta]) => {
      const total = getQuestions(slug, difficultySlug).length;
      const progress = progressMap.get(`${slug}:${difficultySlug}`) || {};
      const currentIndex = Math.min(Number(progress.current_index || 0), total);
      const questionItems = Array.isArray(progress.questions) ? progress.questions : [];
      const answered = questionItems.length
        ? questionItems.filter(question => question.answered).length
        : Number(progress.answered_count || 0);
      const correct = questionItems.length
        ? questionItems.filter(question => question.correct).length
        : Number(progress.correct_count || 0);
      const levels = buildQuestionBlocks(total, currentIndex, questionItems);

      return {
        slug: difficultySlug,
        name: meta.name,
        total,
        currentIndex,
        answered,
        correct,
        remaining: Math.max(0, total - currentIndex),
        percent: total ? Math.round((currentIndex / total) * 100) : 100,
        completed: currentIndex >= total,
        blockSize: BLOCK_SIZE,
        totalLevels: levels.length,
        currentLevel: levels.find(level => level.current)?.number || levels.length,
        levels
      };
    });

    return {
      slug,
      name: title(slug),
      difficulties
    };
  });
}

function questionPreview(question) {
  if (question?.prompt) return String(question.prompt);
  if (Array.isArray(question?.code) && question.code.length) return question.code[0];
  return 'Pregunta sin enunciado';
}

// GUIA: progreso visible del alumno.
// SQL: lee progress y question_progress para mostrar correctas, incorrectas, intentos y niveles.
async function progressDetail(userId) {
  await ensurePlayerRows(userId);

  const rows = await query(
    `SELECT t.slug AS tema, d.slug AS dificultad, p.current_index,
            qp.question_key, qp.question_index, qp.question_type,
            qp.answered, qp.correct, qp.last_correct, qp.attempts_count,
            qp.last_answered_at
     FROM progress p
     JOIN temas t ON t.id = p.tema_id
     JOIN dificultades d ON d.id = p.dificultad_id
     LEFT JOIN question_progress qp
       ON qp.user_id = p.user_id
      AND qp.tema_id = p.tema_id
      AND qp.dificultad_id = p.dificultad_id
     WHERE p.user_id = :userId
     ORDER BY t.slug, d.id, qp.question_index`,
    { userId }
  );

  const byLevel = new Map();
  for (const row of rows) {
    const key = `${row.tema}:${row.dificultad}`;
    if (!byLevel.has(key)) {
      byLevel.set(key, {
        currentIndex: Number(row.current_index || 0),
        questions: new Map()
      });
    }

    if (row.question_key) {
      byLevel.get(key).questions.set(Number(row.question_index), row);
    }
  }

  return {
    themes: themeSlugs().map(slug => ({
      slug,
      name: title(slug),
      difficulties: Object.entries(difficultyMeta).map(([difficultySlug, meta]) => {
        const questions = getQuestions(slug, difficultySlug);
        const level = byLevel.get(`${slug}:${difficultySlug}`) || { currentIndex: 0, questions: new Map() };
        const currentIndex = Math.min(level.currentIndex, questions.length);
        let answered = 0;
        let correct = 0;

        const questionItems = questions.map((question, index) => {
          const saved = level.questions.get(index);
          const isAnswered = Boolean(saved?.answered);
          const isCorrectAnswer = Boolean(saved?.correct);

          if (isAnswered) answered += 1;
          if (isCorrectAnswer) correct += 1;

          return {
            id: `${slug}:${difficultySlug}:${index}`,
            index,
            number: index + 1,
            prompt: questionPreview(question),
            type: question.tipo || 'unknown',
            status: isCorrectAnswer ? 'correct' : isAnswered ? 'incorrect' : 'pending',
            answered: isAnswered,
            correct: isCorrectAnswer,
            lastCorrect: Boolean(saved?.last_correct),
            attempts: Number(saved?.attempts_count || 0),
            lastAnsweredAt: saved?.last_answered_at || null,
            current: index === currentIndex && currentIndex < questions.length
          };
        });
        const levels = buildQuestionBlocks(questions.length, currentIndex, questionItems);

        return {
          slug: difficultySlug,
          name: meta.name,
          total: questions.length,
          currentIndex,
          answered,
          correct,
          pending: Math.max(0, questions.length - answered),
          remaining: Math.max(0, questions.length - currentIndex),
          percent: questions.length ? Math.round((currentIndex / questions.length) * 100) : 100,
          completed: currentIndex >= questions.length,
          blockSize: BLOCK_SIZE,
          totalLevels: levels.length,
          currentLevel: levels.find(level => level.current)?.number || levels.length,
          levels,
          questions: questionItems
        };
      })
    }))
  };
}

function difficultyId(slug) {
  return difficultyMeta[slug]?.id || null;
}

// GUIA: migracion automatica de base de datos.
// SQL: crea tablas/columnas/indices faltantes al iniciar para no romper bases viejas.
async function ensureRuntimeSchema() {
  await query(`CREATE TABLE IF NOT EXISTS question_progress (
    user_id INT NOT NULL,
    tema_id INT NOT NULL,
    dificultad_id INT NOT NULL,
    question_key VARCHAR(180) NOT NULL,
    question_index INT NOT NULL,
    question_type VARCHAR(40) NOT NULL,
    answered BOOLEAN NOT NULL DEFAULT TRUE,
    correct BOOLEAN NOT NULL DEFAULT FALSE,
    last_correct BOOLEAN NOT NULL DEFAULT FALSE,
    attempts_count INT NOT NULL DEFAULT 0,
    last_answer_json JSON NULL,
    correct_answer_json JSON NULL,
    first_answered_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    last_answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, tema_id, dificultad_id, question_key),
    INDEX idx_question_progress_user (user_id),
    INDEX idx_question_progress_topic (tema_id, dificultad_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (tema_id) REFERENCES temas(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (dificultad_id) REFERENCES dificultades(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`);

  await query(`CREATE TABLE IF NOT EXISTS minigame_question_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    attempt_id INT NOT NULL,
    user_id INT NOT NULL,
    tema_id INT NOT NULL,
    dificultad_id INT NOT NULL,
    question_key VARCHAR(180) NOT NULL,
    question_index INT NOT NULL,
    question_type VARCHAR(40) NOT NULL,
    submitted_answer_json JSON NULL,
    correct_answer_json JSON NULL,
    correct BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_attempt_questions_attempt (attempt_id),
    INDEX idx_attempt_questions_user (user_id),
    FOREIGN KEY (attempt_id) REFERENCES minigame_attempts(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (tema_id) REFERENCES temas(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (dificultad_id) REFERENCES dificultades(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`);

  await addColumnIfMissing('skins', 'model_code', "VARCHAR(80) NOT NULL DEFAULT 'capythilda'");
  await addColumnIfMissing('skins', 'preview_image', 'VARCHAR(160) NULL');
  await addColumnIfMissing('minigame_attempts', 'start_index', 'INT NOT NULL DEFAULT 0');
  await addColumnIfMissing('minigame_attempts', 'end_index', 'INT NOT NULL DEFAULT 0');
  await addColumnIfMissing('user_stats', 'last_map_code', "VARCHAR(80) NOT NULL DEFAULT 'hub'");
  await addColumnIfMissing('user_stats', 'last_theme_slug', 'VARCHAR(120) NULL');
  await addColumnIfMissing('users', 'grupo_id', 'INT NULL');
  await addColumnIfMissing('grupos', 'numero', 'INT NULL');
  await addColumnIfMissing('grupos', 'description', 'VARCHAR(255) NULL');
  await addColumnIfMissing('grupos', 'join_code', 'VARCHAR(12) NULL');
  await addColumnIfMissing('grupos', 'max_students', 'INT NULL');

  await query('UPDATE grupos SET numero = id WHERE numero IS NULL');
  await query(`UPDATE users u
               JOIN grupo_users gu ON gu.user_id = u.id
               SET u.grupo_id = gu.grupo_id
               WHERE u.grupo_id IS NULL`);

  const groupsWithoutCode = await query('SELECT id FROM grupos WHERE join_code IS NULL OR join_code = ""');
  for (const group of groupsWithoutCode) {
    await query('UPDATE grupos SET join_code = :joinCode WHERE id = :id', {
      id: group.id,
      joinCode: await uniqueJoinCode()
    });
  }

  await dropIndexIfExists('grupos', 'uq_grupos_numero');
  await dropIndexIfExists('grupos', 'numero');
  await dropIndexIfExists('grupos', 'join_code');
  await addIndexIfMissing('grupos', 'uq_grupos_profesor_numero', 'CREATE UNIQUE INDEX uq_grupos_profesor_numero ON grupos(profesor_id, numero)');
  await addIndexIfMissing('grupos', 'uq_grupos_join_code', 'CREATE UNIQUE INDEX uq_grupos_join_code ON grupos(join_code)');
}

async function addColumnIfMissing(tableName, columnName, definition) {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName AND COLUMN_NAME = :columnName`,
    { tableName, columnName }
  );

  if (rows[0].total === 0) {
    await query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

// GUIA: helpers de migracion SQL.
// addIndexIfMissing/dropIndexIfExists mantienen indices sin duplicarlos.
async function addIndexIfMissing(tableName, indexName, createSql) {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName AND INDEX_NAME = :indexName`,
    { tableName, indexName }
  );

  if (rows[0].total === 0) {
    await query(createSql);
  }
}

async function dropIndexIfExists(tableName, indexName) {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName AND INDEX_NAME = :indexName`,
    { tableName, indexName }
  );

  if (rows[0].total > 0) {
    await query(`ALTER TABLE ${tableName} DROP INDEX ${indexName}`);
  }
}

// GUIA: semillas iniciales.
// SQL: llena temas, dificultades y skins base cuando arranca el servidor.
async function initDb() {
  await ensureRuntimeSchema();

  const temas = themeSlugs();

  for (const slug of temas) {
    await query(
      'INSERT IGNORE INTO temas (slug, name) VALUES (:slug, :name)',
      { slug, name: title(slug) }
    );
  }

  for (const [slug, meta] of Object.entries(difficultyMeta)) {
    await query(
      'INSERT IGNORE INTO dificultades (id, slug, name, xp_otorgado) VALUES (:id, :slug, :name, :xp)',
      { id: meta.id, slug, name: meta.name, xp: meta.xp }
    );
  }

  const skins = [
    [1, 'capythilda', 'Capy Thilda', 0, '#b98252', '#f0c08a', 'capythilda'],
    [2, 'capyaqua', 'Capy Aqua', 80, '#2f80ed', '#9bd5ff', 'capyaqua'],
    [3, 'capyblack', 'Capy Black', 100, '#111827', '#6b7280', 'capyblack'],
    [4, 'capycandy', 'Capy Candy', 120, '#ff6fb1', '#ffd1e6', 'capycandy'],
    [5, 'capyconstellations', 'Capy Constellations', 150, '#312e81', '#a5b4fc', 'capyconstellations'],
    [6, 'capyearth', 'Capy Earth', 170, '#27ae60', '#a8f0c0', 'capyearth'],
    [7, 'capyexplorer', 'Capy Explorer', 200, '#a16207', '#fde68a', 'capyexplorer'],
    [8, 'capyking', 'Capy King', 250, '#f2c94c', '#fff2a8', 'capyking'],
    [9, 'capymage', 'Capy Mage', 280, '#7b61ff', '#dacfff', 'capymage'],
    [10, 'capyruna', 'Capy Runa', 330, '#6d28d9', '#22d3ee', 'capyruna'],
    [11, 'capysun', 'Capy Sun', 400, '#f97316', '#fed7aa', 'capysun']
  ];

  for (const skin of skins) {
    await query(
      `INSERT INTO skins (id, code, name, price, color_a, color_b, model_code)
       VALUES (:id, :code, :name, :price, :a, :b, :modelCode)
       ON DUPLICATE KEY UPDATE
         code = VALUES(code),
         name = VALUES(name),
         price = VALUES(price),
         color_a = VALUES(color_a),
         color_b = VALUES(color_b),
         model_code = VALUES(model_code)`,
      { id: skin[0], code: skin[1], name: skin[2], price: skin[3], a: skin[4], b: skin[5], modelCode: skin[6] }
    );
  }

  for (const slug of temas) {
    const temaRows = await query('SELECT id FROM temas WHERE slug = :slug', { slug });
    const temaId = temaRows[0].id;

    for (const [difficultySlug, meta] of Object.entries(difficultyMeta)) {
      const existing = await query(
        'SELECT id FROM niveles WHERE tema_id = :temaId AND dificultad_id = :difficultyId AND numero_nivel = 1',
        { temaId, difficultyId: meta.id }
      );

      if (existing.length === 0) {
        const result = await query(
          'INSERT INTO niveles (tema_id, dificultad_id, numero_nivel) VALUES (:temaId, :difficultyId, 1)',
          { temaId, difficultyId: meta.id }
        );

        await query(
          'INSERT INTO logros (nivel_id, name, description) VALUES (:nivelId, :name, :description)',
          {
            nivelId: result.insertId,
            name: `${title(slug)} ${meta.name}`,
            description: `Completaste ${title(slug)} en dificultad ${meta.name}.`
          }
        );
      }
    }
  }
}

// GUIA: filas base del jugador.
// SQL: garantiza user_stats, progreso por tema/dificultad y skins desbloqueadas basicas.
async function ensurePlayerRows(userId) {
  await query(
    'INSERT IGNORE INTO user_stats (user_id, coins, xp, selected_skin_id) VALUES (:userId, 150, 0, 1)',
    { userId }
  );

  await query(
    'INSERT IGNORE INTO user_skins (user_id, skin_id) VALUES (:userId, 1)',
    { userId }
  );

  const temas = await query('SELECT id, slug FROM temas');
  const dificultades = await query('SELECT id, slug FROM dificultades');

  for (const tema of temas) {
    for (const dificultad of dificultades) {
      await query(
        'INSERT IGNORE INTO progress (user_id, tema_id, dificultad_id, current_index) VALUES (:userId, :temaId, :dificultadId, 0)',
        { userId, temaId: tema.id, dificultadId: dificultad.id }
      );
    }
  }
}

// GUIA: estado completo del juego.
// API lo usa despues de login y al refrescar: usuario, XP, monedas, skins, mapas y mundos.
async function gameState(userId) {
  await ensurePlayerRows(userId);

  const users = await query('SELECT id, username, role, grupo_id FROM users WHERE id = :userId', { userId });
  const statsRows = await query(
    `SELECT us.coins, us.xp, us.last_map_code, us.last_theme_slug, s.id AS selected_skin_id, s.code AS selected_skin_code, s.name AS selected_skin_name,
            s.color_a AS selected_color_a, s.color_b AS selected_color_b, s.model_code AS selected_model_code
     FROM user_stats us
     JOIN skins s ON s.id = us.selected_skin_id
     WHERE us.user_id = :userId`,
    { userId }
  );

  const skinRows = await query(
    `SELECT s.id, s.code, s.name, s.price, s.color_a, s.color_b, s.model_code, s.preview_image,
            CASE WHEN us.skin_id IS NULL THEN 0 ELSE 1 END AS unlocked,
            CASE WHEN st.selected_skin_id = s.id THEN 1 ELSE 0 END AS selected
     FROM skins s
     LEFT JOIN user_skins us ON us.skin_id = s.id AND us.user_id = :userId
     JOIN user_stats st ON st.user_id = :userId
     ORDER BY s.id`,
    { userId }
  );

  const progressRows = await query(
    `SELECT t.slug AS tema, d.slug AS dificultad, p.current_index,
            COALESCE(SUM(CASE WHEN qp.answered THEN 1 ELSE 0 END), 0) AS answered_count,
            COALESCE(SUM(CASE WHEN qp.correct THEN 1 ELSE 0 END), 0) AS correct_count
     FROM progress p
     JOIN temas t ON t.id = p.tema_id
     JOIN dificultades d ON d.id = p.dificultad_id
     LEFT JOIN question_progress qp
       ON qp.user_id = p.user_id
      AND qp.tema_id = p.tema_id
      AND qp.dificultad_id = p.dificultad_id
     WHERE p.user_id = :userId
     GROUP BY t.slug, d.slug, p.current_index`,
    { userId }
  );

  const temas = buildProgressByLevel(progressRows);

  const achievements = await query(
    `SELECT l.name, l.description, ul.obtained_at
     FROM user_logros ul
     JOIN logros l ON l.id = ul.logro_id
     WHERE ul.user_id = :userId
     ORDER BY ul.obtained_at DESC`,
    { userId }
  );

  return {
    user: users[0],
    stats: statsRows[0],
    skins: skinRows.map(row => ({
      id: row.id,
      code: row.code,
      name: row.name,
      price: row.price,
      colorA: row.color_a,
      colorB: row.color_b,
      modelCode: row.model_code,
      previewImage: row.preview_image,
      unlocked: Boolean(row.unlocked),
      selected: Boolean(row.selected)
    })),
    map: { temas },
    achievements,
    ai: {
      pythonHelpAvailable: Boolean(configuredOpenAIKey())
    }
  };
}

// GUIA: logros.
// SQL: asigna logros cuando se completa una combinacion tema/dificultad.
async function grantAchievement(connection, userId, temaId, dificultadId) {
  const [rows] = await connection.execute(
    `SELECT l.id
     FROM logros l
     JOIN niveles n ON n.id = l.nivel_id
     WHERE n.tema_id = ? AND n.dificultad_id = ?
     LIMIT 1`,
    [temaId, dificultadId]
  );

  if (rows.length) {
    await connection.execute(
      'INSERT IGNORE INTO user_logros (user_id, logro_id) VALUES (?, ?)',
      [userId, rows[0].id]
    );
  }
}

// API: registro publico de alumnos bloqueado.
// Los alumnos se crean desde profesor o se unen a grupos con codigo.
app.post('/api/register', (req, res) => {
  res.status(403).json({ error: 'El registro de alumnos se hace desde el panel del profesor' });
});

// API: registrar profesor.
// SQL: crea usuario profesor y devuelve token para entrar al dashboard.
app.post('/api/teachers/register', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (username.length < 3) return res.status(400).json({ error: 'Usuario demasiado corto' });
    if (password.length < 4) return res.status(400).json({ error: 'Contraseña demasiado corta' });

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (username, password_hash, role, active)
       VALUES (:username, :passwordHash, 'profesor', TRUE)`,
      { username, passwordHash }
    );

    await ensurePlayerRows(result.insertId);
    const user = { id: result.insertId, username, role: 'profesor' };
    res.json({ ok: true, userId: result.insertId, username, token: tokenFor(user), state: await gameState(user.id) });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese usuario ya existe' });
    console.error('Error al registrar profesor:', error);
    res.status(500).json({ error: 'Error al registrar profesor' });
  }
});

// API: login general.
// Decide por role si el frontend abre juego de alumno o dashboard profesor.
app.post('/api/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    const rows = await query(
      'SELECT id, username, password_hash, role, active FROM users WHERE username = :username',
      { username }
    );

    if (!rows.length || !rows[0].active) return res.status(401).json({ error: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    const user = { id: rows[0].id, username: rows[0].username, role: rows[0].role };
    res.json({ token: tokenFor(user), state: await gameState(user.id) });
  } catch {
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// API: estado del juego del alumno/profesor autenticado.
app.get('/api/game/state', auth, async (req, res) => {
  try {
    res.json(await gameState(req.user.id));
  } catch {
    res.status(500).json({ error: 'Error al cargar estado' });
  }
});

// API: panel de progreso del alumno.
// SQL: usa progressDetail para mostrar preguntas, intentos y niveles.
app.get('/api/progress', auth, async (req, res) => {
  try {
    res.json(await progressDetail(req.user.id));
  } catch (error) {
    console.error('Error al cargar progreso:', error);
    res.status(500).json({ error: 'Error al cargar progreso' });
  }
});


// API: dashboard profesor - grupos propios.
// SQL: trae solo grupos donde grupos.profesor_id es el usuario actual.
app.get('/api/teacher/groups', auth, requireRole('profesor'), async (req, res) => {
  try {
    res.json({ groups: await teacherGroupsFor(req.user.id) });
  } catch {
    res.status(500).json({ error: 'Error al cargar grupos' });
  }
});

// API: dashboard profesor - crear grupo.
// SQL: inserta en grupos, genera join_code y usa numero unico por profesor.
app.post('/api/teacher/groups', auth, requireRole('profesor'), async (req, res) => {
  try {
    let numero = toPositiveInt(req.body.numero);
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const maxStudents = toPositiveInt(req.body.maxStudents);
    if (!numero) {
      const rows = await query(
        'SELECT COALESCE(MAX(numero), 0) + 1 AS next_numero FROM grupos WHERE profesor_id = :profesorId',
        { profesorId: req.user.id }
      );
      numero = Number(rows[0].next_numero || 1);
    }

    if (!numero) return res.status(400).json({ error: 'Número de grupo inválido' });
    if (name.length < 2) return res.status(400).json({ error: 'Nombre de grupo demasiado corto' });

    const joinCode = await uniqueJoinCode();
    const result = await query(
      `INSERT INTO grupos (numero, name, description, profesor_id, join_code, max_students)
       VALUES (:numero, :name, :description, :profesorId, :joinCode, :maxStudents)`,
      { numero, name, description: description || null, profesorId: req.user.id, joinCode, maxStudents }
    );

    res.json({ id: result.insertId, groups: await teacherGroupsFor(req.user.id) });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese numero de grupo ya existe para tu cuenta' });
    console.error('Error al guardar grupo:', error);
    res.status(500).json({ error: 'Error al guardar grupo' });
  }
});

// API: dashboard profesor - alumnos de un grupo.
// SQL: carga alumnos inscritos, progreso por pregunta y estadisticas por nivel.
app.get('/api/teacher/groups/:groupId/students', auth, requireRole('profesor'), async (req, res) => {
  try {
    const groupId = toPositiveInt(req.params.groupId);
    if (!groupId) return res.status(400).json({ error: 'Grupo inválido' });

    const groupRows = await query(
      'SELECT id, numero, name, description, join_code, max_students FROM grupos WHERE id = :groupId AND profesor_id = :profesorId',
      { groupId, profesorId: req.user.id }
    );
    if (!groupRows.length) return res.status(404).json({ error: 'Grupo no encontrado' });

    const students = await query(
      `SELECT DISTINCT u.id, u.username, u.created_at
       FROM grupo_users gu
       JOIN users u ON u.id = gu.user_id
       WHERE u.role = 'jugador'
         AND u.active = TRUE
         AND gu.grupo_id = :groupId
       ORDER BY u.username`,
      { groupId }
    );

    for (const student of students) {
      await ensurePlayerRows(student.id);
    }

    let progressRows = [];
    if (students.length) {
      const ids = students.map(student => Number(student.id)).filter(Number.isInteger);
      progressRows = await query(
        `SELECT p.user_id, t.slug AS tema, d.slug AS dificultad, p.current_index,
                qp.question_key, qp.question_index, qp.answered, qp.correct,
                qp.attempts_count, qp.last_answered_at
         FROM progress p
         JOIN temas t ON t.id = p.tema_id
         JOIN dificultades d ON d.id = p.dificultad_id
         LEFT JOIN question_progress qp
           ON qp.user_id = p.user_id
          AND qp.tema_id = p.tema_id
          AND qp.dificultad_id = p.dificultad_id
         WHERE p.user_id IN (${ids.join(',')})
         ORDER BY p.user_id, t.slug, d.id, qp.question_index`
      );
    }

    const rowsByStudent = new Map();
    for (const row of progressRows) {
      if (!rowsByStudent.has(row.user_id)) rowsByStudent.set(row.user_id, []);
      rowsByStudent.get(row.user_id).push(row);
    }

    res.json({
      group: {
        id: groupRows[0].id,
        numero: groupRows[0].numero,
        name: groupRows[0].name,
        description: groupRows[0].description || '',
        joinCode: groupRows[0].join_code,
        maxStudents: groupRows[0].max_students
      },
      students: students.map(student => ({
        id: student.id,
        username: student.username,
        createdAt: student.created_at,
        progress: buildProgressByLevel(rowsByStudent.get(student.id) || [])
      }))
    });
  } catch {
    res.status(500).json({ error: 'Error al cargar alumnos del grupo' });
  }
});

// API: dashboard profesor - alumnos registrados en la plataforma.
// SQL: lista usuarios jugador para que el profesor pueda inscribirlos a sus grupos.
app.get('/api/teacher/students', auth, requireRole('profesor'), async (req, res) => {
  try {
    const students = await query(
      `SELECT u.id, u.username, u.created_at,
              COUNT(DISTINCT gu.grupo_id) AS group_count
       FROM users u
       LEFT JOIN grupo_users gu ON gu.user_id = u.id
       WHERE u.role = 'jugador' AND u.active = TRUE
       GROUP BY u.id, u.username, u.created_at
       ORDER BY u.username`
    );

    res.json({ students: students.map(student => ({
      id: student.id,
      username: student.username,
      createdAt: student.created_at,
      groupCount: Number(student.group_count || 0)
    })) });
  } catch {
    res.status(500).json({ error: 'Error al cargar alumnos' });
  }
});

// API: dashboard profesor - inscribir alumnos existentes.
// SQL: inserta relaciones en grupo_users sin duplicar y respeta cupo maximo.
app.post('/api/teacher/groups/:groupId/students', auth, requireRole('profesor'), async (req, res) => {
  try {
    const groupId = toPositiveInt(req.params.groupId);
    const studentIds = Array.isArray(req.body.studentIds)
      ? req.body.studentIds.map(Number).filter(Number.isInteger)
      : [];

    if (!groupId) return res.status(400).json({ error: 'Grupo invalido' });
    if (!studentIds.length) return res.status(400).json({ error: 'Selecciona al menos un alumno' });

    const group = await requireTeacherGroup(groupId, req.user.id);
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });

    const currentRows = await query(
      'SELECT COUNT(*) AS total FROM grupo_users WHERE grupo_id = :groupId',
      { groupId }
    );
    const currentTotal = Number(currentRows[0].total || 0);
    if (group.max_students && currentTotal + studentIds.length > group.max_students) {
      return res.status(400).json({ error: 'El grupo no tiene cupo suficiente' });
    }

    const validStudents = await query(
      `SELECT id FROM users
       WHERE role = 'jugador' AND active = TRUE AND id IN (${studentIds.join(',')})`
    );

    await transaction(async connection => {
      for (const student of validStudents) {
        await connection.execute(
          'INSERT IGNORE INTO grupo_users (grupo_id, user_id) VALUES (?, ?)',
          [groupId, student.id]
        );
        await connection.execute(
          'UPDATE users SET grupo_id = COALESCE(grupo_id, ?) WHERE id = ?',
          [groupId, student.id]
        );
      }
    });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error al inscribir alumnos' });
  }
});

// API: alumno se une a grupo con codigo.
// SQL: busca grupos.join_code, valida cupo e inserta en grupo_users.
app.post('/api/student/groups/join', auth, requireRole('jugador'), async (req, res) => {
  try {
    const joinCode = String(req.body.joinCode || '').trim().toUpperCase();
    if (joinCode.length < 4) return res.status(400).json({ error: 'Codigo invalido' });

    const groups = await query(
      `SELECT g.id, g.max_students, COUNT(gu.user_id) AS student_count
       FROM grupos g
       LEFT JOIN grupo_users gu ON gu.grupo_id = g.id
       WHERE g.join_code = :joinCode
       GROUP BY g.id, g.max_students`,
      { joinCode }
    );
    if (!groups.length) return res.status(404).json({ error: 'No existe un grupo con ese codigo' });

    const group = groups[0];
    if (group.max_students && Number(group.student_count || 0) >= Number(group.max_students)) {
      return res.status(400).json({ error: 'Ese grupo ya no tiene cupo' });
    }

    await query(
      'INSERT IGNORE INTO grupo_users (grupo_id, user_id) VALUES (:groupId, :userId)',
      { groupId: group.id, userId: req.user.id }
    );
    await query(
      'UPDATE users SET grupo_id = COALESCE(grupo_id, :groupId) WHERE id = :userId',
      { groupId: group.id, userId: req.user.id }
    );

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error al unirse al grupo' });
  }
});

// API: profesor crea alumno nuevo y lo inscribe.
// SQL: crea users.role='jugador', guarda password hash y liga grupo_users.
app.post('/api/teacher/students', auth, requireRole('profesor'), async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const groupId = toPositiveInt(req.body.groupId);
    const groupNumber = toPositiveInt(req.body.groupNumber);

    if (username.length < 3) return res.status(400).json({ error: 'Usuario demasiado corto' });
    if (password.length < 4) return res.status(400).json({ error: 'Contraseña demasiado corta' });
    if (!groupId && !groupNumber) return res.status(400).json({ error: 'Selecciona un grupo' });

    const groups = await query(
      groupId
        ? `SELECT g.id, g.max_students, COUNT(gu.user_id) AS student_count
           FROM grupos g
           LEFT JOIN grupo_users gu ON gu.grupo_id = g.id
           WHERE g.id = :groupId AND g.profesor_id = :profesorId
           GROUP BY g.id, g.max_students`
        : `SELECT g.id, g.max_students, COUNT(gu.user_id) AS student_count
           FROM grupos g
           LEFT JOIN grupo_users gu ON gu.grupo_id = g.id
           WHERE g.numero = :groupNumber AND g.profesor_id = :profesorId
           GROUP BY g.id, g.max_students`,
      { groupId, groupNumber, profesorId: req.user.id }
    );
    if (!groups.length) return res.status(404).json({ error: 'Grupo no encontrado' });
    if (groups[0].max_students && Number(groups[0].student_count || 0) >= Number(groups[0].max_students)) {
      return res.status(409).json({ error: 'El grupo ya esta lleno' });
    }

    const selectedGroupId = groups[0].id;
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await transaction(async connection => {
      const [insertResult] = await connection.execute(
        'INSERT INTO users (username, password_hash, role, grupo_id) VALUES (?, ?, "jugador", ?)',
        [username, passwordHash, selectedGroupId]
      );

      await connection.execute(
        'INSERT IGNORE INTO grupo_users (grupo_id, user_id) VALUES (?, ?)',
        [selectedGroupId, insertResult.insertId]
      );

      return insertResult;
    });

    await ensurePlayerRows(result.insertId);
    res.json({ ok: true, userId: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese usuario ya existe' });
    res.status(500).json({ error: 'Error al registrar alumno' });
  }
});

// API: obtener preguntas del minijuego.
// Lee data/levels.json mediante src/levels.js y entrega el bloque/nivel solicitado.
app.get('/api/questions', auth, async (req, res) => {
  try {
    const tema = String(req.query.tema || '');
    const dificultad = String(req.query.dificultad || '');
    const requestedBlock = toPositiveInt(req.query.block);

    if (!themeSlugs().includes(tema)) return res.status(404).json({ error: 'Tema inválido' });
    if (!difficultyMeta[dificultad]) return res.status(404).json({ error: 'Dificultad inválida' });

    await ensurePlayerRows(req.user.id);

    const rows = await query(
      `SELECT p.current_index
       FROM progress p
       JOIN temas t ON t.id = p.tema_id
       JOIN dificultades d ON d.id = p.dificultad_id
       WHERE p.user_id = :userId AND t.slug = :tema AND d.slug = :dificultad`,
      { userId: req.user.id, tema, dificultad }
    );

    const questions = getQuestions(tema, dificultad);
    const currentIndex = Math.min(rows[0]?.current_index || 0, questions.length);
    const totalBlocks = Math.max(1, Math.ceil(questions.length / BLOCK_SIZE));
    const currentBlock = questions.length
      ? Math.min(totalBlocks, Math.floor(currentIndex / BLOCK_SIZE) + 1)
      : 1;
    const blockNumber = requestedBlock || currentBlock;

    if (blockNumber > currentBlock) {
      return res.status(403).json({ error: 'Completa el nivel actual antes de entrar al siguiente.' });
    }

    if (blockNumber > totalBlocks) {
      return res.status(404).json({ error: 'Nivel invÃ¡lido' });
    }

    const start = (blockNumber - 1) * BLOCK_SIZE;
    const end = Math.min(start + BLOCK_SIZE, questions.length);

    const progressRows = await query(
      `SELECT qp.question_index, qp.answered, qp.correct, qp.last_correct,
              qp.attempts_count, qp.last_answered_at
       FROM question_progress qp
       JOIN temas t ON t.id = qp.tema_id
       JOIN dificultades d ON d.id = qp.dificultad_id
       WHERE qp.user_id = :userId
         AND t.slug = :tema
         AND d.slug = :dificultad
         AND qp.question_index >= :start
         AND qp.question_index < :end`,
      { userId: req.user.id, tema, dificultad, start, end }
    );

    const progressMap = new Map(progressRows.map(row => [Number(row.question_index), row]));
    const picked = questions
      .slice(start, end)
      .map((question, offset) => {
        const index = start + offset;
        const clean = cleanQuestion(question, tema, dificultad, index);
        const saved = progressMap.get(index);
        const answered = Boolean(saved?.answered);
        const correct = Boolean(saved?.correct);
        return {
          ...clean,
          number: index + 1,
          status: correct ? 'correct' : answered ? 'incorrect' : 'pending',
          answered,
          correct,
          lastCorrect: Boolean(saved?.last_correct),
          attempts: Number(saved?.attempts_count || 0),
          lastAnsweredAt: saved?.last_answered_at || null,
          current: index === currentIndex && currentIndex < questions.length
        };
      });

    const blocks = buildQuestionBlocks(
      questions.length,
      currentIndex,
      picked.map(question => ({
        index: question.index,
        answered: question.answered,
        correct: question.correct
      }))
    );
    const block = blocks.find(item => item.number === blockNumber);

    res.json({
      tema,
      dificultad,
      block,
      blocks,
      blockSize: BLOCK_SIZE,
      blockNumber,
      currentBlock,
      totalBlocks,
      start,
      end,
      total: questions.length,
      completed: currentIndex >= questions.length,
      questions: picked
    });
  } catch {
    res.status(500).json({ error: 'Error al cargar preguntas' });
  }
});

// API: intento completo del minijuego.
// SQL: guarda historial en minigame_attempts/minigame_question_attempts y actualiza progress.
app.post('/api/minigame/submit', auth, async (req, res) => {
  try {
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    if (!answers.length) return res.status(400).json({ error: 'No hay respuestas' });

    const parsed = answers.map(item => ({
      parsed: parseQuestionId(item.questionId),
      answer: item.answer || {}
    }));

    if (parsed.some(item => !item.parsed)) return res.status(400).json({ error: 'Preguntas inválidas' });

    const tema = parsed[0].parsed.tema;
    const dificultad = parsed[0].parsed.dificultad;

    if (parsed.some(item => item.parsed.tema !== tema || item.parsed.dificultad !== dificultad)) {
      return res.status(400).json({ error: 'Sesión mezclada inválida' });
    }

    if (!themeSlugs().includes(tema) || !difficultyMeta[dificultad]) {
      return res.status(400).json({ error: 'Tema o dificultad inválida' });
    }

    const questions = getQuestions(tema, dificultad);
    if (parsed.some(item => !questions[item.parsed.index])) {
      return res.status(400).json({ error: 'Pregunta fuera de rango' });
    }

    const checked = parsed.map(item => {
      const question = questions[item.parsed.index];
      const correct = isCorrect(question, item.answer);
      return {
        questionId: `${tema}:${dificultad}:${item.parsed.index}`,
        questionIndex: item.parsed.index,
        questionType: question?.tipo || 'unknown',
        submittedAnswer: item.answer,
        correct,
        correctAnswer: correct ? null : correctAnswer(question),
        storedCorrectAnswer: correctAnswer(question)
      };
    });

    const totalQuestions = checked.length;
    const correctAnswers = checked.filter(item => item.correct).length;
    const passed = correctAnswers >= Math.ceil(totalQuestions * 0.6);
    let rewardCoins = 0;
    let rewardXp = 0;
    const maxAnsweredIndex = Math.max(...parsed.map(item => item.parsed.index)) + 1;

    await transaction(async connection => {
      const [temaRows] = await connection.execute('SELECT id FROM temas WHERE slug = ?', [tema]);
      const [difficultyRows] = await connection.execute('SELECT id FROM dificultades WHERE slug = ?', [dificultad]);
      const temaId = temaRows[0].id;
      const dificultadId = difficultyRows[0].id;

      await connection.execute(
        `INSERT IGNORE INTO progress (user_id, tema_id, dificultad_id, current_index)
         VALUES (?, ?, ?, 0)`,
        [req.user.id, temaId, dificultadId]
      );

      await connection.execute(
        `INSERT IGNORE INTO progress (user_id, tema_id, dificultad_id, current_index)
         VALUES (?, ?, ?, 0)`,
        [req.user.id, temaId, dificultadId]
      );

      const [progRows] = await connection.execute(
        'SELECT current_index FROM progress WHERE user_id = ? AND tema_id = ? AND dificultad_id = ?',
        [req.user.id, temaId, dificultadId]
      );
      const savedIndex = progRows.length ? Number(progRows[0].current_index || 0) : 0;
      const nextProgressItem = checked.find(item => item.questionIndex === savedIndex);
      const shouldAdvance = Boolean(nextProgressItem?.correct);

      if (shouldAdvance) {
        rewardCoins = difficultyMeta[dificultad].reward;
        rewardXp = Math.round(difficultyMeta[dificultad].xp / questions.length) || 1;
      }

      const [attemptResult] = await connection.execute(
        `INSERT INTO minigame_attempts
         (user_id, tema_id, dificultad_id, total_questions, correct_answers, reward_coins, reward_xp, passed, start_index, end_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, temaId, dificultadId, totalQuestions, correctAnswers, rewardCoins, rewardXp, passed, Math.min(...parsed.map(item => item.parsed.index)), maxAnsweredIndex]
      );

      for (const item of checked) {
        const answerJson = JSON.stringify(item.submittedAnswer || {});
        const correctJson = JSON.stringify(item.storedCorrectAnswer || {});

        await connection.execute(
          `INSERT INTO minigame_question_attempts
           (attempt_id, user_id, tema_id, dificultad_id, question_key, question_index, question_type, submitted_answer_json, correct_answer_json, correct)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [attemptResult.insertId, req.user.id, temaId, dificultadId, item.questionId, item.questionIndex, item.questionType, answerJson, correctJson, item.correct]
        );

        await connection.execute(
          `INSERT INTO question_progress
           (user_id, tema_id, dificultad_id, question_key, question_index, question_type, answered, correct, last_correct, attempts_count, last_answer_json, correct_answer_json)
           VALUES (?, ?, ?, ?, ?, ?, TRUE, ?, ?, 1, ?, ?)
           ON DUPLICATE KEY UPDATE
             answered = TRUE,
             correct = GREATEST(correct, VALUES(correct)),
             last_correct = VALUES(last_correct),
             attempts_count = attempts_count + 1,
             last_answer_json = VALUES(last_answer_json),
             correct_answer_json = VALUES(correct_answer_json),
             last_answered_at = CURRENT_TIMESTAMP`,
          [req.user.id, temaId, dificultadId, item.questionId, item.questionIndex, item.questionType, item.correct, item.correct, answerJson, correctJson]
        );
      }

      if (shouldAdvance) {
        await connection.execute(
          'UPDATE user_stats SET coins = coins + ?, xp = xp + ? WHERE user_id = ?',
          [rewardCoins, rewardXp, req.user.id]
        );

        const newIndex = Math.min(savedIndex + 1, questions.length);
        await connection.execute(
          `UPDATE progress
           SET current_index = GREATEST(current_index, ?)
           WHERE user_id = ? AND tema_id = ? AND dificultad_id = ?`,
          [newIndex, req.user.id, temaId, dificultadId]
        );

        if (newIndex >= questions.length) {
          await grantAchievement(connection, req.user.id, temaId, dificultadId);
        }
      }
    });

    const state = await gameState(req.user.id);

    res.json({
      tema,
      dificultad,
      totalQuestions,
      correctAnswers,
      passed,
      rewardCoins,
      rewardXp,
      results: checked.map(item => ({
        questionId: item.questionId,
        correct: item.correct,
        correctAnswer: item.correctAnswer
      })),
      state
    });
  } catch {
    res.status(500).json({ error: 'Error al guardar minijuego' });
  }
});

// Verificación de una sola pregunta al pulsar "Continuar".
// Solo avanza el progreso (current_index) si la respuesta es correcta.
// El progreso por nivel solo puede subir, nunca bajar (GREATEST).
// API: revisar una sola pregunta.
// GUIA: aqui se guardan progreso, correctas, intentos, XP y monedas al pulsar "Revisar".
// SQL progreso: question_progress guarda cada pregunta; progress.current_index guarda avance por tema/dificultad.
// RECOMPENSAS: user_stats.coins y user_stats.xp suben solo cuando la pregunta nueva se supera.
app.post('/api/minigame/check', auth, async (req, res) => {
  try {
    const parsed = parseQuestionId(req.body.questionId);
    if (!parsed) return res.status(400).json({ error: 'Pregunta inválida' });

    const { tema, dificultad, index } = parsed;
    const answer = req.body.answer || {};

    if (!themeSlugs().includes(tema) || !difficultyMeta[dificultad]) {
      return res.status(400).json({ error: 'Tema o dificultad inválida' });
    }

    const questions = getQuestions(tema, dificultad);
    const question = questions[index];
    if (!question) return res.status(400).json({ error: 'Pregunta fuera de rango' });

    const correct = isCorrect(question, answer);
    const questionId = `${tema}:${dificultad}:${index}`;
    const questionType = question.tipo || 'unknown';
    const storedCorrectAnswer = correctAnswer(question);

    const result = await transaction(async connection => {
      const [temaRows] = await connection.execute('SELECT id FROM temas WHERE slug = ?', [tema]);
      const [difficultyRows] = await connection.execute('SELECT id FROM dificultades WHERE slug = ?', [dificultad]);
      const temaId = temaRows[0].id;
      const dificultadId = difficultyRows[0].id;

      const answerJson = JSON.stringify(answer || {});
      const correctJson = JSON.stringify(storedCorrectAnswer || {});

      // Historial acumulado por pregunta. 'correct' nunca baja (GREATEST).
      await connection.execute(
        `INSERT INTO question_progress
         (user_id, tema_id, dificultad_id, question_key, question_index, question_type, answered, correct, last_correct, attempts_count, last_answer_json, correct_answer_json)
         VALUES (?, ?, ?, ?, ?, ?, TRUE, ?, ?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE
           answered = TRUE,
           correct = GREATEST(correct, VALUES(correct)),
           last_correct = VALUES(last_correct),
           attempts_count = attempts_count + 1,
           last_answer_json = VALUES(last_answer_json),
           correct_answer_json = VALUES(correct_answer_json),
           last_answered_at = CURRENT_TIMESTAMP`,
        [req.user.id, temaId, dificultadId, questionId, index, questionType, correct, correct, answerJson, correctJson]
      );

      let rewardCoins = 0;
      let rewardXp = 0;
      let levelCompleted = false;

      if (correct) {
        const [progRows] = await connection.execute(
          'SELECT current_index FROM progress WHERE user_id = ? AND tema_id = ? AND dificultad_id = ?',
          [req.user.id, temaId, dificultadId]
        );
        const savedIndex = progRows.length ? Number(progRows[0].current_index || 0) : 0;

        // El avance guardado solo sube por el tramo correcto consecutivo.
        // Repetir preguntas anteriores no baja ni sube el progreso.
        // Contestar un índice futuro tampoco salta el avance.
        const [correctRows] = await connection.execute(
          `SELECT question_index
           FROM question_progress
           WHERE user_id = ?
             AND tema_id = ?
             AND dificultad_id = ?
             AND correct = TRUE
             AND question_index >= ?
           ORDER BY question_index`,
          [req.user.id, temaId, dificultadId, savedIndex]
        );

        const correctIndexes = new Set(correctRows.map(row => Number(row.question_index)));
        let newIndex = savedIndex;
        while (newIndex < questions.length && correctIndexes.has(newIndex)) {
          newIndex += 1;
        }

        const advancedBy = Math.max(0, newIndex - savedIndex);

        if (advancedBy > 0) {
          rewardCoins = difficultyMeta[dificultad].reward * advancedBy;
          rewardXp = (Math.round(difficultyMeta[dificultad].xp / questions.length) || 1) * advancedBy;

          await connection.execute(
            'UPDATE user_stats SET coins = coins + ?, xp = xp + ? WHERE user_id = ?',
            [rewardCoins, rewardXp, req.user.id]
          );

          await connection.execute(
            `UPDATE progress
             SET current_index = GREATEST(current_index, ?)
             WHERE user_id = ? AND tema_id = ? AND dificultad_id = ?`,
            [newIndex, req.user.id, temaId, dificultadId]
          );

          levelCompleted = newIndex >= questions.length;
          if (levelCompleted) {
            await grantAchievement(connection, req.user.id, temaId, dificultadId);
          }
        }
      }

      return { rewardCoins, rewardXp, levelCompleted };
    });

    const state = await gameState(req.user.id);

    res.json({
      questionId,
      correct,
      // La respuesta correcta solo se revela cuando el alumno acertó,
      // para no filtrar la solución en intentos fallidos.
      correctAnswer: correct ? storedCorrectAnswer : null,
      rewardCoins: result.rewardCoins,
      rewardXp: result.rewardXp,
      levelCompleted: result.levelCompleted,
      state
    });
  } catch {
    res.status(500).json({ error: 'Error al verificar la respuesta' });
  }
});


// GUIA: ayuda Python con OpenAI.
// Se usa solo si hay OPENAI_API_KEY; si no, el frontend muestra error controlado.
function callOpenAIChat(messages) {
  const apiKey = configuredOpenAIKey();
  const model = process.env.OPENAI_MODEL || process.env.CHATGPT_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    return Promise.reject(new Error('OPENAI_API_KEY no está configurada'));
  }

  const payload = JSON.stringify({
    model,
    messages,
    temperature: 0.25,
    max_tokens: 700
  });

  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, response => {
      let body = '';
      response.on('data', chunk => body += chunk);
      response.on('end', () => {
        let data = {};
        try { data = JSON.parse(body); } catch {}

        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error(data.error?.message || 'Error de OpenAI'));
        }

        resolve(data.choices?.[0]?.message?.content || 'No recibí respuesta.');
      });
    });

    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

// API: chat de ayuda.
// Recibe mensajes del modal de ayuda y responde con el modelo configurado.
app.post('/api/chat', auth, async (req, res) => {
  try {
    if (!configuredOpenAIKey()) {
      return res.status(403).json({ error: 'Python AI Help no está disponible' });
    }

    const rawMessages = Array.isArray(req.body.messages) ? req.body.messages : [];
    const cleaned = rawMessages
      .filter(message => ['user', 'assistant'].includes(message?.role) && String(message?.content || '').trim())
      .slice(-10)
      .map(message => ({ role: message.role, content: String(message.content).slice(0, 2500) }));

    const directMessage = String(req.body.message || '').trim();
    if (!cleaned.length && directMessage) cleaned.push({ role: 'user', content: directMessage.slice(0, 2500) });
    if (!cleaned.length) return res.status(400).json({ error: 'Mensaje vacío' });

    const answer = await callOpenAIChat([
      {
        role: 'system',
        content: 'Eres el asistente de CapyCode. Ayuda con dudas de Python de forma clara, breve y didáctica. No resuelvas todo sin explicar el razonamiento útil para que el alumno aprenda.'
      },
      ...cleaned
    ]);

    res.json({ answer });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Error al consultar ChatGPT' });
  }
});

// API: tienda de skins - comprar.
// SQL: descuenta monedas de user_stats e inserta en user_skins.
app.post('/api/skins/buy', auth, async (req, res) => {
  try {
    const skinId = Number(req.body.skinId);
    if (!Number.isInteger(skinId)) return res.status(400).json({ error: 'Skin inválida' });

    const result = await transaction(async connection => {
      const [skins] = await connection.execute('SELECT id, price FROM skins WHERE id = ?', [skinId]);
      if (!skins.length) return { status: 404, error: 'Skin no existe' };

      const [owned] = await connection.execute(
        'SELECT skin_id FROM user_skins WHERE user_id = ? AND skin_id = ?',
        [req.user.id, skinId]
      );

      if (owned.length) return { status: 200 };

      const [stats] = await connection.execute('SELECT coins FROM user_stats WHERE user_id = ?', [req.user.id]);
      if (stats[0].coins < skins[0].price) return { status: 400, error: 'No tienes suficientes monedas' };

      await connection.execute('UPDATE user_stats SET coins = coins - ? WHERE user_id = ?', [skins[0].price, req.user.id]);
      await connection.execute('INSERT INTO user_skins (user_id, skin_id) VALUES (?, ?)', [req.user.id, skinId]);

      return { status: 200 };
    });

    if (result.status !== 200) return res.status(result.status).json({ error: result.error });
    res.json({ state: await gameState(req.user.id) });
  } catch {
    res.status(500).json({ error: 'Error al comprar skin' });
  }
});

// API: tienda de skins - seleccionar.
// SQL: actualiza user_stats.selected_skin_id si el usuario ya posee la skin.
app.post('/api/skins/select', auth, async (req, res) => {
  try {
    const skinId = Number(req.body.skinId);
    if (!Number.isInteger(skinId)) return res.status(400).json({ error: 'Skin inválida' });

    const owned = await query(
      'SELECT skin_id FROM user_skins WHERE user_id = :userId AND skin_id = :skinId',
      { userId: req.user.id, skinId }
    );

    if (!owned.length) return res.status(403).json({ error: 'Skin bloqueada' });

    await query(
      'UPDATE user_stats SET selected_skin_id = :skinId WHERE user_id = :userId',
      { skinId, userId: req.user.id }
    );

    res.json({ state: await gameState(req.user.id) });
  } catch {
    res.status(500).json({ error: 'Error al seleccionar skin' });
  }
});


// API: guardar ultimo mapa visitado.
// SQL: persiste user_stats.last_map_code y last_theme_slug para restaurar ubicacion al entrar.
app.post('/api/map/last', auth, async (req, res) => {
  try {
    const mapCode = String(req.body.mapCode || 'hub').slice(0, 80);
    const themeSlug = req.body.themeSlug ? String(req.body.themeSlug).slice(0, 120) : null;

    await query(
      'UPDATE user_stats SET last_map_code = :mapCode, last_theme_slug = :themeSlug WHERE user_id = :userId',
      { mapCode, themeSlug, userId: req.user.id }
    );

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error al guardar mapa' });
  }
});

// GUIA: arranque del servidor.
// Primero prepara base de datos; despues abre http://localhost:3000.
initDb()
  .then(() => {
    app.listen(port, () => console.log(`CapyCode running on http://localhost:${port}`));
  })
  .catch(error => {
    console.error('Database initialization failed');
    console.error(error);
    process.exit(1);
  });
