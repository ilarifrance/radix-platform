'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const V=require('../lib/trading-view.js');

const SNAP={versione:1,generato:'2026-10-29T10:00:00Z',modalita:'paper',
 backtest:{risultati:{
  crypto_trend_daily:{strategia:'crypto_trend_daily',mercato:'crypto',metriche_fuori_campione:{total_return:0.532,max_drawdown:-0.482,sharpe:0.53,orders:102},cancello_1:{deflated_sharpe:0.484,passed:false},finestre:44,compra_e_tieni:{rendimento:0.9,max_drawdown:-0.7}},
  'trend_momentum@etf':{strategia:'trend_momentum',mercato:'etf',metriche_fuori_campione:{total_return:-0.315,max_drawdown:-0.389,sharpe:-0.32,orders:299},cancello_1:{deflated_sharpe:0.0072,passed:false}},
  'trend_momentum@cambi':{strategia:'trend_momentum',mercato:'cambi',errore:'nessun dato nell\'archivio'},
  crypto_trend_guarded:{strategia:'crypto_trend_guarded',mercato:'crypto',metriche_fuori_campione:{total_return:0.31,max_drawdown:-0.19,sharpe:1.1,orders:80},cancello_1:{deflated_sharpe:0.97,passed:true}}
 },curve:{crypto_trend_daily:{date:['2023-01-31','2023-02-28'],strategia:[1,1.1],compra_e_tieni:[1,null]}}},
 paper:{cassa:900,picco:1010,patrimonio:1004.5,posizioni:[{chiave:'kraken:XBTEUR',prezzo_entrata:60000,stop:57000}],operazioni:[{ts:'2026-10-29T09:00:00Z'}],ultime_decisioni:[],andamento:[{ts:'2026-10-29T08:00:00Z',patrimonio:1000},{ts:'2026-10-29T09:00:00Z',patrimonio:1004.5}]},
 dati:[{mercato:'binance',simbolo:'XBTEUR',barre:35073,ultima:'2026-10-29T09:00:00Z'},{mercato:'kraken',simbolo:'XBTEUR',barre:730,ultima:'2026-10-29T09:00:00Z'},{mercato:'yahoo',simbolo:'SPY',barre:5490,ultima:'2026-10-20T00:00:00Z'}],
 macro:[{serie:'VIXCLS',titolo:'VIX',valore:18.2,data:'2026-10-27',un_mese_fa:16.2},{serie:'X',valore:'bad'}],
 notizie:{totale:2,ultime:[{ts:'2026-10-29T08:00:00Z',titolo:'<b>Rates</b>',fonte:'reuters.com'},{titolo:''}]}};

test('tests: passed first, then by reliability; errors kept',()=>{
 const t=V.tests(SNAP);
 assert.deepEqual(t.map(x=>x.key),['crypto_trend_guarded','crypto_trend_daily','trend_momentum@etf','trend_momentum@cambi']);
 assert.equal(t[0].name,'Trend crypto protetto');
 assert.equal(t[2].marketName,'ETF');
 assert.equal(t[3].error,'nessun dato nell\'archivio');
 assert.equal(t[3].totalReturn,null);
});

test('verdict says why a test did not pass',()=>{
 const t=Object.fromEntries(V.tests(SNAP).map(x=>[x.key,x]));
 assert.equal(V.verdict(t.crypto_trend_guarded).ok,true);
 assert.match(V.verdict(t.crypto_trend_daily).text,/non abbastanza affidabile e discesa peggiore oltre il 25%/);
 assert.match(V.verdict(t['trend_momentum@cambi']).text,/Dati non ancora raccolti/);
});

test('curve keeps missing points as null',()=>{
 const c=V.curve(SNAP,'crypto_trend_daily');
 assert.equal(c.length,2);assert.equal(c[1].hold,null);assert.equal(c[1].strategy,1.1);
 assert.deepEqual(V.curve(SNAP,'missing'),[]);
});

