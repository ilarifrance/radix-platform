'use strict';
const {createHandler}=require('./_sales');
const {getSessionUser}=require('./_auth');
const {createStore}=require('./_sales_store');
module.exports=createHandler({getSessionUser,getStore:()=>createStore(require('./_db').sql())});
