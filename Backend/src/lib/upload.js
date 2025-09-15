// Backend/src/lib/upload.js
import multer from "multer";

// Límite por archivo (por defecto 20MB; ajusta con env MAX_FILE_SIZE si quieres)
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "20971520", 10);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE, // bytes
    files: 12,
  },
});
