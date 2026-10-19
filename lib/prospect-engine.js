'use strict';
/**
 * RADIX Prospect Engine v0: deterministic, provider-neutral qualification.
 * No external fetch, email sending, personal-data enrichment or DB access.
 * External enrichment and outreach require separately authorized integrations.
 */
const validString = value => typeof value === 'string' && value.trim().length > 0;
const normalize = value => validString(value) ? value.normalize('NFKC').trim().toLocaleLowerCase('it') : '';
function normalizeDomain(value) {
  if (!validString(value)) return null;
  let raw = value.trim().toLowerCase();
  raw = raw.replace(/^https?:\/\//,'').replace(/^www\./,'').split(/[/?#:]/)[0];
  if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(raw) || raw.length>253) return null;
  return raw;
}
function companyKey(candidate) {
  const domain = normalizeDomain(candidate?.domain);
  if (domain) return 'domain:'+domain;
  const name=normalize(candidate?.name);
  const country=normalize(candidate?.country);
  return name&&country?'name:'+name+'|country:'+country:null;
}
function assessProspect(candidate,icp) {
  if (!candidate || typeof candidate!=='object' || !icp || typeof icp!=='object') {
    throw new TypeError('Candidate and ICP objects required');
  }
  const evidence=[],unknown=[];
  const checks=[
    ['country',icp.countries,candidate.country,25],
    ['industry',icp.industries,candidate.industry,30],
    ['size',icp.companySizes,candidate.companySize,25],
    ['role',icp.roles,candidate.contactRole,20],
  ];
  let earned=0,available=0;
  for (const [field,requested,actual,weight] of checks){
    if(!Array.isArray(requested)||!requested.length)continue;
    if(!requested.every(validString))throw new TypeError('ICP values must be nonblank strings');
    if(!validString(actual)){unknown.push(field);continue;}
    available+=weight;
    const matched=requested.map(normalize).includes(normalize(actual));
    if(matched)earned+=weight;
    evidence.push({field,value:actual,matched,weight});
  }
  const score=available?Math.round(100*earned/available):null;
  return Object.freeze({
    prospectKey:companyKey(candidate),
    score,
    scoreKind:'rules_based_icp_fit',
    coverage:available,
    unknownFields:unknown,
    evidence,
    qualification:score===null?'needs_review':score>=75?'high_fit':score>=45?'review':'low_fit',
    canAutoSend:false,
    humanReviewRequired:true,
    dataProvenance:validString(candidate.source)?candidate.source:null,
    warnings:[
      'Rules-based fit is not purchase intent or conversion probability.',
      'Contact provenance and communication lawful basis must be independently checked.'
    ],
  });
}
function deduplicateCompanies(candidates){
  if(!Array.isArray(candidates))throw new TypeError('candidates must be array');
  const seen=new Map(),pending=[];
  candidates.forEach((item,index)=>{
    const key=companyKey(item);
    if(!key){pending.push({index,reason:'insufficient_identity'});return;}
    const indexes=seen.get(key)||[];indexes.push(index);seen.set(key,indexes);
  });
  return {duplicateGroups:[...seen].filter(([,indexes])=>indexes.length>1).map(([key,indexes])=>({key,indexes,autoMerged:false})),pendingReview:pending};
}
function proposeOutreach(prospect){
  return {status:'draft_only',prospectKey:companyKey(prospect),message:null,requiresHumanReview:true,requiresLawfulBasisCheck:true,delivery:'disabled'};
}
module.exports={normalizeDomain,companyKey,assessProspect,deduplicateCompanies,proposeOutreach};
