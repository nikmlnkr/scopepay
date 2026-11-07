import {createHash} from 'node:crypto';
import {sourcesFor} from './scope-sources.js';
const fingerprint=s=>createHash('sha256').update(JSON.stringify(s)).digest('hex');
const clean=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const languages=/\b(spanish|french|german|hindi|tamil|telugu|arabic|japanese|chinese|portuguese|italian|korean|english)\b/i;
function finding(text,kind,reason,source,question='',rule='manual-review'){
 const evidence=source?.text||null;
 return {text:text.slice(0,160),kind,reason,evidence,sourceId:source?.id||null,sourceStart:evidence?0:null,sourceEnd:evidence?.length??null,question,confidence:kind==='clarify'?'low':'high',rule};
}
function matchingContext(text,sources){const language=text.match(languages)?.[0]?.toLowerCase();return sources.find(s=>(s.id.startsWith('accepted-change')||s.id.startsWith('deliverable'))&&language&&s.text.toLowerCase().includes(language));}
export function ruleAnalysis(p,{mode='change',request=''}={}){
 if(!['scope','change'].includes(mode))throw new Error('Invalid scope review mode');
 const sources=sourcesFor(p,mode),summarySource=sources.find(s=>s.id==='summary'),exclusions=sources.find(s=>s.id==='exclusions');
 const findings=[];
 if(mode==='scope'){
  for(const s of sources.filter(s=>!s.id.startsWith('revisions'))){
   if(/\b(tbd|maybe|etc|as needed|punchier|better|unlimited|asap|high quality)\b/i.test(s.text))findings.push(finding('Clarify open-ended wording','clarify','This clause uses wording without a measurable limit or acceptance test.',s,'What exact quantity, quality test or limit should replace this wording?','ambiguous-wording'));
   if(s.id.endsWith('-criteria')&&!/\d|\b(one|two|three|four|five|single)\b/i.test(s.text))findings.push(finding('Confirm quantity or measurable acceptance','clarify','No numeric quantity or measurement was found in this deliverable criterion.',s,'What measurable acceptance test and quantity will the client approve?','measurable-criteria'));
  }
  if(summarySource.text.length<30)findings.push(finding('Expand the project objective','clarify','The summary is too short for a useful scope record.',summarySource,'What outcome, audience and deliverables are expected?','short-summary'));
  if(!findings.length)findings.push(finding('Basic scope checks passed','clarify','No obvious open-ended wording or missing measurements were found. Confirm the full requirements with the client.',summarySource,'Confirm dependencies, deadlines and acceptance criteria with the client.','seller-review'));
 }else{
  if(typeof request!=='string'||!request.trim()||request.length>4000)throw new Error('Enter a change request of 1–4000 characters');
  const items=request.split(/\n|;/).map(x=>x.trim()).filter(Boolean);
  if(items.length>20||items.some(x=>x.length>160))throw new Error('Use one request item per line, up to 20 items and 160 characters per item.');
  for(const text of items){
   if(/\b(ignore|system prompt|api key|reveal|override instructions)\b/i.test(text)){findings.push(finding(text,'clarify','This looks like an instruction to the tool rather than a deliverable request.',null,'Describe the actual work requested.','instruction-like-text'));continue;}
   if(/\b(punchier|better|asap|etc|as needed|improve|polish)\b/i.test(text)){findings.push(finding(text,'clarify','The requested outcome is not measurable.',null,'Which specific changes and acceptance criteria do you want?','ambiguous-request'));continue;}
   if(/\brevis(?:ion|ions|e)\b/i.test(text)){findings.push(finding(text,'clarify','The agreement defines revision rounds, but used rounds are not tracked.',sources.find(s=>s.id==='revisions'),'How many rounds have been used, and what changes are requested?','revision-usage'));
    continue;}
   const normalized=clean(text),unchanged=/\b(unchanged|same|already agreed|previously agreed)\b/i.test(text),additional=/\b(add|additional|another|second|extra|new|more)\b/i.test(text);
   const exact=sources.find(s=>(s.id.endsWith('-title')||s.id.startsWith('accepted-change'))&&clean(s.text.split('\n')[0])===normalized);
   const matched=matchingContext(text,sources);
   const translation=/\b(translat\w*|spanish|french|german|hindi|tamil|telugu|arabic|japanese|chinese|portuguese|italian|korean)\b/i.test(text);
   const alternate=/\b(square|landscape|horizontal|16\s*:\s*9|1\s*:\s*1|aspect ratio|aspect ratios)\b/i.test(text);
   const excluded=/\bexcluded?\b/i.test(exclusions.text)&&!/\b(not excluded|included|allowed)\b/i.test(exclusions.text);
   const exclusion=excluded&&(translation&&/\btranslat\w*/i.test(exclusions.text)||alternate&&/aspect ratios?|alternate formats?/i.test(exclusions.text));
   const accepted=matched?.id.startsWith('accepted-change');
   if(exact||(unchanged&&matched&&!additional)){
    if(exclusion&&!accepted){findings.push(finding(text,'clarify','A deliverable match and an exclusion may conflict. Confirm the intended agreement before proceeding.',matched,'Confirm which clause governs this request.','conflicting-clauses'));continue;}
    findings.push(finding(text,'included','Matches an agreed deliverable or accepted addition. Verify that quantity and specifications remain unchanged.',exact||matched,'','agreed-deliverable'));continue;
   }
   if(matched&&exclusion){findings.push(finding(text,'clarify',accepted?'An accepted change already covers related work. Avoid charging again without confirming the new quantity.':'A related agreed deliverable may conflict with this exclusion.',matched,'Is this the already approved work, or an additional deliverable?','existing-work-check'));continue;}
   if(exclusion){findings.push(finding(text,'extra','This request appears to match an explicit exclusion. It is only a proposed extra, subject to seller review and client approval.',exclusions,'','explicit-exclusion'));continue;}
   findings.push(finding(text,'clarify','The agreement does not provide a clear match for this request.',null,'Confirm whether this is included work, an additional deliverable, or a clarification.','no-rule-match'));
  }
 }
 return {id:undefined,summary:mode==='scope'?'Review the scope and confirm any open questions with the client.':'Review each request against the agreement. Confirm any unclear details before proposing additional work.',findings:findings.slice(0,20),request,mode,sources,sourceHash:fingerprint(sources),baselineVersion:p.baseline?.version,baselineHash:p.baseline?.hash,draftRevision:p.revision,adapter:'rules',model:'scope-rules-v1',createdAt:new Date().toISOString()};
}
