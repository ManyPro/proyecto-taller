// Backend/src/routes/files.routes.js
import { Router } from "express";
import mongoose from "mongoose";
import { authCompany } from "../middlewares/auth.js";
import { upload } from "../lib/upload.js";

const router = Router();

/**
 * Sube múltiples archivos (campo 'files') -> GridFS (bucket 'uploads')
 * Devuelve [{ fileId, filename, mimetype, size }]
 */
router.post("/files/upload", authCompany, upload.array("files", 12), (req, res) => {
  const files = (req.files || []).map(f => ({
    fileId: (f.id || f._id)?.toString(),
    filename: f.filename,
    mimetype: f.mimetype,
    size: f.size,
  }));
  res.json({ files });
});

/**
 * Sirve un archivo por id desde GridFS
 * GET /api/v1/files/:id
 */
router.get("/files/:id", async (req, res) => {
  try {
    const id = new mongoose.Types.ObjectId(req.params.id);
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "uploads" });
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
