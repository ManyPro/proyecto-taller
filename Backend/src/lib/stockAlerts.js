import Item from '../models/Item.js';
import Notification from '../models/Notification.js';
import VehicleIntake from '../models/VehicleIntake.js';

// Check low stock for a single item and create a notification if needed.
// Rules:
// - Only if item.minStock > 0
// - Trigger when item.stock <= item.minStock
// - CRITICAL: when item.stock <= (item.minStock / 2) - URGENT notification
// - Throttle: if lowStockAlertedAt within last 24h, skip
// - When stock goes above minStock, clear lowStockAlertedAt to enable future alerts
export async function checkLowStockAndNotify(companyId, itemId) {
  try {
    const item = await Item.findOne({ _id: itemId, companyId }).select('sku name stock minStock lowStockAlertedAt lowStockCriticalAlertedAt vehicleIntakeId');
    if (!item) return false;
    const min = Number(item.minStock || 0);
    const current = Number(item.stock || 0);

    if (!(min > 0)) {
      // If threshold disabled but there is an alert flag, clear it
      if (item.lowStockAlertedAt) {
        item.lowStockAlertedAt = null;
        await item.save();
      }
      if (item.lowStockCriticalAlertedAt) {
        item.lowStockCriticalAlertedAt = null;
        await item.save();
      }
      return false;
    }

    const criticalThreshold = Math.ceil(min / 2); // La mitad del mínimo
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    // STOCK CRÍTICO: <= mitad del mínimo
    if (current <= criticalThreshold) {
      const lastCritical = item.lowStockCriticalAlertedAt ? new Date(item.lowStockCriticalAlertedAt).getTime() : 0;
      if (!lastCritical || (now - lastCritical) > day) {
        let purchaseLabel = null;
        if (item.vehicleIntakeId) {
          try {
            const intake = await VehicleIntake.findOne({ _id: item.vehicleIntakeId, companyId }).select('intakeKind purchasePlace intakeDate');
            if (intake && String(intake.intakeKind).toLowerCase() === 'purchase') {
              const place = (intake.purchasePlace || '').trim();
              const date = intake.intakeDate ? new Date(intake.intakeDate) : null;
              const ymd = date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '';
              const label = `COMPRA${place ? ': ' + place : ''}${ymd ? ' ' + ymd : ''}`.trim();
              purchaseLabel = label || null;
            }
          } catch (err) {
            // swallow intake lookup errors but continue with notification
          }
        }

        // Create CRITICAL notification
        await Notification.create({
          companyId,
          type: 'inventory.criticalstock',
          data: {
            itemId: item._id,
            sku: item.sku,
            name: item.name,
            stock: current,
            minStock: min,
            criticalThreshold,
            purchaseLabel: purchaseLabel || undefined
          }
        });
        item.lowStockCriticalAlertedAt = new Date();
        await item.save();
        return true;
      }
      return false;
    }
    // STOCK BAJO: <= mínimo pero > mitad del mínimo
    else if (current <= min) {
      const last = item.lowStockAlertedAt ? new Date(item.lowStockAlertedAt).getTime() : 0;
      if (!last || (now - last) > day) {
        let purchaseLabel = null;
        if (item.vehicleIntakeId) {
          try {
            const intake = await VehicleIntake.findOne({ _id: item.vehicleIntakeId, companyId }).select('intakeKind purchasePlace intakeDate');
            if (intake && String(intake.intakeKind).toLowerCase() === 'purchase') {
              const place = (intake.purchasePlace || '').trim();
              const date = intake.intakeDate ? new Date(intake.intakeDate) : null;
              const ymd = date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '';
              const label = `COMPRA${place ? ': ' + place : ''}${ymd ? ' ' + ymd : ''}`.trim();
              purchaseLabel = label || null;
            }
          } catch (err) {
            // swallow intake lookup errors but continue with notification
          }
        }

        // Create normal low stock notification
        await Notification.create({
          companyId,
          type: 'inventory.lowstock',
          data: {
            itemId: item._id,
            sku: item.sku,
            name: item.name,
            stock: current,
            minStock: min,
            purchaseLabel: purchaseLabel || undefined
          }
        });
        item.lowStockAlertedAt = new Date();
        await item.save();
        return true;
      }
      return false;
    } else {
      // If stock recovered above threshold, clear alert flags
      if (item.lowStockAlertedAt) {
        item.lowStockAlertedAt = null;
        await item.save();
      }
      if (item.lowStockCriticalAlertedAt) {
        item.lowStockCriticalAlertedAt = null;
        await item.save();
      }
      return false;
    }
  } catch (e) {
    console.error('checkLowStockAndNotify', e?.message);
    return false;
  }
}

// Batch helper: run checks over a list of itemIds
export async function checkLowStockForMany(companyId, itemIds) {
  const ids = Array.from(new Set((itemIds||[]).map(String))).filter(Boolean);
  for (const id of ids) {
    try { await checkLowStockAndNotify(companyId, id); } catch {}
  }
}