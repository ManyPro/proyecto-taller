import { Router } from 'express';
import { authCompany } from '../middlewares/auth.js';
import { uploadArray, isCloudinary } from '../lib/upload.js';

const router = Router();

// POST /api/v1/media/upload
router.post('/upload', authCompany, (req, res, next) => {
  uploadArray(req, res, async (err) => {
    if (err) return next(err);

    const base = `${req.protocol}://${req.get('host')}`;
    const companyId = (req.company?.id || 'public').toString();

    const files = (req.files || []).map(f => {
      if (isCloudinary) {
        return {
          url: f.path,          // https://res.cloudinary.com/...
          publicId: f.filename, // public_id
          mimetype: f.mimetype
        };
      }
      // Local: servir desde /uploads/<companyId>/<filename>
      return {
        url: `${base}/uploads/${companyId}/${f.filename}`,
        publicId: f.filename,
        mimetype: f.mimetype
      };
    });

    return res.json({ files });
  });
});

export default router;
