import CustomerProfile from '../models/CustomerProfile.js';
import CustomerProfileHistory from '../models/CustomerProfileHistory.js';

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}
function upper(value) { return cleanString(value).toUpperCase(); }

function buildPayload(companyId, src = {}) {
  const plate = upper(src?.vehicle?.plate || src?.vehicle?.Plate || '');
  if (!plate) return null;
  return {
    companyId: String(companyId),
    plate,
    customer: {
      idNumber: cleanString(src?.customer?.idNumber || src?.customer?.document || ''),
      name: cleanString(src?.customer?.name),
      phone: cleanString(src?.customer?.phone),
      email: cleanString(src?.customer?.email),
      address: cleanString(src?.customer?.address)
    },
    vehicle: {
      plate,
      brand: upper(src?.vehicle?.brand || src?.vehicle?.make || ''),
      line: upper(src?.vehicle?.line || ''),
      engine: upper(src?.vehicle?.engine || src?.vehicle?.displacement || ''),
      year: src?.vehicle?.year ?? src?.vehicle?.modelYear ?? null,
      mileage: src?.vehicle?.mileage ?? null
    }
  };
}

function score(doc) {
  if (!doc) return 0; const c = doc.customer||{}; const v = doc.vehicle||{}; let s=0;
  if (cleanString(c.name)) s+=5; if (cleanString(c.idNumber)) s+=3; if (cleanString(c.phone)) s+=2; if (cleanString(c.email)) s+=1; if (cleanString(c.address)) s+=1;
  if (cleanString(v.brand)) s+=2; if (cleanString(v.line)) s+=1; if (cleanString(v.engine)) s+=1; if (v.year!=null) s+=1; if (v.mileage!=null) s+=1; return s;
}

function merge(base={}, payload, opts={}) {
  const { overwriteCustomer=false, overwriteVehicle=false, overwriteMileage=false, overwriteYear=false } = opts;
  const c = { idNumber:'', name:'', phone:'', email:'', address:'', ...(base.customer||{}) };
  const v = { plate: payload.plate, brand:'', line:'', engine:'', year:null, mileage:null, ...(base.vehicle||{}) };
  for (const k of Object.keys(payload.customer)) {
    const val = payload.customer[k];
    if (!val) continue;
    if (overwriteCustomer || !c[k]) c[k]=val;
  }
  for (const k of ['brand','line','engine']) {
    const val = payload.vehicle[k];
    if (!val) continue;
    if (overwriteVehicle || !v[k]) v[k]=val;
  }
  if (payload.vehicle.year!=null) {
    if (overwriteYear || v.year==null) v.year = payload.vehicle.year;
  }
  if (payload.vehicle.mileage!=null) {
    if (overwriteMileage || v.mileage==null || payload.vehicle.mileage>v.mileage) v.mileage = payload.vehicle.mileage;
  }
  v.plate = payload.plate; return { companyId: payload.companyId, plate: payload.plate, customer: c, vehicle: v };
}

export async function upsertProfileFromSource(companyId, sourceDoc, options={}) {
  const payload = buildPayload(companyId, sourceDoc);
  if (!payload) return null;
  const query = { companyId: payload.companyId, $or: [{ plate: payload.plate }, { 'vehicle.plate': payload.plate }] };
  let docs = await CustomerProfile.find(query).sort({ updatedAt: -1, createdAt: -1 });
  if (!docs.length) {
    try { const created = await CustomerProfile.create(payload); 
      try { await CustomerProfileHistory.create({ companyId: payload.companyId, profileId: created._id, plate: payload.plate, action: 'created', diff: payload, snapshotAfter: created.toObject(), source: options.source||'' }); } catch {}
      return { action:'created', profile: created.toObject(), diff: payload }; 
    } catch(e){ if (e?.code!==11000) throw e; docs = await CustomerProfile.find(query).sort({ updatedAt: -1, createdAt: -1 }); }
  }
  if (!docs.length) return;
  docs.sort((a,b)=> score(b)-score(a) || (b.updatedAt-b.updatedAt) );
  const [primary, ...rest] = docs;
  if (rest.length) {
    const ids = rest.map(r=>r._id).filter(Boolean);
    if (ids.length) { try { await CustomerProfile.deleteMany({ companyId: payload.companyId, _id:{ $in: ids } }); } catch {} }
  }
  const before = primary.toObject();
  const merged = merge(primary, payload, options);
  primary.set(merged);
  primary.plate = merged.plate;
  if (!primary.vehicle) primary.vehicle = {}; primary.vehicle.plate = merged.vehicle.plate;
  primary.markModified('customer'); primary.markModified('vehicle');
  const changed = {};
  ['customer','vehicle','plate'].forEach(k=>{ if (JSON.stringify(before[k])!==JSON.stringify(merged[k])) changed[k]= { before: before[k], after: merged[k] }; });
  if (Object.keys(changed).length) {
    await primary.save();
    try { await CustomerProfileHistory.create({ companyId: payload.companyId, profileId: primary._id, plate: payload.plate, action: 'updated', diff: changed, snapshotAfter: primary.toObject(), source: options.source||'', meta: { overwrite: options } }); } catch {}
    return { action:'updated', diff: changed, profile: primary.toObject() };
  }
  try { await CustomerProfileHistory.create({ companyId: payload.companyId, profileId: primary._id, plate: payload.plate, action: 'unchanged', diff: {}, snapshotAfter: primary.toObject(), source: options.source||'' }); } catch {}
  return { action:'unchanged', profile: primary.toObject(), diff: {} };
}
