// Backend/src/controllers/chats.controller.js
import Chat from '../models/Chat.js';
import Item from '../models/Item.js';
import Vehicle from '../models/Vehicle.js';
import Quote from '../models/Quote.js';
import { publish } from '../lib/live.js';
import mongoose from 'mongoose';

// Helper para obtener filtro de companyId considerando base de datos compartida
async function getItemQueryCompanyFilter(req) {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return null;
  
  // Si hay base compartida, buscar en ambas empresas
  if (req.hasSharedDatabase) {
    const Company = (await import('../models/Company.js')).default;
    const company = await Company.findById(req.originalCompanyId || companyId).select('sharedDatabaseConfig sharedDatabaseId').lean();
    
    if (company?.sharedDatabaseConfig?.sharedFrom?.companyId) {
      // Empresa secundaria: buscar en principal y secundaria
      return {
        $or: [
          { companyId: new mongoose.Types.ObjectId(company.sharedDatabaseConfig.sharedFrom.companyId) },
          { companyId: new mongoose.Types.ObjectId(req.originalCompanyId || companyId) }
        ]
      };
    } else if (company?.sharedDatabaseConfig?.sharedWith?.length > 0) {
      // Empresa principal: buscar en principal y todas las secundarias
      const companyIds = [new mongoose.Types.ObjectId(companyId)];
      company.sharedDatabaseConfig.sharedWith.forEach(sw => {
        companyIds.push(new mongoose.Types.ObjectId(sw.companyId));
      });
      return { companyId: { $in: companyIds } };
    } else if (company?.sharedDatabaseId) {
      // Sistema antiguo
      return {
        $or: [
          { companyId: new mongoose.Types.ObjectId(company.sharedDatabaseId) },
          { companyId: new mongoose.Types.ObjectId(req.originalCompanyId || companyId) }
        ]
      };
    }
  }
  
  return { companyId: new mongoose.Types.ObjectId(companyId) };
}

// Listar chats activos
export const listChats = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta empresa (companyId)' });

  const { active = true } = req.query;
  const query = { companyId };
  if (active !== undefined) {
    query.active = active === 'true' || active === true;
  }

  const chats = await Chat.find(query)
    .populate('vehicle.vehicleId', 'make line displacement modelYear')
    .populate('inventoryHistory.itemId', 'sku name stock salePrice')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ items: chats });
};

// Obtener un chat por ID
export const getChat = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta empresa (companyId)' });

  const { id } = req.params;
  const chat = await Chat.findOne({ _id: id, companyId })
    .populate('vehicle.vehicleId', 'make line displacement modelYear')
    .populate('inventoryHistory.itemId', 'sku name stock salePrice')
    .lean();

  if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });

  res.json({ item: chat });
};

// Crear chat
export const createChat = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta empresa (companyId)' });

  const { customer, vehicle, technician, context, platform } = req.body || {};

  if (!customer || !customer.name || !customer.phone) {
    return res.status(400).json({ error: 'Cliente con nombre y teléfono requeridos' });
  }

  // Validar vehículo si se proporciona vehicleId
  let vehicleData = {
    vehicleId: vehicle?.vehicleId || null,
    year: vehicle?.year || ''
  };

  if (vehicleData.vehicleId) {
    const vehicleDoc = await Vehicle.findById(vehicleData.vehicleId);
    if (!vehicleDoc || !vehicleDoc.active) {
      return res.status(404).json({ error: 'Vehículo no encontrado o inactivo' });
    }
  }

  const chat = await Chat.create({
    companyId,
    createdBy: req.userId || req.user?.id || undefined,
    customer: {
      name: customer.name.trim(),
      phone: customer.phone.trim()
    },
    vehicle: vehicleData,
    technician: technician ? String(technician).trim() : '',
    context: context ? String(context).trim() : '',
    platform: platform || 'WhatsApp',
    active: true
  });

  // Publicar evento en vivo
  await publish(companyId, 'chat:created', { id: chat._id });

  const populated = await Chat.findById(chat._id)
    .populate('vehicle.vehicleId', 'make line displacement modelYear')
    .lean();

  res.status(201).json({ item: populated });
};

