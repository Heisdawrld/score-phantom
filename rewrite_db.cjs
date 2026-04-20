const fs = require('fs');

let content = fs.readFileSync('src/config/database.js', 'utf8');

// Replace pg import with better-sqlite3
content = content.replace('import pg from "pg";', 'import Database from "better-sqlite3";');

// Remove pool
content = content.replace(/const pool = new pg\.Pool\([\s\S]*?\}\);/, 'const sqliteDb = new Database("local.db");');

// Rewrite db object
content = content.replace(/const db = \{[\s\S]*?^\};/m, `const db = {
  execute: async (queryOrObj, ...argsObj) => {
    let sql = typeof queryOrObj === 'string' ? queryOrObj : queryOrObj.sql;
    let args = typeof queryOrObj === 'string' ? (argsObj.length ? argsObj[0] : []) : (queryOrObj.args || []);
    
    // Convert SERIAL to INTEGER PRIMARY KEY AUTOINCREMENT
    sql = sql.replace(/SERIAL PRIMARY KEY/g, "INTEGER PRIMARY KEY AUTOINCREMENT");
    
    // SQLite doesn't have information_schema.columns, rewrite the query:
    if (sql.includes('information_schema.columns')) {
      const match = sql.match(/table_name = '([^']+)'/);
      if (match) {
        sql = \`PRAGMA table_info('\${match[1]}')\`;
      }
    }

    try {
      if (sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('PRAGMA')) {
        const stmt = sqliteDb.prepare(sql);
        const rows = stmt.all(...args);
        return { rows, rowsAffected: 0 };
      } else {
        const stmt = sqliteDb.prepare(sql);
        const info = stmt.run(...args);
        return { rows: [], rowsAffected: info.changes };
      }
    } catch (err) {
      throw err;
    }
  },
  batch: async (statements) => {
    const results = [];
    const runBatch = sqliteDb.transaction((stmts) => {
      for (const stmt of stmts) {
        let sql = typeof stmt === 'string' ? stmt : stmt.sql;
        let args = typeof stmt === 'string' ? [] : (stmt.args || []);
        sql = sql.replace(/SERIAL PRIMARY KEY/g, "INTEGER PRIMARY KEY AUTOINCREMENT");
        if (sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('PRAGMA')) {
          const s = sqliteDb.prepare(sql);
          const rows = s.all(...args);
          results.push({ rows, rowsAffected: 0 });
        } else {
          const s = sqliteDb.prepare(sql);
          const info = s.run(...args);
          results.push({ rows: [], rowsAffected: info.changes });
        }
      }
    });
    runBatch(statements);
    return results;
  }
};`);

fs.writeFileSync('src/config/database.js', content);
