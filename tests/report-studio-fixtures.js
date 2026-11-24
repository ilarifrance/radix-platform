'use strict';
// Fake data for the «Report mensile» tests and screenshots: Forno Aurora, September 2026 against August 2026.
// Every number here is invented for the tests; nothing comes from a real client.
const LOGO='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 96"><circle cx="48" cy="48" r="32" fill="#2F5D50"/><circle cx="48" cy="34" r="7" fill="#E3B448"/><text x="94" y="58" font-family="Fraunces, serif" font-size="34" font-weight="700" fill="#1C1C1E">Forno Aurora</text></svg>';
const KIT={brand:'Forno Aurora',direction:'Bottega di quartiere',palette:[{role:'primary',hex:'#2F5D50'},{role:'secondary',hex:'#A0522D'},{role:'accent',hex:'#E3B448'},{role:'dark',hex:'#1C1C1E'},{role:'light',hex:'#FAF6EE'}],fonts:[{heading:'Fraunces',body:'Inter'}],logo:LOGO};
const PROFILE={identityKit:KIT,visual:'Verde salvia #2F5D50, crosta #A0522D, farina #FAF6EE'};
const TODAY=new Date('2026-10-22T09:00:00Z');
const m=(impressions,reach,reactions,comments,shares,clicks)=>({impressions,reach,reactions,comments,shares,clicks});
const post=(id,title,channel,date,time,metrics,source='csv')=>({id,title,channel,date,time,status:'approved',copy:title,stats:{source,link:'https://instagram.com/p/'+id,publishedAt:date+'T'+time+':00',metrics,engagementRate:null}});
function editorial(){return {schemaVersion:1,projectId:'forno-aurora',briefApproved:true,contents:[
 // September 2026: 6 posts with numbers, 1 sent by Buffer without numbers yet, 1 approved, 1 in review, 1 draft
 post('s1','Il lievito madre spiegato in 60 secondi','Instagram','2026-09-02','09:00',m(2400,1800,190,22,14,null)),
 post('s2','Dietro le quinte: le 5 del mattino','Instagram','2026-09-06','07:30',m(3100,2300,260,31,20,null)),
 post('s3','Focaccia del giorno','Facebook','2026-09-10','12:00',m(1200,950,64,8,5,null)),
 post('s4','Carosello: 5 pani da provare','Instagram','2026-09-15','09:00',m(4200,3100,410,45,38,null),'buffer'),
 post('s5','Torte della domenica: come ordinare','Facebook','2026-09-19','18:00',m(1500,1100,70,12,6,null)),
 post('s6','Sabato in bottega','Instagram','2026-09-26','08:00',m(2600,1900,180,19,11,null)),
 {id:'s7',title:'Promemoria ordini di ottobre',channel:'Facebook',date:'2026-09-29',time:'10:00',status:'approved',copy:'x'},
 {id:'s8',title:'La storia del forno dal 1987',channel:'LinkedIn',date:'2026-09-30',time:'09:30',status:'approved',copy:'x'},
 {id:'s9',title:'Clienti del quartiere',channel:'Instagram',date:'2026-09-24',time:'11:00',status:'review',copy:'x'},
 {id:'s10',title:'Pane e marmellata',channel:'Instagram',date:'2026-09-27',time:'11:00',status:'draft',copy:'x'},
 // August 2026: 4 posts with numbers
 post('a1','Ferie: siamo aperti','Instagram','2026-08-03','09:00',m(1900,1500,120,10,6,null)),
 post('a2','Focaccia estiva','Facebook','2026-08-09','12:00',m(900,700,40,5,2,null)),
 post('a3','Pane per il picnic','Instagram','2026-08-18','09:00',m(2100,1600,140,14,9,null)),
 post('a4','Si riparte a settembre','Instagram','2026-08-29','09:00',m(1800,1400,110,9,7,null))]}}
