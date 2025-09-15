// Backend/src/server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { connectDB } from "./db.js";

import authRoutes from "./routes/auth.routes.js";
import notesRoutes from "./routes/notes.routes.js";
import mediaRoutes from "./routes/media.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import ordersRoutes from "./routes/orders.routes.js";
import filesRoutes from "./routes/files.routes.js"; // <= para servir archivos GridFS

// 1) PRIMERO crea la app
const app = express();

// 2) Middlewares globales
const allowed = (process.env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowed.includes("*") || allowed.includes(origin)) return cb(null, true);
    return cb(new Error("CORS not allowed"), false);
  },
  credentials: true,
}));
app.use(morgan("dev"));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => res.json({ ok: true }));

// 3) Luego monta las rutas (ahora sí existe `app`)
app.use("/api/v1", filesRoutes);              // GET /api/v1/files/:id
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/notes", notesRoutes);
app.use("/api/v1/media", mediaRoutes);
app.use("/api/v1/inventory", inventoryRoutes); // items/vehicle-intakes/export/import
app.use("/api/v1/orders", ordersRoutes);

// 4) Arranque
const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("Falta MONGODB_URI en .env");
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error("Falta JWT_SECRET en .env");
  process.exit(1);
}

connectDB(MONGODB_URI)
  .then(() => app.listen(PORT, () => console.log(`API en http://localhost:${PORT}`)))
  .catch((e) => {
    console.error("Error conectando a Mongo:", e.message);
    process.exit(1);
  });
