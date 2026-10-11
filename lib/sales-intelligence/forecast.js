'use strict';
/** Deterministic advisory forecast. Excludes closed deals; never mixes currencies. */
const DEFAULT_PROBABILITIES=Object.freeze({prospect:0.1,qualified:0.3,proposal:0.5,negotiation:0.7});
function forecastScenarios(opportunities, probabilities=DEFAULT_PROBABILITIES) {
  if(!Array.isArray(opportunities)) throw new TypeError('opportunities must be an array');
  const results={conservative:{},base:{},optimistic:{}};
  for(const deal of opportunities) {
    if(!deal || typeof deal!=='object') continue;
    if(deal.status==='won'||deal.status==='lost') continue;
    if(deal.status!=='open') continue;
    const {currency,value,stage}=deal;
    if(typeof currency!=='string'||!/^[A-Z]{3}$/.test(currency)) continue;
    if(!Number.isFinite(value)||value<0) continue;
    const p=probabilities[stage];
    if(!Number.isFinite(p)||p<0||p>1) continue;
    for(const [scenario,multiplier] of [['conservative',0.7],['base',1],['optimistic',1.2]]) {
      const weight=Math.min(1,p*multiplier);
      results[scenario][currency]=(results[scenario][currency]||0)+value*weight;
    }
  }
  return results;
}
module.exports={forecastScenarios,DEFAULT_PROBABILITIES};
