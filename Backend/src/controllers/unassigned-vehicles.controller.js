import UnassignedVehicle from '../models/UnassignedVehicle.js';
import CustomerProfile from '../models/CustomerProfile.js';
import Vehicle from '../models/Vehicle.js';
import mongoose from 'mongoose';

// GET /api/v1/profiles/unassigned-vehicles
// Listar clientes sin vehículo asignado (pendientes de aprobación)
export async function listUnassignedVehicles(req, res) {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });
  
  const { status = 'pending', page = 1, pageSize = 25 } = req.query || {};
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 25));
  
  const query = { companyId, status };
  
  const [items, total] = await Promise.all([
    UnassignedVehicle.find(query)
      .populate('profileId', 'customer plate vehicle')
      .populate('suggestedVehicle.vehicleId')
      .sort({ createdAt: -1 })
      .skip((pg - 1) * lim)
      .limit(lim),
    UnassignedVehicle.countDocuments(query)
  ]);
  
  res.json({ items, total, page: pg, pageSize: lim });
}

// GET /api/v1/profiles/unassigned-vehicles/:id
// Obtener un cliente sin vehículo asignado específico
export async function getUnassignedVehicle(req, res) {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });
  
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  
  const item = await UnassignedVehicle.findOne({ _id: id, companyId })
    .populate('profileId', 'customer plate vehicle')
    .populate('suggestedVehicle.vehicleId');
  
  if (!item) {
    return res.status(404).json({ error: 'No encontrado' });
  }
  
  res.json({ item });
}

// POST /api/v1/profiles/unassigned-vehicles/:id/approve
// Aprobar asignación de vehículo a un cliente
export async function approveVehicleAssignment(req, res) {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });
  
  const { id } = req.params;
  const { vehicleId } = req.body || {};
  
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  
  const unassigned = await UnassignedVehicle.findOne({ _id: id, companyId });
  if (!unassigned) {
    return res.status(404).json({ error: 'No encontrado' });
  }
  
  if (unassigned.status !== 'pending') {
    return res.status(400).json({ error: 'Solo se pueden aprobar asignaciones pendientes' });
  }
  
  // Determinar qué vehículo asignar
  let targetVehicleId = vehicleId;
  if (!targetVehicleId && unassigned.suggestedVehicle?.vehicleId) {
    targetVehicleId = unassigned.suggestedVehicle.vehicleId;
  }
  
  if (!targetVehicleId) {
    return res.status(400).json({ error: 'Debe especificar un vehicleId o haber una sugerencia' });
  }
  
  // Verificar que el vehículo existe
  const vehicle = await Vehicle.findOne({ _id: targetVehicleId, active: true });
  if (!vehicle) {
    return res.status(404).json({ error: 'Vehículo no encontrado' });
  }
  
  // Actualizar el CustomerProfile con el vehículo asignado
  const profile = await CustomerProfile.findById(unassigned.profileId);
  if (!profile) {
    return res.status(404).json({ error: 'Perfil de cliente no encontrado' });
  }
  
  // Actualizar vehículo en el perfil
  await CustomerProfile.updateOne(
    { _id: profile._id },
    {
      $set: {
        'vehicle.vehicleId': vehicle._id,
        'vehicle.brand': vehicle.make,
        'vehicle.line': vehicle.line,
        'vehicle.engine': vehicle.displacement,
        'vehicle.year': unassigned.vehicleData.year || null
      }
    }
  );
  
  // Marcar como aprobado
  await UnassignedVehicle.updateOne(
    { _id: id },
    { 
      $set: { 
        status: 'approved',
        notes: req.body.notes || unassigned.notes || ''
      } 
    }
  );
  
  res.json({ 
    success: true, 
    message: 'Vehículo asignado correctamente',
    vehicle: {
      id: vehicle._id,
      make: vehicle.make,
      line: vehicle.line,
      displacement: vehicle.displacement
    }
  });
}

// POST /api/v1/profiles/unassigned-vehicles/:id/reject
// Rechazar asignación (dejar cliente sin vehículo)
export async function rejectVehicleAssignment(req, res) {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });
  
  const { id } = req.params;
  
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  
  const unassigned = await UnassignedVehicle.findOne({ _id: id, companyId });
  if (!unassigned) {
    return res.status(404).json({ error: 'No encontrado' });
  }
  
  if (unassigned.status !== 'pending') {
    return res.status(400).json({ error: 'Solo se pueden rechazar asignaciones pendientes' });
  }
  
  // Marcar como rechazado
  await UnassignedVehicle.updateOne(
    { _id: id },
    { 
      $set: { 
        status: 'rejected',
        notes: req.body.notes || unassigned.notes || ''
      } 
    }
  );
  
  res.json({ 
    success: true, 
    message: 'Asignación rechazada. El cliente permanecerá sin vehículo asignado.'
  });
}

// DELETE /api/v1/profiles/unassigned-vehicles/:id
// Eliminar cliente de la lista (eliminar el cliente completo)
export async function deleteUnassignedVehicle(req, res) {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });
  
  const { id } = req.params;
  
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  
  const unassigned = await UnassignedVehicle.findOne({ _id: id, companyId });
  if (!unassigned) {
    return res.status(404).json({ error: 'No encontrado' });
  }
  
  // Opcional: eliminar también el CustomerProfile si se solicita
  const { deleteProfile = false } = req.query || {};
  
  if (deleteProfile === 'true' && unassigned.profileId) {
    await CustomerProfile.deleteOne({ _id: unassigned.profileId, companyId });
  }
  
  // Marcar como eliminado o eliminar completamente
  await UnassignedVehicle.updateOne(
    { _id: id },
    { $set: { status: 'deleted' } }
  );
  
  res.json({ 
    success: true, 
    message: deleteProfile === 'true' 
      ? 'Cliente eliminado de la lista y perfil eliminado' 
      : 'Cliente eliminado de la lista'
  });
}

// GET /api/v1/profiles/unassigned-vehicles/stats
// Obtener estadísticas de vehículos no asignados
export async function getUnassignedVehiclesStats(req, res) {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });
  
  const [pending, approved, rejected, deleted] = await Promise.all([
    UnassignedVehicle.countDocuments({ companyId, status: 'pending' }),
    UnassignedVehicle.countDocuments({ companyId, status: 'approved' }),
    UnassignedVehicle.countDocuments({ companyId, status: 'rejected' }),
    UnassignedVehicle.countDocuments({ companyId, status: 'deleted' })
  ]);
  
  res.json({
    pending,
    approved,
    rejected,
    deleted,
    total: pending + approved + rejected + deleted
  });
}

