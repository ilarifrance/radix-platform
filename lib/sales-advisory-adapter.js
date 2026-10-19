'use strict';
// Offline composition boundary only. Never expose as a public route without
// authenticated tenant membership and server-side Customer360 collection.
const {projectOpportunity,validateEnvelope}=require('../api/_sales_intelligence');
const {evaluateOpportunity}=require('./sales-advisory');
function adviseTrustedCustomer360({workspace,opportunityId,rows,asOf,now}={}){
 const envelope=projectOpportunity({workspace,opportunityId,rows,asOf});
 const advisory=evaluateOpportunity(envelope,{validateEnvelope,now});
 // Explicitly avoid returning customer360 rows, note bodies or private metadata.
 return {contractVersion:envelope.contractVersion,organizationId:envelope.organizationId,opportunityId:envelope.opportunityId,recordVersion:envelope.recordVersion,asOf:envelope.asOf,dataQuality:envelope.dataQuality,advisory};
}
module.exports={adviseTrustedCustomer360};
