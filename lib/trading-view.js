/* RADIX Trading — pure functions for trading.html: from the snapshot the member's Mac sends (trading/radix_trading/
   snapshot.py) to rows, figures and sentences in plain Italian. No numbers are invented: what the snapshot lacks
   stays null and the page shows a dash. Shared by the page and tests/trading-view.test.js. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixTradingView=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const GATE_DSR=0.95,GATE_MAX_DD=-0.25,START_EUR=1000;
const STRATEGIES=Object.freeze({
 crypto_trend_daily:{name:'Trend crypto giornaliero',how:'Compra quando la media di 10-20 giorni è sopra quella di 50-100 e decide una volta al giorno.'},
 crypto_trend_guarded:{name:'Trend crypto protetto',how:'Come il trend giornaliero, ma esce quando una crypto scende oltre il 10-20% dal massimo recente.'},
 breakout_regime:{name:'Rottura dei massimi',how:'Entra quando il prezzo supera il massimo degli ultimi 2-7 giorni in un mercato che sale.'},
 mean_reversion:{name:'Ritorno alla media',how:'Compra i cali bruschi di poche ore dentro un trend che sale.'},
 trend_momentum:{name:'Momentum mensile',how:'Ogni mese tiene ciò che è salito negli ultimi 6-12 mesi ed è sopra la sua media.'},
 intraday_momentum:{name:'Day trading selettivo',how:'Guarda il minuto: compra quando in un’ora il prezzo sale molto più del normale, vende al +1% o a fine giornata. Al massimo 2 operazioni al giorno.'}
});
const MARKETS=Object.freeze({crypto:'Crypto',etf:'ETF',italia:'Borsa italiana',materie_prime:'Materie prime',cambi:'Cambi',multi:'Più mercati'});
const VENUE_MARKET=Object.freeze({kraken:'crypto',binance:'crypto',yahoo:'etf',italia:'italia',materie:'materie_prime',cambi:'cambi'});
const fin=v=>typeof v==='number'&&Number.isFinite(v);

function strategyName(id){return STRATEGIES[id]?.name||String(id||'')}
function marketName(id){return MARKETS[id]||String(id||'')}

// One row per test (strategy × market), best first: passed, then by reliability.
function tests(snap){
 const res=snap?.backtest?.risultati||{};
 const out=Object.entries(res).map(([key,r])=>{
  const m=r?.metriche_fuori_campione||{},g=r?.cancello_1||{},bh=r?.compra_e_tieni||{};
  const strategy=r?.strategia||key.split('@')[0],market=r?.mercato||(key.includes('@')?key.split('@')[1]:'crypto');
  const COIN={XBTEUR:'Bitcoin',ETHEUR:'Ethereum'},LEVEL={kraken:'costi Kraken',economico:'costi bassi'};
  const detail=r?.costi_livello?[COIN[r.simboli?.[0]]||r.simboli?.[0],LEVEL[r.costi_livello]||r.costi_livello].filter(Boolean).join(', '):'';
  return {key,strategy,name:strategyName(strategy)+(detail?' ('+detail+')':''),market,marketName:marketName(market),
   error:r?.errore||null,
   totalReturn:fin(m.total_return)?m.total_return:null,cagr:fin(m.cagr)?m.cagr:null,
   maxDrawdown:fin(m.max_drawdown)?m.max_drawdown:null,sharpe:fin(m.sharpe)?m.sharpe:null,
   orders:fin(m.orders)?m.orders:null,exposure:fin(m.exposure)?m.exposure:null,
   dsr:fin(g.deflated_sharpe)?g.deflated_sharpe:null,passed:g.passed===true,
   windows:fin(r?.finestre)?r.finestre:null,
   holdReturn:fin(bh.rendimento)?bh.rendimento:null,holdDrawdown:fin(bh.max_drawdown)?bh.max_drawdown:null,
   symbols:Array.isArray(r?.simboli)?r.simboli.length:null};
 });
 return out.sort((a,b)=>(b.passed-a.passed)||((b.dsr??-1)-(a.dsr??-1))||a.key.localeCompare(b.key));
}

// Why a test did not pass, in one short phrase.
function verdict(t){
 if(t.error)return {ok:false,text:/nessun dato/.test(t.error)?'Dati non ancora raccolti: arrivano con il giro serale':/storico insufficiente/.test(t.error)?'Storico ancora troppo corto per provarla':'Prova non riuscita: '+t.error};
 if(t.passed)return {ok:true,text:'Superata: il conto simulato può usarla'};
 const why=[];
 if(t.dsr==null||t.dsr<GATE_DSR)why.push('risultato non abbastanza affidabile');
 if(t.maxDrawdown!=null&&t.maxDrawdown<GATE_MAX_DD)why.push('discesa peggiore oltre il 25%');
 return {ok:false,text:why.length?why.join(' e '):'non superata'};
}

function curve(snap,key){
 const c=snap?.backtest?.curve?.[key];
 if(!c||!Array.isArray(c.date))return [];
 return c.date.map((d,i)=>({date:d,strategy:fin(c.strategia?.[i])?c.strategia[i]:null,hold:fin(c.compra_e_tieni?.[i])?c.compra_e_tieni[i]:null}))
  .filter(p=>p.strategy!=null||p.hold!=null);
}

function account(snap){
 const p=snap?.paper||{};
 const invested=fin(p.patrimonio)?p.patrimonio:(fin(p.cassa)?p.cassa:null);
 // Guadagni messi da parte ogni giorno (riserva): fanno parte del patrimonio totale.
 const reserve=fin(p.riserva)?p.riserva:0,equity=invested==null?null:invested+reserve;
 const fills=Array.isArray(p.operazioni)?p.operazioni:[];
 return {equity,start:START_EUR,change:equity==null?null:equity/START_EUR-1,cash:fin(p.cassa)?p.cassa:null,reserve,peak:fin(p.picco)?p.picco:null,
  positions:Array.isArray(p.posizioni)?p.posizioni:[],fills,decisions:Array.isArray(p.ultime_decisioni)?p.ultime_decisioni:[],
  counts:p.decisioni&&typeof p.decisioni==='object'?p.decisioni:{},
  history:(Array.isArray(p.andamento)?p.andamento:[]).filter(x=>fin(x?.patrimonio)&&typeof x.ts==='string')};
}

// Event study (events.py): news themes, calendar and market shocks vs. the markets in the next days.
const EVENT_NAMES=Object.freeze({dazi:'Dazi e guerre commerciali',trump:'Notizie su Trump',guerra:'Attacchi e guerre',tregua:'Tregue e accordi di pace',
 sanzioni:'Sanzioni',petrolio:'Petrolio e OPEC',fed_tassi:'Banche centrali e tassi',inflazione:'Inflazione',crisi_banche:'Crisi di banche e fallimenti',
 big_tech:'Grandi aziende tech',cina:'Cina e Taiwan',medio_oriente:'Medio Oriente',russia_ucraina:'Russia e Ucraina',elezioni:'Elezioni',
 epidemie:'Epidemie',borse:'Notizie sulle borse',spx_crollo:'Crollo dell’S&P 500',oro_balzo:'Balzo dell’oro',petrolio_shock:'Shock del petrolio',
 vix_esplode:'La paura (VIX) esplode',tassi_salto:'Salto dei tassi a 10 anni',dollaro_shock:'Shock del dollaro',fed_alza:'La Fed alza i tassi',
 fed_taglia:'La Fed taglia i tassi',cpi:'Dato sull’inflazione USA',lavoro_usa:'Dati sul lavoro USA',fomc:'Comunicato della Fed'});
function eventName(key){const [kind,id]=String(key||'').split(':');const n=EVENT_NAMES[id]||id||'';
 return kind==='notizie'?n+' (tante notizie)':n}
function eventsView(snap){
 const e=snap?.eventi;if(!e||typeof e!=='object')return null;
 const links=(Array.isArray(e.legami)?e.legami:[]).filter(x=>fin(x?.medio)).map(x=>({event:eventName(x.evento),market:String(x.mercato||''),days:x.giorni,
  move:x.medio,hit:fin(x.vince)?x.vince:null,n:x.n,checkN:x.verifica_n||0,checkMove:fin(x.verifica_medio)?x.verifica_medio:null,
  holds:x.regge_verifica===true,coversCosts:x.copre_costi===true}));
 const holding=links.filter(l=>l.holds);
 const lead=e.errore?String(e.errore):!links.length?`Nessun legame tra eventi e mercati regge alla correzione statistica (${e.prove??0} prove).`
  :holding.length?`${holding.length} ${holding.length===1?'legame regge':'legami reggono'} anche nell’ultimo anno, mai usato per cercarli.`
  :`${links.length} ${links.length===1?'legame sembra reale':'legami sembrano reali'} negli anni di ricerca, ma nessuno regge ancora nell’ultimo anno.`;
 const m=e.minuto&&typeof e.minuto==='object'?e.minuto:null;
 const minuteRow=x=>({event:EVENT_NAMES[x.evento]||String(x.evento||''),market:String(x.mercato||''),delay:x.ritardo_min,exit:String(x.uscita||''),
  follow:x.modo==='segui',net:x.netto_medio,hit:fin(x.vince)?x.vince:null,n:x.n,checkN:x.verifica_n||0,checkNet:fin(x.verifica_netto)?x.verifica_netto:null,holds:x.regge_verifica===true});
 const minute=m?{tests:m.prove??0,links:(Array.isArray(m.legami)?m.legami:[]).filter(x=>fin(x?.netto_medio)).map(minuteRow),
  hints:(Array.isArray(m.migliori_non_corretti)?m.migliori_non_corretti:[]).filter(x=>fin(x?.netto_medio)).map(minuteRow)}:null;
 if(minute)minute.lead=!minute.links.length?`Al minuto: nessuna regola regge alla correzione (${minute.tests} prove, costi inclusi).`
  :`Al minuto: ${minute.links.length} ${minute.links.length===1?'regola sembra':'regole sembrano'} reali, ${minute.links.filter(l=>l.holds).length} reggono anche nell’ultimo anno.`;
 return {tests:e.prove??0,lead,links,minute,period:Array.isArray(e.periodo_scoperta)?e.periodo_scoperta:null,newsDays:e.giorni_di_notizie??0};
}

// Multi-strategy simulated portfolio (portfolio.py): lanes, director's shares, profit reserve.
function portfolio(snap){
 const p=snap?.portafoglio;if(!p||typeof p!=='object')return null;
 const start=fin(p.capitale_iniziale)?p.capitale_iniziale:START_EUR;
 const invested=fin(p.patrimonio)?p.patrimonio:start,reserve=fin(p.riserva)?p.riserva:0,total=invested+reserve;
 const lanes=(Array.isArray(p.corsie)?p.corsie:[]).filter(l=>fin(l?.peso)).map(l=>({id:String(l.id||''),title:String(l.titolo||l.id||''),weight:l.peso}))
  .sort((a,b)=>b.weight-a.weight);
 const history=(Array.isArray(p.andamento)?p.andamento:[]).filter(x=>fin(x?.patrimonio)&&typeof x.ts==='string')
  .map(x=>({ts:x.ts,total:x.patrimonio+(fin(x.riserva)?x.riserva:0),reserve:fin(x.riserva)?x.riserva:0}));
 return {start,invested,reserve,total,change:total/start-1,lanes,history,
  positions:(Array.isArray(p.posizioni)?p.posizioni:[]).filter(x=>fin(x?.quantita)&&x.quantita!==0).map(x=>({symbol:String(x.simbolo||''),units:x.quantita,short:x.quantita<0})),
  fills:Array.isArray(p.operazioni)?p.operazioni:[]};
}

// Data collected, grouped by market, with how old the newest bar is.
function sources(snap,now=Date.now()){
 const groups={};
 for(const d of Array.isArray(snap?.dati)?snap.dati:[]){
  const m=VENUE_MARKET[d?.mercato]||d?.mercato||'altro';
  const g=groups[m]||(groups[m]={market:m,name:marketName(m),symbols:new Set(),bars:0,last:null,history:false});
  g.symbols.add(String(d.simbolo));g.bars+=fin(d.barre)?d.barre:0;
  if(d.mercato==='binance')g.history=true;
  else if(typeof d.ultima==='string'&&(!g.last||d.ultima>g.last))g.last=d.ultima;
 }
 return Object.values(groups).map(g=>{
  const age=g.last?(now-Date.parse(g.last))/3600000:null;
  const limit=g.market==='crypto'?3:96; // hourly bars vs daily bars (weekends included)
  return {market:g.market,name:g.name,symbols:g.symbols.size,bars:g.bars,last:g.last,ageHours:age,fresh:age!=null&&age<=limit};
 }).sort((a,b)=>Object.keys(MARKETS).indexOf(a.market)-Object.keys(MARKETS).indexOf(b.market));
}

function summary(snap){
 const all=tests(snap),ok=all.filter(t=>!t.error);
 const passed=ok.filter(t=>t.passed);
 const best=ok.filter(t=>t.totalReturn!=null).sort((a,b)=>(b.dsr??-1)-(a.dsr??-1))[0]||null;
 const acc=account(snap);
 let lead;
 if(!all.length)lead='Il Mac non ha ancora mandato i risultati delle prove: arrivano dopo il primo giro serale (23:30).';
 else if(!passed.length)lead=`Nessuna delle ${ok.length} prove ha ancora superato il controllo, quindi il conto simulato non opera. È voluto: si compra solo con una strategia che ha funzionato su dati che non aveva mai visto.`;
 else lead=`${passed.length} ${passed.length===1?'prova ha':'prove hanno'} superato il controllo: il conto simulato le usa con soldi finti e prezzi veri.`;
 return {tests:all.length,passed:passed.length,best,lead,account:acc,fills:acc.fills.length,openPositions:acc.positions.length};
}

function macro(snap){
 return (Array.isArray(snap?.macro)?snap.macro:[]).filter(m=>fin(m?.valore)).map(m=>({id:String(m.serie),name:String(m.titolo||m.serie),value:m.valore,date:String(m.data||''),
  change:fin(m.un_mese_fa)?m.valore-m.un_mese_fa:null}));
}

function news(snap){
 const n=snap?.notizie||{};
 return {total:fin(n.totale)?n.totale:0,items:(Array.isArray(n.ultime)?n.ultime:[]).filter(x=>typeof x?.titolo==='string'&&x.titolo)};
}

const nf=(d,opt)=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:d,minimumFractionDigits:d,...opt});
function pct(v,d=1){if(!fin(v))return '—';return (v>0?'+':'')+nf(d,{style:'percent'}).format(v)}
function eur(v,d=0){if(!fin(v))return '—';return nf(d,{style:'currency',currency:'EUR'}).format(v)}
function num(v,d=2){if(!fin(v))return '—';return nf(d).format(v)}
function ago(iso,now=Date.now()){
 const t=Date.parse(iso||'');if(!Number.isFinite(t))return '—';
 const h=(now-t)/3600000;
 if(h<1)return 'meno di un’ora fa';if(h<24)return Math.round(h)+(Math.round(h)===1?' ora fa':' ore fa');
 const d=Math.round(h/24);return d+(d===1?' giorno fa':' giorni fa');
}
// «100 € sarebbero diventati 153 €».
function hundred(r){return fin(r)?eur(100*(1+r)):'—'}

// Broad search (research.py): ranking on the search years, finalists opened once on the locked year.
function research(snap){
 const r=snap?.ricerca;if(!r||typeof r!=='object')return null;
 const row=x=>({family:String(x?.famiglia||''),name:String(x?.nome||x?.famiglia||''),market:String(x?.mercato||''),marketName:marketName(x?.mercato),capital:fin(x?.capitale)?x.capitale:null,
  timeframe:x?.timeframe==='1h'?'orario':'giornaliero',yearly:fin(x?.ricerca?.annuo)?x.ricerca.annuo:null,afterTax:fin(x?.ricerca?.annuo_dopo_tasse)?x.ricerca.annuo_dopo_tasse:null,
  maxDrawdown:fin(x?.ricerca?.max_drawdown)?x.ricerca.max_drawdown:null,dsr:fin(x?.dsr)?x.dsr:null,
  lockYearly:fin(x?.anno_chiuso?.annuo)?x.anno_chiuso.annuo:null,lockDrawdown:fin(x?.anno_chiuso?.max_drawdown)?x.anno_chiuso.max_drawdown:null,
  lockPassed:x?.supera_anno_chiuso===true,final:!!x?.anno_chiuso});
 const finals=(Array.isArray(r.finaliste)?r.finaliste:[]).map(row);
 const ranking=(Array.isArray(r.classifica)?r.classifica:[]).map(row);
 const goal=r.obiettivo||{},winners=finals.filter(f=>f.lockPassed);
 const lead=!finals.length?`Nessuna delle ${r.prove??0} prove rispetta l’obiettivo (almeno ${pct(goal.annuo,0)} l’anno con perdita massima entro ${pct(goal.max_drawdown,0)}) sugli anni di ricerca.`
  :winners.length?`${winners.length} ${winners.length===1?'strategia supera':'strategie superano'} anche l’anno chiuso a chiave: ${winners.map(w=>w.name+' su '+w.marketName).join(', ')}.`
  :`${finals.length} ${finals.length===1?'strategia rispetta':'strategie rispettano'} l’obiettivo negli anni di ricerca, ma nessuna regge sull’anno chiuso a chiave: erano probabilmente fortuna.`;
 return {combos:fin(r.combinazioni_totali)?r.combinazioni_totali:null,tests:fin(r.prove)?r.prove:null,meets:fin(r.rispettano_obiettivo)?r.rispettano_obiettivo:0,
  goal:{yearly:goal.annuo,maxDrawdown:goal.max_drawdown},finals,ranking,winners:winners.length,lead,generated:r.generato||null};
}

return {eventsView,eventName,portfolio,research,GATE_DSR,GATE_MAX_DD,START_EUR,STRATEGIES,MARKETS,strategyName,marketName,tests,verdict,curve,account,sources,summary,macro,news,pct,eur,num,ago,hundred};
});
