DROP DATABASE IF EXISTS capycode;
CREATE DATABASE capycode CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE capycode;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('jugador','profesor') NOT NULL DEFAULT 'jugador',
    grupo_id INT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE temas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(120) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL UNIQUE
);

CREATE TABLE dificultades (
    id INT PRIMARY KEY,
    slug VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(30) NOT NULL UNIQUE,
    xp_otorgado INT NOT NULL DEFAULT 0
);

CREATE TABLE niveles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tema_id INT NOT NULL,
    dificultad_id INT NOT NULL,
    numero_nivel INT NOT NULL,
    FOREIGN KEY (tema_id) REFERENCES temas(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (dificultad_id) REFERENCES dificultades(id) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (tema_id, dificultad_id, numero_nivel)
);

CREATE TABLE logros (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nivel_id INT NOT NULL,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(255),
    FOREIGN KEY (nivel_id) REFERENCES niveles(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE grupos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero INT NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    profesor_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profesor_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE grupo_users (
    grupo_id INT NOT NULL,
    user_id INT NOT NULL,
    PRIMARY KEY (grupo_id, user_id),
    FOREIGN KEY (grupo_id) REFERENCES grupos(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE user_logros (
    user_id INT NOT NULL,
    logro_id INT NOT NULL,
    obtained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, logro_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (logro_id) REFERENCES logros(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- progress.current_index: avance del jugador por tema/dificultad.
-- Garantia del servidor: solo SUBE (se actualiza siempre con GREATEST),
-- nunca baja. Regresar a preguntas anteriores es solo conceptual y no
-- modifica este valor guardado.
CREATE TABLE progress (
    user_id INT NOT NULL,
    tema_id INT NOT NULL,
    dificultad_id INT NOT NULL,
    current_index INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, tema_id, dificultad_id),
    INDEX idx_user (user_id),
    INDEX idx_tema (tema_id),
    INDEX idx_dificultad (dificultad_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (tema_id) REFERENCES temas(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (dificultad_id) REFERENCES dificultades(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE question_progress (
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
);

CREATE TABLE skins (
    id INT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL,
    price INT NOT NULL DEFAULT 0,
    color_a CHAR(7) NOT NULL,
    color_b CHAR(7) NOT NULL,
    model_code VARCHAR(80) NOT NULL DEFAULT 'capythilda',
    preview_image VARCHAR(160) NULL
);

CREATE TABLE user_stats (
    user_id INT PRIMARY KEY,
    coins INT NOT NULL DEFAULT 150,
    xp INT NOT NULL DEFAULT 0,
    selected_skin_id INT NOT NULL DEFAULT 1,
    last_map_code VARCHAR(80) NOT NULL DEFAULT 'hub',
    last_theme_slug VARCHAR(120) NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (selected_skin_id) REFERENCES skins(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE user_skins (
    user_id INT NOT NULL,
    skin_id INT NOT NULL,
    unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, skin_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (skin_id) REFERENCES skins(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE minigame_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    tema_id INT NOT NULL,
    dificultad_id INT NOT NULL,
    total_questions INT NOT NULL,
    correct_answers INT NOT NULL,
    reward_coins INT NOT NULL,
    reward_xp INT NOT NULL,
    passed BOOLEAN NOT NULL,
    start_index INT NOT NULL DEFAULT 0,
    end_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (tema_id) REFERENCES temas(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (dificultad_id) REFERENCES dificultades(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE minigame_question_attempts (
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
);

INSERT INTO dificultades (id, slug, name, xp_otorgado) VALUES
(1, 'facil', 'Fácil', 25),
(2, 'medio', 'Medio', 45),
(3, 'dificil', 'Difícil', 75);

INSERT INTO skins (id, code, name, price, color_a, color_b, model_code) VALUES
(1, 'capythilda', 'Capy Thilda', 0, '#b98252', '#f0c08a', 'capythilda'),
(2, 'capyaqua', 'Capy Aqua', 80, '#2f80ed', '#9bd5ff', 'capyaqua'),
(3, 'capyblack', 'Capy Black', 100, '#111827', '#6b7280', 'capyblack'),
(4, 'capycandy', 'Capy Candy', 120, '#ff6fb1', '#ffd1e6', 'capycandy'),
(5, 'capyconstellations', 'Capy Constellations', 150, '#312e81', '#a5b4fc', 'capyconstellations'),
(6, 'capyearth', 'Capy Earth', 170, '#27ae60', '#a8f0c0', 'capyearth'),
(7, 'capyexplorer', 'Capy Explorer', 200, '#a16207', '#fde68a', 'capyexplorer'),
(8, 'capyking', 'Capy King', 250, '#f2c94c', '#fff2a8', 'capyking'),
(9, 'capymage', 'Capy Mage', 280, '#7b61ff', '#dacfff', 'capymage'),
(10, 'capyruna', 'Capy Runa', 330, '#6d28d9', '#22d3ee', 'capyruna'),
(11, 'capysun', 'Capy Sun', 400, '#f97316', '#fed7aa', 'capysun');
