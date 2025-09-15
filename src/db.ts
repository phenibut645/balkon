import mysql from "mysql2/promise";
import { DATABASE, HOST, PASSWORD, USER } from "./config.js";

console.log("🧾 Pool creating...")

const pool = mysql.createPool({
  host: HOST,
  user: USER,
  password: PASSWORD,
  database: DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,  
});

console.log("✅ Pool succesfly created!");

export default pool;
