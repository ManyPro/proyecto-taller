#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import Sale from '../src/models/Sale.js';

dotenv.config();

/*
 Script: purge_incomplete_legacy_sales.js
 Goal:
  - Remove legacy Sale documents created without detailed pricing (empty items and zero totals).
  - Intended to clean up partial imports before running the detailed legacy migration.

 Usage:
  node scripts/purge_incomplete_legacy_sales.js \
    --mongo "mongodb://localhost:27017" \
    [--companyIds 68cb18f4202d108152a26e4c,68c871198d7595062498d7a1] \
    [--maxTotal 0] \
    [--status closed,draft] \
    [--limit 500] \
    [--dry] \
    [--force]

 Flags:
  --mongo        Mongo connection string (required unless MONGODB_URI exists).
  --companyIds   Comma separated Mongo company ids to filter.
  --maxTotal     Upper bound applied to total/subtotal (default 0).
  --status       Comma separated statuses to include (default closed,draft).
  --limit        Process at most N matches.
  --dry          Preview without deleting.
  --force        Execute deletion (omit to keep preview mode).
  --all          Ignore legacy filters and delete every Sale that matches status/company filters.
*/

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    let token = argv[i];
    if (!token.startsWith('--')) continue;
    token = token.slice(2);
    if (token.includes('=')) {
      const [k, v] = token.split(/=(.*)/);
      out[k] = v;
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[token] = next; i++; }
      else out[token] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const dryRun = !!args.dry;
const force = !!args.force || !!args.confirm || !!args.yes;
const limit = args.limit ? parseInt(args.limit, 10) : null;
const maxTotal = args.maxTotal !== undefined ? Number(args.maxTotal) : 0;
const statuses = args.status
  ? String(args.status).split(',').map(s => s.trim()).filter(Boolean)
  : ['closed', 'draft'];
const purgeAll = !!args.all;
const statusSpecialToken = statuses.length === 1 && ['all', '*', 'any'].includes(statuses[0].toLowerCase());
const statusFilter = statusSpecialToken ? null : statuses;

function toObjectIds(input) {
  const ids = [];
  for (const raw of input) {
    try {
      ids.push(new mongoose.Types.ObjectId(String(raw).trim()));
    } catch (err) {
      console.error(`Invalid company id: ${raw}`);
      process.exit(1);
    }
  }
  return ids;
}

const companyIds = args.companyIds
  ? toObjectIds(String(args.companyIds).split(',').map(s => s.trim()).filter(Boolean))
  : [];

const legacyMarkerRegex = /LEGACY\s+or_id=/i;

let match;
if (purgeAll) {
  match = {};
} else {
  match = {
    legacyOrId: { $exists: true, $ne: '' },
    notes: { $regex: legacyMarkerRegex },
    $and: [
      { $or: [{ total: { $exists: false } }, { total: { $lte: maxTotal } }] },
      { $or: [{ subtotal: { $exists: false } }, { subtotal: { $lte: maxTotal } }] },
      { $or: [{ items: { $exists: false } }, { items: { $size: 0 } }] }
    ]
  };
}

if (statusFilter && statusFilter.length) {
  match.status = { $in: statusFilter };
}

if (companyIds.length === 1) match.companyId = companyIds[0];
else if (companyIds.length > 1) match.companyId = { $in: companyIds };

async function main() {
  const uri = args.mongo || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Missing Mongo connection string: use --mongo or set MONGODB_URI');
    process.exit(1);
  }

  await connectDB(uri);

  if (purgeAll) {
    console.warn('*** WARNING: --all mode ignores legacy filters and will delete every sale matching the provided status/company filters. ***');
    if (dryRun) {
      console.warn('    (Currently running in preview mode because --dry is set.)');
    }
  }

  const totalMatches = await Sale.countDocuments(match);
  if (totalMatches === 0) {
    console.log(purgeAll ? 'No sales matched the purge criteria.' : 'No legacy sales matched the purge criteria.');
    return;
  }

  let query = Sale.find(match)
    .select('_id companyId legacyOrId status total subtotal createdAt updatedAt')
    .sort({ createdAt: -1, _id: -1 });
  if (limit) query = query.limit(limit);
  const rows = await query.lean();

  const previewCount = rows.length;
  if (purgeAll) {
    console.log(`Matched sales: ${totalMatches}${limit ? ` (showing first ${previewCount} due to limit)` : ''}`);
  } else {
    console.log(`Matched legacy sales: ${totalMatches}${limit ? ` (showing first ${previewCount} due to limit)` : ''}`);
  }
  const sample = rows.slice(0, Math.min(10, rows.length));
  sample.forEach(row => {
    const created = row.createdAt ? new Date(row.createdAt).toISOString() : 'n/a';
    const subtotal = row.subtotal ?? 'n/a';
    const total = row.total ?? 'n/a';
    const parts = [
      `saleId=${row._id}`,
      `companyId=${row.companyId}`,
      `status=${row.status ?? 'n/a'}`,
      `subtotal=${subtotal}`,
      `total=${total}`,
      `createdAt=${created}`
    ];
    if (row.legacyOrId) parts.splice(1, 0, `legacyOrId=${row.legacyOrId}`);
    console.log(` - ${parts.join(' ')}`);
  });

  if (dryRun || !force) {
    console.log('Preview only. Re-run with --force to delete.' + (dryRun ? '' : ' (Add --dry to preview without DB writes.)'));
    return;
  }

  if (!rows.length) {
    console.log('No rows retrieved for deletion (limit may be zero). Nothing to delete.');
    return;
  }

  const ids = rows.map(row => row._id);
  const result = await Sale.deleteMany({ _id: { $in: ids } });
  console.log(`Deleted ${result.deletedCount} sale(s).`);

  if (!limit && result.deletedCount < totalMatches) {
    const remaining = totalMatches - result.deletedCount;
    console.log(`${remaining} additional sale(s) still match the filter. Re-run the script if you want to remove all of them.`);
  } else if (limit && totalMatches > limit) {
    const remaining = totalMatches - result.deletedCount;
    console.log(`${remaining} sale(s) remain because --limit was applied.`);
  }
}

main()
  .then(() => mongoose.connection.close().catch(() => {}))
  .catch(err => {
    console.error(err);
    mongoose.connection.close().catch(() => {});
    process.exit(1);
  });
