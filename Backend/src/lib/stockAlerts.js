import Item from '../models/Item.js';
import Notification from '../models/Notification.js';
import VehicleIntake from '../models/VehicleIntake.js';

// Check low stock for a single item and create a notification if needed.
// Rules:
// - Only if item.minStock > 0
// - Trigger IMMEDIATELY when item.stock <= item.minStock (cuando cambia el stock)
// - CRITICAL: when item.stock <= (item.minStock / 2) - URGENT notification
// - Notifica inmediatamente cuando el stock cruza el umbral (sin throttling por tiempo)
// - Usa flags para evitar duplicados: solo notifica si el estado cambió
// - Cuando stock se recupera por encima del umbral, limpia las flags para permitir futuras alertas
export async function checkLowStockAndNotify(companyId, itemId) {
  try {
    const item = await Item.findOne({ _id: itemId, companyId }).select('sku name stock minStock lowStockAlertedAt lowStockCriticalAlertedAt vehicleIntakeId');
    if (!item) {
      console.log(`[stockAlerts] Item ${itemId} no encontrado para company ${companyId}`);
      return false;
    }
    
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
    
    // Verificar si ya hay una notificación muy reciente (últimos 2 minutos) para evitar duplicados en la misma operación
    const recentThreshold = 2 * 60 * 1000; // 2 minutos
    const now = Date.now();
    const lastCritical = item.lowStockCriticalAlertedAt ? new Date(item.lowStockCriticalAlertedAt).getTime() : 0;
    const lastLow = item.lowStockAlertedAt ? new Date(item.lowStockAlertedAt).getTime() : 0;
    
    // Verificar si ya existe una notificación reciente del mismo tipo para evitar duplicados
    const hasRecentCriticalNotification = lastCritical && (now - lastCritical) < recentThreshold;
    const hasRecentLowNotification = lastLow && (now - lastLow) < recentThreshold;

    // STOCK CRÍTICO: <= mitad del mínimo
    if (current <= criticalThreshold) {
      // Notificar si:
      // 1. Nunca se ha notificado crítico, O
      // 2. Tenía alerta de stock bajo pero ahora está crítico (empeoró), O
      // 3. No hay notificación crítica reciente (evitar duplicados en la misma operación)
      // Nota: Si el stock pasa directamente a crítico sin pasar por bajo, también notificamos
      const wasLowButNotCritical = lastLow && !lastCritical;
      const shouldNotifyCritical = !hasRecentCriticalNotification && (!lastCritical || wasLowButNotCritical);
      
      if (shouldNotifyCritical) {
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
            console.warn(`[stockAlerts] Error buscando intake para item ${item.sku}:`, err?.message);
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
        // Limpiar alerta de stock bajo si existe (ya está en crítico)
        if (item.lowStockAlertedAt) {
          item.lowStockAlertedAt = null;
        }
        await item.save();
        console.log(`[stockAlerts] ✅ Notificación CRÍTICA creada INMEDIATAMENTE para ${item.sku || item.name}: stock=${current}, min=${min}, crítico<=${criticalThreshold}`);
        return true;
      } else {
        console.log(`[stockAlerts] ⏸️ Stock crítico para ${item.sku || item.name} pero ya hay notificación reciente (hace ${Math.round((now - lastCritical) / 1000)}s)`);
      }
      return false;
    }
    // STOCK BAJO: <= mínimo pero > mitad del mínimo
    else if (current <= min) {
      // Notificar si:
      // 1. Nunca se ha notificado bajo, O
      // 2. Tenía alerta crítica pero ahora está solo bajo (mejoró pero sigue bajo), O
      // 3. No hay notificación baja reciente (evitar duplicados en la misma operación)
      const wasCriticalButNotLow = lastCritical && !lastLow;
      const shouldNotifyLow = !hasRecentLowNotification && (!lastLow || wasCriticalButNotLow);
      
      if (shouldNotifyLow) {
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
            console.warn(`[stockAlerts] Error buscando intake para item ${item.sku}:`, err?.message);
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
        // Si tenía alerta crítica, limpiarla (ya no está crítico)
        if (item.lowStockCriticalAlertedAt) {
          item.lowStockCriticalAlertedAt = null;
        }
        await item.save();
        console.log(`[stockAlerts] ✅ Notificación de STOCK BAJO creada INMEDIATAMENTE para ${item.sku || item.name}: stock=${current}, min=${min}`);
        return true;
      } else {
        console.log(`[stockAlerts] ⏸️ Stock bajo para ${item.sku || item.name} pero ya hay notificación reciente (hace ${Math.round((now - lastLow) / 1000)}s)`);
      }
      return false;
    } else {
      // If stock recovered above threshold, clear alert flags to allow future notifications
      const hadLowAlert = !!item.lowStockAlertedAt;
      const hadCriticalAlert = !!item.lowStockCriticalAlertedAt;
      
      if (item.lowStockAlertedAt) {
        item.lowStockAlertedAt = null;
        await item.save();
        console.log(`[stockAlerts] ✅ Stock recuperado para ${item.sku || item.name}: stock=${current} > min=${min}, alertas limpiadas (permite futuras alertas)`);
      }
      if (item.lowStockCriticalAlertedAt) {
        item.lowStockCriticalAlertedAt = null;
        await item.save();
      }
      
      // Si había alertas y ahora se recuperó, no crear notificación (solo limpiar flags)
      return false;
    }
  } catch (e) {
    console.error('[stockAlerts] Error en checkLowStockAndNotify:', e?.message, e?.stack);
    return false;
  }
}

// Batch helper: run checks over a list of itemIds
export async function checkLowStockForMany(companyId, itemIds) {
  const ids = Array.from(new Set((itemIds||[]).map(String))).filter(Boolean);
  if (ids.length === 0) {
    console.log('[stockAlerts] checkLowStockForMany: lista vacía');
    return;
  }
  console.log(`[stockAlerts] Verificando ${ids.length} items para alertas de stock bajo`);
  let notifiedCount = 0;
  for (const id of ids) {
    try { 
      const notified = await checkLowStockAndNotify(companyId, id);
      if (notified) notifiedCount++;
    } catch (err) {
      console.error(`[stockAlerts] Error verificando item ${id}:`, err?.message);
    }
  }
  console.log(`[stockAlerts] Verificación completa: ${notifiedCount} notificaciones creadas de ${ids.length} items`);
}