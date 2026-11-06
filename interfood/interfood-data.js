'use strict';
/* Interfood demo: FICTIONAL data only (made-up companies, machines, people). No real customer or supplier data. */
(function(root){
const customers=[
 {id:'c1',name:'Northfield Bakeries Ltd',city:'Leeds'},
 {id:'c2',name:'Harbour Foods Group',city:'Grimsby'},
 {id:'c3',name:'Greenacre Dairy Co-op',city:'Shrewsbury'},
 {id:'c4',name:'Ashdown Snacks Ltd',city:'Brighton'},
 {id:'c5',name:'Castlerock Ready Meals',city:'Belfast'},
 {id:'c6',name:'Millbrook Confectionery',city:'Derby'},
 {id:'c7',name:'Dunmore Fresh Produce',city:'Cork'},
 {id:'c8',name:'Pennine Pies & Pastry',city:'Huddersfield'}
];
const machines=[
 {id:'M-1001',model:'Tray sealer TS-300',type:'Packing',customer:'c1',serial:'TS300-2209-14',installed:'2025-03-12',warrantyEnd:'2027-03-12',status:'Running',lastService:'2026-08-20',nextService:'2027-02-20'},
 {id:'M-1002',model:'Filling line FL-400',type:'Filling',customer:'c2',serial:'FL400-2301-07',installed:'2025-06-03',warrantyEnd:'2027-06-03',status:'Service due',lastService:'2026-04-30',nextService:'2026-11-12'},
 {id:'M-1003',model:'Flow wrapper FW-250',type:'Packing',customer:'c4',serial:'FW250-2112-31',installed:'2024-09-18',warrantyEnd:'2026-09-18',status:'Out of warranty',lastService:'2026-05-14',nextService:'2026-11-30'},
 {id:'M-1004',model:'Checkweigher CW-80',type:'Inspection',customer:'c1',serial:'CW80-2304-02',installed:'2025-03-12',warrantyEnd:'2027-03-12',status:'Running',lastService:'2026-08-20',nextService:'2027-02-20'},
 {id:'M-1005',model:'Dough divider DD-120',type:'Processing',customer:'c8',serial:'DD120-2210-19',installed:'2024-11-05',warrantyEnd:'2026-11-05',status:'Warranty ending',lastService:'2026-06-02',nextService:'2026-12-02'},
 {id:'M-1006',model:'Metal detector MD-60',type:'Inspection',customer:'c5',serial:'MD60-2308-44',installed:'2025-10-21',warrantyEnd:'2027-10-21',status:'Running',lastService:'2026-04-22',nextService:'2026-12-22'},
 {id:'M-1007',model:'Tray sealer TS-300',type:'Packing',customer:'c3',serial:'TS300-2402-08',installed:'2025-12-09',warrantyEnd:'2027-12-09',status:'Fault reported',lastService:'2026-06-15',nextService:'2026-12-15'},
 {id:'M-1008',model:'Mixer MX-500',type:'Processing',customer:'c6',serial:'MX500-2111-23',installed:'2023-07-27',warrantyEnd:'2025-07-27',status:'Out of warranty',lastService:'2026-02-03',nextService:'2026-11-18'},
 {id:'M-1009',model:'Filling line FL-400',type:'Filling',customer:'c3',serial:'FL400-2405-11',installed:'2026-02-16',warrantyEnd:'2028-02-16',status:'Running',lastService:'2026-08-11',nextService:'2027-02-11'},
 {id:'M-1010',model:'Checkweigher CW-80',type:'Inspection',customer:'c2',serial:'CW80-2406-30',installed:'2025-06-03',warrantyEnd:'2027-06-03',status:'Running',lastService:'2026-04-30',nextService:'2026-11-12'},
 {id:'M-1011',model:'Flow wrapper FW-250',type:'Packing',customer:'c7',serial:'FW250-2503-05',installed:'2026-04-08',warrantyEnd:'2028-04-08',status:'Running',lastService:'2026-10-02',nextService:'2027-04-02'},
 {id:'M-1012',model:'Mixer MX-500',type:'Processing',customer:'c8',serial:'MX500-2407-16',installed:'2025-01-30',warrantyEnd:'2027-01-30',status:'Running',lastService:'2026-07-09',nextService:'2027-01-09'}
];
const stages=['Enquiry','Site visit','Trial','Quote','Negotiation','Order'];
const deals=[
 {id:'D-01',title:'Second tray sealer line',customer:'c1',value:48000,stage:'Quote',owner:'Priya Shah',next:'Send revised quote',due:'2026-11-10'},
 {id:'D-02',title:'Filling line upgrade',customer:'c2',value:132000,stage:'Negotiation',owner:'Tom Ellis',next:'Agree delivery date',due:'2026-11-12'},
 {id:'D-03',title:'Flow wrapper replacement',customer:'c4',value:36500,stage:'Trial',owner:'Priya Shah',next:'Collect trial results',due:'2026-11-14'},
 {id:'D-04',title:'Metal detector, 2 lines',customer:'c5',value:29800,stage:'Site visit',owner:'Tom Ellis',next:'Book site visit',due:'2026-11-18'},
 {id:'D-05',title:'New dough line',customer:'c8',value:210000,stage:'Enquiry',owner:'Amelia Hart',next:'Qualification call',due:'2026-11-09'},
 {id:'D-06',title:'Mixer MX-500 x2',customer:'c6',value:74000,stage:'Quote',owner:'Amelia Hart',next:'Follow up on quote',due:'2026-11-16'},
 {id:'D-07',title:'Checkweigher retrofit',customer:'c3',value:18200,stage:'Order',owner:'Tom Ellis',next:'Plan installation',due:'2026-11-20'},
 {id:'D-08',title:'Packing line extension',customer:'c7',value:96500,stage:'Site visit',owner:'Priya Shah',next:'Site survey report',due:'2026-11-25'},
 {id:'D-09',title:'Spare parts contract',customer:'c2',value:12400,stage:'Negotiation',owner:'Amelia Hart',next:'Confirm pricing',due:'2026-11-11'},
 {id:'D-10',title:'Trial of tray sealer TS-300',customer:'c5',value:41000,stage:'Trial',owner:'Tom Ellis',next:'Install trial unit',due:'2026-11-22'}
];
const installs=[
 {id:'I-01',title:'Checkweigher retrofit',customer:'c3',engineer:'Jack Morrison',phases:[{name:'Survey',start:'2026-11-23',end:'2026-11-27',done:false},{name:'Delivery',start:'2026-12-01',end:'2026-12-04',done:false},{name:'Install',start:'2026-12-07',end:'2026-12-11',done:false},{name:'Commissioning',start:'2026-12-14',end:'2026-12-16',done:false}]},
 {id:'I-02',title:'Filling line FL-400 (line 2)',customer:'c2',engineer:'Sara Jennings',phases:[{name:'Survey',start:'2026-10-05',end:'2026-10-09',done:true},{name:'Delivery',start:'2026-10-19',end:'2026-10-23',done:true},{name:'Install',start:'2026-11-02',end:'2026-11-13',done:false},{name:'Commissioning',start:'2026-11-16',end:'2026-11-20',done:false}]},
 {id:'I-03',title:'Trial unit TS-300',customer:'c5',engineer:'Jack Morrison',phases:[{name:'Delivery',start:'2026-11-17',end:'2026-11-19',done:false},{name:'Install',start:'2026-11-20',end:'2026-11-24',done:false},{name:'Commissioning',start:'2026-11-25',end:'2026-11-27',done:false}]}
];
const tickets=[
 {id:'T-2041',customer:'c3',machine:'M-1007',issue:'Seal temperature alarm',priority:'High',status:'Open',opened:'2026-11-05',tech:null,day:null,start:null,dur:3},
 {id:'T-2040',customer:'c2',machine:'M-1002',issue:'Planned service due',priority:'Normal',status:'Scheduled',opened:'2026-11-03',tech:'Sara Jennings',day:'2026-11-06',start:13,dur:3},
 {id:'T-2038',customer:'c6',machine:'M-1008',issue:'Gearbox noise',priority:'High',status:'In progress',opened:'2026-11-02',tech:'Jack Morrison',day:'2026-11-06',start:9,dur:4},
 {id:'T-2037',customer:'c4',machine:'M-1003',issue:'Spare film cutter blade',priority:'Low',status:'Waiting for parts',opened:'2026-10-30',tech:null,day:null,start:null,dur:2},
 {id:'T-2033',customer:'c8',machine:'M-1005',issue:'Warranty-ending inspection',priority:'Normal',status:'Scheduled',opened:'2026-10-28',tech:'Jack Morrison',day:'2026-11-09',start:9,dur:3},
 {id:'T-2029',customer:'c1',machine:'M-1001',issue:'Operator training request',priority:'Low',status:'Resolved',opened:'2026-10-20',tech:'Sara Jennings',day:'2026-11-04',start:10,dur:2}
];
const nodes=[
 {id:'crm',label:'CRM',sub:'Sales pipeline',state:'live',stateText:'Live in RADIX'},
 {id:'assets',label:'Asset database',sub:'Sold machines & installations',state:'live',stateText:'Live in RADIX'},
 {id:'service',label:'Service platform',sub:'Tickets and maintenance (Proxedo being implemented)',state:'live',stateText:'Live in RADIX'},
 {id:'dashboard',label:'Management dashboard',sub:'KPIs',state:'live',stateText:'Live in RADIX'},
 {id:'marketing',label:'Marketing database',sub:'Leads and campaigns',state:'demo',stateText:'Demo data'},
 {id:'erp',label:'ERP',sub:'Microsoft Business Central',state:'connect',stateText:'To connect'},
 {id:'hr',label:'HR',sub:'Sage HR',state:'connect',stateText:'To connect'}
];
const leadSources=[{source:'Trade shows',leads:46,qualified:14},{source:'Website enquiries',leads:31,qualified:9},{source:'Referrals',leads:12,qualified:8},{source:'Email campaigns',leads:58,qualified:6},{source:'Existing customers (upgrades)',leads:19,qualified:11}];
const erpPreview=[{item:'Sales order SO-10482',customer:'c2',amount:132000,status:'Open'},{item:'Invoice SI-90113',customer:'c1',amount:48000,status:'Paid'},{item:'Sales order SO-10479',customer:'c3',amount:18200,status:'Open'},{item:'Invoice SI-90098',customer:'c6',amount:21750,status:'Overdue'}];
const users=[
 {id:'u1',name:'Jono Atherton',role:'Operations',access:['crm','assets','service','dashboard','marketing','erp','hr']},
 {id:'u2',name:'Amelia Hart',role:'Sales manager',access:['crm']},
 {id:'u3',name:'Jack Morrison',role:'Service engineer',access:['assets','service']},
 {id:'u4',name:'Sara Jennings',role:'Installation lead',access:['assets']},
 {id:'u5',name:'Hannah Cole',role:'Marketing manager',access:['marketing']}
];
const contacts=[
 {id:'p1',customer:'c1',name:'Rachel Dunn',role:'Operations director',email:'rachel.dunn@northfield.example',last:'2026-11-03'},
 {id:'p2',customer:'c1',name:'Mark Teale',role:'Maintenance lead',email:'mark.teale@northfield.example',last:'2026-10-21'},
 {id:'p3',customer:'c2',name:'Fiona Marsh',role:'Plant manager',email:'fiona.marsh@harbour.example',last:'2026-11-04'},
 {id:'p4',customer:'c2',name:'Peter Collins',role:'Purchasing',email:'peter.collins@harbour.example',last:'2026-10-29'},
 {id:'p5',customer:'c3',name:'Gareth Pugh',role:'Production manager',email:'gareth.pugh@greenacre.example',last:'2026-11-05'},
 {id:'p6',customer:'c4',name:'Nina Patel',role:'Engineering manager',email:'nina.patel@ashdown.example',last:'2026-10-27'},
 {id:'p7',customer:'c5',name:'Liam Doherty',role:'Technical director',email:'liam.doherty@castlerock.example',last:'2026-11-02'},
 {id:'p8',customer:'c5',name:'Aoife Quinn',role:'Quality manager',email:'aoife.quinn@castlerock.example',last:'2026-10-18'},
 {id:'p9',customer:'c6',name:'Steve Booth',role:'Factory manager',email:'steve.booth@millbrook.example',last:'2026-11-01'},
 {id:'p10',customer:'c7',name:'Ciara Murphy',role:'Managing director',email:'ciara.murphy@dunmore.example',last:'2026-10-30'},
 {id:'p11',customer:'c8',name:'Jo Whitaker',role:'Owner',email:'jo.whitaker@pennine.example',last:'2026-11-04'},
 {id:'p12',customer:'c8',name:'Dan Hirst',role:'Head baker',email:'dan.hirst@pennine.example',last:'2026-10-12'}
];
const activities=[
 {id:'a1',type:'Call',text:'Qualification call about the new dough line',deal:'D-05',owner:'Amelia Hart',due:'2026-11-09',done:false},
 {id:'a2',type:'Email',text:'Send revised quote for the second tray sealer line',deal:'D-01',owner:'Priya Shah',due:'2026-11-10',done:false},
 {id:'a3',type:'Meeting',text:'Agree delivery date for the filling line upgrade',deal:'D-02',owner:'Tom Ellis',due:'2026-11-12',done:false},
 {id:'a4',type:'Call',text:'Confirm spare parts pricing',deal:'D-09',owner:'Amelia Hart',due:'2026-11-11',done:false},
 {id:'a5',type:'Visit',text:'Site visit for the two-line metal detector',deal:'D-04',owner:'Tom Ellis',due:'2026-11-18',done:false},
 {id:'a6',type:'Email',text:'Follow up on the mixer quote',deal:'D-06',owner:'Amelia Hart',due:'2026-11-16',done:false},
 {id:'a7',type:'Call',text:'Collect trial results for the flow wrapper',deal:'D-03',owner:'Priya Shah',due:'2026-11-05',done:false},
 {id:'a8',type:'Visit',text:'Site survey report for the packing line',deal:'D-08',owner:'Priya Shah',due:'2026-11-25',done:false}
];

const technicians=[
 {id:'t1',name:'Jack Morrison',base:'Shrewsbury',status:'Working',lat:52.71,lon:-2.75},
 {id:'t2',name:'Sara Jennings',base:'Leeds',status:'Driving',lat:53.8,lon:-1.55},
 {id:'t3',name:'Ewan Price',base:'Bristol',status:'Available',lat:51.45,lon:-2.58},
 {id:'t4',name:'Lauren Ahmed',base:'Belfast',status:'Available',lat:54.6,lon:-5.93}
];
const geo={c1:[53.8,-1.55],c2:[53.57,-0.08],c3:[52.71,-2.75],c4:[50.82,-0.14],c5:[54.6,-5.93],c6:[52.92,-1.48],c7:[51.9,-8.47],c8:[53.65,-1.78]};
const parts=[{id:'P-310',name:'Seal bar heater 300 mm',price:86},{id:'P-322',name:'Film cutter blade',price:34},{id:'P-415',name:'Gearbox oil, 5 l',price:42},{id:'P-518',name:'Temperature sensor PT100',price:58},{id:'P-640',name:'Conveyor belt, 1.2 m',price:215}];
const checklist=['Safety lock-out checked','Fault reproduced / cause found','Repair or adjustment done','Machine tested under load','Operator briefed'];
const archive=[
 {id:'k1',kind:'Chat answer',title:'Seal temperature alarm: first checks',text:'Check the PT100 sensor reading against a handheld probe, then the heater element resistance. If the sensor drifts more than 3 C replace it before touching the controller. Typical cause on TS-300 units after 12 months: contaminated seal bar.',tags:['TS-300','sealing'],machine:'M-1007',shared:true,date:'2026-11-05',by:'Jack Morrison'},
 {id:'k2',kind:'Voice note',title:'Greenacre line layout, site visit',text:'Gareth says the new filling line must fit behind the existing wrapper; 600 mm clearance on the left, forklift route cannot move.',tags:['Greenacre','install'],machine:'',shared:false,date:'2026-11-03',by:'Sara Jennings'},
 {id:'k3',kind:'Note',title:'Mixer MX-500 gearbox noise',text:'Noise rises above 60 percent speed. Oil level low and metal in the drain plug: likely bearing. Order bearing kit before the visit.',tags:['MX-500','gearbox'],machine:'M-1008',shared:true,date:'2026-11-02',by:'Jack Morrison'}
];
const core={technicians,geo,parts,checklist,archive,customers,machines,stages,deals,installs,tickets,nodes,leadSources,erpPreview,users,contacts,activities};
if(typeof module==='object'&&module.exports)module.exports=core;
root.InterfoodDemo=core;
})(typeof globalThis!=='undefined'?globalThis:this);
