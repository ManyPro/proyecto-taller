// Backend/src/routes/files.routes.js
import { Router } from "express";
import mongoose from "mongoose";
import { ObjectId } from "mongodb";
import { authCompany } from "../middlewares/auth.js";   // <— OJO: import nombrado
import upload from "../lib/upload.js";                  // multer-gridfs-storage con bucket "uploads"

const router = Router();

// Helpers
const bucket = () =>
  new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "uploads" });

const toId = (id) => {
  try { return new ObjectId(id); } catch { return null; }
};

// --------------------------------------------------------------------------------------
// 1) SUBIR archivos (array)  -> campo "files"
//    Endpoints: /media/upload  y  /files/upload
// --------------------------------------------------------------------------------------
router.post(
  ["/media/upload", "/files/upload"],
  authCompany,
  upload.array("files", 12),
  async (req, res) => {
    const files = (req.files || []).map((f) => {
      const fid = f.id || f._id || f.fileId || f.filename;
      return {
        id: String(fid),
        filename: f.filename,
        mimetype: f.mimetype || f.contentType || "application/octet-stream",
        size: f.size ?? 0,
        url: `/api/v1/media/${String(fid)}/download`,
      };
    });
    res.json({ ok: true, files });
  }
);

// --------------------------------------------------------------------------------------
// 2) DESCARGAR (attachment): /media/:id/download  y  /files/:id/download
// --------------------------------------------------------------------------------------
router.get(["/media/:id/download", "/files/:id/download"], authCompany, async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: "ID inválido" });

  const dl = bucket().openDownloadStream(id);

  let headersSet = false;
  dl.on("file", (file) => {
    if (headersSet) return;
    headersSet = true;
    res.setHeader("Content-Type", file.contentType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(file.filename || "archivo")}"`
    );
  });

  dl.on("error", () => res.status(404).json({ error: "Archivo no encontrado" }));
  dl.pipe(res);
});

// --------------------------------------------------------------------------------------
// 3) VER inline: /media/:id  y  /files/:id
// --------------------------------------------------------------------------------------
router.get(["/media/:id", "/files/:id"], authCompany, async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: "ID inválido" });

  const dl = bucket().openDownloadStream(id);

  let headersSet = false;
  dl.on("file", (file) => {
    if (headersSet) return;
    headersSet = true;
    res.setHeader("Content-Type", file.contentType || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  });

  dl.on("error", () => res.status(404).json({ error: "Archivo no encontrado" }));
  dl.pipe(res);
});

// --------------------------------------------------------------------------------------
// 4) ELIMINAR: /media/:id  y  /files/:id
// --------------------------------------------------------------------------------------
router.delete(["/media/:id", "/files/:id"], authCompany, async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: "ID inválido" });

  try {
    await bucket().delete(id);
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "Archivo no encontrado" });
  }
});

export default router;
