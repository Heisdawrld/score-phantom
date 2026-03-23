router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const existing = await db.execute({
      sql: "SELECT id FROM users WHERE email = ?",
      args: [normalizedEmail],
    });

    if ((existing.rows || []).length > 0) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 3);

    const insertResult = await db.execute({
      sql: `
        INSERT INTO users (email, password, status, trial_ends_at)
        VALUES (?, ?, ?, ?)
      `,
      args: [normalizedEmail, String(password), "trial", trialEnds.toISOString()],
    });

    const newId =
      insertResult?.lastInsertRowid ||
      insertResult?.insertId ||
      insertResult?.rows?.[0]?.id;

    if (!newId) {
      const lookup = await db.execute({
        sql: "SELECT id, email FROM users WHERE email = ? LIMIT 1",
        args: [normalizedEmail],
      });

      const createdUser = lookup.rows?.[0];
      if (!createdUser) {
        throw new Error("User created but could not be reloaded");
      }

      const token = signToken(createdUser);
      return res.json({ token });
    }

    const token = signToken({
      id: newId,
      email: normalizedEmail,
    });

    res.json({ token });
  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ error: "Signup failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();

    const result = await db.execute({
      sql: "SELECT * FROM users WHERE email = ?",
      args: [normalizedEmail],
    });

    const user = result.rows?.[0];

    if (!user || String(user.password) !== String(password)) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = signToken(user);
    res.json({ token });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});