test('summary, account, sources, macro and news',()=>{
 const s=V.summary(SNAP);
 assert.equal(s.passed,1);assert.equal(s.tests,4);assert.equal(s.best.key,'crypto_trend_guarded');
 assert.match(s.lead,/1 prova ha superato/);
 assert.equal(s.account.equity,1004.5);assert.ok(Math.abs(s.account.change-0.0045)<1e-9);
 assert.equal(s.openPositions,1);assert.equal(s.fills,1);
 const src=V.sources(SNAP,Date.parse('2026-10-29T10:00:00Z'));
 assert.deepEqual(src.map(x=>[x.market,x.symbols,x.bars,x.fresh]),[['crypto',1,35803,true],['etf',1,5490,false]]);
 assert.deepEqual(V.macro(SNAP).map(m=>[m.id,Math.round(m.change*10)/10]),[['VIXCLS',2]]);
 const n=V.news(SNAP);assert.equal(n.total,2);assert.equal(n.items.length,1);assert.equal(n.items[0].titolo,'<b>Rates</b>');
});

test('empty snapshot never throws and invents nothing',()=>{
 const s=V.summary(null);
 assert.equal(s.tests,0);assert.equal(s.account.equity,null);assert.match(s.lead,/non ha ancora mandato/);
 assert.deepEqual(V.sources({}),[]);assert.deepEqual(V.macro(undefined),[]);
});

test('formats in Italian',()=>{
 assert.equal(V.hundred(0.532),'153 €');
 assert.equal(V.pct(-0.482,0),'-48%');
 assert.equal(V.pct(null),'—');
 assert.equal(V.ago('2026-10-29T07:00:00Z',Date.parse('2026-10-29T10:00:00Z')),'3 ore fa');
});

test('day trading rows say coin and cost level',()=>{
 const t=V.tests({backtest:{risultati:{'intraday_momentum@XBTEUR:economico':{strategia:'intraday_momentum',mercato:'crypto',simboli:['XBTEUR'],costi_livello:'economico',metriche_fuori_campione:{total_return:0.059},cancello_1:{deflated_sharpe:0.3,passed:false}}}}});
 assert.equal(t[0].name,'Day trading selettivo (Bitcoin, costi bassi)');
 assert.equal(t[0].marketName,'Crypto');
});

test('research: finalists opened on the locked year',()=>{
 assert.equal(V.research({}),null);
 const base={obiettivo:{annuo:0.1,max_drawdown:-0.15},combinazioni_totali:900,prove:40,rispettano_obiettivo:1};
 let r=V.research({ricerca:{...base,finaliste:[{famiglia:'rsi_dip',nome:'Acquisto sui cali',mercato:'etf',timeframe:'1d',ricerca:{annuo:0.12,max_drawdown:-0.1},dsr:0.7,anno_chiuso:{annuo:0.02,max_drawdown:-0.08},supera_anno_chiuso:false}],classifica:[]}});
 assert.match(r.lead,/nessuna regge/);assert.equal(r.finals[0].lockYearly,0.02);
 r=V.research({ricerca:{...base,finaliste:[],classifica:[{famiglia:'ma_cross',mercato:'cambi',ricerca:{annuo:0.01}}]}});
 assert.match(r.lead,/Nessuna delle 40 prove/);assert.equal(r.ranking[0].marketName,'Cambi');
});

test('portfolio: total includes the reserve, lanes sorted by weight',()=>{
 assert.equal(V.portfolio({}),null);
 const p=V.portfolio({portafoglio:{capitale_iniziale:1000,patrimonio:1000,riserva:42.5,
  corsie:[{id:'gold_macro',titolo:'Oro con segnali macro',peso:0.27},{id:'risk_switch',titolo:'VIX',peso:0.34},{id:'x',peso:'nan'}],
  posizioni:[{simbolo:'ETHEUR',quantita:-0.1},{simbolo:'GLD',quantita:0}],
  andamento:[{ts:'2026-10-29T10:00:00Z',patrimonio:1000,riserva:0},{ts:'2026-10-30T10:00:00Z',patrimonio:1000,riserva:42.5},{ts:5}]}});
 assert.equal(p.total,1042.5);assert.ok(Math.abs(p.change-0.0425)<1e-9);
 assert.deepEqual(p.lanes.map(l=>l.id),['risk_switch','gold_macro']);
 assert.equal(p.history.length,2);assert.equal(p.history[1].total,1042.5);
 assert.deepEqual(p.positions,[{symbol:'ETHEUR',units:-0.1,short:true}]);
});
