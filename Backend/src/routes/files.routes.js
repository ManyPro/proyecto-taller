// Backend/src/routes/files.routes.js
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { Readable } from "stream";
import { authCompany } from "../middlewares/auth.js"; // 👈 import nombrado

const router = express.Router();

// Subimos a memoria y luego lo escribimos a GridFS
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 10, fileSize: 50 * 1024 * 1024 }, // 50 MB por archivo
});

// Helper para obtener el bucket "uploads"
function getBucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB no conectado");
  return new mongoose.mongo.GridFSBucket(db, { bucketName: "uploads" });
}

// === POST /upload  -> guarda 1..n archivos en GridFS
router.post("/upload", authCompany, upload.array("files", 10), async (req, res) => {
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
    console.error(e);
    res.status(500).json({ error: "Error subiendo archivos" });
  }
});

// === GET /:id  -> sirve el archivo (con control por empresa)
router.get("/:id", authCompany, async (req, res) => {
  try {
    const id = new mongoose.Types.ObjectId(req.params.id);
    const bucket = getBucket();
    const companyId = new mongoose.Types.ObjectId(req.companyId);

    // Validamos que el archivo pertenezca a la compañía
    const files = await bucket
      .find({ _id: id, "metadata.companyId": companyId })
      .toArray();

    if (!files.length) return res.status(404).send("Archivo no encontrado");

    const file = files[0];
    if (file.contentType) res.set("Content-Type", file.contentType);

    bucket.openDownloadStream(id).pipe(res);
  } catch (e) {
    res.status(404).send("Archivo no encontrado");
  }
});

// === DELETE /:id  -> elimina el archivo (mismo control por empresa)
router.delete("/:id", authCompany, async (req, res) => {
  try {
    const id = new mongoose.Types.ObjectId(req.params.id);
    const bucket = getBucket();
    const companyId = new mongoose.Types.ObjectId(req.companyId);

    // comprobamos propiedad
    const files = await bucket
      .find({ _id: id, "metadata.companyId": companyId })
      .toArray();
    if (!files.length) return res.status(404).json({ error: "Archivo no encontrado" });

    await bucket.delete(id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo eliminar" });
  }
});

export default router;
