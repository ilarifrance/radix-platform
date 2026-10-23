/* Scontorno nel browser per lo Studio Foto prodotto (lib/product-photo-studio.js): un modello open source di
   segmentazione che gira sul computer di chi usa RADIX, senza crediti e senza mandare la foto a un fornitore.
   - Runtime: Transformers.js (Apache-2.0, https://github.com/huggingface/transformers.js/blob/main/LICENSE),
     versione fissa, da cdn.jsdelivr.net; i suoi file WebAssembly arrivano dallo stesso pacchetto fisso.
   - Pesi: BiRefNet lite in ONNX (MIT: https://huggingface.co/onnx-community/BiRefNet_lite-ONNX, convertito da
     https://huggingface.co/ZhengPeng7/BiRefNet_lite, codice https://github.com/ZhengPeng7/BiRefNet), a un commit fisso.
   Niente RMBG (licenza non commerciale) né @imgly/background-removal (AGPL).
   Tutto si scarica solo quando lo studio chiede il primo scontorno (load), una volta: poi resta nella cache del
   browser. Serve WebGPU (Chrome ed Edge aggiornati, Safari 26): su WebAssembly il modello a 1024 px supera i 4 GB di
   memoria del browser e si ferma, verificato; senza WebGPU lo studio propone lo scontorno «Fondo uniforme». load({onProgress}) riporta i byte scaricati per la barra; segment(canvas) restituisce la maschera
   {width,height,data:Uint8Array 0..255} alla risoluzione della foto. In Node (test) il modulo espone solo le costanti:
   nessun download. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixProductPhotoSegment=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const RUNTIME_VERSION='3.8.1';
const RUNTIME_URL='https://cdn.jsdelivr.net/npm/@huggingface/transformers@'+RUNTIME_VERSION+'/dist/transformers.min.js';
const MODEL='onnx-community/BiRefNet_lite-ONNX';
const REVISION='de15b22ba131738a16dff04aab8bdf8dc32e3ac1';
// What a page shows next to the button, and what the tests check: both licences allow commercial use.
const LICENSES=Object.freeze([
 Object.freeze({part:'Runtime Transformers.js '+RUNTIME_VERSION,license:'Apache-2.0',url:'https://github.com/huggingface/transformers.js/blob/main/LICENSE'}),
 Object.freeze({part:'Modello BiRefNet lite (ONNX)',license:'MIT',url:'https://huggingface.co/onnx-community/BiRefNet_lite-ONNX'})
]);
// Approximate download size, for the notice next to the button (it costs no credits, only bandwidth).
const SIZES=Object.freeze({webgpu:{dtype:'fp16',mb:115}});
const NO_GPU='Questo browser non ha WebGPU: lo scontorno con il modello funziona con Chrome o Edge aggiornati. Intanto usa «Fondo uniforme».';
let loading=null,pipe=null,device='';
const hasGpu=()=>!!(root.navigator&&root.navigator.gpu);
function plan(){return {device:'webgpu',dtype:SIZES.webgpu.dtype,mb:SIZES.webgpu.mb,supported:hasGpu()}}
// Progress across the files of the model: {loaded,total,ratio}. The runtime sends {status:'progress',file,loaded,total}.
function progressTracker(onProgress){const files=new Map();return e=>{if(!e||typeof onProgress!=='function')return;
 if(e.status==='progress'||e.status==='done'){const f=files.get(e.file)||{loaded:0,total:0};if(e.total)f.total=e.total;f.loaded=e.status==='done'?(f.total||f.loaded):(e.loaded||0);files.set(e.file,f)}
 if(e.status==='ready'){onProgress({loaded:1,total:1,ratio:1,ready:true});return}
 let loaded=0,total=0;files.forEach(f=>{loaded+=f.loaded;total+=f.total});onProgress({loaded,total,ratio:total?Math.min(1,loaded/total):0})}}
async function importRuntime(){if(root.__radixTransformers)return root.__radixTransformers; // tests and local checks inject it
 return import(/* webpackIgnore: true */RUNTIME_URL)}
function load(opts={}){if(pipe)return Promise.resolve(pipe);if(loading)return loading;
 if(!hasGpu())return Promise.reject(Object.assign(Error(NO_GPU),{noGpu:true}));
 const track=progressTracker(opts.onProgress);
 loading=(async()=>{const T=await importRuntime();T.env.allowLocalModels=false;
  pipe=await T.pipeline('image-segmentation',MODEL,{revision:REVISION,device:'webgpu',dtype:SIZES.webgpu.dtype,progress_callback:track});device='webgpu';
  track({status:'ready'});return pipe})();
 loading.catch(()=>{loading=null});
 return loading}
// canvas: the photo (HTMLCanvasElement). Returns the mask at the canvas size.
async function segment(canvas,opts={}){const P=await load(opts),T=await importRuntime(),img=T.RawImage.fromCanvas(canvas);
 const out=await P(img),m=out&&out[0]&&out[0].mask;if(!m)throw Error('Il modello non ha restituito la maschera.');
 const mask=(m.width!==canvas.width||m.height!==canvas.height)?await m.resize(canvas.width,canvas.height):m;
 const ch=mask.channels||1,data=new Uint8Array(mask.width*mask.height);for(let i=0;i<data.length;i++)data[i]=mask.data[i*ch];
 return {width:mask.width,height:mask.height,data}}
const status=()=>({ready:!!pipe,device});
return Object.freeze({RUNTIME_VERSION,RUNTIME_URL,MODEL,REVISION,LICENSES,SIZES,NO_GPU,hasGpu,plan,progressTracker,load,segment,status});
});
