'use strict';
// /api/accounting-stripe — Stripe webhook for RADIX Accounting subscriptions. The signature is computed on the exact
// bytes Stripe sent, so this function reads the raw body itself (body parsing off) and lives apart from /api/accounting.
const {webhook}=require('./_accounting_billing');
const {createStore}=require('./_accounting_store');
module.exports=async function(req,res){
 res.setHeader('Cache-Control','no-store');
 try{return res.status(200).json(await webhook(createStore(require('./_db').sql()),req,res));}
 catch(e){if(!e.status)console.error('accounting stripe webhook',e);res.status(e.status||500).json({error:e.status?e.message:'Errore interno.'});}
};
module.exports.config={api:{bodyParser:false}};
