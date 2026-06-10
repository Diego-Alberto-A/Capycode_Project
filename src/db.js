const mysql = require('mysql2/promise');

// GUIA: conexion MySQL.
// Todas las queries SQL del proyecto pasan por este pool compartido.
// Las credenciales vienen de .env: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'capycode',
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true
});

// SQL: ejecutar consulta simple.
// Uso tipico: await query('SELECT ... WHERE id = :id', { id }).
// namedPlaceholders permite usar :nombre en vez de solo signos ?.
async function query(sql, params = {}) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// SQL: transaccion segura.
// Se usa cuando varias escrituras deben guardarse juntas o revertirse juntas.
async function transaction(fn) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { pool, query, transaction };
