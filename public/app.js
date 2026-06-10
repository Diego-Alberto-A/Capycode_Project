import * as THREE from 'three';
import { MTLLoader } from '/vendor/three/examples/loaders/MTLLoader.js';
import { OBJLoader } from '/vendor/three/examples/loaders/OBJLoader.js';

const $ = id => document.getElementById(id);

// GUIA FRONTEND: estado global.
// Sesion, mundo 3D, profesor/alumno, minijuego, progreso, skins y audio viven aqui.
let token = localStorage.getItem('capy_token') || '';
let state = null;
let scene = null;
let camera = null;
let renderer = null;
let player = null;
let playerBody = null;
let portals = [];
let labels = [];
let nearestPortal = null;
let session = null;
let draggedItem = null;
let currentMap = { code: 'hub', theme: null };
let worldBuildId = 0;
let selectedAuthRole = null;
let teacherGroups = [];
let selectedTeacherGroupId = null;
let selectedTeacherStudentId = null;
let progressData = null;
let selectedProgressTheme = null;
let selectedProgressDifficulty = 'facil';
let selectedProgressFilter = 'all';
let tutorialIndex = 0;
let allTeacherStudents = [];
let currentTeacherGroupStudents = [];
let colliders = [];
let obstacleColliders = [];
let terrainMeshes = [];
const downRaycaster = new THREE.Raycaster();
let verticalVelocity = 0;
let isGrounded = true;
let cameraYaw = 0;
let cameraDistance = 15;
let cameraHeight = 9.5;
let isDraggingCamera = false;
let lastPointerX = 0;
let chatHistory = [];

const keys = {};
const assetCache = new Map();
const ASSET_BASE = '/assets/objects';

// GUIA FRONTEND: imagenes PNG de skins en la tienda.
// Si agregas una skin nueva, registra aqui su archivo de public/assets/skins.
const skinPreviewFiles = {
  capythilda: 'Capythilda.png',
  capyaqua: 'CapyAqua.png',
  capyblack: 'CapyBlack.png',
  capycandy: 'CapyCandy.png',
  capyconstellations: 'CapyConstelation.png',
  capyearth: 'CapyEarth.png',
  capyexplorer: 'CapyExplorer.png',
  capyking: 'CapyKing.png',
  capymage: 'CapyMage.png',
  capyruna: 'CapyRuna.png',
  capysun: 'CapySun.png'
};
// GUIA FRONTEND: tutorial del menu lateral.
// Cada objeto es una diapositiva del popup "Tutorial".
const tutorialSlides = [
  {
    title: 'Bienvenido a CapyCode',
    icon: 'CC',
    body: 'CapyCode es un juego para practicar Python explorando mapas, entrando a portales y completando niveles de preguntas.'
  },
  {
    title: 'Movimiento',
    icon: 'WASD',
    body: 'Usa W, A, S y D para moverte por el mundo. Presiona Espacio para saltar.'
  },
  {
    title: 'Camara',
    icon: 'CAM',
    body: 'Usa las flechas izquierda y derecha para girar la camara. Usa flecha arriba o abajo para acercar o alejar la vista.'
  },
  {
    title: 'Portales y mundos',
    icon: 'E',
    body: 'Acercate a un portal y presiona E para entrar. Los portales del mapa principal te llevan a temas como algoritmos, funciones o ciclos.'
  },
  {
    title: 'Niveles de preguntas',
    icon: '1-5',
    body: 'Cada tema y dificultad se divide en niveles de 5 preguntas. Completa el nivel actual para desbloquear el siguiente.'
  },
  {
    title: 'Responder y revisar',
    icon: 'OK',
    body: 'Puedes moverte entre preguntas con Anterior y Siguiente. El boton Revisar valida la respuesta sin cambiarte de pregunta.'
  },
  {
    title: 'Colores de progreso',
    icon: 'RGB',
    body: 'Los circulos verdes son preguntas correctas, los rojos necesitan correccion y los grises aun estan pendientes.'
  },
  {
    title: 'Recompensas',
    icon: 'XP',
    body: 'Al responder correctamente preguntas nuevas ganas monedas y XP. Las monedas sirven para comprar skins.'
  },
  {
    title: 'Menu lateral',
    icon: 'MENU',
    body: 'Abre el menu de tres lineas para ver tu progreso, cambiar skins, pedir ayuda de Python, volver al mapa principal o cerrar sesion.'
  },
  {
    title: 'Progreso',
    icon: 'PROG',
    body: 'En Progreso puedes revisar temas, dificultades, niveles y preguntas correctas, pendientes o por corregir.'
  }
];

const difficultyColors = {
  facil: 0x22c55e,
  medio: 0xf59e0b,
  dificil: 0xef4444
};

const difficultyModels = {
  facil: 'facil',
  medio: 'medio',
  dificil: 'dificil'
};

const themeSceneModels = [
  'scene1',
  'scene2',
  'scene3',
  'scene4',
  'scene5',
  'scene6',
  'scene7',
  'scene8'
];

const HUB_PORTAL_CENTER = { x: -3.5, z: -5 };
const HUB_THEME_PORTAL_POSITIONS = [
  { x: -5.260, z: 4.623 },
  { x: -10.564, z: -0.621 },
  { x: -8.811, z: -8.612 },
  { x: 8.165, z: -9.328 },
  { x: -4.353, z: -12.860 },
  { x: 4.525, z: -13.107 },
  { x: 10.797, z: -3.018 },
  { x: 4.636, z: 4.530 }
];
const HUB_STORE_PORTAL_POSITION = { x: -0.071, z: 12.402 };
const HUB_PROMPT_LABEL_POSITION = { x: -0.121, z: -6.468 };

// Audio ambiental por escena. Los archivos viven en /audio.
// 'main' = hub. audio1..audio8 = cada escenario 3D (scene1..scene8).
// scene9 todavía no tiene audio: mostramos un aviso.
const AUDIO_BASE = '/audio';
const AUDIO_EXTENSIONS = ['opus', 'ogg', 'mp3', 'wav', 'm4a', 'aac'];
// GUIA FRONTEND: audio ambiental.
// Relaciona cada mapa/escena con el archivo base en public/audio.
const SCENE_AUDIO = {
  main_map: 'main',
  scene1: 'audio1',
  scene2: 'audio2',
  scene3: 'audio3',
  scene4: 'audio4',
  scene5: 'audio5',
  scene6: 'audio6',
  scene7: 'audio7',
  scene8: 'audio8',
  scene9: null // "Será añadido pronto"
};

// Ajuste fino vertical por mapa. Algunos OBJ tienen geometría muy por debajo
// de su suelo visible, lo que al "aterrizarlos" los deja flotando.
// El valor es la fracción de la altura escalada que se baja el modelo.
const MAP_GROUND_OFFSET_RATIO = {
  main_map: 0.25, // el mapa principal venía levantado ~25%
  scene1: 0, 
  scene2: 0, //tipos de datos
  scene3: 0.25, // expresiones, mover eje
  scene4: -0.06, //funciones
  scene5: 0.16, // condicionales
  scene6: 0.65, // bucles
  scene7: 0, // estructuras de datos
  scene8: -0.06, // texto plano
};
//gffhggh
// GUIA FRONTEND: mover o rotar mapas OBJ por separado.
// Usa estos ajustes cuando un mapa este corrido lateralmente, volteado o mal orientado.
// x/y/z mueven el mapa. rotX/rotY/rotZ rotan en radianes. scale agranda o reduce.
// Ejemplos:
// scene3: { x: 1.5, z: -2, rotY: Math.PI / 2 }
// scene5: { y: -0.8, rotY: Math.PI, scale: 1.05 }
const MAP_MODEL_TRANSFORMS = {
  main_map: {},
  scene1: {},
  scene2: {},
  scene3: { x: 1.8, z: -4},
  scene5: {rotX: Math.PI / 2},
  scene6: {},
  scene7: {},
  scene8: {},
  scene9: {}
};

let currentAudio = null;
let currentAudioKey = null;

// GUIA FRONTEND: cliente API.
// Todas las llamadas fetch al backend estan centralizadas aqui.
// Busca rutas como /api/progress, /api/teacher/groups o /api/minigame/check.
const api = {
  async request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(data.error || 'Error de servidor');
    return data;
  },
  login(username, password) {
    return this.request('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },
  registerTeacher(username, password) {
    return this.request('/api/teachers/register', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },
  state() {
    return this.request('/api/game/state');
  },
  progress() {
    return this.request('/api/progress');
  },
  questions(tema, dificultad, blockNumber = null) {
    const params = new URLSearchParams({ tema, dificultad });
    if (blockNumber) params.set('block', String(blockNumber));
    return this.request(`/api/questions?${params.toString()}`);
  },
  submit(answers) {
    return this.request('/api/minigame/submit', {
      method: 'POST',
      body: JSON.stringify({ answers })
    });
  },
  check(questionId, answer) {
    return this.request('/api/minigame/check', {
      method: 'POST',
      body: JSON.stringify({ questionId, answer })
    });
  },
  buySkin(skinId) {
    return this.request('/api/skins/buy', {
      method: 'POST',
      body: JSON.stringify({ skinId })
    });
  },
  selectSkin(skinId) {
    return this.request('/api/skins/select', {
      method: 'POST',
      body: JSON.stringify({ skinId })
    });
  },
  saveMap(mapCode, themeSlug) {
    return this.request('/api/map/last', {
      method: 'POST',
      body: JSON.stringify({ mapCode, themeSlug })
    }).catch(() => null);
  },
  teacherGroups() {
    return this.request('/api/teacher/groups');
  },
  createTeacherGroup(numero, name, description, maxStudents) {
    return this.request('/api/teacher/groups', {
      method: 'POST',
      body: JSON.stringify({ numero, name, description, maxStudents })
    });
  },
  teacherStudents(groupId) {
    return this.request(`/api/teacher/groups/${encodeURIComponent(groupId)}/students`);
  },
  allTeacherStudents() {
    return this.request('/api/teacher/students');
  },
  enrollStudents(groupId, studentIds) {
    return this.request(`/api/teacher/groups/${encodeURIComponent(groupId)}/students`, {
      method: 'POST',
      body: JSON.stringify({ studentIds })
    });
  },
  joinGroup(joinCode) {
    return this.request('/api/student/groups/join', {
      method: 'POST',
      body: JSON.stringify({ joinCode })
    });
  },
  createTeacherStudent(username, password, groupId) {
    return this.request('/api/teacher/students', {
      method: 'POST',
      body: JSON.stringify({ username, password, groupId })
    });
  },
  chat(messages) {
    return this.request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages })
    });
  }
};

function show(element) {
  element.classList.remove('hidden');
}

function hide(element) {
  element.classList.add('hidden');
}

