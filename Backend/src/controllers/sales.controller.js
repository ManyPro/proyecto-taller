import Sale from '../models/Sale.js';
import Item from '../models/Item.js';
import StockMove from '../models/StockMove.js';
import PriceEntry from '../models/PriceEntry.js';
import Counter from '../models/Counter.js';

const asNum = (n)=> Number.isFinite(Number(n)) ? Number(n) : 0;
function computeTotals(sale){ let total=0; for(const it of (sale.items||[])){ it.total=Math.round(asNum(it.qty||1)*asNum(it.unitPrice||0)); total+=it.total; } sale.subtotal=total; sale.tax=0; sale.total=total; }
async function nextSaleNumber(companyId){ const doc=await Counter.findOneAndUpdate({companyId,key:'sale_number'},{ $inc:{seq:1}},{upsert:true,new:true}); return doc.seq||1; }

export const startSale = async (req,res)=>{ const sale=await Sale.create({ companyId:req.companyId, status:'draft', items:[] }); sale.name=`Venta · ${String(sale._id).slice(-6).toUpperCase()}`; await sale.save(); res.json(sale.toObject()); };
export const getSale = async (req,res)=>{ const s=await Sale.findOne({_id:req.params.id,companyId:req.companyId}); if(!s) return res.status(404).json({error:'Sale not found'}); res.json(s.toObject()); };
export const listSales = async (req,res)=>{ const q={companyId:req.companyId}; if(req.query?.status) q.status=req.query.status; const list=await Sale.find(q).sort({updatedAt:-1}); res.json({data:list}); };
export const patchSale = async (req,res)=>{ const set={}; if(req.body?.name!=null) set.name=String(req.body.name); if(req.body?.notes!=null) set.notes=String(req.body.notes);
  const s=await Sale.findOneAndUpdate({_id:req.params.id,companyId:req.companyId},{ $set:set },{new:true}); if(!s) return res.status(404).json({error:'Sale not found'}); res.json(s.toObject()); };
export const setCustomerVehicle = async (req,res)=>{ const s=await Sale.findOne({_id:req.params.id,companyId:req.companyId}); if(!s) return res.status(404).json({error:'Sale not found'});
  const {customer,vehicle}=req.body||{}; if(customer) s.customer=customer; if(vehicle){ s.vehicle=vehicle; const p=(vehicle.plate||'').trim().toUpperCase(); if(p) s.name=`Venta · ${p}`; else if(!s.name) s.name=`Venta · ${String(s._id).slice(-6).toUpperCase()}`; } await s.save(); res.json(s.toObject()); };

export const addItem = async (req,res)=>{ const s=await Sale.findOne({_id:req.params.id,companyId:req.companyId}); if(!s) return res.status(404).json({error:'Sale not found'});
  const {source,refId,sku,qty}=req.body||{}; const q=asNum(qty)||1;
  if(source==='inventory'){ let it=null; if(refId) it=await Item.findOne({_id:refId,companyId:req.companyId}); else if(sku) it=await Item.findOne({sku:String(sku).toUpperCase(),companyId:req.companyId});
    if(!it) return res.status(404).json({error:'Item not found'}); const up=asNum(it.salePrice||it.price||0); s.items.push({source:'inventory',refId:it._id,sku:it.sku,name:it.name||it.sku,qty:q,unitPrice:up,total:Math.round(q*up)}); }
  else if(source==='price'){ const pe=await PriceEntry.findOne({_id:refId,companyId:req.companyId}); if(!pe) return res.status(404).json({error:'Price entry not found'});
    const up=asNum(pe.price||pe.values?.PRICE||0); s.items.push({source:'price',refId:pe._id,sku:pe.code||'',name:pe.name||pe.description||pe.code||'Precio',qty:q,unitPrice:up,total:Math.round(q*up)}); }
  else if(source==='service'){ const up=asNum(req.body?.unitPrice||0); s.items.push({source:'service',refId:refId||null,sku:sku||'',name:req.body?.name||'Servicio',qty:q,unitPrice:up,total:Math.round(q*up)}); }
  else return res.status(400).json({error:'invalid source'});
  computeTotals(s); await s.save(); res.json(s.toObject()); };

