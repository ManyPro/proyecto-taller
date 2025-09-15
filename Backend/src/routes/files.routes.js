// Backend/src/routes/files.routes.js
import { Router } from "express";
import mongoose from "mongoose";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { authCompany } from "../middlewares/auth.js";
import { upload } from "../lib/upload.js";

const router = Router();

// --- Handlers compartidos --- //
async function handleUpload(req, res) {
  try {
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });

    const out = [];
    for (const f of req.files || []) {
      const src = Readable.from(f.buffer);
      const up = bucket.openUploadStream(f.originalname, {
        contentType: f.mimetype,
        metadata: { companyId: req.companyId || null, userId: req.userId || null },
      });
      await pipeline(src, up); // escribe el buffer en GridFS
      out.push({
        fileId: up.id.toString(),
        filename: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
      });
    }
    res.json({ files: out });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "No se pudo subir el archivo" });
  }
}

async function handleGetFile(req, res) {
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
}

// --- Rutas oficiales (/files/*) --- //
router.post("/files/upload", authCompany, upload.array("files", 12), handleUpload);
router.get("/files/:id", handleGetFile);

// --- Alias compatibles (/media/*) --- //
router.post("/media/upload", authCompany, upload.array("files", 12), handleUpload);
router.get("/media/:id", handleGetFile);

export default router;
