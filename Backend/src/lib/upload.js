// Backend/src/lib/upload.js
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

export const driver = (process.env.UPLOAD_DRIVER || "local").toLowerCase();

let upload;
let uploadsRoot = null;

function safeName(name) {
  return name.replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
}

if (driver === "cloudinary") {
  // Cloudinary
  const { v2: cloudinary } = await import("cloudinary");
  const { CloudinaryStorage } = await import("multer-storage-cloudinary");

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      folder: process.env.CLD_FOLDER || "taller",
      resource_type: file.mimetype.startsWith("video/") ? "video" : "image",
      public_id: `${Date.now()}-${safeName(file.originalname)}`,
      overwrite: false,
    }),
  });

  upload = multer({ storage });
} else {
  // Local
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  uploadsRoot = path.resolve(__dirname, "../../uploads");

  const storage = multer.diskStorage({
    destination: uploadsRoot,
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${safeName(file.originalname)}`);
    },
  });

  upload = multer({ storage });
}

export { upload, uploadsRoot };

export function normalizeFiles(files = []) {
  const arr = Array.isArray(files) ? files : Object.values(files || {});
  return arr.map((f) =>
    driver === "cloudinary"
      ? { url: f.path, publicId: f.filename, mimetype: f.mimetype }
      : { url: `/uploads/${path.basename(f.path)}`, publicId: path.basename(f.path), mimetype: f.mimetype }
  );
}
