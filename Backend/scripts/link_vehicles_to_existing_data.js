#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import Vehicle from '../src/models/Vehicle.js';
import Sale from '../src/models/Sale.js';
import Quote from '../src/models/Quote.js';
import CustomerProfile from '../src/models/CustomerProfile.js';
import PriceEntry from '../src/models/PriceEntry.js';

dotenv.config();

/*
Script: link_vehicles_to_existing_data.js
Goal: Linkear vehículos de la BD global a ventas, cotizaciones, perfiles y precios existentes

Usage:
  node scripts/link_vehicles_to_existing_data.js [--dry] [--limit 1000]

Flags:
  --dry     Preview sin escribir cambios
  --limit   Procesar solo N registros por tipo
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

function cleanStr(v) {
  return String(v ?? '').trim().toUpperCase();
}

async function findVehicle(brand, line, engine) {
  if (!brand || !line || !engine) return null;
  try {
    return await Vehicle.findOne({
      make: cleanStr(brand),
      line: cleanStr(line),
      displacement: cleanStr(engine),
      active: true
    });
  } catch {
    return null;
  }
}

const args = parseArgs(process.argv.slice(2));
const dryRun = !!args.dry;
const limit = args.limit ? parseInt(args.limit, 10) : null;

async function main() {
  try {
    if (!dryRun) {
      await connectDB();
      console.log('✅ Conectado a MongoDB');
    } else {
      console.log('🔍 Modo DRY RUN - No se escribirán cambios');
    }

    let totalLinked = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    // 1. Linkear CustomerProfiles
    console.log('\n📋 Procesando CustomerProfiles...');
    const profilesQuery = {
      $or: [
        { 'vehicle.vehicleId': { $exists: false } },
        { 'vehicle.vehicleId': null }
      ],
      'vehicle.brand': { $exists: true, $ne: '' },
      'vehicle.line': { $exists: true, $ne: '' },
      'vehicle.engine': { $exists: true, $ne: '' }
    };
    const profiles = await CustomerProfile.find(profilesQuery).limit(limit || 10000);
    console.log(`  Encontrados ${profiles.length} perfiles sin vehicleId`);
    
    let profilesLinked = 0;
    for (const profile of profiles) {
      const vehicle = await findVehicle(profile.vehicle.brand, profile.vehicle.line, profile.vehicle.engine);
      if (vehicle) {
        if (!dryRun) {
          profile.vehicle.vehicleId = vehicle._id;
          await profile.save();
        }
        profilesLinked++;
        if (profilesLinked % 100 === 0) {
          console.log(`  ✅ Linkeados: ${profilesLinked}...`);
        }
      } else {
        totalSkipped++;
      }
    }
    console.log(`  ✅ CustomerProfiles linkeados: ${profilesLinked}`);
    totalLinked += profilesLinked;

    // 2. Linkear Sales
    console.log('\n📋 Procesando Sales...');
    const salesQuery = {
      $or: [
        { 'vehicle.vehicleId': { $exists: false } },
        { 'vehicle.vehicleId': null }
      ],
      'vehicle.brand': { $exists: true, $ne: '' },
      'vehicle.line': { $exists: true, $ne: '' },
      'vehicle.engine': { $exists: true, $ne: '' }
    };
    const sales = await Sale.find(salesQuery).limit(limit || 10000);
    console.log(`  Encontradas ${sales.length} ventas sin vehicleId`);
    
    let salesLinked = 0;
    for (const sale of sales) {
      const vehicle = await findVehicle(sale.vehicle.brand, sale.vehicle.line, sale.vehicle.engine);
      if (vehicle) {
        if (!dryRun) {
          sale.vehicle.vehicleId = vehicle._id;
          await sale.save();
        }
        salesLinked++;
        if (salesLinked % 100 === 0) {
          console.log(`  ✅ Linkeadas: ${salesLinked}...`);
        }
      } else {
        totalSkipped++;
      }
    }
    console.log(`  ✅ Sales linkeadas: ${salesLinked}`);
    totalLinked += salesLinked;

    // 3. Linkear Quotes
    console.log('\n📋 Procesando Quotes...');
    const quotesQuery = {
      $or: [
        { 'vehicle.vehicleId': { $exists: false } },
        { 'vehicle.vehicleId': null }
      ],
      'vehicle.make': { $exists: true, $ne: '' },
      'vehicle.line': { $exists: true, $ne: '' },
      'vehicle.displacement': { $exists: true, $ne: '' }
    };
    const quotes = await Quote.find(quotesQuery).limit(limit || 10000);
    console.log(`  Encontradas ${quotes.length} cotizaciones sin vehicleId`);
    
    let quotesLinked = 0;
    for (const quote of quotes) {
      const vehicle = await findVehicle(quote.vehicle.make, quote.vehicle.line, quote.vehicle.displacement);
      if (vehicle) {
        if (!dryRun) {
          quote.vehicle.vehicleId = vehicle._id;
          await quote.save();
        }
        quotesLinked++;
        if (quotesLinked % 100 === 0) {
          console.log(`  ✅ Linkeadas: ${quotesLinked}...`);
        }
      } else {
        totalSkipped++;
      }
    }
    console.log(`  ✅ Quotes linkeadas: ${quotesLinked}`);
    totalLinked += quotesLinked;

    // 4. Linkear PriceEntries
    console.log('\n📋 Procesando PriceEntries...');
    const pricesQuery = {
      $or: [
        { vehicleId: { $exists: false } },
        { vehicleId: null }
      ],
      brand: { $exists: true, $ne: '' },
      line: { $exists: true, $ne: '' },
      engine: { $exists: true, $ne: '' }
    };
    const prices = await PriceEntry.find(pricesQuery).limit(limit || 10000);
    console.log(`  Encontrados ${prices.length} precios sin vehicleId`);
    
    let pricesLinked = 0;
    for (const price of prices) {
      const vehicle = await findVehicle(price.brand, price.line, price.engine);
      if (vehicle) {
        if (!dryRun) {
          price.vehicleId = vehicle._id;
          await price.save();
        }
        pricesLinked++;
        if (pricesLinked % 100 === 0) {
          console.log(`  ✅ Linkeados: ${pricesLinked}...`);
        }
      } else {
        totalSkipped++;
      }
    }
    console.log(`  ✅ PriceEntries linkeados: ${pricesLinked}`);
    totalLinked += pricesLinked;

    console.log('\n📊 Resumen final:');
    console.log(`  ✅ Total linkeados: ${totalLinked}`);
    console.log(`  ⏭️  Total omitidos (sin vehículo en BD): ${totalSkipped}`);
    console.log(`  ❌ Total errores: ${totalErrors}`);

    if (!dryRun) {
      console.log('\n✅ Migración completada');
      await mongoose.connection.close();
    }
  } catch (err) {
    console.error('❌ Error fatal:', err);
    process.exit(1);
  }
}

main();