function toast(message) {
  $('toast').textContent = message;
  show($('toast'));
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => hide($('toast')), 2500);
}

function setAuthMessage(message) {
  $('authMsg').textContent = message || '';
}

function setTeacherRegisterMessage(message) {
  $('teacherRegisterMsg').textContent = message || '';
}

// --- Audio ambiental por escena -------------------------------------------

function stopSceneAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  currentAudioKey = null;
}

// Intenta reproducir el primer formato disponible para un nombre base dado.
function tryPlayAudio(baseName, sceneKey, extIndex = 0) {
  if (extIndex >= AUDIO_EXTENSIONS.length) {
    console.warn(`No se encontró audio para "${baseName}" en /audio (formatos probados: ${AUDIO_EXTENSIONS.join(', ')}).`);
    return;
  }

  const url = `${AUDIO_BASE}/${baseName}.${AUDIO_EXTENSIONS[extIndex]}`;
  const audio = new Audio(url);
  audio.loop = true;
  audio.volume = 0.55;

  audio.addEventListener('error', () => {
    // Ese formato no existe; probamos el siguiente.
    tryPlayAudio(baseName, sceneKey, extIndex + 1);
  }, { once: true });

  audio.addEventListener('canplaythrough', () => {
    if (currentAudioKey !== sceneKey) return; // cambió de escena mientras cargaba
    currentAudio = audio;
    audio.play().catch(() => {
      // Autoplay bloqueado por el navegador: se reanuda en la primera interacción.
      const resume = () => {
        if (currentAudio === audio) audio.play().catch(() => {});
        window.removeEventListener('pointerdown', resume);
        window.removeEventListener('keydown', resume);
      };
      window.addEventListener('pointerdown', resume, { once: true });
      window.addEventListener('keydown', resume, { once: true });
    });
  }, { once: true });

  audio.load();
}

// Reproduce automáticamente el audio de la escena indicada por su modelo de mapa.
function playSceneAudio(mapModelCode) {
  if (currentAudioKey === mapModelCode) return; // ya sonando esa escena

  // scene9 está reservada pero aún sin audio.
  if (mapModelCode === 'scene9') {
    stopSceneAudio();
    currentAudioKey = mapModelCode;
    toast('Audio del escenario 9: Sera anadido pronto');
    return;
  }

  const baseName = SCENE_AUDIO[mapModelCode];
  stopSceneAudio();
  currentAudioKey = mapModelCode;

  if (!baseName) {
    if (Object.prototype.hasOwnProperty.call(SCENE_AUDIO, mapModelCode)) {
      toast('Audio de este escenario: Sera anadido pronto');
    }
    return;
  }

  tryPlayAudio(baseName, mapModelCode);
}

// GUIA FRONTEND: login y registro.
// Estas funciones cambian entre pantalla inicial, login alumno/profesor y registro de profesor.
function showRoleChoice() {
  selectedAuthRole = 'profesor';
  document.body.classList.add('auth-mode');
  hide($('auth'));
  hide($('teacherRegister'));
  hide($('hud'));
  hide($('sideMenu'));
  hide($('sideMenuBackdrop'));
  hide($('logoutConfirm'));
  hide($('joinGroupPanel'));
  hide($('tutorialPanel'));
  hide($('teacherDashboard'));
  hide($('portalInfo'));
  hide($('minigame'));
  hide($('skinsPanel'));
  hide($('progressPanel'));
  hide($('chatPanel'));
  show($('roleChoice'));
  setAuthMessage('');
  setTeacherRegisterMessage('');
}

function openTeacherRegister() {
  selectedAuthRole = null;
  hide($('roleChoice'));
  hide($('auth'));
  show($('teacherRegister'));
  $('teacherRegisterUsername').value = '';
  $('teacherRegisterPassword').value = '';
  setTeacherRegisterMessage('');
}

async function registerTeacher() {
  const username = $('teacherRegisterUsername').value.trim();
  const password = $('teacherRegisterPassword').value;
  setTeacherRegisterMessage('');

  try {
    const data = await api.registerTeacher(username, password);
    if (!data.token || !data.state) throw new Error('Profesor creado, pero no se pudo iniciar sesion automaticamente.');
    token = data.token;
    localStorage.setItem('capy_token', token);
    state = data.state;
    afterLogin();
  } catch (error) {
    setTeacherRegisterMessage(error.message);
  }
}

function openAuth(role) {
  selectedAuthRole = role;
  hide($('roleChoice'));
  hide($('teacherRegister'));
  show($('auth'));
  $('authTitle').textContent = 'Iniciar sesion';
  $('authSubtitle').textContent = 'Entra con tu correo o usuario y contraseña.';
  $('username').value = '';
  $('password').value = '';
  setAuthMessage('');
  $('authTitle').textContent = role === 'profesor' ? 'Acceso profesor' : 'Acceso alumno';
  $('authSubtitle').textContent = role === 'profesor'
    ? 'Inicia sesion para abrir el dashboard.'
    : 'Inicia sesion con la cuenta creada por tu profesor.';
}

async function enter() {
  const username = $('username').value.trim();
  const password = $('password').value;
  setAuthMessage('');

  try {
    const data = await api.login(username, password);

    if (selectedAuthRole && data.state?.user?.role !== selectedAuthRole) {
      throw new Error(selectedAuthRole === 'profesor'
        ? 'Esta cuenta no es de profesor.'
        : 'Esta cuenta no es de alumno.');
    }

    token = data.token;
    localStorage.setItem('capy_token', token);
    state = data.state;
    afterLogin();
  } catch (error) {
    setAuthMessage(error.message);
  }
}

function logout() {
  token = '';
  state = null;
  session = null;
  selectedTeacherGroupId = null;
  stopSceneAudio();
  localStorage.removeItem('capy_token');
  showRoleChoice();
}

async function restore() {
  if (!token) {
    showRoleChoice();
    return;
  }

  try {
    state = await api.state();
    afterLogin();
  } catch {
    logout();
  }
}

function afterLogin() {
  document.body.classList.remove('auth-mode');
  hide($('roleChoice'));
  hide($('auth'));
  hide($('teacherRegister'));
  hide($('minigame'));
  hide($('skinsPanel'));
  hide($('progressPanel'));
  hide($('chatPanel'));
  hide($('sideMenu'));
  hide($('sideMenuBackdrop'));
  hide($('logoutConfirm'));
  hide($('joinGroupPanel'));
  hide($('tutorialPanel'));

  if (state?.user?.role === 'profesor') {
    hide($('hud'));
    hide($('portalInfo'));
    show($('teacherDashboard'));
    stopSceneAudio();
    openTeacherDashboard();
    return;
  }

  hide($('teacherDashboard'));
  show($('hud'));

  const savedMap = state?.stats?.last_map_code || 'hub';
  const savedTheme = state?.stats?.last_theme_slug || null;
  const themeExists = savedTheme && state.map.temas.some(tema => tema.slug === savedTheme);
  currentMap = savedMap !== 'hub' && themeExists
    ? { code: savedMap, theme: savedTheme }
    : { code: 'hub', theme: null };

  renderHud();
  buildWorld();
  renderSkins();
}

// GUIA FRONTEND: dashboard profesor.
// Carga grupos, alumnos, inscripciones, estadisticas grupales y perfiles de alumnos.
async function openTeacherDashboard() {
  $('teacherName').textContent = state?.user?.username ? `Sesión: ${state.user.username}` : '';
  await loadAllTeacherStudents();
  await loadTeacherGroups();
}

async function loadAllTeacherStudents() {
  try {
    const data = await api.allTeacherStudents();
    allTeacherStudents = data.students || [];
    renderAllStudentsList();
  } catch (error) {
    toast(error.message);
  }
}

async function loadTeacherGroups() {
  try {
    const data = await api.teacherGroups();
    teacherGroups = data.groups || [];
    if (!selectedTeacherGroupId && teacherGroups.length) selectedTeacherGroupId = teacherGroups[0].id;
    if (selectedTeacherGroupId && !teacherGroups.some(group => group.id === selectedTeacherGroupId)) {
      selectedTeacherGroupId = teacherGroups[0]?.id || null;
    }
    renderTeacherGroups();
    if (selectedTeacherGroupId) await loadTeacherStudents(selectedTeacherGroupId);
    else renderNoTeacherGroups();
  } catch (error) {
    toast(error.message);
  }
}

function renderTeacherGroups() {
  $('groupsList').innerHTML = teacherGroups.length
    ? teacherGroups.map(group => `
      <button class="group-card ${group.id === selectedTeacherGroupId ? 'selected' : ''}" data-group-id="${group.id}">
        <strong>Grupo ${escapeHtml(group.numero)} · ${escapeHtml(group.name)}</strong>
        <span>Codigo ${escapeHtml(group.joinCode || 'pendiente')} · ${group.studentCount}${group.maxStudents ? `/${group.maxStudents}` : ''} alumnos</span>
      </button>
    `).join('')
    : '<p class="empty-state">Aún no hay grupos.</p>';

  $('studentGroupSelect').innerHTML = teacherGroups.map(group => `
    <option value="${group.id}" ${group.id === selectedTeacherGroupId ? 'selected' : ''}>
      Grupo ${escapeHtml(group.numero)} · ${escapeHtml(group.name)}
    </option>
  `).join('');

  document.querySelectorAll('[data-group-id]').forEach(button => {
    button.addEventListener('click', async () => {
      selectedTeacherGroupId = Number(button.dataset.groupId);
      renderTeacherGroups();
      await loadTeacherStudents(selectedTeacherGroupId);
    });
  });
}

function renderNoTeacherGroups() {
  $('selectedGroupTitle').textContent = 'Crea un grupo para empezar';
  $('selectedGroupMeta').textContent = 'Después podrás agregar alumnos y revisar su avance.';
  $('studentsList').innerHTML = '<p class="empty-state">Sin grupo seleccionado.</p>';
  hide($('groupStats'));
  $('groupStats').innerHTML = '';
  hide($('studentDetail'));
  $('studentDetail').innerHTML = '';
  currentTeacherGroupStudents = [];
  selectedTeacherStudentId = null;
  renderAllStudentsList();
}

async function saveTeacherGroup() {
  const numero = Number($('groupNumber').value);
  const name = $('groupName').value.trim();
  const description = $('groupDescription').value.trim();
  const maxStudents = Number($('groupMaxStudents').value) || null;

  try {
    await api.createTeacherGroup(numero, name, description, maxStudents);
    $('groupNumber').value = '';
    $('groupName').value = '';
    $('groupMaxStudents').value = '';
    $('groupDescription').value = '';
    toast('Grupo guardado.');
    await loadTeacherGroups();
  } catch (error) {
    toast(error.message);
  }
}

