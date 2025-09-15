// Backend/src/routes/files.routes.js
import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { authCompany } from "../middlewares/auth.js"; // <- IMPORTACIÓN CORRECTA (nombrada)

// --- Config básica de almacenamiento en disco ---
const router = Router();

const UPLOAD_DIR =
  process.env.UPLOAD_DIR && process.env.UPLOAD_DIR.trim().length > 0
    ? process.env.UPLOAD_DIR.trim()
    : "uploads";

// Asegura que la carpeta de subidas exista
const uploadRoot = path.resolve(process.cwd(), UPLOAD_DIR);
fs.mkdirSync(uploadRoot, { recursive: true });

// Nombre de archivo “seguro”
function safeName(str) {
  return (
    str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .toLowerCase() || "file"
  );
}

// Multer: destino + nombre
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (req, file, cb) => {
    const company = (req.companyId || "common").toString();
    const base = safeName(file.originalname);
    const stamp = Date.now();
    cb(null, `${company}-${stamp}-${base}`);
  },
});

// 15 MB máx. y aceptamos imágenes y vídeo
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/|^video\//.test(file.mimetype);
    if (!ok) return cb(new Error("Tipo de archivo no permitido"));
    cb(null, true);
  },
});

// Construye URL pública hacia /uploads/<filename>
function buildPublicUrl(req, filename) {
  const base =
    process.env.BASE_URL?.replace(/\/+$/, "") ||
    `${req.protocol}://${req.get("host")}`;
  return `${base}/uploads/${encodeURIComponent(filename)}`;
}

/**
 * Sube 1 o varios archivos.
 * Acepta tanto 'file' (uno) como 'files' (múltiples).
 * Respuesta:
 * { ok:true, files:[{filename, url, mimetype, size, originalname}] }
 */
router.post("/files/upload", authCompany, upload.any(), (req, res) => {
  const files = (req.files || []).map((f) => ({
    filename: f.filename,
    originalname: f.originalname,
    mimetype: f.mimetype,
    size: f.size,
    url: buildPublicUrl(req, f.filename),
  }));

  if (files.length === 0) {
    return res.status(400).json({ ok: false, message: "No se envió archivo" });
  }

  return res.json({ ok: true, files });
});

/**
 * Elimina un archivo por nombre
 */
router.delete("/files/:filename", authCompany, (req, res) => {
  const filePath = path.join(uploadRoot, req.params.filename);
  fs.stat(filePath, (err, stat) => {
    if (err || !stat?.isFile()) {
      return res.status(404).json({ ok: false, message: "Archivo no existe" });
    }
    fs.unlink(filePath, (err2) => {
      if (err2) {
        return res
          .status(500)
          .json({ ok: false, message: "No se pudo eliminar" });
      }
      return res.json({ ok: true });
    });
  });
});

export default router;
