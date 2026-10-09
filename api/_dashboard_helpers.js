'use strict';
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const arr=v=>Array.isArray(v)?v:[];
const short=(v,n=160)=>String(v==null?'':v).slice(0,n);
const stamp=v=>{
 if(v==null||v===''||(!['string','number'].includes(typeof v)&&!(v instanceof Date)))return 0;
 const n=typeof v==='number'?v:/^\d{12,}$/.test(String(v))?Number(v):Date.parse(v);
 return Number.isFinite(n)&&n>0&&n<8640000000000000?n:0;
};
const iso=v=>stamp(v)?new Date(stamp(v)).toISOString():null;
const safeStatus=v=>['pending','running','done','error','stale'].includes(v)?v:'unknown';
const recordedStatus=(flow,nodes)=>{
 if(flow.halted||flow.status==='halted')return 'blocked';
 if(flow.status==='error'||nodes.some(n=>safeStatus(n&&n.status)==='error'))return 'error';
 if(flow.status==='done'||(nodes.length&&nodes.every(n=>safeStatus(n&&n.status)==='done')))return 'done';
 if(flow.status==='running'||nodes.some(n=>safeStatus(n&&n.status)==='running'))return 'running';
 if(flow.status==='pending'||nodes.some(n=>['pending','stale'].includes(safeStatus(n&&n.status))))return 'pending';
 return 'unknown';
};
const snapshotStatus=(recorded,last,now)=>recorded!=='running'?recorded:
 last&&last<=now&&now-last<=600000?'unverified':'stale';
const labels=Object.freeze({
 'marketing-orchestrator':'Orchestratore Marketing','brand-strategist':'Brand Strategist',
 strategist:'Digital Strategist',copywriter:'Copywriter','art-director':'Art Director',
 'ai-specialist':'AI Specialist','social-media-manager':'Social Media Manager',
 'seo-geo':'SEO/GEO','web-content':'Web Content','video-producer':'Video Producer',
 'paid-media':'Paid Media',analytics:'Analytics',orchestrator:'Pipeline editoriale',
 partner:'Orchestratore Studio','commercialista-senior':'Commercialista Senior',
 'commercialista-operativo':'Commercialista Operativo',contabilita:'Contabilità',
 'lavoro-paghe':'Lavoro e Paghe','segreteria-studio':'Segreteria Studio',
 'web-developer':'Web Developer','legal-orchestrator':'Orchestratore Legale',
 'legal-contracts':'Contrattualistica','legal-privacy':'Privacy e GDPR',
 'legal-banking':'Diritto Bancario','legal-risk-analyst':'Analista Rischio',
 'sales-orchestrator':'Orchestratore Commerciale','market-analyst':'Analista Mercato',
 'contact-researcher':'Ricerca Contatti'
});
module.exports={obj,arr,short,stamp,iso,safeStatus,recordedStatus,snapshotStatus,labels};
