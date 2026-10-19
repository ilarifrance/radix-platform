'use strict';
(function(root){
 const clean=x=>String(x??'').trim();
 const flat=r=>Object.fromEntries(Object.entries(r).filter(([k,v])=>v===null||['string','number'].includes(typeof v)).map(([k,v])=>[k.toLowerCase().replace(/[^a-z0-9]/g,''),clean(v)]));
 const first=(o,keys)=>{for(const k of keys){if(o[k])return o[k]}return ''};
 const arrays=['results','items','data','leads','profiles','people','records','output'];
 function unpack(raw){
  let obj=typeof raw==='string'?JSON.parse(raw):raw;
  for(let i=0;i<4&&!Array.isArray(obj);i++){
   if(!obj||typeof obj!=='object')break;
   const key=arrays.find(k=>Array.isArray(obj[k])||(obj[k]&&typeof obj[k]==='object'));
   if(!key)break;obj=obj[key];
  }
  if(!Array.isArray(obj)||!obj.length||obj.length>10000)throw Error('JSON provider: richiesto un array di 1–10000 risultati');
  return obj;
 }
 function convert(raw,sourceUrl){
  const rows=unpack(raw);
  return rows.map((r,i)=>{
   if(!r||typeof r!=='object'||Array.isArray(r))throw Error('Risultato '+(i+1)+' non valido');
   const f=flat(r),nested=r.company&&typeof r.company==='object'&&!Array.isArray(r.company)?flat(r.company):{};
   const row={
    firstName:first(f,['firstname','givenname']),lastName:first(f,['lastname','familyname']),
    fullName:first(f,['fullname','personname','contactname','name']),
    jobTitle:first(f,['jobtitle','currenttitle','title','position','headline']),
    companyName:first(f,['companyname','organizationname','currentcompany','employer'])||first(nested,['name','companyname']),
    companyDomain:first(f,['companydomain','companywebsite','domain','website'])||first(nested,['domain','website']),
    profileUrl:first(f,['profileurl','linkedinurl','linkedinprofileurl','personlinkedinurl','publicidentifierurl']),
    companyUrl:first(f,['companylinkedinurl','companyurl'])||first(nested,['linkedinurl']),
    email:first(f,['email','emailaddress','workemail']),phone:first(f,['phone','phonenumber','workphone']),
    location:first(f,['location','city','geolocation']),country:first(f,['country','countryname']),
    industry:first(f,['industry','companyindustry'])||first(nested,['industry']),
    companySize:first(f,['companysize','companyheadcount','employees'])||first(nested,['companysize','headcount']),
    sourceUrl:first(f,['sourceurl'])||sourceUrl
   };
   if(!row.fullName&&!row.firstName&&!row.lastName)throw Error('Risultato '+(i+1)+' senza identità personale: importa contatti, non solo aziende');
   return row;
  });
 }
 const api={unpack,convert};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.RadixProviderContacts=api;
})(typeof window!=='undefined'?window:globalThis);
