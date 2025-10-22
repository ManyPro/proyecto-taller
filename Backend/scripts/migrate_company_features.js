import mongoose from 'mongoose';
import Company from '../src/models/Company.js';
import { connectDB } from '../src/lib/db.js';

// Default features for all companies
const defaultFeatures = {
  notas: true,
  ventas: true,
  cotizaciones: true,
  inventario: true,
  precios: true,
  cashflow: true,
  techreport: true,
  tecnicos: true,
  templates: true,
  skus: true
};

async function migrateCompanyFeatures() {
  try {
    await connectDB(process.env.MONGODB_URI);
    console.log('Connected to database');

    // Find all companies
    const companies = await Company.find({});
    console.log(`Found ${companies.length} companies to migrate`);

    let updated = 0;
    for (const company of companies) {
      let needsUpdate = false;
      
      // Initialize features if not exists or empty
      if (!company.features || Object.keys(company.features).length === 0) {
        company.features = { ...defaultFeatures };
        needsUpdate = true;
        console.log(`Setting default features for company: ${company.name || company.email}`);
      } else {
        // Merge with defaults for missing features
        const hasChanges = Object.keys(defaultFeatures).some(key => {
          if (company.features[key] === undefined) {
            company.features[key] = defaultFeatures[key];
            return true;
          }
          return false;
        });
        
        if (hasChanges) {
          needsUpdate = true;
          console.log(`Updating features for company: ${company.name || company.email}`);
        }
      }

      if (needsUpdate) {
        await company.save();
        updated++;
      }
    }

    console.log(`Migration completed. Updated ${updated} companies.`);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrateCompanyFeatures();
