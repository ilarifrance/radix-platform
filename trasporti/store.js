/* Plancia (Trasporti) — data of the demonstration, kept in this browser (localStorage) and shared by the driver app
   (/trasporti/autista/) and the command center (/trasporti/) on the same device. A fictitious company is created on
   first use. When migrations/trasporti/001 is applied, the same operations will go to /api/trasporti. */
(function(root){
'use strict';
const KEY='radix-trasporti-demo-v2';
const pad=n=>String(n).padStart(2,'0');
const localIso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
const uid=()=>(root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():'id-'+Date.now().toString(36)+Math.random().toString(36).slice(2));

function seed(now=new Date()){
 let s=20261118;const rnd=()=>(s=(s*1103515245+12345)%2147483648)/2147483648;
 const vehicles=[
  {id:'v1',plate:'GA123BC',label:'Volvo FH 500',kind:'trattore',devices:['3190000101'],tracker:'webfleet',tracker_ref:'001'},
  {id:'v2',plate:'FX456DE',label:'Scania R450',kind:'trattore',devices:['3190000102'],tracker:'webfleet',tracker_ref:'002'},
  {id:'v3',plate:'GD789FG',label:'Iveco S-Way bestiame',kind:'bestiame',devices:['3190000103'],tracker:'rfms',vin:'ZCFC1LF0X0D123456'},
  {id:'v4',plate:'EZ321HK',label:'DAF CF motrice',kind:'motrice',devices:['3190000104'],tracker:'telefono'}];
 const src=v=>v.tracker==='telefono'?'telefono':v.tracker;
 const drivers=[{id:'d1',name:'Marco Bianchi',vehicle:'v1',phone:'+39 333 000 0001'},{id:'d2',name:'Luca Ferri',vehicle:'v2',phone:'+39 333 000 0002'},{id:'d3',name:'Giorgio Rizzo',vehicle:'v3',phone:'+39 333 000 0003'},{id:'d4',name:'Andrea Conti',vehicle:'v4',phone:'+39 333 000 0004'}];
 const customers=[{id:'c1',name:'Latteria Valpadana Srl (esempio)',vat:'IT00000000001',rate_kind:'km',rate_cents:165},{id:'c2',name:'Ortofrutta Delta Spa (esempio)',vat:'IT00000000002',rate_kind:'km',rate_cents:150},{id:'c3',name:'Allevamenti Bassa Coop (esempio)',vat:'IT00000000003',rate_kind:'km',rate_cents:210}];
 const routes=[['Cremona','Verona',112],['Cremona','Milano',95],['Mantova','Bologna',118],['Piacenza','Torino',172],['Lodi','Brescia',82],['Cremona','Monaco di Baviera (DE)',520],['Mantova','Modena',72]];
 const coords={Cremona:[45.133,10.022],Verona:[45.438,10.992],Milano:[45.464,9.19],Mantova:[45.156,10.791],Bologna:[44.494,11.343],Piacenza:[45.052,9.693],Torino:[45.07,7.687],Lodi:[45.314,9.503],Brescia:[45.541,10.211],'Monaco di Baviera (DE)':[48.137,11.575],Modena:[44.647,10.925]};
 const trips=[],documents=[],costs=[],positions=[],issues=[];
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
   documents.push({id:'doc'+n,trip_id:id,kind,at:localIso(start),fields:kind==='giornale'?{numero:'GV-'+(2600+n),specie:'Bovini',numero_animali:18+Math.floor(rnd()*14),luogo_partenza:r[0],luogo_destinazione:r[1],partenza:localIso(start),targa:v.plate}:{numero:(kind==='cmr'?'CMR ':'')+(4100+n),data:localIso(start).slice(0,10),mittente:c.name.replace(' (esempio)',''),destinatario:'Cliente di '+r[1],luogo_carico:r[0],luogo_scarico:r[1],merce:c.id==='c1'?'Formaggi stagionati':'Ortofrutta fresca',colli:20+Math.floor(rnd()*14),pallet:c.id==='c1'?null:12+(n%4)*6,peso_kg:12000+Math.floor(rnd()*12000),targa:v.plate},confirmed:true,corrected:rnd()<0.2?1:0});
   const liters=Math.round(km*0.31);
   costs.push({id:'f'+n,kind:'carburante',date:localIso(start).slice(0,10),amount_cents:Math.round(liters*1.62*100),liters,vehicle_id:v.id,driver_id:d.id,trip_id:id,description:'Rifornimento segnalato dall\'autista'});
   const a=coords[r[0]],b=coords[r[1]];
   track(v,start,end,a,b,id);
   if(rnd()<0.35)documents.push({id:'pod'+n,trip_id:id,kind:'consegna',at:localIso(end),fields:{ricevuto_da:'Magazzino '+r[1],riserve:null,firma:true},confirmed:true});
  }
 }
 // one trip open now (if the day has started): Marco on the road since 06:15
 const open=new Date(today);open.setHours(6,15);
 if(now>open){const v=vehicles[0],r=routes[3],id='t'+(++n);const a=coords[r[0]],b=coords[r[1]];
  trips.push({id,vehicle_id:v.id,driver_id:'d1',customer_id:'c1',status:'aperto',started_at:localIso(open),ended_at:null,origin:r[0],destination:r[1],km:null,revenue_cents:null});
  documents.push({id:'doc'+n,trip_id:id,kind:'ddt',at:localIso(open),fields:{numero:'4199',data:localIso(open).slice(0,10),mittente:'Latteria Valpadana Srl',destinatario:'Cliente di '+r[1],luogo_carico:r[0],luogo_scarico:r[1],merce:'Formaggi stagionati',colli:26,peso_kg:19800,targa:v.plate},confirmed:true,corrected:0});
  track(v,open,new Date(Math.min(now.getTime(),open.getTime()+14*3600000)),a,b,id,true);
  issues.push({id:'i1',trip_id:id,vehicle_id:v.id,driver_id:'d1',at:localIso(new Date(Math.min(now.getTime(),open.getTime()+75*60000))),kind:'ritardo',text:'Coda in A21 per incidente, circa 40 minuti di ritardo allo scarico.',resolved:false});}
 // positions every 30 minutes along the trip from the vehicle's tracker (the phone for the van without one)
 function track(v,start,end,a,b,id,partial){
  const total=partial?Math.max(1,Math.round((end-start)/60000)):Math.round((end-start)/60000);const steps=Math.max(2,Math.floor(total/30));
  for(let i=0;i<=steps;i++){const k=i/steps,f=partial?Math.min(1,k*total/300):(k<0.5?k*2:2-k*2);const t=new Date(start.getTime()+k*total*60000);
   positions.push({vehicle_id:v.id,trip_id:id,at:localIso(t),lat:Math.round((a[0]+(b[0]-a[0])*f)*1e5)/1e5,lon:Math.round((a[1]+(b[1]-a[1])*f)*1e5)/1e5,speed_kmh:i===0||i===steps?0:68,source:src(v)});}
 }
 const first=trips.length?trips[0].started_at.slice(0,10):localIso(today).slice(0,10);
 for(const d of drivers)costs.push({id:'s-'+d.id,kind:'stipendio',date:first,amount_cents:145000,driver_id:d.id,description:'Busta paga, quota del periodo (costo azienda), esempio'});
 for(const v of vehicles)costs.push({id:'l-'+v.id,kind:'leasing',date:first,amount_cents:v.kind==='motrice'?60000:90000,vehicle_id:v.id,description:'Canone leasing, quota del periodo, esempio'});
 costs.push({id:'m1',kind:'manutenzione',date:first,amount_cents:64000,vehicle_id:'v2',description:'Tagliando, esempio'});
 costs.push({id:'g1',kind:'assicurazione',date:first,amount_cents:75000,description:'Assicurazioni flotta, quota del periodo, esempio'});
 return {version:2,company:{name:'Autotrasporti Esempio Srl'},vehicles,drivers,customers,trips,documents,costs,positions,issues,tolls:null,tracker:{provider:'webfleet',lastSync:null},createdAt:localIso(now)};
}