async function saveTeacherStudent() {
  const username = $('studentUsername').value.trim();
  const password = $('studentPassword').value;
  const groupId = Number($('studentGroupSelect').value || selectedTeacherGroupId);

  try {
    await api.createTeacherStudent(username, password, groupId);
    $('studentUsername').value = '';
    $('studentPassword').value = '';
    selectedTeacherGroupId = groupId;
    toast('Alumno agregado.');
    await loadTeacherGroups();
    await loadTeacherStudents(groupId);
  } catch (error) {
    toast(error.message);
  }
}

async function loadTeacherStudents(groupId) {
  try {
    const data = await api.teacherStudents(groupId);
    const group = data.group;
    $('selectedGroupTitle').textContent = `Grupo ${group.numero} · ${group.name}`;
    $('selectedGroupMeta').textContent = group.description || 'Sin descripción';
    currentTeacherGroupStudents = data.students || [];
    selectedTeacherStudentId = null;
    $('selectedGroupMeta').textContent = `Codigo ${group.joinCode || 'pendiente'} · ${currentTeacherGroupStudents.length}${group.maxStudents ? `/${group.maxStudents}` : ''} alumnos${group.description ? ` · ${group.description}` : ''}`;
    hide($('studentDetail'));
    $('studentDetail').innerHTML = '';
    renderGroupStats(currentTeacherGroupStudents);
    renderAllStudentsList();
    renderTeacherStudents(currentTeacherGroupStudents);
  } catch (error) {
    toast(error.message);
  }
}

function renderTeacherStudents(students) {
  if (!students.length) {
    $('studentsList').innerHTML = '<p class="empty-state">Este grupo todavía no tiene alumnos.</p>';
    hide($('groupStats'));
    $('groupStats').innerHTML = '';
    hide($('studentDetail'));
    $('studentDetail').innerHTML = '';
    return;
  }

  $('studentsList').innerHTML = students.map(student => `
    <article class="student-card">
      <h4>${escapeHtml(student.username)}</h4>
      <div class="student-progress">
        ${student.progress.map(tema => `
          <div class="progress-row">
            <strong>${escapeHtml(tema.name)}</strong>
            ${tema.difficulties.map(diff => `
              <span class="progress-pill ${diff.completed ? 'done' : ''}">
                ${escapeHtml(diff.name)}: Nivel ${diff.currentLevel}/${diff.totalLevels} · ${diff.currentIndex}/${diff.total} · ${diff.percent}%
              </span>
            `).join('')}
          </div>
        `).join('')}
      </div>
    </article>
  `).join('');

  $('studentsList').innerHTML = students.map(student => `
    <button class="student-card ${Number(student.id) === Number(selectedTeacherStudentId) ? 'selected' : ''}" data-student-id="${student.id}">
      <h4>${escapeHtml(student.username)}</h4>
      <span>${student.progress.reduce((sum, tema) => sum + tema.difficulties.reduce((inner, diff) => inner + diff.correct, 0), 0)} correctas</span>
      <small>Ver progreso detallado</small>
    </button>
  `).join('');

  document.querySelectorAll('[data-student-id]').forEach(button => {
    button.addEventListener('click', () => {
      selectedTeacherStudentId = Number(button.dataset.studentId);
      renderTeacherStudents(currentTeacherGroupStudents);
      renderSelectedTeacherStudent();
    });
  });
}

