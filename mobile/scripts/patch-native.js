#!/usr/bin/env node
/* After "npx cap add android/ios": adds what the background GPS needs, so nobody edits the native files by hand.
   Android: location (also in background), foreground service of type location, notifications (Android 13+).
   iPhone: the texts shown when asking for the position "always" and the "location" background mode.
   Safe to run again: it adds only what is missing. */
'use strict';
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');

const manifest=path.join(root,'android/app/src/main/AndroidManifest.xml');
if(fs.existsSync(manifest)){
 let x=fs.readFileSync(manifest,'utf8');
 const perms=['ACCESS_COARSE_LOCATION','ACCESS_FINE_LOCATION','ACCESS_BACKGROUND_LOCATION','FOREGROUND_SERVICE','FOREGROUND_SERVICE_LOCATION','POST_NOTIFICATIONS','WAKE_LOCK','REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'];
 const add=perms.filter(p=>!x.includes('android.permission.'+p)).map(p=>'    <uses-permission android:name="android.permission.'+p+'" />').join('\n');
 if(add)x=x.replace(/<\/manifest>\s*$/,add+'\n    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n</manifest>\n');
 fs.writeFileSync(manifest,x);console.log('Android: permessi posizione aggiunti.');
}else console.log('Android non ancora creato: esegui "npx cap add android".');

const plist=path.join(root,'ios/App/App/Info.plist');
if(fs.existsSync(plist)){
 let x=fs.readFileSync(plist,'utf8');
 const why='Plancia registra la posizione del mezzo per il centro operativo dell\'azienda, anche quando l\'app è chiusa, come previsto dagli accordi con l\'azienda.';
 const keys={NSLocationWhenInUseUsageDescription:why,NSLocationAlwaysAndWhenInUseUsageDescription:why,NSLocationAlwaysUsageDescription:why,NSCameraUsageDescription:'Plancia usa la fotocamera per fotografare DDT, CMR e scontrini.'};
 let add='';for(const [k,v] of Object.entries(keys))if(!x.includes('<key>'+k+'</key>'))add+='\t<key>'+k+'</key>\n\t<string>'+v.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</string>\n';
 if(!x.includes('<key>UIBackgroundModes</key>'))add+='\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>location</string>\n\t</array>\n';
 if(add)x=x.replace(/<\/dict>\s*<\/plist>\s*$/,add+'</dict>\n</plist>\n');
 fs.writeFileSync(plist,x);console.log('iPhone: testi permessi e posizione in background aggiunti.');
}else console.log('iPhone non ancora creato: esegui "npx cap add ios" (serve un Mac).');
