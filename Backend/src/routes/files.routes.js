// Backend/src/routes/files.routes.js
import express from "express";
import path from "path";
import fs from "fs";
import { upload, normalizeFiles, driver, uploadsRoot } from "../lib/upload.js";
import { authCompany } from "../middlewares/auth.js"; // export nombrado

const router = express.Router();

/**
 * POST /api/v1/media/upload
 * Campo de formulario: "files" (múltiples)
 * Respuesta: { files: [{ id, url, filename, mimetype, size, provider }] }
 */
router.post(
  "/media/upload",
  authCompany,
  upload.array("files", 10),
  async (req, res, next) => {
    try {
      const files = await normalizeFiles(req.files || [], req);
      return res.json({ files });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/media/:id
 * Solo para modo "local" (stream del archivo desde /uploads).
 * En Cloudinary usa directamente la URL devuelta al subir.
 */
router.get("/media/:id", (req, res) => {
  if (driver !== "local") {
    return res.status(404).json({ error: "No disponible con Cloudinary" });
  }
  const file = path.join(uploadsRoot, path.basename(req.params.id));
  if (!fs.existsSync(file)) return res.sendStatus(404);
  return res.sendFile(file);
});

export default router;