export const updateItem = async (req,res)=>{ const s=await Sale.findOne({_id:req.params.id,companyId:req.companyId}); if(!s) return res.status(404).json({error:'Sale not found'});
  const it=s.items.id(req.params.lineId); if(!it) return res.status(404).json({error:'Line not found'}); if(req.body?.qty!=null) it.qty=asNum(req.body.qty); if(req.body?.unitPrice!=null) it.unitPrice=asNum(req.body.unitPrice);
  it.total=Math.round(asNum(it.qty)*asNum(it.unitPrice)); computeTotals(s); await s.save(); res.json(s.toObject()); };

export const removeItem = async (req,res)=>{ const s=await Sale.findOne({_id:req.params.id,companyId:req.companyId}); if(!s) return res.status(404).json({error:'Sale not found'}); const it=s.items.id(req.params.lineId);
  if(!it) return res.status(404).json({error:'Line not found'}); it.deleteOne(); computeTotals(s); await s.save(); res.json(s.toObject()); };

export const addByQR = async (req,res)=>{ const raw=String(req.body?.code||'').trim(); const ids=raw.match(/[a-f0-9]{24}/ig); const refId=ids?.length?ids[ids.length-1]:null;
  const sku=!refId && /^[A-Z0-9\-_]+$/i.test(raw) ? raw.toUpperCase():null; req.body={source:'inventory',refId,sku,qty:1}; return addItem(req,res); };

export const closeSale = async (req,res)=>{ const s=await Sale.findOne({_id:req.params.id,companyId:req.companyId}); if(!s) return res.status(404).json({error:'Sale not found'});
  if(s.status!=='draft') return res.status(400).json({error:'Sale not in draft'}); computeTotals(s);
  const session=await Sale.startSession(); session.startTransaction();
  try{ for(const line of s.items){ if(line.source!=='inventory'||!line.refId) continue; const q=asNum(line.qty||1);
      const upd=await Item.updateOne({_id:line.refId,companyId:req.companyId,stock:{$gte:q}},{ $inc:{stock:-q} }).session(session);
      if(upd.matchedCount===0||upd.modifiedCount===0) throw new Error(`Stock insuficiente para ${line.sku||line.name}`);
      await StockMove.create([{companyId:req.companyId,itemId:line.refId,qty:-q,type:'sale',direction:'out',saleId:s._id,ts:new Date()}],{session}); }
    s.status='closed'; s.closedAt=new Date(); if(!s.number) s.number=await nextSaleNumber(req.companyId); await s.save({session}); await session.commitTransaction(); session.endSession(); res.json(s.toObject());
  }catch(err){ await session.abortTransaction(); session.endSession(); res.status(400).json({error:err.message||'No se pudo cerrar la venta'}); } };

export const cancelSale = async (req,res)=>{ const s=await Sale.findOne({_id:req.params.id,companyId:req.companyId}); if(!s) return res.status(404).json({error:'Sale not found'});
  if(s.status==='closed') return res.status(400).json({error:'Sale already closed'}); if(s.status==='cancelled') return res.json(s.toObject()); s.status='cancelled'; s.cancelledAt=new Date(); await s.save(); res.json(s.toObject()); };

export const summarySales = async (req,res)=>{ const q={companyId:req.companyId,status:'closed'}; const {from,to}=req.query||{}; if(from||to){ q.createdAt={}; if(from) q.createdAt.$gte=new Date(from); if(to) q.createdAt.$lte=new Date(`${to}T23:59:59.999Z`); }
  const rows=await Sale.aggregate([{ $match:q }, { $group:{ _id:null, count:{ $sum:1 }, total:{ $sum:{ $ifNull:['$total',0] } } } }]); const a=rows[0]||{count:0,total:0}; res.json({count:a.count,total:a.total}); };
