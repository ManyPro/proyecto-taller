// Backend/src/server.js
import "dotenv/config.js";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";

// Rutas
import authRoutes from "./routes/auth.routes.js";
import notesRoutes from "./routes/notes.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import filesRoutes from "./routes/files.routes.js";

// --- Conexión MongoDB ---
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Falta MONGODB_URI en el .env");
  process.exit(1);
}
await mongoose.connect(MONGODB_URI);
console.log("MongoDB conectado");

// --- App ---
const app = express();

// CORS con whitelist por coma
const origins = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl/postman
      if (origins.includes("*") || origins.includes(origin)) return cb(null, true);
      return cb(new Error(`Origen no permitido: ${origin}`), false);
    },
    credentials: true,
  })
);

// JSON
app.use(express.json({ limit: "20mb" }));

// Salud
app.head("/", (_, res) => res.status(200).send("OK"));
app.get("/", (_, res) => res.status(200).send("OK"));

// Montaje de rutas de API v1
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1", notesRoutes);
app.use("/api/v1", inventoryRoutes);
app.use("/api/v1", filesRoutes); // /files/* y alias /media/*

// 404
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Start
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API en http://localhost:${PORT}`);
});
