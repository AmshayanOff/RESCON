require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET, FRONTEND_ORIGIN } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !JWT_SECRET) {
  console.error("Missing env vars: ADMIN_EMAIL, ADMIN_PASSWORD and JWT_SECRET are required.");
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "site.json");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// The password is never stored in plain text after start-up.
const adminEmail = ADMIN_EMAIL.trim().toLowerCase();
const adminHash = bcrypt.hashSync(ADMIN_PASSWORD, 12);

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));

const origins = (FRONTEND_ORIGIN || "").split(",").map(s => s.trim().replace(/\/$/, "")).filter(Boolean);
app.use(cors({ origin: (o, cb) => cb(null, !o || origins.includes(o)) }));
app.use(express.json({ limit: "2mb" }));

// ---------- auth ----------
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

app.post("/api/login", loginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const okPass = bcrypt.compareSync(String(password || ""), adminHash); // always run, keeps timing even
  const okMail = String(email || "").trim().toLowerCase() === adminEmail;
  if (!(okPass && okMail)) return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
  res.json({ token });
});

function requireAdmin(req, res, next) {
  const h = req.headers.authorization || "";
  try {
    const p = jwt.verify(h.replace(/^Bearer /, ""), JWT_SECRET);
    if (p.role === "admin") return next();
  } catch (e) { /* fall through */ }
  res.status(401).json({ error: "Unauthorized" });
}

app.get("/api/me", requireAdmin, (req, res) => res.json({ ok: true }));

// ---------- site content ----------
const KEYS = ["s", "services", "news", "team", "pubs"];
function readSite() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch (e) { return {}; }
}

app.get("/api/site", (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.json(readSite());
});

app.put("/api/site", requireAdmin, (req, res) => {
  const b = req.body;
  if (!b || typeof b !== "object" || Array.isArray(b)) return res.status(400).json({ error: "Invalid body" });
  const out = {};
  for (const k of KEYS) {
    if (!(k in b)) continue;
    const isArr = k !== "s";
    if (isArr ? !Array.isArray(b[k]) : (typeof b[k] !== "object" || Array.isArray(b[k]) || !b[k])) {
      return res.status(400).json({ error: "Invalid field: " + k });
    }
    out[k] = b[k];
  }
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(out));
  fs.renameSync(tmp, DB_FILE); // atomic replace
  res.json({ ok: true });
});

// ---------- image uploads ----------
const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp" };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString("hex") + EXT[file.mimetype]),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, !!EXT[file.mimetype]),
});

app.post("/api/upload", requireAdmin, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Only JPG, PNG, GIF or WebP images up to 8 MB" });
  res.json({ url: "/uploads/" + req.file.filename });
});
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "7d", index: false }));

// ---------- optional: serve the frontend from the same service ----------
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
if (fs.existsSync(FRONTEND_DIR)) app.use(express.static(FRONTEND_DIR));

app.get("/health", (req, res) => res.send("ok"));

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 500).json({ error: "Request failed" });
});

app.listen(PORT, () => console.log("RESCON server on port " + PORT));
