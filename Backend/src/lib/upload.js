// Backend/src/lib/upload.js
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { v2 as cloudinary } from "cloudinary";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const driver = (process.env.UPLOAD_DRIVER || "local").toLowerCase();
const limits = {
  fileSize: Number(process.env.UPLOAD_MAX_BYTES || 20 * 1024 * 1024), // 20MB
};

let upload;           // middleware base de multer
let uploadsRoot = ""; // usado en modo local

if (driver === "cloudinary") {
  // Recibe buffers; luego los mandamos a Cloudinary
  upload = multer({ storage: multer.memoryStorage(), limits });

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY || process.env.CLD_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET || process.env.CLD_SECRET,
    secure: true,
  });
} else {
  // Modo local: escribe en /uploads (junto al proyecto)
  uploadsRoot = path.resolve(__dirname, "../../uploads");
  fs.mkdirSync(uploadsRoot, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsRoot),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const base = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, base + ext);
    },
  });

  upload = multer({ storage, limits });
}

/** Sube un buffer a Cloudinary y devuelve el resultado */
function cloudinaryUpload(buffer, originalname) {
  const folder = process.env.CLD_FOLDER || "taller";
  const publicId =
    (originalname || "file").replace(/\.[^.]+$/, "") +
    "-" +
    Math.round(Math.random() * 1e9);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, resource_type: "auto" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

/**
 * Normaliza la salida: [{ id, url, filename, mimetype, size, provider }]
 * - en local arma la URL pública con el host de la request o PUBLIC_BASE_URL
 * - en cloudinary usa secure_url y public_id
 */
export async function normalizeFiles(files, req) {
  if (!Array.isArray(files) || files.length === 0) return [];

  if (driver === "cloudinary") {
    const out = [];
    for (const f of files) {
      const r = await cloudinaryUpload(f.buffer, f.originalname);
      out.push({
        id: r.public_id,
        url: r.secure_url,
        filename: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        provider: "cloudinary",
      });
    }
    return out;
  }

  // Local
  const base =
    process.env.PUBLIC_BASE_URL ||
    `${req.protocol}://${req.get("host")}`.replace(/\/$/, "");
  return files.map((f) => ({
    id: path.basename(f.filename),
    url: `${base}/uploads/${encodeURIComponent(path.basename(f.filename))}`,
    filename: f.originalname,
    mimetype: f.mimetype,
    size: f.size,
    provider: "local",
  }));
}

export { upload, uploadsRoot };
