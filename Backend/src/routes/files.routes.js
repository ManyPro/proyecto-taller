// Backend/src/routes/files.routes.js
import express from "express";
import path from "path";
import fs from "fs";
import { upload, normalizeFiles, driver, uploadsRoot } from "../lib/upload.js";
import { authCompany } from "../middlewares/auth.js";

const router = express.Router();

/**
 * POST /api/v1/media/upload
 * Campo de formulario: "files" (array)
 * Respuesta: { files: [{ id, url, filename, mimetype, size, provider }] }
 */
router.post("/media/upload", authCompany, (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || "Upload error" });

    try {
      const companyId = req.company?._id?.toString?.() || "inventory_unsigned";
      const files = await normalizeFiles(req.files || [], companyId);
      return res.json({ files });
    } catch (e) {
      console.error("Upload fail:", e);
      return res.status(500).json({ error: "Upload failed" });
    }
  });
});

/**
 * GET /api/v1/media/:id
 * Solo útil para modo "local" (sirve archivo desde /uploads).
 * En Cloudinary usa la URL devuelta al subir.
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
