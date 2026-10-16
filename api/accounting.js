'use strict';
// /api/accounting — RADIX Accounting (bookkeeping and management control for client companies).
const {createHandler}=require('./_accounting');
const {getSessionUser}=require('./_auth');
const {createStore}=require('./_accounting_store');
module.exports=createHandler({getSessionUser,getStore:()=>createStore(require('./_db').sql())});
