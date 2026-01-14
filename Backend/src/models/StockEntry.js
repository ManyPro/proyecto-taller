import mongoose from "mongoose";

/**
 * StockEntry: Rastrea el stock de un item por entrada específica (compra/proveedor)
 * Permite rastrear la procedencia de cada unidad de stock y aplicar FIFO al descontar
 */
const stockEntrySchema = new mongoose.Schema({
  companyId: { type: mongoose.Types.ObjectId, required: true, index: true },
  itemId: { type: mongoose.Types.ObjectId, ref: "Item", required: true, index: true },
  
  // Entrada vinculada (VehicleIntake - puede ser vehicle o purchase)
  // NOTA: Ahora es opcional para soportar el nuevo sistema de compras
  vehicleIntakeId: { type: mongoose.Types.ObjectId, ref: "VehicleIntake", default: null, index: true },
  
  // Nuevos campos para sistema de compras
  supplierId: { type: mongoose.Types.ObjectId, ref: "Supplier", default: null, index: true },
  investorId: { type: mongoose.Types.ObjectId, ref: "Investor", default: null, index: true },
  purchaseId: { type: mongoose.Types.ObjectId, ref: "Purchase", default: null, index: true },
  
  // Cantidad disponible de esta entrada
  qty: { type: Number, required: true, min: 0 },
  
  // Precio de entrada (opcional, para tracking de costos)
  entryPrice: { type: Number, min: 0, default: null },
  
  // Fecha de entrada (para FIFO)
  entryDate: { type: Date, default: () => new Date(), index: true },
  
  // Metadatos adicionales
  meta: {
    note: { type: String, trim: true, default: "" },
    supplier: { type: String, trim: true, default: "" },
    purchaseOrder: { type: String, trim: true, default: "" }
  }
}, { timestamps: true });

// Índices para búsquedas eficientes
stockEntrySchema.index({ companyId: 1, itemId: 1, entryDate: 1 }); // Para FIFO
stockEntrySchema.index({ companyId: 1, vehicleIntakeId: 1 });
stockEntrySchema.index({ companyId: 1, itemId: 1, qty: 1 }); // Para encontrar entradas con stock disponible
stockEntrySchema.index({ companyId: 1, supplierId: 1 });
stockEntrySchema.index({ companyId: 1, investorId: 1 });
stockEntrySchema.index({ companyId: 1, purchaseId: 1 });

export default mongoose.model("StockEntry", stockEntrySchema);

