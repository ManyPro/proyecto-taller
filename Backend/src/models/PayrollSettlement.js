import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema({
  conceptId: { type: mongoose.Schema.Types.ObjectId, ref: 'CompanyPayrollConcept' },
  name: { type: String, required: true },
  type: { type: String, enum: ['earning','deduction','surcharge'], required: true },
  base: { type: Number, default: 0 },
  value: { type: Number, required: true },
  calcRule: { type: String, default: '' },
  notes: { type: String, default: '' },
  // Metadatos opcionales (para previsualización/impresión de mano de obra por venta)
  saleId: { type: mongoose.Schema.Types.ObjectId, default: null },
  saleNumber: { type: Number, default: null },
  vehiclePlate: { type: String, default: '' },
  vehicleLabel: { type: String, default: '' }, // placa + detalles (si existen)
  serviceName: { type: String, default: '' },  // nombre servicio/combo asociado
  laborName: { type: String, default: '' },    // tipo de mano de obra (kind)
  // Campos para porcentajes (guardados para liquidación)
  isPercent: { type: Boolean, default: false },
  percentValue: { type: Number, default: null },
  percentBaseType: { type: String, enum: ['total_gross', 'specific_concept', 'fixed_value'], default: 'total_gross' },
  percentBaseConceptId: { type: mongoose.Schema.Types.ObjectId, default: null },
  percentBaseFixedValue: { type: Number, default: 0 }
}, { _id: false });

const PayrollSettlementSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  technicianId: { type: mongoose.Schema.Types.ObjectId, required: false, index: true },
  technicianName: { type: String, required: true, index: true },
  periodId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: 'PayrollPeriod' },
  selectedConceptIds: { type: [mongoose.Schema.Types.ObjectId], default: [] }, // Conceptos seleccionados para aplicar
  items: { type: [ItemSchema], default: [] },
  grossTotal: { type: Number, default: 0 },
  deductionsTotal: { type: Number, default: 0 },
  netTotal: { type: Number, default: 0 },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  approvedAt: { type: Date, default: null },
  paidCashflowId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: 'CashFlowEntry' }, // Mantener para compatibilidad
  paidCashflowIds: { type: [mongoose.Schema.Types.ObjectId], default: [] }, // Múltiples pagos parciales
  paidAmount: { type: Number, default: 0 }, // Monto total pagado hasta ahora
  pdfUrl: { type: String, default: '' },
  status: { type: String, enum: ['draft','approved','paid','partially_paid'], default: 'draft', index: true }
}, { timestamps: true });

// Índice único por técnico y período (una liquidación por técnico por período)
// Usar solo technicianName para la unicidad, ya que technicianId puede ser null
PayrollSettlementSchema.index({ companyId: 1, technicianName: 1, periodId: 1 }, { unique: true });
// Índice auxiliar (NO único) para búsquedas por technicianId cuando existe
// Nota: technicianId puede ser null/ausente; NO usar unique aquí para evitar dup key con null.
PayrollSettlementSchema.index({ companyId: 1, technicianId: 1, periodId: 1 }, { sparse: true });

const PayrollSettlement = mongoose.model('PayrollSettlement', PayrollSettlementSchema);

// Eliminar índice problemático antiguo si existe (migración)
// Este índice causa conflictos cuando technicianId es null
async function dropLegacyIndexes() {
  // Intentar por nombre y por patrón (algunos clusters renombraron índices)
  const ops = [
    // Índice problemático: unique por (companyId, technicianId, periodId) sin sparse efectivo / con nulls
    PayrollSettlement.collection.dropIndex('companyId_1_technicianId_1_periodId_1'),
    PayrollSettlement.collection.dropIndex({ companyId: 1, technicianId: 1, periodId: 1 }),
    // Índice legacy incorrecto: solo permitía 1 liquidación por período en toda la empresa
    PayrollSettlement.collection.dropIndex('companyId_1_periodId_1'),
    PayrollSettlement.collection.dropIndex({ companyId: 1, periodId: 1 })
  ];

  await Promise.allSettled(ops);
}

if (mongoose.connection.readyState === 1) {
  // Si ya está conectado, eliminar el índice inmediatamente
  dropLegacyIndexes().catch(() => {});
} else {
  // Si no está conectado, esperar a que se conecte
  mongoose.connection.once('connected', () => {
    dropLegacyIndexes().catch(() => {});
  });
}

export default PayrollSettlement;


