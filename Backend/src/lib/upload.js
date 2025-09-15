// Backend/src/lib/upload.js
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Helper para __dirname en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRIVER = process.env.UPLOAD_DRIVER || "local";

// Multer en memoria (sirve tanto para local como cloudinary)
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 }, // 10MB, máximo 5 archivos
}).array("files", 5);

// Guarda un archivo y devuelve { url, publicId }
export async function saveUploadedFile(file, companyId = "inventory_unsigned") {
  if (DRIVER === "cloudinary") {
    // import dinámico: solo carga cloudinary si lo vas a usar
    const { v2: cloudinary } = await import("cloudinary");
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    const folder = process.env.CLD_FOLDER || "taller";
    const publicIdBase = `${companyId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const buffer = file.buffer;
    const res = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, public_id: publicIdBase, resource_type: "image" },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      stream.end(buffer);
    });

    return { url: res.secure_url, publicId: res.public_id };
  }

  // --- Modo local ---
  const uploadsDir = path.resolve(__dirname, "../../uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const ext = path.extname(file.originalname || "").toLowerCase() || ".bin";
  const safeName = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}${ext}`;
  const target = path.join(uploadsDir, safeName);

  fs.writeFileSync(target, file.buffer);
  const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:4000";
  const url = `${baseUrl}/uploads/${safeName}`;

  return { url, publicId: `local:${safeName}` };
}

export async function deleteRemoteFile(publicId) {
  if (DRIVER !== "cloudinary") return;

  const { v2: cloudinary } = await import("cloudinary");
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch (e) {
    // No rompas el flujo si falla la eliminación
    console.warn("Cloudinary delete error:", e?.message || e);
  }
}
