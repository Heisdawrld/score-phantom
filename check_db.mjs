import Database from 'better-sqlite3';
const db = new Database('local.db');
const users = db.prepare('SELECT id, email, password_hash, password FROM users LIMIT 10').all();
console.log(users);