function renderGroupStats(students) {
  if (!students.length) {
    show($('groupStats'));
    $('groupStats').innerHTML = '<p class="empty-state">Sin estadisticas grupales todavia.</p>';
    return;
  }

  const themeTotals = new Map();
  const levelTotals = new Map();

  for (const student of students) {
    for (const tema of student.progress || []) {
      if (!themeTotals.has(tema.slug)) {
        themeTotals.set(tema.slug, { name: tema.name, percentSum: 0, correct: 0, answered: 0, total: 0, count: 0 });
      }

      const themeTotal = tema.difficulties.reduce((sum, diff) => sum + diff.percent, 0);
      const average = tema.difficulties.length ? themeTotal / tema.difficulties.length : 0;
      const themeBucket = themeTotals.get(tema.slug);
      themeBucket.percentSum += average;
      themeBucket.correct += tema.difficulties.reduce((sum, diff) => sum + diff.correct, 0);
      themeBucket.answered += tema.difficulties.reduce((sum, diff) => sum + diff.answered, 0);
      themeBucket.total += tema.difficulties.reduce((sum, diff) => sum + diff.total, 0);
      themeBucket.count += 1;

      for (const diff of tema.difficulties) {
        for (const level of diff.levels || []) {
          const key = `${tema.slug}:${diff.slug}:${level.number}`;
          if (!levelTotals.has(key)) {
            levelTotals.set(key, {
              name: `${tema.name} - ${diff.name} - ${level.name}`,
              correct: 0,
              answered: 0,
              total: 0
            });
          }
          const levelBucket = levelTotals.get(key);
          levelBucket.correct += Number(level.correct || 0);
          levelBucket.answered += Number(level.answered || 0);
          levelBucket.total += Number(level.total || 0);
        }
      }
    }
  }

  show($('groupStats'));
  $('groupStats').innerHTML = `
    <h3>Progreso general del grupo</h3>
    <h4>Promedio por mundo</h4>
    <div class="group-stat-grid">
      ${[...themeTotals.values()].map(item => {
        const percent = Math.round(item.percentSum / Math.max(1, item.count));
        return `
          <div class="group-stat-card">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${percent}% promedio</span>
            <span>${item.correct}/${item.total} correctas - ${item.answered} contestadas</span>
            <span class="mini-bar"><i style="width: ${percent}%"></i></span>
          </div>
        `;
      }).join('')}
    </div>
    <h4>Promedio por nivel</h4>
    <div class="group-stat-grid">
      ${[...levelTotals.values()].map(item => {
        const percent = item.total ? Math.round((item.correct / item.total) * 100) : 0;
        return `
          <div class="group-stat-card">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${percent}% correcto</span>
            <span>${item.correct}/${item.total} correctas - ${item.answered} contestadas</span>
            <span class="mini-bar"><i style="width: ${percent}%"></i></span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderSelectedTeacherStudent() {
  const student = currentTeacherGroupStudents.find(item => Number(item.id) === Number(selectedTeacherStudentId));
  if (!student) {
    hide($('studentDetail'));
    $('studentDetail').innerHTML = '';
    return;
  }

  show($('studentDetail'));
  const totalQuestions = student.progress.reduce((sum, tema) => (
    sum + tema.difficulties.reduce((inner, diff) => inner + diff.total, 0)
  ), 0);
  const totalCorrect = student.progress.reduce((sum, tema) => (
    sum + tema.difficulties.reduce((inner, diff) => inner + diff.correct, 0)
  ), 0);
  const totalAnswered = student.progress.reduce((sum, tema) => (
    sum + tema.difficulties.reduce((inner, diff) => inner + diff.answered, 0)
  ), 0);

  $('studentDetail').innerHTML = `
    <div class="student-detail-head">
      <div>
        <h3>${escapeHtml(student.username)}</h3>
        <p>${totalCorrect}/${totalQuestions} correctas - ${totalAnswered} respondidas</p>
      </div>
      <button class="secondary" id="closeStudentDetailBtn">Cerrar</button>
    </div>
    ${student.progress.map(theme => renderTeacherStudentTheme(theme)).join('')}
  `;

  $('closeStudentDetailBtn').addEventListener('click', () => {
    selectedTeacherStudentId = null;
    renderTeacherStudents(currentTeacherGroupStudents);
    hide($('studentDetail'));
    $('studentDetail').innerHTML = '';
  });
}

function renderTeacherStudentTheme(theme) {
  const total = theme.difficulties.reduce((sum, diff) => sum + diff.total, 0);
  const correct = theme.difficulties.reduce((sum, diff) => sum + diff.correct, 0);
  const percent = total ? Math.round((correct / total) * 100) : 100;

  return `
    <section class="student-detail-theme">
      <div class="student-detail-theme-head">
        <strong>${escapeHtml(theme.name)}</strong>
        <span>${correct}/${total} correctas</span>
        <span class="mini-bar"><i style="width: ${percent}%"></i></span>
      </div>
      <div class="progress-difficulty-cards">
        ${theme.difficulties.map(diff => `
          <div class="difficulty-summary">
            <strong>${escapeHtml(diff.name)}</strong>
            <span>${diff.currentIndex}/${diff.total} avance</span>
            <span>${diff.correct} correctas</span>
            <span class="mini-bar"><i style="width: ${diff.percent}%"></i></span>
          </div>
        `).join('')}
      </div>
      <div class="level-card-grid">
        ${theme.difficulties.flatMap(diff => (diff.levels || []).map(level => {
          const status = level.locked ? 'locked' : level.completed ? 'completed' : level.current ? 'current' : 'open';
          return `
            <div class="level-card ${status}">
              <strong>${escapeHtml(diff.name)} - ${escapeHtml(level.name)}</strong>
              <span>Preguntas ${level.startQuestion}-${level.endQuestion}</span>
              <span>${level.correct}/${level.total} correctas</span>
            </div>
          `;
        })).join('')}
      </div>
    </section>
  `;
}

function renderAllStudentsList() {
  const box = $('allStudentsList');
  if (!box) return;
  const query = ($('studentSearch')?.value || '').trim().toLowerCase();
  const enrolledIds = new Set(currentTeacherGroupStudents.map(student => Number(student.id)));
  const visible = allTeacherStudents.filter(student => {
    if (enrolledIds.has(Number(student.id))) return false;
    return !query || student.username.toLowerCase().includes(query);
  });

  box.innerHTML = visible.length
    ? visible.map(student => `
      <label class="student-check">
        <input type="checkbox" value="${student.id}">
        <span>${escapeHtml(student.username)}</span>
      </label>
    `).join('')
    : '<p class="empty-state">No hay alumnos disponibles para agregar.</p>';
}

async function enrollSelectedStudents() {
  if (!selectedTeacherGroupId) return toast('Selecciona un grupo.');
  const ids = [...document.querySelectorAll('#allStudentsList input:checked')].map(input => Number(input.value));
  if (!ids.length) return toast('Selecciona al menos un alumno.');

  try {
    await api.enrollStudents(selectedTeacherGroupId, ids);
    toast('Alumnos inscritos.');
    await loadAllTeacherStudents();
    await loadTeacherStudents(selectedTeacherGroupId);
    await loadTeacherGroups();
  } catch (error) {
    toast(error.message);
  }
}

// GUIA FRONTEND: HUD y menu lateral del juego.
// Aqui viven progreso, skins, tutorial, unirse a grupo y cierre de sesion.
function renderHud() {
  if (!state) return;

  const mapText = currentMap.theme
    ? titleFromSlug(currentMap.theme)
    : 'Mapa principal';

  $('hudUser').textContent = state.user.username;
  $('hudStats').textContent = `Monedas ${state.stats.coins} · XP ${state.stats.xp}`;
  $('hudMap').textContent = `Mapa: ${mapText}`;
  $('mapBtn').disabled = !currentMap.theme;
  renderAiHelpAvailability();
}

function renderAiHelpAvailability() {
  const isAvailable = Boolean(state?.ai?.pythonHelpAvailable);
  $('chatBtn').classList.toggle('hidden', !isAvailable);
  if (!isAvailable) closeChat();
}

function openSideMenu() {
  show($('sideMenuBackdrop'));
  show($('sideMenu'));
}

function closeSideMenuPanel() {
  hide($('sideMenu'));
  hide($('sideMenuBackdrop'));
}

function askLogout() {
  closeSideMenuPanel();
  show($('logoutConfirm'));
}

function cancelLogout() {
  hide($('logoutConfirm'));
}

function openJoinGroupPanel() {
  closeSideMenuPanel();
  $('joinGroupCode').value = '';
  $('joinGroupMsg').textContent = '';
  show($('joinGroupPanel'));
}

function closeJoinGroupPanel() {
  hide($('joinGroupPanel'));
}

async function joinGroupByCode() {
  const joinCode = $('joinGroupCode').value.trim();
  $('joinGroupMsg').textContent = '';

  try {
    await api.joinGroup(joinCode);
    toast('Te uniste al grupo.');
    closeJoinGroupPanel();
  } catch (error) {
    $('joinGroupMsg').textContent = error.message;
  }
}

function openTutorial() {
  closeSideMenuPanel();
  tutorialIndex = 0;
  renderTutorial();
  show($('tutorialPanel'));
}

function closeTutorial() {
  hide($('tutorialPanel'));
}

function renderTutorial() {
  const slide = tutorialSlides[tutorialIndex];
  $('tutorialTitle').textContent = slide.title;
  $('tutorialCounter').textContent = `Paso ${tutorialIndex + 1} de ${tutorialSlides.length}`;
  $('tutorialBody').innerHTML = `
    <div class="tutorial-icon">${escapeHtml(slide.icon)}</div>
    <p>${escapeHtml(slide.body)}</p>
  `;
  $('tutorialPrev').disabled = tutorialIndex === 0;
  $('tutorialNext').textContent = tutorialIndex === tutorialSlides.length - 1 ? 'Terminar' : 'Siguiente';
}

function previousTutorialSlide() {
  tutorialIndex = Math.max(0, tutorialIndex - 1);
  renderTutorial();
}

function nextTutorialSlide() {
  if (tutorialIndex >= tutorialSlides.length - 1) {
    closeTutorial();
    return;
  }
  tutorialIndex += 1;
  renderTutorial();
}

// GUIA FRONTEND: panel de progreso del alumno.
// Muestra mundos, dificultades, niveles y preguntas correctas/incorrectas/pendientes.
async function openProgress() {
  closeSideMenuPanel();
  show($('progressPanel'));
  $('progressSummary').textContent = 'Cargando progreso...';
  $('progressThemes').innerHTML = '<p class="empty-state">Cargando...</p>';
  $('progressDifficultyCards').innerHTML = '';
  $('progressQuestions').innerHTML = '';

  try {
    progressData = await api.progress();
    if (!selectedProgressTheme) selectedProgressTheme = progressData.themes?.[0]?.slug || null;
    renderProgress();
  } catch (error) {
    $('progressSummary').textContent = 'No se pudo cargar el progreso.';
    $('progressQuestions').innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

function closeProgress() {
  hide($('progressPanel'));
}

function renderProgress() {
  const themes = progressData?.themes || [];
  if (!themes.length) {
    $('progressSummary').textContent = 'No hay temas disponibles.';
    $('progressThemes').innerHTML = '<p class="empty-state">Sin temas.</p>';
    return;
  }

  if (!selectedProgressTheme || !themes.some(theme => theme.slug === selectedProgressTheme)) {
    selectedProgressTheme = themes[0].slug;
  }

  const totalQuestions = themes.reduce((sum, theme) => (
    sum + theme.difficulties.reduce((inner, difficulty) => inner + difficulty.total, 0)
  ), 0);
  const totalCorrect = themes.reduce((sum, theme) => (
    sum + theme.difficulties.reduce((inner, difficulty) => inner + difficulty.correct, 0)
  ), 0);
  const totalAnswered = themes.reduce((sum, theme) => (
    sum + theme.difficulties.reduce((inner, difficulty) => inner + difficulty.answered, 0)
  ), 0);

  $('progressSummary').textContent = `${totalCorrect}/${totalQuestions} correctas · ${totalAnswered} respondidas`;

  $('progressThemes').innerHTML = themes.map(theme => {
    const total = theme.difficulties.reduce((sum, difficulty) => sum + difficulty.total, 0);
    const correct = theme.difficulties.reduce((sum, difficulty) => sum + difficulty.correct, 0);
    const answered = theme.difficulties.reduce((sum, difficulty) => sum + difficulty.answered, 0);
    const percent = total ? Math.round((correct / total) * 100) : 100;

    return `
      <button class="progress-theme-card ${theme.slug === selectedProgressTheme ? 'selected' : ''}" data-progress-theme="${escapeAttr(theme.slug)}">
        <strong>${escapeHtml(theme.name)}</strong>
        <span>${correct}/${total} correctas · ${answered} intentadas</span>
        <span class="mini-bar"><i style="width: ${percent}%"></i></span>
      </button>
    `;
  }).join('');

  document.querySelectorAll('[data-progress-theme]').forEach(button => {
    button.addEventListener('click', () => {
      selectedProgressTheme = button.dataset.progressTheme;
      selectedProgressDifficulty = 'facil';
      selectedProgressFilter = 'all';
      $('progressFilter').value = selectedProgressFilter;
      renderProgress();
    });
  });

  renderSelectedProgressTheme();
}

function renderSelectedProgressTheme() {
  const theme = progressData.themes.find(item => item.slug === selectedProgressTheme);
  if (!theme) return;

  if (!theme.difficulties.some(difficulty => difficulty.slug === selectedProgressDifficulty)) {
    selectedProgressDifficulty = theme.difficulties[0]?.slug || 'facil';
  }

  const total = theme.difficulties.reduce((sum, difficulty) => sum + difficulty.total, 0);
  const correct = theme.difficulties.reduce((sum, difficulty) => sum + difficulty.correct, 0);
  const answered = theme.difficulties.reduce((sum, difficulty) => sum + difficulty.answered, 0);

  $('progressTopicTitle').textContent = theme.name;
  $('progressTopicMeta').textContent = `${correct}/${total} correctas · ${answered} preguntas respondidas`;
  $('progressDifficulty').innerHTML = theme.difficulties.map(difficulty => `
    <option value="${escapeAttr(difficulty.slug)}" ${difficulty.slug === selectedProgressDifficulty ? 'selected' : ''}>
      ${escapeHtml(difficulty.name)}
    </option>
  `).join('');
  $('progressFilter').value = selectedProgressFilter;

  $('progressDifficultyCards').innerHTML = theme.difficulties.map(difficulty => {
    const isSelected = difficulty.slug === selectedProgressDifficulty;
    return `
      <button class="difficulty-summary ${isSelected ? 'selected' : ''}" data-progress-difficulty="${escapeAttr(difficulty.slug)}">
        <strong>${escapeHtml(difficulty.name)}</strong>
        <span>${difficulty.currentIndex}/${difficulty.total} avance</span>
        <span>${difficulty.correct} correctas</span>
        <span class="mini-bar"><i style="width: ${difficulty.percent}%"></i></span>
      </button>
    `;
  }).join('');

  document.querySelectorAll('[data-progress-difficulty]').forEach(button => {
    button.addEventListener('click', () => {
      selectedProgressDifficulty = button.dataset.progressDifficulty;
      $('progressDifficulty').value = selectedProgressDifficulty;
      renderSelectedProgressTheme();
    });
  });

  renderProgressLevels(theme);
  renderProgressQuestions(theme);
}

function renderProgressLevels(theme) {
  const difficulty = theme.difficulties.find(item => item.slug === selectedProgressDifficulty);
  if (!difficulty) {
    $('progressLevels').innerHTML = '';
    return;
  }

  $('progressLevels').innerHTML = `
    <h4>Niveles</h4>
    <div class="level-card-grid">
      ${(difficulty.levels || []).map(level => {
        const status = level.locked ? 'locked' : level.completed ? 'completed' : level.current ? 'current' : 'open';
        const label = level.locked
          ? 'Bloqueado'
          : level.completed
            ? 'Completado'
            : level.current
              ? 'Actual'
              : 'Disponible';
        return `
          <div class="level-card ${status}">
            <strong>${escapeHtml(level.name)}</strong>
            <span>Preguntas ${level.startQuestion}-${level.endQuestion}</span>
            <span>${level.correct}/${level.total} correctas</span>
            <small>${label}</small>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderProgressQuestions(theme) {
  const difficulty = theme.difficulties.find(item => item.slug === selectedProgressDifficulty);
  if (!difficulty) return;

  const visibleQuestions = difficulty.questions.filter(question => {
    if (selectedProgressFilter === 'all') return true;
    return question.status === selectedProgressFilter;
  });

  $('progressQuestions').innerHTML = visibleQuestions.length
    ? visibleQuestions.map(question => {
      const statusText = question.status === 'correct'
        ? 'Correcta'
        : question.status === 'incorrect'
          ? 'Por corregir'
          : 'Pendiente';
      const attemptsText = question.attempts === 1 ? '1 intento' : `${question.attempts} intentos`;
      const dateText = question.lastAnsweredAt ? ` · ${formatProgressDate(question.lastAnsweredAt)}` : '';
      const currentBadge = question.current ? '<span class="current-badge">Sigue aqui</span>' : '';

      return `
        <article class="progress-question ${question.status} ${question.current ? 'current' : ''}">
          <div class="question-status-dot" aria-hidden="true"></div>
          <div>
            <div class="progress-question-head">
              <strong>Pregunta ${question.number}</strong>
              <span>${escapeHtml(statusText)}</span>
              ${currentBadge}
            </div>
            <p>${escapeHtml(question.prompt)}</p>
            <small>${escapeHtml(formatQuestionType(question.type))} · ${attemptsText}${escapeHtml(dateText)}</small>
          </div>
        </article>
      `;
    }).join('')
    : '<p class="empty-state">No hay preguntas con este filtro.</p>';
}

function formatQuestionType(type) {
  const labels = {
    opcion_multiple: 'Opcion multiple',
    ordenar_lineas: 'Ordenar lineas',
    drag_and_drop: 'Completar espacios',
    seleccionar_lineas: 'Seleccionar lineas',
    respuesta_numerica: 'Respuesta numerica'
  };
  return labels[type] || type;
}

function formatProgressDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

// GUIA FRONTEND: Three.js y mundo 3D.
// Desde aqui se crea renderer, camara, jugador, mapas, portales y colisiones.
function selectedSkin() {
  return state?.skins?.find(skin => skin.selected) || state?.skins?.[0];
}

function init3D() {
  renderer = new THREE.WebGLRenderer({ canvas: $('world'), antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121826);
  scene.fog = new THREE.Fog(0x121826, 30, 95);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 220);
  camera.position.set(0, 12, 18);

  const ambient = new THREE.HemisphereLight(0xffffff, 0x0f172a, 2.2);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(10, 18, 12);
  sun.castShadow = true;
  scene.add(sun);

  player = new THREE.Group();
  scene.add(player);

  window.addEventListener('resize', resize);
  window.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key) && !isTypingTarget(event.target)) {
      event.preventDefault();
    }
    keys[key] = true;
    if (key === 'z' && player && !isTypingTarget(event.target)) {
      console.log(`Capybara position x=${player.position.x.toFixed(3)}, z=${player.position.z.toFixed(3)}`);
    }
    if (key === 'e' && !isTypingTarget(event.target)) usePortal();
  });
  window.addEventListener('keyup', event => keys[event.key.toLowerCase()] = false);

  const canvas = $('world');
  canvas.addEventListener('pointerdown', event => {
    isDraggingCamera = true;
    lastPointerX = event.clientX;
  });
  window.addEventListener('pointermove', event => {
    if (!isDraggingCamera) return;
    cameraYaw -= (event.clientX - lastPointerX) * 0.006;
    lastPointerX = event.clientX;
  });
  window.addEventListener('pointerup', () => {
    isDraggingCamera = false;
  });

  resize();
  animate();
}

