'use strict';
// Neon HTTP store for /api/accounting: json() reads one jsonb value, tx() runs statements in one transaction.
function createStore(sql){
 return {
  json:async(text,params)=>{const rows=await sql(text,params||[]);return rows[0]?rows[0].v??null:null;},
  tx:queries=>sql.transaction(queries.map(([t,p])=>sql(t,p)))
 };
}
module.exports={createStore};
