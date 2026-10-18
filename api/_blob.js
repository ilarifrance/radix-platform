'use strict';
// Public copies of PED images on Vercel Blob, so services that fetch media by url (Buffer) can reach them
// also when the deployment itself is behind Preview protection. Used only when BLOB_READ_WRITE_TOKEN is set
// (created by linking a public Blob store to the project); otherwise the signed RADIX url is used as before.
const BLOB_API='https://blob.vercel-storage.com/';
const EXT={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};

async function putPublic(token,{name,mime,data}){
 const ext=EXT[mime];if(!ext)throw new Error('Formato immagine non supportato');
 if(!/^[a-z0-9-]{1,80}$/.test(name))throw new Error('Nome file non valido');
 const res=await fetch(BLOB_API+'radix-media/'+name+'.'+ext,{method:'PUT',body:data,
  headers:{authorization:'Bearer '+token,'x-api-version':'7','x-content-type':mime,'x-add-random-suffix':'1','x-cache-control-max-age':'2592000'}});
 let body={};try{body=await res.json()}catch(e){}
 if(!res.ok||typeof body.url!=='string'||!body.url.startsWith('https://'))throw new Error('Vercel Blob non ha accettato l’immagine ('+res.status+')');
 return body.url;
}
module.exports={putPublic};