function resize() {
  if (!renderer || !camera) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function clearWorld() {
  portals = [];
  colliders = [];
  obstacleColliders = [];
  terrainMeshes = [];
  nearestPortal = null;
  labels.forEach(label => {
    disposeObject3D(label);
    scene.remove(label);
  });
  labels = [];

  scene.children
    .filter(child => child.userData.worldItem)
    .forEach(child => {
      disposeObject3D(child);
      scene.remove(child);
    });

  if (player) {
    player.children.forEach(child => disposeObject3D(child));
    player.clear();
  }
}

function disposeObject3D(object) {
  object.traverse(child => {
    if (child.geometry) child.geometry.dispose();

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach(material => {
      Object.values(material).forEach(value => {
        if (value?.isTexture) value.dispose();
      });
      material.dispose();
    });
  });
}

async function buildWorld() {
  if (!scene) init3D();
  const buildId = ++worldBuildId;
  clearWorld();

  createPlayer(selectedSkin(), buildId);

  const activeTheme = currentMap.theme
    ? state.map.temas.find(tema => tema.slug === currentMap.theme)
    : null;

  if (activeTheme) {
    playSceneAudio(themeMapCode(activeTheme.slug));
    await buildThemeMap(activeTheme, buildId);
  } else {
    playSceneAudio('main_map');
    await buildHubMap(buildId);
  }

  if (buildId !== worldBuildId) return;
  player.position.set(0, 0.15, activeTheme ? 7.5 : 0);
  verticalVelocity = 0;
  isGrounded = true;
  renderHud();
}

async function buildHubMap(buildId) {
  await addMapModel('main_map', buildId, { diameter: 46 });

  const temas = state.map.temas;
  const radius = 13.5;

  temas.forEach((tema, index) => {
    const angle = (index / temas.length) * Math.PI * 2;
    const position = HUB_THEME_PORTAL_POSITIONS[index] || {
      x: Math.cos(angle) * radius + HUB_PORTAL_CENTER.x,
      z: Math.sin(angle) * radius + HUB_PORTAL_CENTER.z
    };
    const { x, z } = position;
    const portal = createSimplePortal(0x38bdf8, 1.05);

    portal.position.set(x, 0.1, z);
    portal.userData.worldItem = true;
    portal.userData.portal = {
      kind: 'theme',
      tema: tema.slug,
      temaName: tema.name,
      mapCode: themeMapCode(tema.slug)
    };

    scene.add(portal);
    portals.push(portal);
    addCircleCollider(x, z, 0.95);
    addLabel(tema.name, new THREE.Vector3(x, 2.65, z));
  });

  const storePortal = createSimplePortal(0xef4444, 1.05);
  storePortal.position.set(HUB_STORE_PORTAL_POSITION.x, 0.1, HUB_STORE_PORTAL_POSITION.z);
  storePortal.userData.worldItem = true;
  storePortal.userData.portal = { kind: 'store' };
  scene.add(storePortal);
  portals.push(storePortal);
  addCircleCollider(HUB_STORE_PORTAL_POSITION.x, HUB_STORE_PORTAL_POSITION.z, 0.95);
  addLabel('Tienda', new THREE.Vector3(HUB_STORE_PORTAL_POSITION.x, 2.65, HUB_STORE_PORTAL_POSITION.z));

  addLabel('Elige un mapa con E', new THREE.Vector3(HUB_PROMPT_LABEL_POSITION.x, 3.2, HUB_PROMPT_LABEL_POSITION.z));
}

async function buildThemeMap(tema, buildId) {
  await addMapModel(themeMapCode(tema.slug), buildId, { diameter: 42 });
  addLabel(tema.name, new THREE.Vector3(0, 3.5, -5.5));

  const positions = [
    { slug: 'facil', x: -6.2, z: -4.8 },
    { slug: 'medio', x: 0, z: -6.6 },
    { slug: 'dificil', x: 6.2, z: -4.8 }
  ];

  for (const item of positions) {
    const difficulty = tema.difficulties.find(diff => diff.slug === item.slug);
    if (!difficulty) continue;

    const modelName = difficultyModels[item.slug];
    const portal = await createDifficultyPortal(modelName, difficultyColors[item.slug], buildId);
    if (buildId !== worldBuildId) return;

    portal.position.set(item.x, 0, item.z);
    portal.userData.worldItem = true;
    portal.userData.portal = {
      kind: 'difficulty',
      tema: tema.slug,
      temaName: tema.name,
      dificultad: difficulty.slug,
      dificultadName: difficulty.name,
      total: difficulty.total,
      currentIndex: difficulty.currentIndex,
      answered: difficulty.answered,
      correct: difficulty.correct,
      completed: difficulty.completed
    };

    scene.add(portal);
    portals.push(portal);
    addCircleCollider(item.x, item.z, 1.15);
    addLabel(difficulty.name, new THREE.Vector3(item.x, 2.9, item.z));
  }

  const returnPortal = createSimplePortal(0x93c5fd, 0.92);
  returnPortal.position.set(0, 0.1, 8.4);
  returnPortal.userData.worldItem = true;
  returnPortal.userData.portal = { kind: 'return' };
  scene.add(returnPortal);
  portals.push(returnPortal);
  addLabel('Regresar', new THREE.Vector3(0, 2.4, 8.4));
}

function createSimplePortal(color, scale = 1) {
  const portal = new THREE.Group();
  portal.scale.setScalar(scale);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.96, 0.28, 32),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.22, roughness: 0.55 })
  );
  base.position.y = 0.14;
  portal.add(base);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.08, 14, 36),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.72, roughness: 0.45 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.86;
  portal.add(ring);

  return portal;
}

async function createDifficultyPortal(modelName, fallbackColor, buildId) {
  try {
    const model = await cloneObj('maps', modelName);
    if (buildId !== worldBuildId) return new THREE.Group();
    fitObject(model, { height: 2.2, ground: true });
    model.rotation.y = Math.PI;
    return model;
  } catch (error) {
    console.warn(`No se pudo cargar ${modelName}.obj`, error);
    return createSimplePortal(fallbackColor, 1.05);
  }
}

async function addMapModel(modelName, buildId, options = {}) {
  try {
    const model = await cloneObj('maps', modelName);
    if (buildId !== worldBuildId) return;
    fitObject(model, { diameter: options.diameter || 42, ground: true });

    // Baja el mapa segun su ajuste configurado para que quede pegado al suelo.
    const ratio = MAP_GROUND_OFFSET_RATIO[modelName] || 0;
    if (ratio) {
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      model.position.y -= size.y * ratio;
    }

    model.position.y += options.y || 0;
    model.position.y -= 2;

    const transform = MAP_MODEL_TRANSFORMS[modelName] || {};
    if (transform.scale) model.scale.multiplyScalar(transform.scale);
    model.position.x += transform.x || 0;
    model.position.y += transform.y || 0;
    model.position.z += transform.z || 0;
    model.rotation.x += transform.rotX || 0;
    model.rotation.y += transform.rotY || 0;
    model.rotation.z += transform.rotZ || 0;

    model.userData.worldItem = true;
    registerMapCollisionData(model);
    scene.add(model);
  } catch (error) {
    console.warn(`No se pudo cargar ${modelName}.obj`, error);
    addFallbackFloor();
  }
}

function addFallbackFloor() {
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(24, 80),
    new THREE.MeshStandardMaterial({ color: 0x102030, roughness: 0.92 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.03;
  floor.userData.worldItem = true;
  scene.add(floor);
}

function createPlayer(skin, buildId) {
  playerBody = new THREE.Group();
  player.add(playerBody);
  createFallbackCapy(skin);

  const modelCode = skin?.modelCode || skin?.code || 'capythilda';
  cloneObj('characters', modelCode)
    .then(model => {
      if (buildId !== worldBuildId || !playerBody) return;
      playerBody.children.forEach(child => disposeObject3D(child));
      playerBody.clear();
      fitObject(model, { height: 1.65, ground: true });
      model.rotation.y = 0;
      playerBody.add(model);
    })
    .catch(error => console.warn(`No se pudo cargar ${modelCode}.obj`, error));
}

function createFallbackCapy(skin) {
  const colorA = skin?.colorA || '#b98252';
  const colorB = skin?.colorB || '#f0c08a';

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.74, 24, 18),
    new THREE.MeshStandardMaterial({ color: colorA, roughness: 0.7 })
  );
  body.scale.set(1.4, 0.78, 0.9);
  body.position.y = 0.75;
  playerBody.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 24, 18),
    new THREE.MeshStandardMaterial({ color: colorB, roughness: 0.7 })
  );
  head.scale.set(1.0, 0.84, 0.9);
  head.position.set(0, 0.9, 0.62);
  playerBody.add(head);
}

