/* RADIX Trasporti — data of the demonstration, kept in this browser (localStorage) and shared by the driver app
   (/trasporti/autista/) and the command center (/trasporti/) on the same device. A fictitious company is created on
   first use. When migrations/trasporti/001 is applied, the same operations will go to /api/trasporti. */
(function(root){
'use strict';
const KEY='radix-trasporti-demo-v1';
const pad=n=>String(n).padStart(2,'0');
const localIso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
const uid=()=>(root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():'id-'+Date.now().toString(36)+Math.random().toString(36).slice(2));

function seed(now=new Date()){
 let s=20261118;const rnd=()=>(s=(s*1103515245+12345)%2147483648)/2147483648;
 const vehicles=[
  {id:'v1',plate:'GA123BC',label:'Volvo FH 500',kind:'trattore',devices:['3190000101']},
  {id:'v2',plate:'FX456DE',label:'Scania R450',kind:'trattore',devices:['3190000102']},
  {id:'v3',plate:'GD789FG',label:'Iveco S-Way bestiame',kind:'bestiame',devices:['3190000103']},
  {id:'v4',plate:'EZ321HK',label:'DAF CF motrice',kind:'motrice',devices:['3190000104']}];
 const drivers=[{id:'d1',name:'Marco Bianchi',vehicle:'v1'},{id:'d2',name:'Luca Ferri',vehicle:'v2'},{id:'d3',name:'Giorgio Rizzo',vehicle:'v3'},{id:'d4',name:'Andrea Conti',vehicle:'v4'}];
 const customers=[{id:'c1',name:'Latteria Valpadana Srl (esempio)',rate_kind:'km',rate_cents:165},{id:'c2',name:'Ortofrutta Delta Spa (esempio)',rate_kind:'km',rate_cents:150},{id:'c3',name:'Allevamenti Bassa Coop (esempio)',rate_kind:'km',rate_cents:210}];
 const routes=[['Cremona','Verona',112],['Cremona','Milano',95],['Mantova','Bologna',118],['Piacenza','Torino',172],['Lodi','Brescia',82],['Cremona','Monaco di Baviera (DE)',520],['Mantova','Modena',72]];
 const coords={Cremona:[45.133,10.022],Verona:[45.438,10.992],Milano:[45.464,9.19],Mantova:[45.156,10.791],Bologna:[44.494,11.343],Piacenza:[45.052,9.693],Torino:[45.07,7.687],Lodi:[45.314,9.503],Brescia:[45.541,10.211],'Monaco di Baviera (DE)':[48.137,11.575],Modena:[44.647,10.925]};
 const trips=[],documents=[],costs=[],positions=[];
 const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 let n=0;
 for(let back=16;back>=1;back--){
  const day=new Date(today);day.setDate(day.getDate()-back);if(day.getDay()===0||day.getDay()===6)continue;
  for(const v of vehicles){
   if(rnd()<0.15)continue;
   const d=drivers.find(x=>x.vehicle===v.id);const r=routes[Math.floor(rnd()*routes.length)];
   const c=v.kind==='bestiame'?customers[2]:customers[Math.floor(rnd()*2)];
   const start=new Date(day);start.setHours(5+Math.floor(rnd()*3),Math.floor(rnd()*60));
   const hours=Math.max(2,Math.round(r[2]/62*2))+(rnd()<0.5?1:0);const end=new Date(start);end.setHours(end.getHours()+hours,end.getMinutes()+Math.floor(rnd()*50));
   const km=r[2]*2+Math.floor(rnd()*20);const id='t'+(++n);
   trips.push({id,vehicle_id:v.id,driver_id:d.id,customer_id:c.id,status:back>2?'chiuso':'chiuso',started_at:localIso(start),ended_at:localIso(end),origin:r[0],destination:r[1],km,revenue_cents:Math.round(km*c.rate_cents/100)*100});
   const kind=v.kind==='bestiame'?'giornale':r[1].includes('(DE)')?'cmr':'ddt';
   documents.push({id:'doc'+n,trip_id:id,kind,at:localIso(start),fields:kind==='giornale'?{numero:'GV-'+(2600+n),specie:'Bovini',numero_animali:18+Math.floor(rnd()*14),luogo_partenza:r[0],luogo_destinazione:r[1],partenza:localIso(start),targa:v.plate}:{numero:(kind==='cmr'?'CMR ':'')+(4100+n),data:localIso(start).slice(0,10),mittente:c.name.replace(' (esempio)',''),destinatario:'Cliente di '+r[1],luogo_carico:r[0],luogo_scarico:r[1],merce:c.id==='c1'?'Formaggi stagionati':'Ortofrutta fresca',colli:20+Math.floor(rnd()*14),peso_kg:12000+Math.floor(rnd()*12000),targa:v.plate},confirmed:true,corrected:rnd()<0.2?1:0});
   const liters=Math.round(km*0.31);
   costs.push({id:'f'+n,kind:'carburante',date:localIso(start).slice(0,10),amount_cents:Math.round(liters*1.62*100),liters,vehicle_id:v.id,driver_id:d.id,trip_id:id,description:'Rifornimento segnalato dall\'autista'});
   const a=coords[r[0]],b=coords[r[1]];
   positions.push({vehicle_id:v.id,trip_id:id,at:localIso(start),lat:a[0],lon:a[1],source:'localizzatore'},{vehicle_id:v.id,trip_id:id,at:localIso(new Date((start.getTime()+end.getTime())/2)),lat:(a[0]+b[0])/2,lon:(a[1]+b[1])/2,source:'localizzatore'},{vehicle_id:v.id,trip_id:id,at:localIso(end),lat:b[0],lon:b[1],source:'localizzatore'});
  }
 }
 const first=trips.length?trips[0].started_at.slice(0,10):localIso(today).slice(0,10);
 for(const d of drivers)costs.push({id:'s-'+d.id,kind:'stipendio',date:first,amount_cents:145000,driver_id:d.id,description:'Busta paga, quota del periodo (costo azienda), esempio'});
 for(const v of vehicles)costs.push({id:'l-'+v.id,kind:'leasing',date:first,amount_cents:v.kind==='motrice'?60000:90000,vehicle_id:v.id,description:'Canone leasing, quota del periodo, esempio'});
 costs.push({id:'m1',kind:'manutenzione',date:first,amount_cents:64000,vehicle_id:'v2',description:'Tagliando, esempio'});
 costs.push({id:'g1',kind:'assicurazione',date:first,amount_cents:75000,description:'Assicurazioni flotta, quota del periodo, esempio'});
 return {version:1,company:{name:'Autotrasporti Esempio Srl'},vehicles,drivers,customers,trips,documents,costs,positions,tolls:null,createdAt:localIso(now)};
}

// A toll invoice detail (Telepass-like CSV) for the demonstration trips, with a few transits to check.
function sampleTollCsv(data){
 const veh=new Map(data.vehicles.map(v=>[v.id,v]));
 const fmt=s=>s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4);
 const add=(s,m)=>{const d=new Date(s);d.setMinutes(d.getMinutes()+m);return localIso(d);};
 const gates={Cremona:'CREMONA',Verona:'VERONA SUD',Milano:'MILANO SUD',Mantova:'MANTOVA NORD',Bologna:'BOLOGNA ARCOVEGGIO',Piacenza:'PIACENZA SUD',Torino:'TORINO BRUERE',Lodi:'LODI',Brescia:'BRESCIA CENTRO','Monaco di Baviera (DE)':'BRENNERO',Modena:'MODENA NORD'};
 const lines=['Data;Ora entrata;Casello entrata;Ora uscita;Casello uscita;Targa;Dispositivo;Importo'];
 for(const t of data.trips){const v=veh.get(t.vehicle_id);const a=add(t.started_at,25),b=add(t.started_at,25+Math.round(t.km/2/80*60));
  const eur=(Math.round(t.km/2*0.19*100)/100).toFixed(2).replace('.',',');
  lines.push([fmt(a),a.slice(11),gates[t.origin]||t.origin.toUpperCase(),b.slice(11),gates[t.destination]||t.destination.toUpperCase(),v.plate,v.devices[0],eur].join(';'));
  const c=add(t.ended_at,-40),e=add(t.ended_at,-5);
  lines.push([fmt(e),c.slice(11),gates[t.destination]||t.destination.toUpperCase(),e.slice(11),gates[t.origin]||t.origin.toUpperCase(),v.plate,v.devices[0],eur].join(';'));}
 const last=data.trips[data.trips.length-1];if(last){const sat=new Date(data.createdAt||last.started_at);sat.setDate(sat.getDate()-((sat.getDay()+1)%7||7));sat.setHours(15,10);const s=localIso(sat);
  lines.push([fmt(s),'15:10','CREMONA','15:48','PIACENZA SUD','FX456DE','3190000102','6,90'].join(';'));
  lines.push([fmt(s),'09:02','BRESCIA CENTRO','09:31','VERONA SUD','AB999ZZ','3190000999','5,40'].join(';'));}
 return lines.join('\n');
}

function load(){
 let d=null;try{d=JSON.parse(root.localStorage.getItem(KEY)||'null');}catch{d=null;}
 if(!d||d.version!==1){d=seed();save(d);}
 return d;
}
function save(d){try{root.localStorage.setItem(KEY,JSON.stringify(d));return true;}catch{return false;}}
function reset(){const d=seed();save(d);return d;}

root.RadixTrStore={load,save,reset,seed,sampleTollCsv,uid,localIso};
if(typeof module==='object'&&module.exports)module.exports=root.RadixTrStore;
})(typeof globalThis!=='undefined'?globalThis:this);
