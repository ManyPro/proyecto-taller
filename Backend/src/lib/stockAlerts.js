import Item from '../models/Item.js';
import Notification from '../models/Notification.js';

// Check low stock for a single item and create a notification if needed.
// Rules:
// - Only if item.minStock > 0
// - Trigger when item.stock <= item.minStock
// - Throttle: if lowStockAlertedAt within last 24h, skip
// - When stock goes above minStock, clear lowStockAlertedAt to enable future alerts
export async function checkLowStockAndNotify(companyId, itemId) {
  try {
    const item = await Item.findOne({ _id: itemId, companyId }).select('sku name stock minStock lowStockAlertedAt');
    if (!item) return false;
    const min = Number(item.minStock || 0);
    const current = Number(item.stock || 0);

    if (!(min > 0)) {
      // If threshold disabled but there is an alert flag, clear it
      if (item.lowStockAlertedAt) {
        item.lowStockAlertedAt = null;
        await item.save();
      }
      return false;
    }

    if (current <= min) {
      const last = item.lowStockAlertedAt ? new Date(item.lowStockAlertedAt).getTime() : 0;
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      if (!last || (now - last) > day) {
        // Create notification
        await Notification.create({
          companyId,
          type: 'inventory.lowstock',
          data: { itemId: item._id, sku: item.sku, name: item.name, stock: current, minStock: min }
        });
        item.lowStockAlertedAt = new Date();
        await item.save();
        return true;
      }
      return false;
    } else {
      // If stock recovered above threshold, clear alert flag
      if (item.lowStockAlertedAt) {
        item.lowStockAlertedAt = null;
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