// s7 went out through Buffer on 29/09 but its numbers are not imported yet: published, without metrics.
const PUBLICATIONS=[{content_id:'s7',status:'queued',post_id:'buf-77',due_at:'2026-09-29T08:00:00Z'},{content_id:'s8',status:'failed',post_id:null,due_at:'2026-09-30T07:30:00Z'}];
function seoImport(id,from,to,rows){return {id,at:to+'T10:00:00Z',range:{from,to},files:['Date.csv'],dates:rows}}
function seoRows(from,days,clicks,impressions,position){const out=[],t=Date.parse(from+'T12:00:00Z');for(let i=0;i<days;i++){const d=new Date(t+i*864e5).toISOString().slice(0,10);out.push([d,clicks+(i%3),impressions+(i%5)*10,position])}return out}
function agents(){return {schemaVersion:1,conversations:{},
 seoResults:{schemaVersion:1,brandTerms:[],advice:null,imports:[seoImport('i-aug','2026-08-01','2026-08-31',seoRows('2026-08-01',31,10,400,14.2)),seoImport('i-sep','2026-09-01','2026-09-30',seoRows('2026-09-01',30,12,450,12.8))]},
 menu:{schemaVersion:1,items:[{id:'menu-1',at:'2026-09-12T10:00:00.000Z',type:'prodotti'}]},
 coordinato:{schemaVersion:1,items:[{id:'k-1',at:'2026-08-20T10:00:00.000Z'}]}}}
const PM={projects:[{id:'p1',name:'Forno Aurora'}],tasks:[
 {id:'t1',title:'Shooting in laboratorio',status:'Completato',completedAt:'2026-09-08T16:00:00Z'},
 {id:'t2',title:'Nuovo listino torte',status:'Completato',completedAt:'2026-09-17T11:00:00Z'},
 {id:'t3',title:'Piano editoriale di ottobre',status:'Completato',completedAt:'2026-09-28T15:00:00Z'},
 {id:'t4',title:'Scheda Google aggiornata',status:'Completato',completedAt:'2026-08-21T10:00:00Z'},
 {id:'t5',title:'Volantino open day',status:'In corso'}]};
const OPERATIONS={schemaVersion:1,records:[{id:'o1',title:'Stampa locandine A3',status:'done',updatedAt:'2026-09-22T09:00:00Z'},{id:'o2',title:'Foto vetrina',status:'doing',updatedAt:'2026-09-25T09:00:00Z'}]};
const WS={id:'3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f',name:'Forno Aurora · CRM'};
function leads(){const out=[];let i=0;const add=(date,source,n)=>{for(let k=0;k<n;k++)out.push({id:'l'+(++i),title:'Richiesta '+i,status:'nuovo',source,created_at:date+'T1'+(k%9)+':00:00Z'})};
 add('2026-09-04','sito',3);add('2026-09-18','sito',4);add('2026-09-11','linkedin',2);add('2026-08-12','sito',3);add('2026-08-20','manuale',1);return out}
function campaigns(){const contacts=[],sends=[],clicks=[],followups=[];
 for(let i=1;i<=40;i++){contacts.push({id:'c'+i,name:'Cliente '+i,marketing_consent:true});sends.push({title:'Email: Torte della domenica',contact_id:'c'+i,occurred_at:'2026-09-14T08:00:00Z',k:'Torte%20della%20domenica'})}
 for(let i=1;i<=9;i++)clicks.push({contact_id:'c'+i,campaign:'Torte della domenica',url:'https://www.fornoaurora.it/torte',clicked_at:'2026-09-14T09:0'+i+':00Z'});
 followups.push({contact_id:'c2',kind:'call',occurred_at:'2026-09-16T10:00:00Z',title:'Telefonata ordine'});
 for(let i=1;i<=30;i++)sends.push({title:'Email: Si riparte',contact_id:'c'+i,occurred_at:'2026-08-30T08:00:00Z',k:'Si%20riparte'});
 for(let i=1;i<=4;i++)clicks.push({contact_id:'c'+i,campaign:'Si riparte',url:'https://www.fornoaurora.it/',clicked_at:'2026-08-30T09:00:00Z'});
 return {sends,clicks,contacts,followups,opportunities:[]}}
const crm=()=>({workspace:WS,leads:leads(),truncated:false,report:campaigns(),error:''});
const input=(over={})=>({month:'2026-09',today:TODAY,projectName:'Forno Aurora',editorial:editorial(),publications:PUBLICATIONS.slice(),agents:agents(),pm:PM,operations:OPERATIONS,crm:crm(),...over});
module.exports={LOGO,KIT,PROFILE,TODAY,WS,editorial,agents,PM,OPERATIONS,PUBLICATIONS,leads,campaigns,crm,input};
