// importing dependencies
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local"; // Renamed Strategy to LocalStrategy for clarity
import GoogleStrategy from "passport-google-oauth2";
import { v4 as uuidv4 } from "uuid";

// configurations
dotenv.config();
const app = express();
const saltRounds = 3; // Consider moving to .env if it varies by environment
const port = process.env.PORT || 3000; // Fallback port

const db = new pg.Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

db.connect((err) => {
  if (err) {
    console.error("Failed to connect to the database!", err.stack);
  } else {
    console.log("Successfully connected to the database.");
  }
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 1 day
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Removed global task, complete, percent, date variables
// These will be fetched or calculated within routes

// Helper function to get current date components
function getCurrentDateComponents() {
  const now = new Date();
  return {
    day: now.getDate(),
    month: now.getMonth() + 1, // JS months are 0-indexed
    year: now.getFullYear(),
    formattedDate: `${now.getDate()} ${now.getMonth() + 1} ${now.getFullYear()}`,
    isoDate: now.toISOString().split('T')[0] // YYYY-MM-DD
  };
}

// get routes
app.get("/", (req, res) => {
  res.render("home.ejs");
});

app.get("/register", (req, res) => {
  res.render("signup.ejs", { error: req.query.error || "" });
});

app.get("/signup", (req, res) => { // Alias for /register
  res.render("signup.ejs", { error: req.query.error || "" });
});

app.get("/login", (req, res) => {
  res.render("signup.ejs", { error: req.query.error || "" }); // Assuming login and signup are on the same page template
});

app.get("/app", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login?error=Kindly login.");
  }

  const today = getCurrentDateComponents();
  let tasks = [];
  let completedTasks = [];
  let currentPercent = 0;

  try {
    const taskData = await db.query(
      "SELECT * FROM task WHERE user_id = $1 AND date = $2 AND month = $3 AND year = $4;",
      [req.user.id, today.day, today.month, today.year]
    );
    tasks = taskData.rows;

    const completedData = await db.query(
      "SELECT * FROM complete_task WHERE user_id = $1 AND date = $2 AND month = $3 AND year = $4;",
      [req.user.id, today.day, today.month, today.year]
    );
    completedTasks = completedData.rows;

    const totalTasks = tasks.length + completedTasks.length;
    currentPercent = totalTasks === 0 ? 0 : (completedTasks.length / totalTasks) * 100;

    // Upsert completion percentage for the day
    await db.query(
      "INSERT INTO complete_percentage (user_id, date, percentage) VALUES ($1, $2, $3) ON CONFLICT (user_id, date) DO UPDATE SET percentage = $3;",
      [req.user.id, today.isoDate, Math.round(currentPercent)] // Use Math.round for integer percentage
    );

    res.render("app.ejs", {
      userName: req.user.name, // Pass user's name
      task: tasks,
      date: today.formattedDate,
      complete: completedTasks,
      percent: currentPercent
    });

  } catch (err) {
    console.error("Error loading app data:", err.stack);
    // Consider rendering an error page or redirecting with an error message
    res.status(500).send("Error loading application data.");
  }
});

app.get("/auth/google", passport.authenticate("google", {
  scope: ["profile", "email"],
}));

app.get("/auth/google/streaksync", passport.authenticate("google", {
  successRedirect: "/app",
  failureRedirect: "/login?error=Google authentication failed.", // More specific error
}));

app.post("/streak", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).send("User not authenticated"); // Or redirect to login
  }
  try {
    const result = await db.query(
      `SELECT TO_CHAR(date, 'YYYY-MM-DD') AS date, percentage
       FROM complete_percentage
       WHERE user_id = $1 ORDER BY date DESC;`, // Added ORDER BY
      [req.user.id]
    );
    res.render("streak.ejs", { streak: result.rows });
  } catch (err) {
    console.error("Error fetching streak data:", err.stack);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/logout", (req, res, next) => { // Added next for req.logout in newer passport versions
  req.logout((err) => {
    if (err) { return next(err); }
    res.redirect("/login");
  });
});

// post routes
app.post("/register", async (req, res) => {
  const { name, mail, password } = req.body;
  if (!name || !mail || !password) {
    return res.redirect("/register?error=All fields are required.");
  }

  try {
    const existingUser = await db.query("SELECT * FROM users WHERE mail = $1", [mail]);
    if (existingUser.rows.length > 0) {
      return res.redirect("/register?error=Account already exists with this email.");
    }

    const hash = await bcrypt.hash(password, saltRounds);
    const userId = uuidv4();

    const newUserResult = await db.query(
      "INSERT INTO users (id, name, mail, password) VALUES ($1, $2, $3, $4) RETURNING *",
      [userId, name, mail, hash]
    );
    const newUser = newUserResult.rows[0];

    req.login(newUser, (err) => {
      if (err) {
        console.error("Login error after registration:", err);
        return res.redirect("/login?error=Error logging in after registration.");
      }
      return res.redirect("/app");
    });
  } catch (err) {
    console.error("Error during registration:", err.stack);
    res.redirect("/register?error=Server error during registration.");
  }
});

app.post("/login", passport.authenticate("local", {
  successRedirect: "/app",
  failureRedirect: "/login?error=Invalid email or password.", // Changed from /signup to /login
}));

