import { Router } from "express";
import { authCompany } from "../middlewares/auth.js";
import { upload, normalizeFiles } from "../lib/upload.js";

const router = Router();

// Subida de varios archivos (campo "files")
router.post("/files/upload",
  authCompany,
  upload.array("files", 15),
  async (req, res, next) => {
    try {
      const out = await normalizeFiles(req); // [{fileId, filename, mimetype, size, url}]
      res.json({ files: out });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