// Actualizar chat
export const updateChat = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta empresa (companyId)' });

  const { id } = req.params;
  const update = req.body || {};

  const chat = await Chat.findOne({ _id: id, companyId });
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });

  // Actualizar campos permitidos
  if (update.customer) {
    if (update.customer.name) chat.customer.name = String(update.customer.name).trim();
    if (update.customer.phone) chat.customer.phone = String(update.customer.phone).trim();
  }

  if (update.vehicle) {
    if (update.vehicle.vehicleId) {
      const vehicleDoc = await Vehicle.findById(update.vehicle.vehicleId);
      if (!vehicleDoc || !vehicleDoc.active) {
        return res.status(404).json({ error: 'Vehículo no encontrado o inactivo' });
      }
      chat.vehicle.vehicleId = update.vehicle.vehicleId;
    }
    if (update.vehicle.year !== undefined) chat.vehicle.year = String(update.vehicle.year).trim();
  }

  if (update.technician !== undefined) chat.technician = String(update.technician).trim();
  if (update.context !== undefined) chat.context = String(update.context).trim();
  if (update.platform) chat.platform = update.platform;
  if (update.quotePrice !== undefined) chat.quotePrice = update.quotePrice === null ? null : Number(update.quotePrice);
  if (update.escalatedToAdmin !== undefined) chat.escalatedToAdmin = !!update.escalatedToAdmin;
  if (update.active !== undefined) chat.active = !!update.active;

  await chat.save();

  // Publicar evento en vivo
  await publish(companyId, 'chat:updated', { id: chat._id });

  const populated = await Chat.findById(chat._id)
    .populate('vehicle.vehicleId', 'make line displacement modelYear')
    .populate('inventoryHistory.itemId', 'sku name stock salePrice')
    .lean();

  res.json({ item: populated });
};

// Agregar item al historial de inventario
export const addInventoryItem = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta empresa (companyId)' });

  const { id } = req.params;
  const { itemId } = req.body || {};

  if (!itemId) return res.status(400).json({ error: 'itemId requerido' });

  const chat = await Chat.findOne({ _id: id, companyId });
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });

  // Verificar que el item existe (considerando base de datos compartida)
  const itemCompanyFilter = await getItemQueryCompanyFilter(req);
  const item = await Item.findOne({ _id: itemId, ...itemCompanyFilter });
  if (!item) return res.status(404).json({ error: 'Item no encontrado' });

  // Verificar si ya está en el historial
  const exists = chat.inventoryHistory.some(h => String(h.itemId) === String(itemId));
  if (exists) {
    return res.status(400).json({ error: 'El item ya está en el historial' });
  }

  // Agregar al historial
  chat.inventoryHistory.push({
    itemId: item._id,
    sku: item.sku || '',
    name: item.name || '',
    searchedAt: new Date()
  });

  await chat.save();

  // Publicar evento en vivo
  await publish(companyId, 'chat:updated', { id: chat._id });

  const populated = await Chat.findById(chat._id)
    .populate('vehicle.vehicleId', 'make line displacement modelYear')
    .populate('inventoryHistory.itemId', 'sku name stock salePrice')
    .lean();

  res.json({ item: populated });
};

// Agregar comentario
export const addComment = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta empresa (companyId)' });

  const { id } = req.params;
  const { text } = req.body || {};

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Texto del comentario requerido' });
  }

  const chat = await Chat.findOne({ _id: id, companyId });
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });

  chat.comments.push({
    text: text.trim(),
    createdBy: req.userId || req.user?.id || undefined,
    createdAt: new Date()
  });

  await chat.save();

  // Publicar evento en vivo
  await publish(companyId, 'chat:updated', { id: chat._id });

  const populated = await Chat.findById(chat._id)
    .populate('vehicle.vehicleId', 'make line displacement modelYear')
    .populate('inventoryHistory.itemId', 'sku name stock salePrice')
    .lean();

  res.json({ item: populated });
};

// Eliminar chat
export const deleteChat = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta empresa (companyId)' });

  const { id } = req.params;
  const chat = await Chat.findOne({ _id: id, companyId });
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });

  await Chat.deleteOne({ _id: id });

  // Publicar evento en vivo
  await publish(companyId, 'chat:deleted', { id: chat._id });

  res.status(204).end();
};

