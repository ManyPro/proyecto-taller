// Backend/src/lib/upload.js
import multer from "multer";

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "20971520", 10); // 20MB

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 12 },
});
