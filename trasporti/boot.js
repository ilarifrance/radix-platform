/* Plancia — starts the program after the data of this device are ready (trasporti/sync.js). */
(function(){var el=document.currentScript,src=el.getAttribute('data-app');var go=function(){var s=document.createElement('script');s.src=src;document.body.appendChild(s);};var L=window.RadixTrLive;if(L&&L.ready)L.ready.then(go,go);else go();})();