function loadObj(category, name) {
  const key = `${category}/${name}`;
  if (assetCache.has(key)) return assetCache.get(key);

  const promise = new Promise((resolve, reject) => {
    const mtlLoader = new MTLLoader();
    mtlLoader.setPath(`${ASSET_BASE}/${category}/`);
    mtlLoader.setResourcePath(`${ASSET_BASE}/textures/`);
    mtlLoader.load(`${name}.mtl`, materials => {
      materials.preload();
      const objLoader = new OBJLoader();
      objLoader.setMaterials(materials);
      objLoader.setPath(`${ASSET_BASE}/${category}/`);
      objLoader.load(`${name}.obj`, object => {
        object.traverse(child => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (Array.isArray(child.material)) {
              child.material.forEach(material => material.side = THREE.DoubleSide);
            } else if (child.material) {
              child.material.side = THREE.DoubleSide;
            }
          }
        });
        resolve(object);
      }, undefined, reject);
    }, undefined, reject);
  });

  assetCache.set(key, promise);
  return promise;
}

async function cloneObj(category, name) {
  const source = await loadObj(category, name);
  return source.clone(true);
}

function fitObject(object, options = {}) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);

  if (options.height) {
    const scale = options.height / Math.max(size.y, 0.001);
    object.scale.multiplyScalar(scale);
  } else if (options.diameter) {
    const maxXZ = Math.max(size.x, size.z, 0.001);
    object.scale.multiplyScalar(options.diameter / maxXZ);
  }

  const scaledBox = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  scaledBox.getCenter(center);

  object.position.x -= center.x;
  object.position.z -= center.z;
  if (options.ground) object.position.y -= scaledBox.min.y;
}

function addLabel(text, position) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
  ctx.roundRect(8, 24, 496, 76, 22);
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 34px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.position.copy(position);
  sprite.scale.set(4.4, 1.1, 1);
  sprite.userData.worldItem = true;
  scene.add(sprite);
  labels.push(sprite);
}

function isTypingTarget(target) {
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName);
}

function addCircleCollider(x, z, radius) {
  colliders.push({ x, z, radius });
}

function registerMapCollisionData(root) {
  root.updateMatrixWorld(true);
  const rootBox = new THREE.Box3().setFromObject(root);
  const rootSize = new THREE.Vector3();
  rootBox.getSize(rootSize);
  root.traverse(child => {
    if (!child.isMesh) return;

    const box = new THREE.Box3().setFromObject(child);
    const size = new THREE.Vector3();
    box.getSize(size);

    const isTerrain = size.x > 1.2 && size.z > 1.2 && size.y < 3.0;
    if (isTerrain) {
      terrainMeshes.push(child);
      return;
    }

    const tooFlat = size.y < 0.35;
    const tooHuge = size.x > rootSize.x * 0.86 && size.z > rootSize.z * 0.86;
    if (!tooFlat && !tooHuge) {
      obstacleColliders.push({ box });
    }
  });
}

function terrainHeightAt(x, z) {
  if (!terrainMeshes.length) return 0.15;

  downRaycaster.set(new THREE.Vector3(x, 120, z), new THREE.Vector3(0, -1, 0));
  const hits = downRaycaster.intersectObjects(terrainMeshes, false);
  return hits.length ? hits[0].point.y + 0.15 : 0.15;
}

function isBlockedAt(x, z, y = player.position.y) {
  const playerRadius = 0.46;
  const playerHeight = 1.65;
  const limit = currentMap.theme ? 17.5 : 20.5;
  if (Math.hypot(x, z) > limit) return true;

  if (colliders.some(collider => {
    const minDistance = collider.radius + playerRadius;
    return Math.hypot(x - collider.x, z - collider.z) < minDistance;
  })) return true;

  const playerBox = new THREE.Box3(
    new THREE.Vector3(x - playerRadius, y, z - playerRadius),
    new THREE.Vector3(x + playerRadius, y + playerHeight, z + playerRadius)
  );

  return obstacleColliders.some(collider => playerBox.intersectsBox(collider.box));
}

function tryMovePlayer(dx, dz) {
  const maxStepUp = 0.42;

  const tryAxis = (nextX, nextZ) => {
    const targetGround = terrainHeightAt(nextX, nextZ);
    if (targetGround - player.position.y > maxStepUp) return false;
    if (isBlockedAt(nextX, nextZ, Math.max(player.position.y, targetGround))) return false;

    player.position.x = nextX;
    player.position.z = nextZ;

    if (isGrounded) {
      player.position.y = targetGround;
      verticalVelocity = 0;
    }
    return true;
  };

  tryAxis(player.position.x + dx, player.position.z);
  tryAxis(player.position.x, player.position.z + dz);
}

function animate() {
  requestAnimationFrame(animate);

  if (player && state && !session && state.user?.role !== 'profesor') {
    updatePlayer();
    updatePortalInfo();
  }

  if (player) {
    const arrowSpeed = 0.035;
    if (keys.arrowleft) cameraYaw += arrowSpeed;
    if (keys.arrowright) cameraYaw -= arrowSpeed;
    if (keys.arrowup) cameraDistance = Math.max(9, cameraDistance - 0.12);
    if (keys.arrowdown) cameraDistance = Math.min(24, cameraDistance + 0.12);

    const offset = new THREE.Vector3(
      Math.sin(cameraYaw) * cameraDistance,
      cameraHeight,
      Math.cos(cameraYaw) * cameraDistance
    );
    const target = new THREE.Vector3(player.position.x, player.position.y + 0.7, player.position.z).add(offset);
    camera.position.lerp(target, 0.07);
    camera.lookAt(player.position.x, player.position.y + 0.7, player.position.z);
  }

  renderer.render(scene, camera);
}

function updatePlayer() {
  const speed = 0.115;
  const input = new THREE.Vector3();

  if (keys.w) input.z += 1;
  if (keys.s) input.z -= 1;
  if (keys.a) input.x -= 1;
  if (keys.d) input.x += 1;

  if (input.lengthSq() > 0) {
    input.normalize();

    const forward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    const right = new THREE.Vector3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
    const move = new THREE.Vector3()
      .addScaledVector(forward, input.z)
      .addScaledVector(right, input.x)
      .normalize();

    tryMovePlayer(move.x * speed, move.z * speed);
    if (playerBody) playerBody.rotation.y = Math.atan2(move.x, move.z);
  }

  const groundY = terrainHeightAt(player.position.x, player.position.z);
  if ((keys[' '] || keys.spacebar) && isGrounded) {
    verticalVelocity = 0.21;
    isGrounded = false;
  }

  verticalVelocity -= 0.012;
  player.position.y += verticalVelocity;

  if (player.position.y <= groundY) {
    player.position.y = groundY;
    verticalVelocity = 0;
    isGrounded = true;
  } else {
    isGrounded = false;
  }
}

function updatePortalInfo() {
  nearestPortal = null;
  let nearestDistance = Infinity;

  for (const portal of portals) {
    const distance = portal.position.distanceTo(player.position);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestPortal = portal;
    }
  }

  if (!nearestPortal || nearestDistance > 2.25) {
    hide($('portalInfo'));
    return;
  }

  const data = nearestPortal.userData.portal;

  if (data.kind === 'theme') {
    $('portalInfo').innerHTML = `
      <strong>${escapeHtml(data.temaName)}</strong><br>
      Presiona <strong>E</strong> para viajar a este mapa
    `;
  } else if (data.kind === 'return') {
    $('portalInfo').innerHTML = 'Presiona <strong>E</strong> para regresar al mapa principal';
  } else if (data.kind === 'store') {
    $('portalInfo').innerHTML = `
      <strong>Tienda</strong><br>
      Presiona <strong>E</strong> para abrir la tienda de skins
    `;
  } else {
    const remaining = Math.max(0, data.total - data.currentIndex);
    $('portalInfo').innerHTML = `
      <strong>${escapeHtml(data.temaName)}</strong> · ${escapeHtml(data.dificultadName)}<br>
      ${data.completed ? 'Completado' : `${data.currentIndex}/${data.total} preguntas completadas · ${data.correct}/${data.total} correctas guardadas · quedan ${remaining}`}<br>
      Presiona <strong>E</strong> para jugar
    `;
  }

  show($('portalInfo'));
}

// GUIA FRONTEND: navegacion por portales.
// Decide si el portal manda a un mundo, dificultad, minijuego o hub.
async function usePortal() {
  if (!nearestPortal || $('portalInfo').classList.contains('hidden')) return;

  const data = nearestPortal.userData.portal;

  if (data.kind === 'theme') {
    currentMap = { code: data.mapCode, theme: data.tema };
    await api.saveMap(currentMap.code, currentMap.theme);
    await buildWorld();
    return;
  }

  if (data.kind === 'return') {
    await goHub();
    return;
  }

  if (data.kind === 'store') {
    openSkins();
    return;
  }

  await startMinigame(data.tema, data.dificultad, data.temaName, data.dificultadName);
}

async function goHub() {
  closeSideMenuPanel();
  currentMap = { code: 'hub', theme: null };
  await api.saveMap('hub', null);
  await buildWorld();
}

// GUIA FRONTEND: minijuego por niveles.
// Carga preguntas, pinta navegacion, revisa respuestas y no avanza hasta que el usuario lo pida.
async function startMinigame(tema, dificultad, temaName, dificultadName, blockNumber = null) {
  try {
    const data = await api.questions(tema, dificultad, blockNumber);
    if (!data.questions.length) {
      toast('No hay preguntas en este nivel.');
      state = await api.state();
      buildWorld();
      return;
    }

    session = {
      tema,
      dificultad,
      temaName,
      dificultadName,
      questions: data.questions,
      block: data.block,
      blocks: data.blocks || [],
      blockNumber: data.blockNumber,
      currentBlock: data.currentBlock,
      totalBlocks: data.totalBlocks,
      totalQuestions: data.total,
      index: 0,
      answers: new Map(),
      result: null
    };

    for (const question of data.questions) {
      if (question.answered) {
        session.answers.set(question.id, {
          questionId: question.id,
          answer: {},
          checked: true,
          correct: Boolean(question.correct),
          attempts: Number(question.attempts || 0),
          saved: true
        });
      }
    }

    $('gameTitle').textContent = `${temaName} · ${dificultadName}`;
    show($('minigame'));
    renderQuestion();
  } catch (error) {
    toast(error.message);
  }
}

function closeMinigame() {
  session = null;
  hide($('minigame'));
}

function codeBlock(lines) {
  if (!lines || !lines.length) return '';
  return `<pre class="code">${escapeHtml(lines.join('\n'))}</pre>`;
}

