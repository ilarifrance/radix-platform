'use strict';
// /api/booking — Ciuffo (shop agenda + public «Prenota» page). Logic in api/_booking.js, slots in lib/booking/slots.js.
const {createHandler,getOwner}=require('./_booking');
const getStore=()=>{const sql=require('./_db').sql();return {
 json:async(text,params)=>{const rows=await sql(text,params||[]);return rows[0]?rows[0].v??null:null;},
 tx:queries=>sql.transaction(queries.map(([t,p])=>sql(t,p)))};};
module.exports=createHandler({getOwner,getStore});
