import mongoose from 'mongoose';
import CashFlowEntry from '../models/CashFlowEntry.js';
import Account from '../models/Account.js';
import Company from '../models/Company.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://giovannymanriquelol_db_user:XfOvU9NYHxoNgKAl@cluster0.gs3ajdl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function fixBalances(companyName = null) {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Buscar empresa si se especifica
    let companyQuery = {};
    if (companyName) {
      const company = await Company.findOne({ name: { $regex: companyName, $options: 'i' } });
      if (!company) {
        console.error(`❌ Empresa "${companyName}" no encontrada`);
        process.exit(1);
      }
      companyQuery = { _id: company._id };
      console.log(`📋 Procesando empresa: ${company.name} (${company._id})`);
    } else {
      console.log('📋 Procesando todas las empresas');
    }

    // Obtener todas las cuentas
    const accounts = await Account.find(companyQuery ? { companyId: companyQuery._id } : {}).lean();
    console.log(`📊 Encontradas ${accounts.length} cuentas`);

    let totalFixed = 0;
    let totalEntries = 0;

    for (const account of accounts) {
      const companyId = account.companyId;
      const accountId = account._id;
      const initialBalance = account.initialBalance || 0;

      // Obtener todas las entradas ordenadas por fecha
      const entries = await CashFlowEntry.find({ companyId, accountId })
        .sort({ date: 1, _id: 1 })
        .lean();

      if (entries.length === 0) continue;

      let runningBalance = initialBalance;
      const updates = [];

      for (const entry of entries) {
        if (entry.kind === 'IN') {
          runningBalance += (entry.amount || 0);
        } else if (entry.kind === 'OUT') {
          runningBalance -= (entry.amount || 0);
        }

        // Solo actualizar si el balance es diferente
        if (entry.balanceAfter !== runningBalance) {
          updates.push({
            updateOne: {
              filter: { _id: entry._id },
              update: { $set: { balanceAfter: runningBalance } }
            }
          });
          totalFixed++;
        }
        totalEntries++;
      }

      // Ejecutar actualizaciones en batch
      if (updates.length > 0) {
        await CashFlowEntry.bulkWrite(updates);
        console.log(`✅ Cuenta ${account.name}: Corregidos ${updates.length} de ${entries.length} movimientos`);
      }
    }

    console.log(`\n✅ Proceso completado:`);
    console.log(`   - Total de entradas procesadas: ${totalEntries}`);
    console.log(`   - Total de balances corregidos: ${totalFixed}`);

    await mongoose.disconnect();
    console.log('✅ Desconectado de MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Ejecutar script
const companyName = process.argv[2] || null;
fixBalances(companyName).then(() => {
  process.exit(0);
});

