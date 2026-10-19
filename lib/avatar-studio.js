/* Studio Avatar: the questions that turn «how do you want your avatar?» into a HeyGen photo-avatar request,
   the voices worth proposing, and the avatar saved on the project profile for the PED videos. Pure: browser and Node. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixAvatarStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Italian label → HeyGen value (POST /v2/photo_avatar/photo/generate). First entry is the default.
const QUESTIONS=[
 {id:'gender',label:'Uomo o donna?',options:[['Uomo','Man'],['Donna','Woman'],['Non specificato','Unspecified']]},
 {id:'age',label:'Che età dimostra?',options:[['30-45 anni','Early Middle Age'],['20-30 anni','Young Adult'],['45-60 anni','Late Middle Age'],['Over 60','Senior'],['Non specificata','Unspecified']]},
 {id:'ethnicity',label:'Tratti del viso',options:[['Europei','White'],['Mediterranei / latini','Hispanic'],['Mediorientali','Middle Eastern'],['Africani','Black'],['Asiatici orientali','East Asian'],['Sud-est asiatico','South East Asian'],['Asia meridionale','South Asian'],['Asiatico-americani','Asian American'],['Pacifico','Pacific'],['Non specificati','Unspecified']]},
 {id:'style',label:'Che stile di immagine?',options:[['Realistico','Realistic'],['Cinematografico','Cinematic'],['Vintage','Vintage'],['Bianco e nero','Noir'],['Cartone 3D','Pixar'],['Futuristico','Cyberpunk']]},
 {id:'pose',label:'Inquadratura',options:[['Mezzo busto','half_body'],['Primo piano','close_up'],['Figura intera','full_body']]},
 {id:'orientation',label:'Formato',options:[['Verticale (Reel, Stories)','vertical'],['Quadrato','square'],['Orizzontale','horizontal']]}
];
const APPEARANCE_MAX=1000;
const valid=(id,v)=>QUESTIONS.find(q=>q.id===id).options.some(o=>o[1]===v);
// What the user answered → the body HeyGen expects. Throws a plain-Italian message on anything missing.
function designPayload(answers,name){const a=answers||{},out={name:String(name||'Avatar RADIX').trim().slice(0,80)||'Avatar RADIX'};
 for(const q of QUESTIONS){const v=a[q.id]==null?q.options[0][1]:a[q.id];if(!valid(q.id,v))throw Error('Risposta non valida per «'+q.label+'».');out[q.id]=v}
 const look=String(a.appearance||'').trim();if(look.length<15)throw Error('Descrivi in una frase come appare: abbigliamento, ambiente, espressione.');
 out.appearance=look.slice(0,APPEARANCE_MAX);return out}
// A starting description from the project: who they speak to and with what tone.
function appearanceHint(profile){const p=profile||{},bits=['abito professionale curato, espressione sicura e cordiale, luce naturale morbida'];
 if(p.kind)bits.push('contesto: '+String(p.kind).slice(0,120));if(p.voice)bits.push('tono: '+String(p.voice).split(/[.\n]/)[0].slice(0,140));
 return ('Sfondo ufficio moderno sfocato, '+bits.join(', ')).slice(0,APPEARANCE_MAX)}
// The voices to propose: same language first, then same gender, at most three.
function pickVoices(voices,{gender,language='Italian'}={}){const g=gender==='Woman'?'female':gender==='Man'?'male':'';const lang=String(language).toLowerCase();
 const list=(voices||[]).filter(v=>v&&v.id);const score=v=>(String(v.language||'').toLowerCase().includes(lang)?2:0)+(g&&String(v.gender||'').toLowerCase()===g?1:0);
 return list.map((v,i)=>({v,i,s:score(v)})).filter(x=>x.s>=2||!list.some(v=>String(v.language||'').toLowerCase().includes(lang))).sort((a,b)=>b.s-a.s||a.i-b.i).slice(0,3).map(x=>x.v)}
// At most three examples to choose from, each with what HeyGen needs to turn it into an avatar.
function examples(images){return (images||[]).filter(x=>x&&x.url&&x.key).slice(0,3)}
// The avatar kept on the project profile; the PED video tool starts from it.
function avatarRecord(choice){const c=choice||{};if(!c.id)throw Error('Scegli prima un avatar.');if(!c.voiceId)throw Error('Scegli prima una voce.');
 return {type:c.type==='talking_photo'?'talking_photo':'avatar',id:String(c.id),name:String(c.name||'Avatar').slice(0,80),voiceId:String(c.voiceId),voiceName:String(c.voiceName||'').slice(0,80),imageUrl:/^https:\/\//.test(c.imageUrl||'')?c.imageUrl:'',groupId:c.groupId?String(c.groupId):'',createdAt:c.createdAt||new Date().toISOString()}}
// The saved avatar as a team-memory proposal, so writers know who presents the videos; a person confirms it.
function avatarMemory(record,projectId,clientId,appearance){const t=s=>String(s||'').replace(/\s+/g,' ').trim(),look=t(appearance).slice(0,400);
 return {level:'project',kind:'decision',status:'proposed',projectId:String(projectId||''),clientId:String(clientId||''),title:('Avatar dei video: '+t(record.name)).slice(0,140),
  content:'I video del progetto sono presentati da «'+t(record.name)+'» ('+(record.type==='talking_photo'?'foto parlante':'avatar')+' HeyGen)'+(t(record.voiceName)?' con la voce «'+t(record.voiceName)+'»':'')+'.'+(look?' Aspetto: '+look+'.':'')+' Scelto nello Studio Avatar.',
  source:'Studio Avatar'}}
function savedAvatar(profile){const a=profile&&profile.avatar;return a&&a.id&&a.voiceId?a:null}
return Object.freeze({QUESTIONS,APPEARANCE_MAX,designPayload,appearanceHint,pickVoices,examples,avatarRecord,avatarMemory,savedAvatar});
});