app.post("/task", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login?error=Kindly login.");
  }
  const { t_name } = req.body;
  if (!t_name || t_name.trim() === "") {
    // Optionally, redirect back with an error message if task name is empty
    return res.redirect("/app");
  }

  const today = getCurrentDateComponents();
  const taskId = uuidv4();
  try {
    await db.query(
      'INSERT INTO task (user_id, task, task_id, date, month, year) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user.id, t_name.trim(), taskId, today.day, today.month, today.year]
    );
    res.redirect("/app");
  } catch (err) {
    console.error("Error adding task:", err.stack);
    // Optionally, pass an error message to the template
    res.status(500).send("Failed to add task.");
  }
});

app.post("/delete-task", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login?error=Kindly login.");
  }
  const { task_id } = req.body;
  try {
    // Ensure the task belongs to the logged-in user before deleting for security
    await db.query("DELETE FROM task WHERE task_id = $1 AND user_id = $2", [task_id, req.user.id]);
    res.redirect("/app");
  } catch (err) {
    console.error("Error deleting task:", err.stack);
    res.status(500).send("Failed to delete task.");
  }
});

app.post("/complete-task", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login?error=Kindly login.");
  }
  const { task_id, task } = req.body; // task content is passed in hidden input
  const today = getCurrentDateComponents();

  try {
    // Begin transaction
    await db.query('BEGIN');
    // Delete from task table (ensure it belongs to user)
    const deleteResult = await db.query(
      "DELETE FROM task WHERE task_id = $1 AND user_id = $2 RETURNING *",
      [task_id, req.user.id]
    );

    if (deleteResult.rowCount === 0) {
        await db.query('ROLLBACK');
        // This means task didn't exist or didn't belong to user.
        // Could redirect with error or just go back to app.
        return res.redirect("/app?error=Task not found or unauthorized.");
    }

    // Insert into complete_task table
    await db.query(
      "INSERT INTO complete_task (user_id, task, task_id, date, month, year) VALUES ($1, $2, $3, $4, $5, $6)",
      [req.user.id, task, task_id, today.day, today.month, today.year]
    );
    await db.query('COMMIT');
    res.redirect("/app");
  } catch (err) {
    await db.query('ROLLBACK');
    console.error("Error completing task:", err.stack);
    res.status(500).send("Error completing task.");
  }
});

app.post("/delete-complete", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login?error=Kindly login.");
  }
  const today = getCurrentDateComponents();
  try {
    await db.query(
      "DELETE FROM complete_task WHERE user_id = $1 AND date = $2 AND month = $3 AND year = $4",
      [req.user.id, today.day, today.month, today.year]
    );
    res.redirect("/app");
  } catch (err) {
    console.error("Error deleting completed tasks:", err.stack);
    res.status(500).send("Failed to delete completed tasks.");
  }
});

app.post("/delete-today", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login?error=Kindly login.");
  }
  const today = getCurrentDateComponents();
  try {
    await db.query(
      "DELETE FROM task WHERE user_id = $1 AND date = $2 AND month = $3 AND year = $4",
      [req.user.id, today.day, today.month, today.year]
    );
    res.redirect("/app");
  } catch (err) {
    console.error("Error deleting all pending tasks for today:", err.stack);
    res.status(500).send("Failed to delete today's pending tasks.");
  }
});

// strategies
passport.use("local",
  new LocalStrategy({ usernameField: "mail" }, async (mail, password, cb) => {
    try {
      const result = await db.query("SELECT * FROM users WHERE mail = $1", [mail]);
      if (result.rows.length === 0) {
        return cb(null, false, { message: "Account does not exist with this email." });
      }
      const user = result.rows[0];
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return cb(null, false, { message: "Invalid email or password." });
      }
      return cb(null, user);
    } catch (err) {
      console.error("Error during local authentication:", err);
      return cb(err);
    }
  })
);

passport.use("google",
  new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.CALLBACK_URL, // Using environment variable
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo", // Remains same
  }, async (accessToken, refreshToken, profile, cb) => {
    try {
      const result = await db.query("SELECT * FROM users WHERE mail = $1", [profile.email]);
      if (result.rows.length === 0) { // User doesn't exist, create new one
        const userId = uuidv4();
        const newUser = await db.query(
          "INSERT INTO users (id, name, mail, password) VALUES ($1, $2, $3, $4) RETURNING *",
          [userId, profile.displayName, profile.email, "google"] // Store 'google' as password for OAuth users
        );
        return cb(null, newUser.rows[0]);
      } else { // User exists, log them in
        return cb(null, result.rows[0]);
      }
    } catch (err) {
      console.error("Error during Google authentication:", err);
      return cb(err);
    }
  })
);

// Store only user ID in session
passport.serializeUser((user, cb) => {
  cb(null, user.id);
});

// Retrieve full user object from ID
passport.deserializeUser(async (id, cb) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return cb(new Error('User not found'));
    }
    cb(null, result.rows[0]);
  } catch (err) {
    cb(err);
  }
});

app.listen(port, () => {
  console.log(`App is running on http://localhost:${port}.`);
});
