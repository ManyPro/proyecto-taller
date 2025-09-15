import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const DRIVER = (process.env.UPLOAD_DRIVER || 'cloudinary').toLowerCase();
let uploader;

if (DRIVER === 'cloudinary') {
  // Config Cloudinary desde env
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

  const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      folder: process.env.CLD_FOLDER || 'taller',
      resource_type: 'auto' // permite imágenes, video, pdf, etc.
    })
  });

  uploader = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
  });
} else {
  // Local disk
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const dir = path.join(__dirname, '..', '..', 'uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      const name = crypto.randomUUID().replace(/-/g, '');
      cb(null, `${Date.now()}_${name}${ext}`);
    }
  });

  uploader = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }
  });
}

export const uploadArray = uploader.array('files[]', 12);
export const isCloudinary = DRIVER === 'cloudinary';
export { cloudinary };
