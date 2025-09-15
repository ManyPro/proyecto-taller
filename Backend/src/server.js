import "dotenv/config";
import express from "express";
import morgan from "morgan";
import { connectDB } from "./db.js";
import authRoutes from "./routes/auth.routes.js";
import notesRoutes from "./routes/notes.routes.js";
import mediaRoutes from "./routes/media.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import ordersRoutes from "./routes/orders.routes.js";
import cors from "cors";

const ALLOWED = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    // permite same-origin / curl y tu dominio Netlify
    if (!origin) return cb(null, true);
    if (ALLOWED.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  // << IMPORTANTE: Authorization debe estar permitido
  allowedHeaders: ["Content-Type", "Authorization"],
  // útil si un día devuelves descargas
  exposedHeaders: ["Content-Disposition"],
};

app.use(cors(corsOptions));
// Preflight para TODO (incluido /files/upload)
app.options("*", cors(corsOptions));
// --- fin CORS ---

const app = express();

const allowed = (process.env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowed.includes("*") || allowed.includes(origin)) return cb(null, true);
    return cb(new Error("CORS not allowed: " + origin));
  },
  credentials: true,
}));

app.use(express.json({ limit: "20mb" }));
app.use(morgan("dev"));

app.get("/api/v1/health", (req, res) => res.json({ ok: true, at: new Date().toISOString() }));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/notes", notesRoutes);
app.use("/api/v1/media", mediaRoutes);
app.use("/api/v1/inventory", inventoryRoutes);
app.use("/api/v1/orders", ordersRoutes);

const { PORT = 4000, MONGODB_URI } = process.env;
if (!MONGODB_URI) {
  console.error("Falta MONGODB_URI en .env");
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error("Falta JWT_SECRET en .env");
  process.exit(1);
}

connectDB(MONGODB_URI).then(() => {
  app.listen(PORT, () => console.log(`API en http://localhost:${PORT}`));
}).catch((e) => {
  console.error("Error conectando a Mongo:", e.message);
  process.exit(1);
});
