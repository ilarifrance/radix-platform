'use strict';
(function(root){
 const FIELDS=['name','domain','country','industry','companySize','contactRole','source'];
 const ALIASES={name:['name','azienda','company','companyname','currentcompany','accountname','nomeazienda'],domain:['domain','dominio','website','companywebsite','companydomain','sitoazienda'],country:['country','paese'],industry:['industry','settore','companyindustry','settoreazienda'],companySize:['companysize','dimensione','size','employeeheadcount','companyheadcount','employeesize'],contactRole:['contactrole','ruolo','role','jobtitle','title','position','currentposition'],source:['source','fonte','linkedinurl','profileurl','sourceurl','companylinkedinurl']};
 // Optional person columns (Sales Navigator / CRM exports): added to a row only when the file has them.
 const PERSON={contactName:['contactname','fullname','nomecompleto','referente','nomereferente','personname','leadname'],firstName:['firstname','givenname','nomepersona'],lastName:['lastname','cognome','surname','familyname'],email:['email','emailaddress','workemail','mail','indirizzoemail','emailaziendale'],phone:['phone','telefono','phonenumber','cellulare','mobile'],profileUrl:['profileurl','linkedinprofileurl','personlinkedinurl','linkedinprofile']};
 const normalize=s=>s.normalize('NFKC').trim().toLocaleLowerCase('it').replace(/[\s_-]/g,'');
 const KNOWN=new Set([...Object.values(ALIASES),...Object.values(PERSON)].flat());
 function rowsOf(text,delimiter,maxRows){
  const result=[];let row=[],cell='',state=0,line=1,start=1;
  const field=()=>{row.push(cell);cell='';state=0};
  const finish=()=>{field();if(row.some(x=>x.trim()))result.push({row,line:start});if(result.length>maxRows+1)throw Error('CSV: massimo '+maxRows+' prospect');row=[];start=line+1};
  for(let i=0;i<text.length;i++){
   const ch=text[i],newline=ch==='\r'||ch==='\n';
   if(state===2){
    if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++}else state=3}
    else if(newline){cell+='\n';if(ch==='\r'&&text[i+1]==='\n')i++;line++}
    else cell+=ch;
   }else if(ch===delimiter)field();
   else if(newline){finish();if(ch==='\r'&&text[i+1]==='\n')i++;line++}
   else if(state===0&&ch==='"')state=2;
   else if(state===1&&ch==='"')throw Error('CSV: virgolette non valide alla riga '+line);
   else if(state===3){if(ch!==' '&&ch!=='\t')throw Error('CSV: caratteri dopo virgolette alla riga '+line)}
   else{cell+=ch;state=1}
  }
  if(state===2)throw Error('CSV: virgolette non chiuse alla riga '+start);
  if(row.length||cell.trim())finish();
  return result;
 }
 function parseCsv(source,{maxRows=250,maxCell=2000}={}){
  if(typeof source!=='string'||source.length>1024*1024)throw Error('CSV: massimo 1 MB');
  const text=source.replace(/^\uFEFF/,'');
  if(!text.trim())throw Error('CSV vuoto');
  const first=text.split(/\r?\n/,1)[0];
  const choices=[',',';','\t'].map(delimiter=>{
   let header=[];
   try{header=rowsOf(first,delimiter,maxRows)[0]?.row||[]}catch(_){}
   return{delimiter,score:header.map(normalize).filter(x=>KNOWN.has(x)).length,count:header.length};
  }).sort((a,b)=>b.score-a.score||b.count-a.count);
  const data=rowsOf(text,choices[0].delimiter,maxRows);
  if(!data.length)throw Error('CSV vuoto');
  const header=data.shift().row.map(normalize),positions={};
  for(const key of FIELDS){
   const indexes=header.flatMap((x,i)=>ALIASES[key].includes(x)?[i]:[]);
   if(indexes.length>1)throw Error('CSV: intestazione duplicata '+key);
   positions[key]=indexes[0]??-1;
  }
  if(positions.name<0&&positions.domain<0)throw Error('CSV: manca nome o dominio');
  const extra=Object.entries(PERSON).map(([key,names])=>[key,header.findIndex(x=>names.includes(x))]).filter(([,i])=>i>=0);
  return data.map(({row,line})=>{
   if(row.length!==header.length)throw Error('CSV: numero colonne diverso alla riga '+line);
   const result={};
   for(const key of FIELDS){
    const value=positions[key]<0?'':row[positions[key]].trim();
    if(value.length>maxCell||value.includes('\0'))throw Error('CSV: campo non valido '+key+' alla riga '+line);
    result[key]=value;
   }
   for(const [key,i] of extra){const value=row[i].trim();if(value.length>maxCell||value.includes('\0'))throw Error('CSV: campo non valido '+key+' alla riga '+line);result[key]=value}
   return result;
  });
 }
 const api={parseCsv,PERSON};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixLeadCsv=api;
})(typeof window!=='undefined'?window:globalThis);