// A toll invoice detail (Telepass-like CSV) for the demonstration trips, with a few transits to check.
function sampleTollCsv(data){
 const veh=new Map(data.vehicles.map(v=>[v.id,v]));
 const fmt=s=>s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4);
 const add=(s,m)=>{const d=new Date(s);d.setMinutes(d.getMinutes()+m);return localIso(d);};
 const gates={Cremona:'CREMONA',Verona:'VERONA SUD',Milano:'MILANO SUD',Mantova:'MANTOVA NORD',Bologna:'BOLOGNA ARCOVEGGIO',Piacenza:'PIACENZA SUD',Torino:'TORINO BRUERE',Lodi:'LODI',Brescia:'BRESCIA CENTRO','Monaco di Baviera (DE)':'BRENNERO',Modena:'MODENA NORD'};
 const lines=['Data;Ora entrata;Casello entrata;Ora uscita;Casello uscita;Targa;Dispositivo;Importo'];
 for(const t of data.trips.filter(t=>t.ended_at)){const v=veh.get(t.vehicle_id);const a=add(t.started_at,25),b=add(t.started_at,25+Math.round(t.km/2/80*60));
  const eur=(Math.round(t.km/2*0.19*100)/100).toFixed(2).replace('.',',');
  lines.push([fmt(a),a.slice(11),gates[t.origin]||t.origin.toUpperCase(),b.slice(11),gates[t.destination]||t.destination.toUpperCase(),v.plate,v.devices[0],eur].join(';'));
  const c=add(t.ended_at,-40),e=add(t.ended_at,-5);
  lines.push([fmt(e),c.slice(11),gates[t.destination]||t.destination.toUpperCase(),e.slice(11),gates[t.origin]||t.origin.toUpperCase(),v.plate,v.devices[0],eur].join(';'));}
 const closed=data.trips.filter(t=>t.ended_at),last=closed[closed.length-1];if(last){const sat=new Date(data.createdAt||last.started_at);sat.setDate(sat.getDate()-((sat.getDay()+1)%7||7));sat.setHours(15,10);const s=localIso(sat);
  lines.push([fmt(s),'15:10','CREMONA','15:48','PIACENZA SUD','FX456DE','3190000102','6,90'].join(';'));
  lines.push([fmt(s),'09:02','BRESCIA CENTRO','09:31','VERONA SUD','AB999ZZ','3190000999','5,40'].join(';'));}
 return lines.join('\n');
}

