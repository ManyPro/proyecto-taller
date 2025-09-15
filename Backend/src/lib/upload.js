import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";

const storage = new GridFsStorage({
  url: process.env.MONGODB_URI,
  file: (_req, file) => ({
    filename: `${Date.now()}-${file.originalname}`,
    bucketName: "uploads",
    metadata: { mime: file.mimetype, field: file.fieldname },
  }),
});

export const upload = multer({ storage });
