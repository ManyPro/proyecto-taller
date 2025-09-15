// Backend/src/routes/files.routes.js
import { Router } from "express";
import multer from "multer";
import mongoose from "mongoose";
import { Readable } from "node:stream";
import { authCompany } from "../middlewares/auth.js";

const router = Router();

// Subida en memoria -> luego escribir a GridFS (bucket "uploads")
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 10, fileSize: 50 * 1024 * 1024 }, // 50MB por archivo
});

function getBucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB no conectado");
  return new mongoose.mongo.GridFSBucket(db, { bucketName: "uploads" });
}

// --------------------------- Handlers comunes ---------------------------
async function handleUpload(req, res) {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: "No se recibieron archivos" });

    const bucket = getBucket();
    const companyId = new mongoose.Types.ObjectId(req.companyId);

    const saves = await Promise.all(
      files.map(
        (f) =>
          new Promise((resolve, reject) => {
            const meta = {
              companyId,
              size: f.size,
              originalname: f.originalname,
              uploadedAt: new Date(),
              mimetype: f.mimetype,
            };
            const ws = bucket.openUploadStream(f.originalname, {
              metadata: meta,
              contentType: f.mimetype,
            });
            Readable.from(f.buffer)
              .pipe(ws)
              .on("error", reject)
              .on("finish", () => {
                resolve({
                  fileId: ws.id.toString(),
                  filename: f.originalname,
                  mimetype: f.mimetype,
                  size: f.size,
                });
              });
          })
      )
    );

    res.status(201).json({ files: saves });
  } catch (e) {
    console.error("Upload error:", e);
    res.status(500).json({ error: "Error subiendo archivos" });
  }
}

async function handleGet(req, res) {
  try {
    const id = new mongoose.Types.ObjectId(req.params.id);
    const bucket = getBucket();
    const companyId = new mongoose.Types.ObjectId(req.companyId);

    const files = await bucket.find({ _id: id, "metadata.companyId": companyId }).toArray();
    if (!files.length) return res.status(404).send("Archivo no encontrado");

    const file = files[0];
    if (file.contentType) res.set("Content-Type", file.contentType);
    res.set("Cache-Control", "public, max-age=31536000, immutable");

    bucket.openDownloadStream(id).pipe(res);
  } catch {
    res.status(404).send("Archivo no encontrado");
  }
}

async function handleDelete(req, res) {
  try {
    const id = new mongoose.Types.ObjectId(req.params.id);
    const bucket = getBucket();
    const companyId = new mongoose.Types.ObjectId(req.companyId);

    const files = await bucket.find({ _id: id, "metadata.companyId": companyId }).toArray();
    if (!files.length) return res.status(404).json({ error: "Archivo no encontrado" });

    await bucket.delete(id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo eliminar" });
  }
}

// --------------------------- Rutas oficiales (/files/*) ---------------------------
router.post("/files/upload", authCompany, upload.array("files", 10), handleUpload);
router.get("/files/:id", authCompany, handleGet);
router.delete("/files/:id", authCompany, handleDelete);

// --------------------------- Alias compatibilidad (/media/*) ----------------------
router.post("/media/upload", authCompany, upload.array("files", 10), handleUpload);
router.get("/media/:id", authCompany, handleGet);
router.delete("/media/:id", authCompany, handleDelete);

export default router;
