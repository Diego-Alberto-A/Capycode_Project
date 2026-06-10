const fs = require('fs');
const path = require('path');

const levelsPath = path.join(__dirname, '..', 'data', 'levels.json');
const levels = JSON.parse(fs.readFileSync(levelsPath, 'utf8'));

// GUIA: dificultad, recompensas y XP.
// reward son monedas por pregunta nueva correcta; xp es experiencia por pregunta nueva correcta.
const difficultyMeta = {
  facil: { id: 1, name: 'Fácil', reward: 10, xp: 25 },
  medio: { id: 2, name: 'Medio', reward: 15, xp: 45 },
  dificil: { id: 3, name: 'Difícil', reward: 25, xp: 75 }
};

// GUIA: nombres bonitos de mundos/temas.
// Convierte slugs como "estructuras_de_control" a texto visible.
function title(slug) {
  return slug
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// GUIA: catalogo de mundos.
// Lee las claves dentro de data/levels.json -> temas.
function themeSlugs() {
  return Object.keys(levels.temas || {});
}

// GUIA: preguntas por mundo y dificultad.
// Esta es la fuente que usa /api/questions y el minijuego.
function getQuestions(tema, dificultad) {
  return levels.temas?.[tema]?.[dificultad] || [];
}

// GUIA: identificador estable de pregunta.
// Se guarda en question_progress para recordar intentos aunque se recargue la pagina.
function questionId(tema, dificultad, index) {
  return `${tema}:${dificultad}:${index}`;
}

// GUIA: leer id de pregunta.
// Convierte "tema:dificultad:index" en partes validadas.
function parseQuestionId(id) {
  const parts = String(id || '').split(':');
  if (parts.length !== 3) return null;
  const index = Number(parts[2]);
  if (!Number.isInteger(index) || index < 0) return null;
  return { tema: parts[0], dificultad: parts[1], index };
}

// GUIA: enviar pregunta al frontend sin filtrar respuestas correctas.
// Borra correct_ids, orden_correcto, rellenos y valor antes de mandarla al navegador.
function cleanQuestion(question, tema, dificultad, index) {
  const clone = JSON.parse(JSON.stringify(question));
  delete clone.correct_ids;
  delete clone.orden_correcto;
  delete clone.rellenos;
  delete clone.valor;
  clone.id = questionId(tema, dificultad, index);
  clone.index = index;
  return clone;
}

// GUIA: comparacion de listas.
// Sirve para opcion multiple y seleccionar lineas sin depender del orden.
function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(String).sort();
}

function sameList(a, b) {
  const x = normalizeList(a);
  const y = normalizeList(b);
  return x.length === y.length && x.every((item, index) => item === y[index]);
}

// GUIA: validar respuesta del alumno.
// Aqui vive la logica de los tipos de pregunta: multiple, lineas, ordenar, drag/drop y numerica.
function isCorrect(question, answer) {
  if (!question) return false;

  if (question.tipo === 'opcion_multiple') {
    return sameList(answer?.selected, question.correct_ids);
  }

  if (question.tipo === 'seleccionar_lineas') {
    return sameList(answer?.selected, question.correct_ids);
  }

  if (question.tipo === 'ordenar_lineas') {
    return sameList(answer?.order, question.orden_correcto) && answer.order.join('|') === question.orden_correcto.join('|');
  }

  if (question.tipo === 'drag_and_drop') {
    const submitted = answer?.fills || {};
    const expected = question.rellenos || {};
    return Object.keys(expected).every(key => String(submitted[key] || '') === String(expected[key]));
  }

  if (question.tipo === 'respuesta_numerica') {
    return Number(answer?.value) === Number(question.valor);
  }

  return false;
}

// GUIA: respuesta correcta para historial/retroalimentacion.
// El backend puede guardar o devolver la respuesta esperada sin repetir logica.
function correctAnswer(question) {
  if (question.tipo === 'opcion_multiple') return { selected: question.correct_ids };
  if (question.tipo === 'seleccionar_lineas') return { selected: question.correct_ids };
  if (question.tipo === 'ordenar_lineas') return { order: question.orden_correcto };
  if (question.tipo === 'drag_and_drop') return { fills: question.rellenos };
  if (question.tipo === 'respuesta_numerica') return { value: question.valor };
  return {};
}

module.exports = {
  levels,
  difficultyMeta,
  title,
  themeSlugs,
  getQuestions,
  questionId,
  parseQuestionId,
  cleanQuestion,
  isCorrect,
  correctAnswer
};
