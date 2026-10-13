'use strict';
/**
 * Review-only bridge between RADIX prospect qualification and CSV export.
 * No network, no side effects, no sending, no CRM mutation.
 */
const {assessProspect,deduplicateCompanies}=require('./prospect-engine');
const {exportProspectReviewCsv,MAX_ROWS}=require('./prospect-review-export');

function buildProspectReview(candidates,icp){
 if(!Array.isArray(candidates)||candidates.length>MAX_ROWS)throw new RangeError('Provide at most '+MAX_ROWS+' prospect companies');
 if(!icp||typeof icp!=='object'||Array.isArray(icp))throw new TypeError('ICP object required');
 const duplicate=deduplicateCompanies(candidates);
 const duplicateIndexes=new Set(duplicate.duplicateGroups.flatMap(group=>group.indexes));
 const identityPending=new Set(duplicate.pendingReview.map(item=>item.index));
 const queue=candidates.map((candidate,index)=>{
  const assessed=assessProspect(candidate,icp);
  const reasons=[];
  if(duplicateIndexes.has(index))reasons.push('possible_duplicate');
  if(identityPending.has(index))reasons.push('missing_company_identity');
  if(assessed.unknownFields.length)reasons.push('missing_icp_fields');
  if(!assessed.dataProvenance)reasons.push('missing_data_provenance');
  if(assessed.score===null)reasons.push('not_enough_evidence');
  // A high score with incomplete coverage is not a safe prioritization signal.
  const fullCoverage=assessed.coverage===100;
  const recommendation=reasons.length||!fullCoverage?'investigate':
   assessed.score>=75?'prioritize':assessed.score>=45?'investigate':'deprioritize';
  return Object.freeze({
   index,prospectKey:assessed.prospectKey,score:assessed.score,
   coveragePercent:assessed.coverage,recommendation,
   reviewReasons:reasons,dataProvenance:assessed.dataProvenance,
   humanReviewRequired:true,outreachEnabled:false,syncEnabled:false
  });
 });
 return Object.freeze({status:'preview_only',queue,duplicates:duplicate,
  canAutoSend:false,canAutoSync:false,humanReviewRequired:true});
}
function createProspectReviewCsv(candidates,icp){
 return exportProspectReviewCsv(buildProspectReview(candidates,icp));
}
module.exports={buildProspectReview,createProspectReviewCsv};