/* Example invoice data and price lists (listini) of the demonstration company: added also to data saved before
   they existed, without touching what the user changed. */
function defaults(d){
 for(const k of ['issues','positions','documents','costs','shipments','rate_cards','consignees','invoices','payslips','cost_documents'])if(!Array.isArray(d[k]))d[k]=[];
 if(!d.supplier_rules||typeof d.supplier_rules!=='object')d.supplier_rules={};
 // example deadlines of the fleet register and a reference cost per km, once
 if(!d._ctrl_seeded){d._ctrl_seeded=true;const day=n=>localIso(new Date(Date.now()+n*86400000)).slice(0,10);
  const due={v1:{due_revisione:day(20),due_assicurazione:day(140)},v2:{due_assicurazione:day(75),due_tachigrafo:day(300)},v3:{due_tachigrafo:day(-3),due_atp:day(200)},v4:{due_revisione:day(45)}};
  for(const v of d.vehicles||[])if(due[v.id])Object.assign(v,due[v.id]);
  if(d.company&&d.company.ref_cost_km_cents==null)d.company.ref_cost_km_cents=145;}
 // example of planned work and of a driver's deadline, once
 if(!d._plan_seeded){d._plan_seeded=true;const at=(n,h)=>{const x=new Date(Date.now()+n*86400000);x.setHours(h,0,0,0);return localIso(x);};const has=(l,id)=>(l||[]).some(x=>x.id===id);
  if(has(d.customers,'c2')&&has(d.vehicles,'v2')&&has(d.drivers,'d2'))d.trips.push({id:'tp1',vehicle_id:'v2',driver_id:'d2',customer_id:'c2',status:'pianificato',started_at:at(1,6),ended_at:null,origin:'Mantova',destination:'Modena',km:null,revenue_cents:null,note:'Carico entro le 7:00, baia 3.',planned:true});
  if(has(d.customers,'c1'))d.trips.push({id:'tp2',vehicle_id:null,driver_id:null,customer_id:'c1',status:'pianificato',started_at:at(2,5),ended_at:null,origin:'Cremona',destination:'Milano',km:null,revenue_cents:null,planned:true});
  const dr=(d.drivers||[]).find(x=>x.id==='d2');if(dr&&!dr.due_cqc)dr.due_cqc=at(18,0).slice(0,10);}
 const c=d.company=d.company||{name:'Autotrasporti Esempio Srl'};
 if(!c.vat&&!c._seeded){Object.assign(c,{vat:'01950620201',street:'Via San Giorgio 1',cap:'63835',comune:'Montappone',provincia:'FM',regime:'RF01',iban:'',ref_cost_km_cents:null,_seeded:true});}
 const addr={c1:['Via Emilia 10','46100','Mantova','MN'],c2:['Via del Porto 5','44121','Ferrara','FE'],c3:['Strada Bassa 3','26100','Cremona','CR']};
 for(const cu of d.customers||[])if(addr[cu.id]&&!cu.street&&!cu._seeded){const a=addr[cu.id];Object.assign(cu,{street:a[0],cap:a[1],comune:a[2],provincia:a[3],nazione:'IT',sdi:'0000000',_seeded:true});}
 if(!d._rates_seeded){
  d._rates_seeded=true;
  const gas={kind:'gasolio',base_eur_l:1.65,incidence_pct:30,current_eur_l:1.72},sosta={kind:'sosta',free_hours:2,per_hour_cents:4000};
  d.rate_cards.push(
   {id:'r0',name:'Listino base al km (esempio)',customer_id:null,method:'km',per_km_cents:150,min_cents:25000,supplements:[gas,sosta]},
   {id:'r1',name:'Latteria: zone di consegna (esempio)',customer_id:'c1',method:'zone',zones:[{name:'Lombardia est',to:['MN','CR','BS'],amount_cents:38000},{name:'Emilia',to:['BO','MO','RE','PR'],amount_cents:42000},{name:'Veneto',to:['VR','VI','PD'],amount_cents:36000},{name:'Piemonte e Milano',to:['TO','MI','NO'],amount_cents:48000}],min_cents:0,supplements:[gas,sosta,{kind:'scarico_extra',amount_cents:5000}]},
   {id:'r2',name:'Ortofrutta: fasce di pallet (esempio)',customer_id:'c2',method:'fasce',basis:'pallet',bands:[{upto:10,amount_cents:25000},{upto:20,amount_cents:40000},{upto:33,amount_cents:52000}],supplements:[gas,{kind:'sponda',amount_cents:3000}]},
   {id:'r3',name:'Allevamenti: a capo (esempio)',customer_id:'c3',method:'capo',per_unit_cents:1800,min_cents:30000,supplements:[gas,{kind:'scarico_extra',amount_cents:5000}]});
 }
 // example for those who work with France (live animals): the way out at the price of the forwarder's order confirmation,
 // the way back with a zone list from the loading area plus extra drops and ramasse; once
 if(!d._fr_seeded){d._fr_seeded=true;const at=(n,h)=>{const x=new Date(Date.now()+n*86400000);x.setHours(h,0,0,0);return localIso(x);};const has=(l,id)=>(l||[]).some(x=>x.id===id);
  if(has(d.vehicles,'v3')&&has(d.drivers,'d3')&&!has(d.customers,'c4')){
   d.customers.push({id:'c4',name:'Trans Alpi Spedizioni Srl (esempio)',vat:'IT00000000004',street:'Corso Francia 12',cap:'12100',comune:'Cuneo',provincia:'CN',nazione:'IT',sdi:'0000000',_seeded:true});
   d.rate_cards.push({id:'r4',name:'Ritorni dalla Francia: carico zona Rodez (esempio)',customer_id:'c4',method:'zone',zones:[{name:'CN da Rodez',from:['Rodez','Aveyron'],to:['CN'],amount_cents:145000},{name:'TO da Rodez',from:['Rodez','Aveyron'],to:['TO','AT'],amount_cents:150000},{name:'Lombardia da Rodez',from:['Rodez','Aveyron'],to:['Lombardia'],amount_cents:175000},{name:'Veneto da Rodez',from:['Rodez','Aveyron'],to:['Veneto'],amount_cents:190000}],supplements:[{kind:'scarico_extra',amount_cents:5000},{kind:'ramassa',amount_cents:10000}]});
   d.trips.push({id:'tf1',vehicle_id:'v3',driver_id:'d3',customer_id:'c4',status:'chiuso',started_at:at(-4,5),ended_at:at(-3,3),origin:'Fossano (CN)',destination:'Rodez (FR)',km:742,revenue_cents:135000,price_detail:{card:'conferma d\'ordine TA-2611/084',lines:[{label:'Prezzo concordato',qty:1,unit:'viaggio',amount_cents:135000}],missing:[]}});
   d.documents.push({id:'df1',trip_id:'tf1',kind:'conferma',at:at(-6,10),demo:true,office:true,file:{name:'conferma-TA-2611-084.pdf',type:'application/pdf',size:0,data:null},
    fields:{numero:'TA-2611/084',data:at(-6,10).slice(0,10),committente:'Trans Alpi Spedizioni Srl',luogo_carico:'Fossano (CN)',data_carico:at(-4,5).slice(0,10),luogo_scarico:'Rodez (FR)',data_scarico:at(-3,3).slice(0,10),merce:'Vitelli da ristallo',pallet:null,numero_capi:62,peso_kg:null,importo:1350,pagamento:'Bonifico 60 gg data fattura',targa:null,note:null}});
   d.trips.push({id:'tf2',vehicle_id:'v3',driver_id:'d3',customer_id:'c4',status:'chiuso',started_at:at(-3,8),ended_at:at(-2,6),origin:'Rodez (FR)',destination:'Savigliano (CN)',km:760,revenue_cents:null,extra_drops:1,extra_loads:1});
  }
 }
 if(!d._tripcost_seeded){d._tripcost_seeded=true;for(const [id,k,a,desc] of [['tf1','lettiera',4500,'10 sacchi di segatura'],['tf1','adblue',3800,'AdBlue 40 l'],['tf2','lavaggio',6500,'Lavaggio e disinfezione dopo lo scarico']]){const t=(d.trips||[]).find(x=>x.id===id);if(t)d.costs.push({id:'tc_'+id+k,kind:k,date:t.started_at.slice(0,10),amount_cents:a,vehicle_id:t.vehicle_id,driver_id:t.driver_id,trip_id:id,source:'spesa',description:desc});}}
 // example empty km (road to the loading place, way back): the margin counts them; once
 if(!d._empty_seeded){d._empty_seeded=true;let i=0;for(const t of d.trips||[])if(t.km>0&&t.empty_km==null&&t.status!=='pianificato'){i++;t.empty_km=t.id==='tf2'?0:t.id==='tf1'?38:Math.round(t.km*[0.08,0.22,0,0.35,0.12,0.5][i%6]);}}
 return d;
}
/* With a real company (trasporti/sync.js) the data set lives in memory and in IndexedDB and travels to the server:
   `backend` is set by that file before the programs start. Without it: the demonstration in localStorage. */
let backend=null;
const headers=()=>({'Content-Type':'application/json','X-Radix-Trasporti':'1',...(backend&&backend.token?{'X-Plancia-Device':backend.token}:{})});
function load(){
 if(backend)return defaults(backend.get());
 let d=null;try{d=JSON.parse(root.localStorage.getItem(KEY)||'null');}catch{d=null;}
 if(!d||d.version!==2){d=seed();save(d);}
 return defaults(d);
}
function save(d){if(backend){backend.set(d);return true;}try{root.localStorage.setItem(KEY,JSON.stringify(d));return true;}catch{return false;}}
function reset(){if(backend)return load();const d=defaults(seed());save(d);return d;}

root.RadixTrStore={load,save,reset,seed,sampleTollCsv,uid,localIso,KEY,headers,setBackend(b){backend=b;},live:()=>backend?backend.info():null};
if(typeof module==='object'&&module.exports)module.exports=root.RadixTrStore;
})(typeof globalThis!=='undefined'?globalThis:this);
