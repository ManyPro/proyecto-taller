/**
 * Fix legacy indexes on payrollsettlements collection.
 *
 * Why:
 * - Some deployments have a legacy UNIQUE index on (companyId, periodId) or
 *   (companyId, technicianId, periodId) that blocks creating settlements for multiple techs.
 *
 * Usage (inside backend container):
 *   node scripts/fix_payroll_settlement_indexes.js
 *
 * Needs:
 *   MONGODB_URI env var (same as backend).
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'taller';

if (!uri) {
  console.error('❌ MONGODB_URI no está definido');
  process.exit(1);
}

async function main() {
  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db;
  const col = db.collection('payrollsettlements');

  const indexes = await col.indexes();
  console.log('📌 Indexes actuales:', indexes.map(i => i.name));

  const tryDrop = async (specOrName) => {
    try {
      await col.dropIndex(specOrName);
      console.log('✅ dropIndex ok:', specOrName);
    } catch (e) {
      console.log('ℹ️ dropIndex skip:', specOrName, '-', e?.message || e);
    }
  };

  // Drop legacy / wrong ones (by common names/specs)
  await tryDrop('companyId_1_periodId_1');
  await tryDrop({ companyId: 1, periodId: 1 });
  await tryDrop('companyId_1_technicianId_1_periodId_1');
  await tryDrop({ companyId: 1, technicianId: 1, periodId: 1 });

  // Extra: drop any UNIQUE index that matches these key patterns even if renamed
  const idxAfterAttempt = await col.indexes();
  for (const idx of idxAfterAttempt) {
    const key = idx.key || {};
    const isUnique = idx.unique === true;
    const isCompanyPeriod =
      key.companyId === 1 && key.periodId === 1 && Object.keys(key).length === 2;
    const isCompanyTechPeriod =
      key.companyId === 1 && key.technicianId === 1 && key.periodId === 1 && Object.keys(key).length === 3;

    if (isUnique && (isCompanyPeriod || isCompanyTechPeriod)) {
      await tryDrop(idx.name);
    }
  }

  // Final list
  const indexesAfter = await col.indexes();
  console.log('📌 Indexes después:', indexesAfter.map(i => i.name));

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('❌ Error:', e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});

