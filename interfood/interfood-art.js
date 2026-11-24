'use strict';
/* Interfood demo: a production-line illustration (filling, sealing, wrapping) with live-status chips. Pure SVG, no images. */
(function(){
window.IFmods=window.IFmods||{};
const NS='http://www.w3.org/2000/svg';
function s(tag,a,txt){const e=document.createElementNS(NS,tag);for(const k in a||{})e.setAttribute(k,a[k]);if(txt!=null)e.textContent=txt;return e}
window.IFmods.art=function(chips){
 const svg=s('svg',{class:'ar',viewBox:'0 0 560 300',role:'img','aria-label':'Illustration of a food production line: filling, sealing and wrapping'}),d=s('defs');
 const lg=(id,a,b)=>{const g=s('linearGradient',{id:id,x1:'0',y1:'0',x2:'0',y2:'1'});g.appendChild(s('stop',{offset:'0','stop-color':a}));g.appendChild(s('stop',{offset:'1','stop-color':b}));d.appendChild(g)};
 lg('arBody','#1c5ea8','#0b2e5c');lg('arTop','#2fa7a0','#0f5a66');lg('arBelt','#17365f','#0a1e3d');
 const cp=s('clipPath',{id:'arClip'});cp.appendChild(s('rect',{x:20,y:196,width:520,height:22,rx:10}));d.appendChild(cp);svg.appendChild(d);
 for(let x=0;x<=560;x+=40)svg.appendChild(s('line',{class:'ar-grid',x1:x,y1:0,x2:x,y2:300}));for(let y=0;y<=300;y+=40)svg.appendChild(s('line',{class:'ar-grid',x1:0,y1:y,x2:560,y2:y}));
 svg.appendChild(s('ellipse',{class:'ar-floor',cx:280,cy:262,rx:270,ry:18}));
 // conveyor
 svg.appendChild(s('rect',{x:20,y:196,width:520,height:22,rx:10,fill:'url(#arBelt)',class:'ar-beltbody'}));
 const belt=s('g',{'clip-path':'url(#arClip)'}),mv=s('g',{class:'ar-move'});for(let i=-1;i<10;i++){mv.appendChild(s('rect',{class:'ar-prod',x:24+i*60,y:200,width:36,height:14,rx:5}));mv.appendChild(s('rect',{class:'ar-lid',x:28+i*60,y:202,width:28,height:3,rx:1.5}))}belt.appendChild(mv);svg.appendChild(belt);
 for(let x=40;x<540;x+=60)svg.appendChild(s('circle',{class:'ar-roller',cx:x,cy:224,r:5}));svg.appendChild(s('rect',{class:'ar-leg',x:60,y:226,width:6,height:36}));svg.appendChild(s('rect',{class:'ar-leg',x:270,y:226,width:6,height:36}));svg.appendChild(s('rect',{class:'ar-leg',x:480,y:226,width:6,height:36}));
 // machine 1: filler
 const m1=s('g');m1.appendChild(s('path',{d:'M70 70 L150 70 L134 112 L86 112 Z',fill:'url(#arTop)',class:'ar-glass'}));m1.appendChild(s('rect',{x:84,y:112,width:52,height:76,rx:8,fill:'url(#arBody)',class:'ar-m'}));m1.appendChild(s('rect',{x:100,y:150,width:20,height:38,rx:4,class:'ar-nozzle'}));m1.appendChild(s('circle',{class:'ar-led',cx:96,cy:126,r:4}));svg.appendChild(m1);
 // machine 2: sealer
 const m2=s('g');m2.appendChild(s('rect',{x:196,y:96,width:130,height:92,rx:12,fill:'url(#arBody)',class:'ar-m'}));m2.appendChild(s('rect',{x:212,y:110,width:62,height:40,rx:7,class:'ar-window'}));m2.appendChild(s('rect',{x:214,y:164,width:98,height:10,rx:5,class:'ar-bar'}));m2.appendChild(s('circle',{class:'ar-led',cx:304,cy:114,r:4}));m2.appendChild(s('rect',{x:226,y:84,width:70,height:14,rx:6,fill:'url(#arTop)',class:'ar-glass'}));svg.appendChild(m2);
 // machine 3: wrapper
 const m3=s('g');m3.appendChild(s('rect',{x:400,y:110,width:104,height:78,rx:12,fill:'url(#arBody)',class:'ar-m'}));m3.appendChild(s('circle',{class:'ar-reel',cx:430,cy:90,r:22}));m3.appendChild(s('circle',{class:'ar-reel-c',cx:430,cy:90,r:7}));m3.appendChild(s('rect',{x:454,y:128,width:36,height:26,rx:6,class:'ar-window'}));m3.appendChild(s('circle',{class:'ar-led amber',cx:414,cy:128,r:4}));svg.appendChild(m3);
 // status chips
 const ch=chips||[['Line 2 · Running',20,22,'ok'],['Next service 12 Nov',200,26,'warn'],['OEE 87%','r',60,'ok']];
 ch.forEach(c=>{const g=s('g',{class:'ar-chip '+c[3]}),w=c[0].length*6.6+26;if(c[1]==='r')c=[c[0],560-w-8,c[2],c[3]];g.appendChild(s('rect',{x:c[1],y:c[2],width:w,height:24,rx:12}));g.appendChild(s('circle',{cx:c[1]+12,cy:c[2]+12,r:3.5}));g.appendChild(s('text',{x:c[1]+22,y:c[2]+16},c[0]));svg.appendChild(g)});
 svg.appendChild(s('line',{class:'ar-link',x1:60,y1:46,x2:110,y2:112}));svg.appendChild(s('line',{class:'ar-link',x1:300,y1:50,x2:290,y2:96}));svg.appendChild(s('line',{class:'ar-link',x1:470,y1:58,x2:452,y2:110}));
 return svg}
})();
