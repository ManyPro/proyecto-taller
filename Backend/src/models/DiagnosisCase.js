import mongoose from 'mongoose';
import { CASE_STATUS_OPTIONS, SKIP_REASONS } from '../lib/diagnosis/engines.js';

const ParameterSchema = new mongoose.Schema({
  name: { type: String, default: '', trim: true },
  value: { type: String, default: '', trim: true },
  unit: { type: String, default: '', trim: true },
  condition: { type: String, default: '', trim: true }
}, { _id: false });

const DtcSchema = new mongoose.Schema({
  code: { type: String, default: '', trim: true, uppercase: true },
  description: { type: String, default: '', trim: true },
  status: { type: String, default: '', trim: true }
}, { _id: false });

const MessageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
  type: { type: String, default: 'texto' },
  content: { type: String, default: '' },
  structured: { type: mongoose.Schema.Types.Mixed, default: null },
  clientRequestId: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const MeasurementSchema = new mongoose.Schema({
  name: { type: String, default: '', trim: true },
  value: { type: String, default: '', trim: true },
  unit: { type: String, default: '', trim: true },
  condition: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true },
  at: { type: Date, default: Date.now }
}, { _id: true });

const TestSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  status: { type: String, enum: ['pendiente', 'completada', 'omitida'], default: 'pendiente' },
  result: { type: String, default: '' },
  skipReason: { type: String, enum: [...SKIP_REASONS, ''], default: '' },
  at: { type: Date, default: Date.now }
}, { _id: true });

const DiagnosisCaseSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    caseNumber: { type: Number, required: true },
    title: { type: String, default: '', trim: true },
    status: { type: String, enum: CASE_STATUS_OPTIONS, default: 'abierto', index: true },
    vehicle: {
      plate: { type: String, default: '', trim: true, uppercase: true },
      model: { type: String, default: '', trim: true },
      year: { type: Number, default: null },
      engineCode: { type: String, default: 'UNKNOWN', trim: true },
      engineLabel: { type: String, default: '', trim: true },
      engineNotes: { type: String, default: '', trim: true },
      mileageKm: { type: Number, default: null },
      transmission: { type: String, default: 'no_se' },
      fuel: { type: String, default: 'gasolina' },
      cngConversion: { type: Boolean, default: false }
    },
    symptom: {
      main: { type: String, default: '', trim: true },
      description: { type: String, default: '', trim: true },
      when: { type: [String], default: [] },
      dtcStatus: { type: String, enum: ['sin_codigos', 'no_leidos', 'con_codigos'], default: 'no_leidos' },
      dtcs: { type: [DtcSchema], default: [] }
    },
    conditions: {
      engineRunning: { type: String, enum: ['encendido', 'apagado', 'no_se'], default: 'no_se' },
      coolantTemp: { type: String, default: '', trim: true },
      rpm: { type: String, default: '', trim: true },
      ac: { type: String, enum: ['on', 'off', 'no_se'], default: 'no_se' },
      city: { type: String, default: 'Bogotá', trim: true },
      altitudeNote: { type: String, default: 'Bogotá ~2600 m. Interpretar MAP/baro según altitud.' }
    },
    history: {
      recentRepairs: { type: String, default: '', trim: true },
      testsDone: { type: String, default: '', trim: true }
    },
    parameters: { type: [ParameterSchema], default: [] },
    ecu: {
      identification: { type: String, default: '', trim: true },
      software: { type: String, default: '', trim: true }
    },
    freezeFrame: { type: String, default: '', trim: true },
    messages: { type: [MessageSchema], default: [] },
    measurements: { type: [MeasurementSchema], default: [] },
    tests: { type: [TestSchema], default: [] },
    hypotheses: { type: [mongoose.Schema.Types.Mixed], default: [] },
    evidence: { type: [mongoose.Schema.Types.Mixed], default: [] },
    pendingTest: { type: mongoose.Schema.Types.Mixed, default: null },
    lastAssistantOutput: { type: mongoose.Schema.Types.Mixed, default: null },
    retrievedSources: { type: [mongoose.Schema.Types.Mixed], default: [] },
    knowledgeStatus: { type: String, enum: ['pendiente', 'disponible'], default: 'pendiente' },
    includeReviewedCases: { type: Boolean, default: false },
    reviewedByWorkshop: { type: Boolean, default: false },
    repair: {
      applied: { type: String, default: '', trim: true },
      notes: { type: String, default: '', trim: true },
      at: { type: Date, default: null },
      by: { type: mongoose.Schema.Types.ObjectId, default: null }
    },
    verification: {
      result: { type: String, default: '', trim: true },
      notes: { type: String, default: '', trim: true },
      at: { type: Date, default: null },
      by: { type: mongoose.Schema.Types.ObjectId, default: null }
    },
    usage: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
      turns: { type: Number, default: 0 },
      dayTurns: { type: Number, default: 0 },
      lastModel: { type: String, default: '' },
      lastResponseId: { type: String, default: '' },
      lastTurnAt: { type: Date, default: null }
    },
    promptVersion: { type: String, default: '' },
    pendingTurnId: { type: String, default: '' },
    pendingTurnAt: { type: Date, default: null },
    lastClientRequestId: { type: String, default: '' },
    lastError: { type: String, default: '' }
  },
  { timestamps: true }
);

DiagnosisCaseSchema.index({ companyId: 1, caseNumber: 1 }, { unique: true });
DiagnosisCaseSchema.index({ companyId: 1, status: 1, updatedAt: -1 });
DiagnosisCaseSchema.index({ companyId: 1, 'vehicle.plate': 1, updatedAt: -1 });
DiagnosisCaseSchema.index({ companyId: 1, title: 1 });
DiagnosisCaseSchema.index({ companyId: 1, 'vehicle.model': 1 });

export default mongoose.model('DiagnosisCase', DiagnosisCaseSchema);
