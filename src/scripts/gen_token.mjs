import db from "../config/database.js";
import jwt from "jsonwebtoken";
const res = await db.execute({sql:"SELECT id, email, status, premium_expires_at, trial_ends_at FROM users WHERE email = ? LIMIT 1", args:["davidchuks229@gmail.com"]});
const user = res.rows[0];
if (!user) { console.log("User not found"); process.exit(1); }
const token = jwt.sign({ id: user.id, email: user.email, status: user.status }, process.env.JWT_SECRET, { expiresIn: "4h" });
console.log("TOKEN=" + token);
console.log("USER=" + JSON.stringify(user));
