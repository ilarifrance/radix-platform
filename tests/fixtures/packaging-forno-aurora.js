// Fake data only (DATI DI ESEMPIO): the made-up bakery «Forno Aurora» as the person would fill the studio «Etichette e
// packaging». Ingredients, nutrition values, addresses and barcodes are invented for the tests and the sample: the EAN
// codes use the 200-299 prefix (GS1 numbers for internal use only, never on goods in shops) with a correct check digit.
const {PROFILE,LOGO}=require('./mockup-forno-aurora.js');
const COMMON={legalName:'Biscotti friabili con farina di mais',storage:'Conservare in luogo fresco e asciutto, lontano da fonti di calore.',
 producer:'Forno Aurora S.r.l. (esempio), Via Nizza 12, 10125 Torino',plant:'',origin:'',usage:'',precautions:'',materials:'',extra:'Prodotto artigianale.',responsible:''};
const VARIANTS=[
 {id:'v1',name:'Classici',color:'primary',ingredients:'Farina di mais 35%, farina di frumento, burro, zucchero, uova, miele, sale, aroma naturale di vaniglia.',traces:'Può contenere tracce di frutta a guscio.',net:'250 g',ean:'2001234567893',
  nutr:{kj:'2010',kcal:'480',fat:'22',sat:'13',carb:'63',sugar:'24',protein:'6,5',salt:'0,30'}},
 {id:'v2',name:'Al cacao',color:'secondary',ingredients:'Farina di frumento, burro, zucchero, farina di mais 25%, uova, cacao magro in polvere 6%, sale.',traces:'Può contenere tracce di frutta a guscio.',net:'250 g',ean:'2009876543213',
  nutr:{kj:'2030',kcal:'485',fat:'23',sat:'14',carb:'60',sugar:'25',protein:'7,2',salt:'0,28'}}];
const BAG={type:'alimentare',format:'cavaliere',size:[150,70],style:'classica',name:'Biscotti di meliga',common:COMMON,variants:VARIANTS,dateKind:'tmc',stampBox:true,sample:true};
const BOX={type:'alimentare',format:'cuscino',size:[100,180],style:'artigianale',name:'Biscotti di meliga',payoff:'Dal forno di via Nizza',common:COMMON,
 variants:VARIANTS.map(v=>({...v,net:'150 g',ean:v.id==='v1'?'2001112223330':'2004445556663'})),dateKind:'tmc',stampBox:true,sample:true};
const COSMETIC={type:'cosmetico',format:'tondo',size:[60],style:'minimal',name:'Crema mani',dateKind:'pao',pao:'12',
 common:{legalName:'Crema mani nutriente',producer:'Esempio Cosmetici S.r.l., Via Prova 1, 10100 Torino',precautions:'Solo per uso esterno. Evitare il contatto con gli occhi.',usage:'',origin:'',plant:'',materials:'',extra:'',responsible:''},
 variants:[{id:'v1',name:'Mandorla',color:'accent',ingredients:'AQUA, GLYCERIN, PRUNUS AMYGDALUS DULCIS OIL, CETEARYL ALCOHOL, PARFUM.',net:'50 ml',ean:''}],sample:true};
module.exports={PROFILE,LOGO,COMMON,VARIANTS,BAG,BOX,COSMETIC};
