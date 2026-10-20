'use strict';
// /api/accounting — RADIX Accounting (bookkeeping and management control for client companies).
const {createHandler}=require('./_accounting');
const {getSessionUser}=require('./_auth');
const {createStore}=require('./_accounting_store');

// Copilot answers come from the Claude API (ANTHROPIC_API_KEY, already set for the agents). ACCOUNTING_AI_MODEL
// is optional and lets the cost of the copilot be tuned without a deploy of new code.
let client=null;
async function ask({system,messages}){
 if(!process.env.ANTHROPIC_API_KEY)return null;
 const Anthropic=require('@anthropic-ai/sdk');
 client=client||new (Anthropic.default||Anthropic)();
 const r=await client.beta.messages.create({
  model:process.env.ACCOUNTING_AI_MODEL||'claude-opus-5-5',max_tokens:8000,
  betas:['server-side-fallback-2026-07-01'],fallbacks:'default',output_config:{effort:'low'},
  system:[{type:'text',text:system,cache_control:{type:'ephemeral'}}],messages});
 if(r.stop_reason==='refusal')return {refused:true};
 return {text:r.content.filter(b=>b.type==='text').map(b=>b.text).join('\n').trim()};
}
// Sign-up, client accounts and the Stripe subscription: api/_accounting_billing.js (STRIPE_SECRET_KEY and
// STRIPE_WEBHOOK_SECRET; the Stripe webhook is /api/accounting-stripe).
const billing=require('./_accounting_billing');
module.exports=createHandler({getSessionUser,getClientUser:billing.getClientUser,billing,getStore:()=>createStore(require('./_db').sql()),ask});
