// database.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '123123123',
  database: 'project_darem',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // optional niceties:
  // dateStrings: true,           // return DATE/TIMESTAMP as strings
  // timezone: 'Z',               // or '+08:00' if you prefer local handling
  // supportBigNumbers: true,
  // bigNumberStrings: true,
});

module.exports = pool;
