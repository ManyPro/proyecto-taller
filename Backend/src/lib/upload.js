// Backend/src/lib/upload.js
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Driver: "cloudinary" (producción) o "local" (dev)
export const driver = process.env.UPLOAD_DRIVER || "local";

// Carpeta física para driver local
export const uploadsRoot = path.resolve(__dirname, "../../uploads");

// Límite de tamaño y número de archivos (configurables por ENV)
const MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024); // 10MB
const MAX_FILES = Number(process.env.UPLOAD_MAX_FILES || 6);

// Multer en memoria (sirve tanto para cloudinary como para local)
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: MAX_FILES },
}).array("files", MAX_FILES);

/**
 * Sube los buffers recibidos por Multer y devuelve
 * un array normalizado [{ id, url, filename, mimetype, size, provider }]
 */
export async function normalizeFiles(files, companyId = "inventory_unsigned") {
  if (!Array.isArray(files) || files.length === 0) return [];

  if (driver === "cloudinary") {
    const { v2: cloudinary } = await import("cloudinary");
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    const folder = process.env.CLD_FOLDER || "taller";
    const out = [];

    for (const f of files) {
      const publicId = `${companyId}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder, public_id: publicId, resource_type: "image" },
          (err, res) => (err ? reject(err) : resolve(res))
        );
        stream.end(f.buffer);
      });

      out.push({
        id: result.public_id,
        url: result.secure_url,
        filename: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        provider: "cloudinary",
      });
    }

    return out;
  }

  // ----- DRIVER LOCAL -----
  if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });

  const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:4000";

  return files.map((f) => {
    const ext = path.extname(f.originalname || "") || ".bin";
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const target = path.join(uploadsRoot, safeName);
    fs.writeFileSync(target, f.buffer);

    return {
      id: safeName,
      url: `${baseUrl}/uploads/${safeName}`,
      filename: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
      provider: "local",
    };
  });
}

/**
 * Eliminación en Cloudinary (no hace nada en local)
 */
export async function deleteRemote(publicId) {
  if (driver !== "cloudinary" || !publicId) return;
  const { v2: cloudinary } = await import("cloudinary");
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch (e) {
    console.warn("Cloudinary delete error:", e?.message || e);
  }
}
