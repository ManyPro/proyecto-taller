import mongoose from "mongoose";

export const streamFile = async (req, res) => {
  try {
    const id = new mongoose.Types.ObjectId(req.params.id);
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "uploads" });

    const files = await mongoose.connection.db.collection("uploads.files").find({ _id: id }).toArray();
    if (!files.length) return res.status(404).json({ error: "Archivo no encontrado" });

    const [{ contentType, filename }] = files;
    if (contentType) res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

    bucket.openDownloadStream(id).on("error", () => res.sendStatus(404)).pipe(res);
  } catch {
    res.status(400).json({ error: "ID inválido" });
  }
};
