// Backend/src/controllers/files.controller.js
import mongoose from "mongoose";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Sube N archivos usando GridFS + memoria (multer.memoryStorage)
 * Requiere authCompany antes para disponer de req.companyId
 */
export async function uploadFiles(req, res) {
  try {
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });

    const results = [];
    for (const f of req.files || []) {
      const src = Readable.from(f.buffer);
      const up = bucket.openUploadStream(f.originalname, {
        contentType: f.mimetype,
        metadata: {
          companyId: req.companyId || null,
          userId: req.userId || null,
          originalName: f.originalname,
        },
      });
      await pipeline(src, up); // escribe el buffer en GridFS
      results.push({
        fileId: up.id.toString(),
        filename: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
      });
    }

    return res.json({ files: results });
  } catch (err) {
    console.error("uploadFiles error:", err);
    return res.status(500).json({ error: "No se pudo subir el archivo" });
  }
}

/**
 * Descarga un archivo por id desde GridFS
 */
export async function getFile(req, res) {
  try {
    const id = new mongoose.Types.ObjectId(req.params.id);
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });

    const stream = bucket.openDownloadStream(id);
    stream.on("file", (f) => {
      if (f?.contentType) res.setHeader("Content-Type", f.contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    });
    stream.on("error", () => res.status(404).end("Not found"));
    stream.pipe(res);
  } catch {
    return res.status(400).end("Bad id");
  }
}
