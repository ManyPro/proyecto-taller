import { Router } from "express";
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import mongoose from "mongoose";
import { authCompany } from "../middlewares/auth.js";

const router = Router();

// Protected storage that stamps companyId metadata
const storage = new GridFsStorage({
  url: process.env.MONGODB_URI,
  file: (req, file) => ({
    filename: Date.now() + "-" + file.originalname,
    metadata: { companyId: req.companyId },
  }),
});
const upload = multer({ storage });

// subir (protegido)
router.post("/upload", authCompany, upload.array("files"), (req, res) => {
  const files = (req.files || []).map(f => ({
    fileId: f.id, filename: f.filename, mimetype: f.mimetype, size: f.size
  }));
  res.json({ files });
});

// descargar/stream (protegido por compañía)
router.get("/:id", authCompany, async (req, res) => {
  const _id = new mongoose.Types.ObjectId(req.params.id);
  const filesCol = mongoose.connection.db.collection("fs.files");
  const fileDoc = await filesCol.findOne({ _id });
  if (!fileDoc) return res.status(404).end();
  const metaCompanyId = fileDoc.metadata?.companyId?.toString();
  if (metaCompanyId !== req.companyId) return res.status(403).json({ error: "No autorizado" });

  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db);
  const dl = bucket.openDownloadStream(_id);
  dl.on("file", (f) => res.set("Content-Type", f.contentType || "application/octet-stream"));
  dl.on("error", () => res.status(404).end());
  dl.pipe(res);
});

export default router;
