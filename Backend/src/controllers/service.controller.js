import Service from '../models/Service.js';

export const listServices = async (req, res) => {
  const items = await Service.find({ companyId: req.companyId }).sort({ name: 1 }).lean();
  res.json({ items });
};

export const createService = async (req, res) => {
  const body = req.body || {};
  body.companyId = req.companyId;
  body.createdBy = req.userId || null;
  const saved = await Service.create(body);
  res.status(201).json(saved);
};

export const updateService = async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const saved = await Service.findOneAndUpdate(
    { _id: id, companyId: req.companyId },
    { $set: body },
    { new: true }
  );
  if (!saved) return res.status(404).json({ error: 'Servicio no encontrado' });
  res.json(saved);
};

export const deleteService = async (req, res) => {
  const { id } = req.params;
  const ok = await Service.findOneAndDelete({ _id: id, companyId: req.companyId });
  if (!ok) return res.status(404).json({ error: 'Servicio no encontrado' });
  res.json({ ok: true });
};
