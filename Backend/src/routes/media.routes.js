// Backend/src/routes/media.routes.js
import { Router } from "express";
import mongoose from "mongoose";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { authCompany } from "../middlewares/auth.js";
import { upload } from "../lib/upload.js"; // usa multer.memoryStorage()

const router = Router();

/**
 * Sube archivos (campo 'files') a GridFS (bucket 'uploads').
 * Respuesta: { files: [{ fileId, filename, mimetype, size }] }
 */
router.post("/media/upload", authCompany, upload.array("files", 12), async (req, res) => {
  try {
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });

    const saved = [];
    for (const f of req.files || []) {
      const src = Readable.from(f.buffer);
      const up = bucket.openUploadStream(f.originalname, {
        contentType: f.mimetype,
        metadata: { companyId: req.companyId || null, userId: req.userId || null },
      });
      await pipeline(src, up);
      saved.push({
        fileId: up.id.toString(),
        filename: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
      });
    }
    res.json({ files: saved });
  } catch (err) {
    console.error("media upload error:", err);
    res.status(500).json({ error: "No se pudo subir el archivo" });
  }
});

/**
 * Descarga/visualiza archivo por id desde GridFS.
 * GET /api/v1/media/:id
 */
router.get("/media/:id", async (req, res) => {
  try {
    const id = new mongoose.Types.ObjectId(req.params.id);
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });
    const stream = bucket.openDownloadStream(id);

    stream.on("file", (f) => {
      if (f?.contentType) res.setHeader("Content-Type", f.contentType);
    });
    stream.on("error", () => res.status(404).end("Not found"));
    stream.pipe(res);
  } catch {
    res.status(400).end("Bad id");
  }
});

export default router;
