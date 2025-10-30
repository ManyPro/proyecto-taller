import mongoose from 'mongoose';
import 'dotenv/config';
import Company from '../src/models/Company.js';
import CompanyPayrollConcept from '../src/models/CompanyPayrollConcept.js';

async function main(){
  const uri = process.env.MONGODB_URI; if(!uri) throw new Error('MONGODB_URI missing');
  const dbName = process.env.MONGODB_DB || 'taller';
  await mongoose.connect(uri, { dbName });
  const companies = await Company.find({ active: true }).select({ _id: 1, name: 1 });
  const defaults = [
    { code: 'BASIC', name: 'Sueldo básico', type: 'earning', amountType: 'fixed', defaultValue: 0, ordering: 10 },
    { code: 'AUX_TRAN', name: 'Auxilio transporte', type: 'earning', amountType: 'fixed', defaultValue: 0, ordering: 20 },
    { code: 'AUX_CONN', name: 'Auxilio conectividad', type: 'earning', amountType: 'fixed', defaultValue: 0, ordering: 30 },
    { code: 'HEALTH', name: 'Salud', type: 'deduction', amountType: 'percent', defaultValue: 4, ordering: 100 },
    { code: 'PENSION', name: 'Pensión', type: 'deduction', amountType: 'percent', defaultValue: 4, ordering: 110 },
  ];
  for(const c of companies){
    for(const d of defaults){
      const exists = await CompanyPayrollConcept.findOne({ companyId: c._id, code: d.code });
      if(!exists){
        await CompanyPayrollConcept.create({ companyId: c._id, ...d, isActive: true });
        console.log(`[seed] ${c.name}: creado ${d.code}`);
      }
    }
  }
  await mongoose.disconnect();
  console.log('OK');
}

main().catch(err => { console.error(err); process.exit(1); });


