import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dbDirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dbDirname, '..', '.env') });
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'mutale',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,          // Return DATE/DATETIME as plain strings, not JS Date objects
});

export async function testConnection() {
  const [rows] = await pool.query('SELECT DATABASE() AS db, NOW() AS connected_at');
  return rows[0];
}

export default pool;