function renderQuestion() {
  const question = session.questions[session.index];
  const stored = session.answers.get(question.id);

  show($('prevQuestion'));
  show($('checkQuestion'));
  show($('nextQuestion'));
  hide($('submitGame'));

  const block = session.block || {};
  $('gameProgress').textContent = `Nivel ${session.blockNumber} de ${session.totalBlocks} · Preguntas ${block.startQuestion || question.number}-${block.endQuestion || question.number} de ${session.totalQuestions}`;
  $('prevQuestion').disabled = session.index === 0;
  $('nextQuestion').disabled = session.index === session.questions.length - 1;
  $('nextQuestion').textContent = 'Siguiente';
  $('checkQuestion').disabled = Boolean(stored?.correct);
  $('checkQuestion').textContent = stored?.correct ? 'Correcta' : 'Revisar';

  let html = `
    ${renderLevelNavigator()}
    ${renderQuestionStepper()}
    <div class="question-prompt">${escapeHtml(question.prompt)}</div>
    ${codeBlock(question.code)}
  `;

  if (question.tipo === 'opcion_multiple') html += renderMultiple(question);
  if (question.tipo === 'seleccionar_lineas') html += renderSelectLines(question);
  if (question.tipo === 'ordenar_lineas') html += renderOrderLines(question);
  if (question.tipo === 'drag_and_drop') html += renderFill(question);
  if (question.tipo === 'respuesta_numerica') html += renderNumeric(question);

  html += `<div id="questionFeedback" class="question-feedback hidden"></div>`;

  $('questionBox').innerHTML = html;
  wireQuestion(question);
  wireQuestionNavigation();

  if (stored?.checked) {
    const message = stored.feedbackHtml || (stored.correct
      ? 'Respuesta correcta. Puedes avanzar cuando quieras.'
      : 'Respuesta incorrecta. Corrige tu respuesta y vuelve a revisar.');
    showQuestionFeedback(Boolean(stored.correct), message);
  }
}

function renderLevelNavigator() {
  return `
    <div class="level-navigator">
      <label for="levelSelect">Nivel</label>
      <select id="levelSelect">
        ${session.blocks.map(block => `
          <option value="${block.number}" ${block.number === session.blockNumber ? 'selected' : ''} ${block.locked ? 'disabled' : ''}>
            ${escapeHtml(block.name)} · ${block.startQuestion}-${block.endQuestion}${block.locked ? ' · bloqueado' : ''}
          </option>
        `).join('')}
      </select>
    </div>
  `;
}

