// Backend/src/routes/media.routes.js
import { Router } from "express";
import authCompany from "../middlewares/auth.js";
import { upload, normalizeFiles } from "../lib/upload.js";

const router = Router();

// Acepta hasta 10 archivos; usa el mismo nombre de campo que el frontend
// Si tu <input type="file"> usa "media" cámbialo aquí si hiciera falta.
const uploader = upload.array("media", 10);

router.post("/media/upload", authCompany, uploader, (req, res) => {
  try {
    const items = normalizeFiles(req.files);
    return res.json({ ok: true, items });
  } catch (err) {
    console.error("upload failed:", err);
    return res.status(500).json({ ok: false, error: "UPLOAD_FAILED" });
  }
});

export default router;