function renderQuestionStepper() {
  return `
    <div class="question-stepper">
      ${session.questions.map((question, index) => {
        const stored = session.answers.get(question.id);
        const status = stored?.correct
          ? 'correct'
          : stored?.checked
            ? 'incorrect'
            : 'pending';
        return `
          <button class="question-dot ${status} ${index === session.index ? 'active' : ''}" data-question-jump="${index}">
            ${question.number || question.index + 1}
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function wireQuestionNavigation() {
  document.querySelectorAll('[data-question-jump]').forEach(button => {
    button.addEventListener('click', () => {
      saveCurrentAnswer();
      session.index = Number(button.dataset.questionJump);
      renderQuestion();
    });
  });

  const levelSelect = $('levelSelect');
  if (levelSelect) {
    levelSelect.addEventListener('change', async event => {
      await switchMinigameLevel(Number(event.target.value));
    });
  }
}

async function switchMinigameLevel(blockNumber) {
  if (!session || blockNumber === session.blockNumber) return;
  saveCurrentAnswer();
  await startMinigame(
    session.tema,
    session.dificultad,
    session.temaName,
    session.dificultadName,
    blockNumber
  );
}

function showQuestionFeedback(correct, message) {
  const box = $('questionFeedback');
  if (!box) return;
  box.className = `question-feedback ${correct ? 'feedback-good' : 'feedback-bad'}`;
  box.innerHTML = message;
  show(box);
}

function renderMultiple(question) {
  return `<div class="options">${question.opciones.map(option => `
    <button class="option" data-id="${escapeAttr(option.id)}">${escapeHtml(option.id)}. ${escapeHtml(option.text)}</button>
  `).join('')}</div>`;
}

function renderSelectLines(question) {
  return `<div class="lines">${question.lineas.map(line => `
    <button class="line-card" data-id="${escapeAttr(line.id)}">${escapeHtml(line.id)}. ${escapeHtml(line.text)}</button>
  `).join('')}</div>`;
}

function renderOrderLines(question) {
  const previous = session.answers.get(question.id)?.answer?.order;
  const lines = previous
    ? previous.map(id => question.lineas.find(line => line.id === id)).filter(Boolean)
    : shuffle([...question.lineas]);

  return `<ul id="orderList" class="order-list">${lines.map(line => `
    <li draggable="true" data-id="${escapeAttr(line.id)}">${escapeHtml(line.id)}. ${escapeHtml(line.text)}</li>
  `).join('')}</ul>`;
}

function renderFill(question) {
  return `<div class="template">${question.plantilla.map(line => `
    <div class="template-line">${renderTemplateLine(line, question.banco_palabras)}</div>
  `).join('')}</div>`;
}

function renderTemplateLine(line, bank) {
  return escapeHtml(line).replace(/\{(h\d+)\}/g, (_, key) => {
    const options = bank.map(word => {
      const encoded = JSON.stringify(String(word));
      const label = String(word) === '' ? 'espacio vacío' : String(word);
      return `<option value="${escapeAttr(encoded)}">${escapeHtml(label)}</option>`;
    }).join('');
    return `<select data-hole="${key}"><option value="">...</option>${options}</select>`;
  });
}

function renderNumeric(question) {
  const previous = session.answers.get(question.id)?.answer?.value ?? '';
  return `<input class="numeric" id="numericAnswer" type="number" value="${escapeAttr(previous)}" placeholder="Respuesta">`;
}

function wireQuestion(question) {
  const existing = session.answers.get(question.id)?.answer;

  if (question.tipo === 'opcion_multiple' || question.tipo === 'seleccionar_lineas') {
    const selected = new Set(existing?.selected || []);
    document.querySelectorAll('.option, .line-card').forEach(button => {
      if (selected.has(button.dataset.id)) button.classList.add('selected');
      button.addEventListener('click', () => {
        button.classList.toggle('selected');
        saveCurrentAnswer();
      });
    });
  }

  if (question.tipo === 'ordenar_lineas') {
    document.querySelectorAll('#orderList li').forEach(item => {
      item.addEventListener('dragstart', () => {
        draggedItem = item;
        item.classList.add('selected');
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('selected');
        draggedItem = null;
        saveCurrentAnswer();
      });

      item.addEventListener('dragover', event => event.preventDefault());

      item.addEventListener('drop', event => {
        event.preventDefault();
        if (!draggedItem || draggedItem === item) return;

        const list = $('orderList');
        const items = [...list.children];
        const from = items.indexOf(draggedItem);
        const to = items.indexOf(item);

        if (from < to) item.after(draggedItem);
        else item.before(draggedItem);

        saveCurrentAnswer();
      });
    });
  }

  if (question.tipo === 'drag_and_drop') {
    const fills = existing?.fills || {};
    document.querySelectorAll('select[data-hole]').forEach(select => {
      select.value = Object.prototype.hasOwnProperty.call(fills, select.dataset.hole)
        ? JSON.stringify(String(fills[select.dataset.hole]))
        : '';
      select.addEventListener('change', saveCurrentAnswer);
    });
  }

  if (question.tipo === 'respuesta_numerica') {
    $('numericAnswer').addEventListener('input', saveCurrentAnswer);
  }
}

function readCurrentAnswer() {
  const question = session.questions[session.index];

  if (question.tipo === 'opcion_multiple' || question.tipo === 'seleccionar_lineas') {
    return {
      selected: [...document.querySelectorAll('.option.selected, .line-card.selected')]
        .map(button => button.dataset.id)
    };
  }

  if (question.tipo === 'ordenar_lineas') {
    return {
      order: [...document.querySelectorAll('#orderList li')].map(item => item.dataset.id)
    };
  }

  if (question.tipo === 'drag_and_drop') {
    const fills = {};
    document.querySelectorAll('select[data-hole]').forEach(select => {
      fills[select.dataset.hole] = decodeSelectValue(select.value);
    });
    return { fills };
  }

  if (question.tipo === 'respuesta_numerica') {
    const raw = $('numericAnswer').value.trim();
    return { value: raw === '' ? null : Number(raw) };
  }

  return {};
}

function decodeSelectValue(value) {
  if (value === '') return '';
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function saveCurrentAnswer() {
  if (!session) return;
  const question = session.questions[session.index];
  const existing = session.answers.get(question.id) || {};
  session.answers.set(question.id, { ...existing, questionId: question.id, answer: readCurrentAnswer() });
}

function previousQuestion() {
  // Retroceder es solo conceptual: no toca el progreso guardado en el servidor.
  saveCurrentAnswer();
  session.index = Math.max(0, session.index - 1);
  renderQuestion();
}

function nextQuestion() {
  if (!session) return;
  saveCurrentAnswer();
  session.index = Math.min(session.questions.length - 1, session.index + 1);
  renderQuestion();
}

// GUIA FRONTEND: revisar pregunta actual.
// Llama a /api/minigame/check; ahi se guardan progreso, XP y monedas.
async function checkCurrentQuestion() {
  if (!session || session.checking) return;

  saveCurrentAnswer();
  const question = session.questions[session.index];
  const stored = session.answers.get(question.id);
  const answer = stored ? stored.answer : {};

  session.checking = true;
  $('checkQuestion').disabled = true;
  $('prevQuestion').disabled = true;
  $('nextQuestion').disabled = true;

  try {
    const result = await api.check(question.id, answer);

    // Actualiza monedas/XP y mapa con el estado que devuelve el servidor.
    state = result.state;
    renderHud();
    progressData = null;

    if (!result.correct) {
      const feedbackHtml = 'Respuesta incorrecta. Corrige tu respuesta y vuelve a revisar.';
      session.answers.set(question.id, {
        ...stored,
        questionId: question.id,
        answer,
        checked: true,
        correct: false,
        feedbackHtml
      });
      renderQuestion();
      return;
      showQuestionFeedback(false, 'Respuesta incorrecta. Inténtalo de nuevo para poder avanzar.');
      return;
    }

    const reward = result.rewardCoins
      ? `<br><span class="feedback-reward">🪙 +${result.rewardCoins} · XP +${result.rewardXp}</span>`
      : '';
    const postText = question.post ? `<br>${escapeHtml(question.post)}` : '';
    const allCorrect = session.questions.every(item => {
      if (item.id === question.id) return true;
      return session.answers.get(item.id)?.correct;
    });
    const levelMessage = allCorrect
      ? '<br><span class="feedback-reward">Nivel completado. Ya puedes abrir el siguiente nivel.</span>'
      : '';
    const feedbackHtml = `Correcto.${postText}${reward}${levelMessage}`;
    session.answers.set(question.id, {
      ...stored,
      questionId: question.id,
      answer,
      checked: true,
      correct: true,
      rewardCoins: result.rewardCoins,
      rewardXp: result.rewardXp,
      feedbackHtml
    });
    renderQuestion();
    if (allCorrect || result.levelCompleted) {
      const refreshed = await api.questions(session.tema, session.dificultad, session.blockNumber);
      session.blocks = refreshed.blocks || session.blocks;
      session.block = refreshed.block || session.block;
      session.currentBlock = refreshed.currentBlock || session.currentBlock;
      state = await api.state();
      renderHud();
      buildWorld();
      renderQuestion();
    }
    return;
    showQuestionFeedback(true, `¡Correcto!${postText}${reward}`);

    const isLast = session.index === session.questions.length - 1;

    // Pequeña pausa para que el alumno lea el feedback (post) antes de avanzar.
    setTimeout(() => {
      if (!session) return;
      if (isLast || result.levelCompleted) {
        finishMinigame(result);
      } else {
        session.index += 1;
        renderQuestion();
      }
    }, 1100);
  } catch (error) {
    toast(error.message);
  } finally {
    session.checking = false;
    if ($('checkQuestion')) $('checkQuestion').disabled = Boolean(session.answers.get(question.id)?.correct);
    if ($('nextQuestion')) $('nextQuestion').disabled = session.index === session.questions.length - 1;
    if ($('prevQuestion')) $('prevQuestion').disabled = session.index === 0;
  }
}

function finishMinigame(result) {
  if (!session) return;

  const completed = result.levelCompleted;
  $('questionBox').innerHTML = `
    <div class="result-card">
      <h3>${completed ? '¡Portal completado!' : 'Progreso guardado'}</h3>
      <p>${completed
        ? 'Respondiste correctamente todas las preguntas de este portal.'
        : 'Tu avance quedó guardado en la base de datos. El progreso por nivel solo sube, nunca baja.'}</p>
      <p>Puedes regresar a preguntas anteriores cuando quieras: revisarlas no reduce tu progreso guardado.</p>
    </div>
  `;

  hide($('prevQuestion'));
  hide($('checkQuestion'));
  hide($('nextQuestion'));
  hide($('submitGame'));

  // Refresca el mundo (progreso de portales) sin cerrar la vista de resultado.
  buildWorld();
}

async function submitGame() {
  saveCurrentAnswer();

  const answers = session.questions.map(question => {
    return session.answers.get(question.id) || { questionId: question.id, answer: {} };
  });

  try {
    const result = await api.submit(answers);
    state = result.state;
    renderHud();
    progressData = null;
    buildWorld();
    renderResult(result);
  } catch (error) {
    toast(error.message);
  }
}

function renderResult(result) {
  session.result = result;

  $('questionBox').innerHTML = `
    <div class="result-card">
      <h3>${result.passed ? 'Portal superado' : 'Portal no superado'}</h3>
      <p>Correctas: ${result.correctAnswers}/${result.totalQuestions}</p>
      <p>Ganaste 🪙 ${result.rewardCoins} y XP ${result.rewardXp}</p>
      <p>La base de datos guardó cada pregunta respondida, su respuesta y si fue correcta.</p>
      <div>${result.results.map((item, index) => `
        <p class="${item.correct ? 'result-good' : 'result-bad'}">Pregunta ${index + 1}: ${item.correct ? 'Correcta' : 'Incorrecta'}</p>
      `).join('')}</div>
    </div>
  `;

  hide($('prevQuestion'));
  hide($('checkQuestion'));
  hide($('nextQuestion'));
  hide($('submitGame'));
}

// GUIA FRONTEND: tienda de skins.
// Renderiza skins, compra, seleccion y usa imagenes PNG si existen.
function renderSkins() {
  if (!state) return;

  $('skinsCoins').textContent = `Monedas: ${state.stats.coins}`;
  $('skinsGrid').innerHTML = state.skins.map(skin => {
    const previewImage = skin.previewImage || skinPreviewUrl(skin);
    return `
      <div class="skin-card">
        <div class="skin-preview" style="background-image: url('${escapeAttr(previewImage)}')"></div>
      <div>
        <strong>${escapeHtml(skin.name)}</strong>
        <span>${skin.unlocked ? `Modelo: ${escapeHtml(skin.modelCode)}` : `🪙 ${skin.price}`}</span>
      </div>
      <button data-skin="${skin.id}" data-action="${skin.unlocked ? 'select' : 'buy'}" ${skin.selected ? 'disabled' : ''}>
        ${skin.selected ? 'Equipada' : skin.unlocked ? 'Usar' : 'Comprar'}
      </button>
    </div>
    `;
  }).join('');

  document.querySelectorAll('[data-skin]').forEach(button => {
    button.addEventListener('click', async () => {
      const skinId = Number(button.dataset.skin);
      const action = button.dataset.action;

      try {
        const data = action === 'buy'
          ? await api.buySkin(skinId)
          : await api.selectSkin(skinId);

        state = data.state;
        renderHud();
        renderSkins();
        buildWorld();
      } catch (error) {
        toast(error.message);
      }
    });
  });
}

function skinPreviewUrl(skin) {
  const key = String(skin.modelCode || skin.code || '').toLowerCase();
  const fileName = skinPreviewFiles[key] || `${key}.png`;
  return `/assets/skins/${fileName}`;
}

function openSkins() {
  closeSideMenuPanel();
  renderSkins();
  show($('skinsPanel'));
}

function closeSkins() {
  hide($('skinsPanel'));
}

// GUIA FRONTEND: ayuda Python.
// Modal de chat que llama a /api/chat.
function openChat() {
  if (!state?.ai?.pythonHelpAvailable) {
    closeChat();
    return;
  }

  closeSideMenuPanel();
  renderChatMessages();
  show($('chatPanel'));
  $('chatInput').focus();
}

function closeChat() {
  hide($('chatPanel'));
}

function renderChatMessages() {
  $('chatMessages').innerHTML = chatHistory.length
    ? chatHistory.map(message => `
      <div class="chat-bubble ${message.role === 'user' ? 'from-user' : 'from-assistant'}">
        ${escapeHtml(message.content)}
      </div>
    `).join('')
    : '<p class="empty-state">Haz una pregunta de Python y te ayudo.</p>';
  $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
}

async function sendChatMessage() {
  if (!state?.ai?.pythonHelpAvailable) {
    closeChat();
    return;
  }

  const content = $('chatInput').value.trim();
  if (!content) return;

  chatHistory.push({ role: 'user', content });
  $('chatInput').value = '';
  renderChatMessages();
  $('sendChatBtn').disabled = true;

  try {
    const data = await api.chat(chatHistory);
    chatHistory.push({ role: 'assistant', content: data.answer });
    renderChatMessages();
  } catch (error) {
    toast(error.message);
  } finally {
    $('sendChatBtn').disabled = false;
  }
}

// GUIA FRONTEND: utilidades finales.
// Helpers de texto, HTML seguro, slugs y mezclas aleatorias.
function themeMapCode(slug) {
  const index = Math.max(0, state.map.temas.findIndex(tema => tema.slug === slug));
  return themeSceneModels[index % themeSceneModels.length];
}

function titleFromSlug(slug) {
  return slug
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

// GUIA FRONTEND: conexiones de botones/eventos.
// Si quieres saber que hace un boton del HTML, busca su id aqui.
$('studentModeBtn').addEventListener('click', () => openAuth('jugador'));
$('teacherModeBtn').addEventListener('click', () => openAuth('profesor'));
$('teacherRegisterModeBtn').addEventListener('click', openTeacherRegister);
$('backRoleBtn').addEventListener('click', showRoleChoice);
$('backTeacherRegisterBtn').addEventListener('click', showRoleChoice);
$('loginBtn').addEventListener('click', enter);
$('createTeacherAccountBtn').addEventListener('click', registerTeacher);
$('password').addEventListener('keydown', event => {
  if (event.key === 'Enter') enter();
});
$('teacherRegisterPassword').addEventListener('keydown', event => {
  if (event.key === 'Enter') registerTeacher();
});
$('menuBtn').addEventListener('click', openSideMenu);
$('closeSideMenu').addEventListener('click', closeSideMenuPanel);
$('sideMenuBackdrop').addEventListener('click', closeSideMenuPanel);
$('tutorialBtn').addEventListener('click', openTutorial);
$('joinGroupBtn').addEventListener('click', openJoinGroupPanel);
$('cancelJoinGroupBtn').addEventListener('click', closeJoinGroupPanel);
$('confirmJoinGroupBtn').addEventListener('click', joinGroupByCode);
$('closeTutorial').addEventListener('click', closeTutorial);
$('tutorialPrev').addEventListener('click', previousTutorialSlide);
$('tutorialNext').addEventListener('click', nextTutorialSlide);
$('logoutBtn').addEventListener('click', askLogout);
$('cancelLogoutBtn').addEventListener('click', cancelLogout);
$('confirmLogoutBtn').addEventListener('click', logout);
$('teacherLogoutBtn').addEventListener('click', logout);
$('addGroupBtn').addEventListener('click', saveTeacherGroup);
$('addStudentBtn').addEventListener('click', saveTeacherStudent);
$('studentSearch').addEventListener('input', renderAllStudentsList);
$('enrollSelectedBtn').addEventListener('click', enrollSelectedStudents);
$('studentGroupSelect').addEventListener('change', event => {
  selectedTeacherGroupId = Number(event.target.value);
  renderTeacherGroups();
  loadTeacherStudents(selectedTeacherGroupId);
});
$('progressBtn').addEventListener('click', openProgress);
$('closeProgress').addEventListener('click', closeProgress);
$('progressDifficulty').addEventListener('change', event => {
  selectedProgressDifficulty = event.target.value;
  renderSelectedProgressTheme();
});
$('progressFilter').addEventListener('change', event => {
  selectedProgressFilter = event.target.value;
  const theme = progressData?.themes?.find(item => item.slug === selectedProgressTheme);
  if (theme) renderProgressQuestions(theme);
});
$('skinsBtn').addEventListener('click', openSkins);
$('chatBtn').addEventListener('click', openChat);
$('closeChat').addEventListener('click', closeChat);
$('sendChatBtn').addEventListener('click', sendChatMessage);
$('chatInput').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
});
$('mapBtn').addEventListener('click', goHub);
$('closeSkins').addEventListener('click', closeSkins);
$('closeGame').addEventListener('click', closeMinigame);
$('prevQuestion').addEventListener('click', previousQuestion);
$('checkQuestion').addEventListener('click', checkCurrentQuestion);
$('nextQuestion').addEventListener('click', nextQuestion);
$('submitGame').addEventListener('click', submitGame);

init3D();
restore();
