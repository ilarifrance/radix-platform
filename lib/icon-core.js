/* Studio «Set di icone» (agency job B6, the free part): the pure core, with NO AI, no network and no cost.
   - The catalogue: about 300 business icons of Lucide (ISC licence), vendored in lib/icon-set.js with lib/icon-set.LICENSE.txt
     by tools/icon-set/build.js. The names it vendors are the keys of TABLE below, so the catalogue and the Italian words
     always go together.
   - TABLE: the Italian synonyms of every icon («casa|abitazione|immobile…»). findIcons(concept) scores every icon on the
     words of the concept (lower case, no accents, a light stem that drops the final vowels: «pizze» = «pizza»), mapConcept()
     says «trovata» or «non trovata» with the alternatives, and the person can swap any icon from the whole catalogue.
   - suggestConcepts(): concepts read from the project's own words (its kind, summary, notes, brief) plus the basics every
     business needs (telefono, email, dove siamo, orari). Nothing is invented: a word becomes a concept only when it is
     in the table.
   - STYLES: the 3 proposals (contorno sottile, contorno spesso arrotondato, duotono in contenitore) and the refinement
     settings (stroke, corners, grid 24/32/48, padding, background shape, colours). iconSvg() draws one icon as a clean SVG
     with its viewBox, in fixed colours or currentColor.
   - checks(): the same stroke and grid in every file (read back from the SVGs), the colour contrast (3:1, WCAG for
     graphics), the stroke still at least 1 px at 16 px, dense icons, missing and repeated icons.
   - files(): the export (SVG per icon, currentColor versions, PNG 64/128/512, the SVG sprite with an HTML example, the
     preview sheet in SVG and PNG, LEGGIMI.txt and the Lucide licence) and bundle() the zip (lib/zip-lite.js).
   - The saved choices: the «agents» document of the project, key «icons» (agents-page.js keeps it).
   The mascot is not here: it needs paid image generation, «da collegare». Runs in Node for the tests and in the browser
   as window.RadixIconCore. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixIconCore=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const SET=()=>lib('RadixIconSet','./icon-set.js'),ZIP=()=>lib('RadixZip','./zip-lite.js');
const MAX_CONCEPTS=24,MAX_LABEL=40,MAX_SAVED=6,PNG_SIZES=Object.freeze([64,128,512]),GRIDS=Object.freeze([24,32,48]);

// ---- the Italian synonyms: «icon-name:parola|altra parola|…» (one icon per line, the catalogue order) ----
const TABLE=`house:casa|home|abitazione|immobile|immobili|immobiliare|appartamento|villa|residenza
building:palazzo|edificio|condominio|uffici
building-2:azienda|sede|ufficio|impresa|societa|grattacielo
store:negozio|bottega|punto vendita|vetrina|retail|showroom
factory:fabbrica|stabilimento|produzione|industria|manifattura|laboratorio
warehouse:magazzino|deposito|stoccaggio|logistica
hotel:hotel|albergo|ospitalita|b&b|bed and breakfast|camere|pernottamento
school:scuola|istituto|asilo
church:chiesa|parrocchia|matrimonio religioso
hospital:ospedale|clinica|pronto soccorso
landmark:banca|istituzione|comune|tribunale|museo|monumento
castle:castello|dimora storica|borgo
tent:campeggio|tenda|glamping|camping
user:utente|persona|cliente|profilo|account|area riservata
users:clienti|persone|team|squadra|staff|community|gruppo|famiglia|chi siamo
user-check:cliente verificato|iscrizione|registrato|accesso consentito
user-plus:nuovo cliente|registrati|iscriviti|aggiungi persona
contact:rubrica|contatti|biglietto da visita|anagrafica
baby:bambino|bambini|neonato|infanzia|pediatria|culla
accessibility:accessibilita|disabili|sedia a rotelle|accessibile
person-standing:persona in piedi|postura|benessere personale|yoga|pilates|meditazione
hand-heart:cura|assistenza|volontariato|beneficenza|solidarieta
handshake:accordo|partnership|stretta di mano|collaborazione|affari|partner|fiducia
heart-handshake:sostegno|onlus|non profit|aiuto|donazione
smile:sorriso|soddisfazione|felice|dentista|odontoiatria|denti
phone:telefono|chiamata|chiamaci|numero|centralino
phone-call:telefonata|chiamaci ora|assistenza telefonica|call center
smartphone:cellulare|smartphone|app|mobile|telefonino
mail:email|mail|posta|e-mail|scrivici|newsletter
mail-open:posta letta|messaggio ricevuto
inbox:posta in arrivo|casella
message-circle:chat|messaggio|whatsapp|conversazione|commenti
message-square:messaggi|sms|testo|recensione|opinione
message-circle-question-mark:domande|faq|domande frequenti|dubbi
send:invia|spedisci messaggio|inoltra
at-sign:chiocciola|indirizzo email|contatto email
megaphone:annuncio|pubblicita|promozione|marketing|comunicazione|campagna
bell:notifica|avviso|campanello|promemoria
mic:microfono|podcast|intervista|voce|registrazione
mic-vocal:canto|cantante|karaoke
video:video|videochiamata|riprese|telecamera
headphones:cuffie|ascolto|audio|musica in cuffia
headset:assistenza clienti|supporto|help desk|customer care|servizio clienti
radio:radio|trasmissione
rss:feed|blog|notizie rss
share-2:condividi|condivisione|social|rete
globe:mondo|internazionale|sito web|web|internet|lingue straniere|globale|export
earth:pianeta|terra|ambiente globale
wifi:wifi|wi-fi|connessione|internet gratuito|rete wireless
shopping-cart:carrello|acquisti|ecommerce|e-commerce|shop online|compra
shopping-bag:shopping|borsa|acquisto|moda|boutique
shopping-basket:spesa|cestino spesa|alimentari|supermercato|market
credit-card:carta di credito|pagamento|pagamenti|bancomat|pos|carta
wallet:portafoglio|risparmio|budget|portamonete
banknote:contanti|denaro|banconote|soldi|prezzo|prezzi|costo
coins:monete|guadagno|economia|finanza
euro:euro|valuta|tariffe|listino prezzi
piggy-bank:salvadanaio|risparmi|investimento|conto
receipt:scontrino|ricevuta|fattura|fatturazione
receipt-euro:fattura elettronica|preventivo|parcella
tag:etichetta|prezzo scontato|cartellino|offerta|offerte
tags:etichette|categorie|saldi
percent:sconto|sconti|percentuale|promo|ribasso
badge-percent:coupon|codice sconto|buono sconto
gift:regalo|omaggio|idee regalo|confezione regalo|buono regalo|fidelity
package:pacco|prodotto|prodotti|confezione|imballaggio|collo
package-check:consegnato|ordine completato|ordine
truck:consegna|spedizione|spedizioni|trasporto|corriere|camion|furgone|delivery|trasloco|domicilio
box:scatola|cassa|scatolone
barcode:codice a barre|ean|inventario
qr-code:qr|codice qr|menu digitale
scale:bilancia|giustizia|avvocato|legale|equilibrio|peso
calculator:calcolatrice|contabilita|commercialista|calcolo|conti|preventivi
calendar:calendario|data|prenotazione|agenda|appuntamento|eventi|scadenze
calendar-check:prenota|prenotato|appuntamento confermato|disponibilita
calendar-days:programma|planning|settimana|giorni di apertura
calendar-clock:appuntamento orario|turni
calendar-heart:anniversario|san valentino|ricorrenza
clock:orario|orari|orari di apertura|ore|tempo|puntualita|aperto
timer:cronometro|tempi|durata|velocita|veloce
hourglass:attesa|tempo rimasto|clessidra
alarm-clock:sveglia|promemoria orario|urgente
history:storico|cronologia|tradizione|storia
map:mappa|cartina|percorso|territorio|zona
map-pin:posizione|indirizzo|dove siamo|sede operativa|luogo|localita|pin
map-pinned:come raggiungerci|indicazioni
navigation:navigazione|direzione|indicazioni stradali|gps
compass:bussola|orientamento|esplorare|consulenza strategica
car:auto|automobile|macchina|autonoleggio|noleggio auto|concessionaria
car-front:officina|autosalone|parcheggio auto|veicolo|veicoli
car-taxi-front:taxi|ncc|transfer
bus:autobus|pullman|navetta|gita
bus-front:trasporto pubblico|fermata
train-front:treno|stazione|ferrovia
plane:aereo|volo|voli|viaggi|aeroporto|viaggio
plane-takeoff:partenze|decollo|vacanze
ship:nave|traghetto|crociera|porto
sailboat:barca a vela|vela|nautica|barca
anchor:ancora|marina|nautico
bike:bici|bicicletta|ciclismo|cicloturismo|noleggio bici
square-parking:parcheggio|posteggio|park
fuel:carburante|benzina|distributore|gasolio|rifornimento
route:itinerario|tragitto|percorsi
signpost:cartello|segnaletica|bivio
ambulance:ambulanza|emergenza|soccorso
caravan:camper|roulotte|caravan
tractor:trattore|agricoltura|azienda agricola|agricolo|agriturismo
forklift:muletto|carrello elevatore|movimentazione merci
container:container|import|spedizioni internazionali
utensils:ristorante|cucina|pranzo|cena|mangiare|posate|ristorazione|trattoria|osteria
utensils-crossed:menu|pasti|food|piatti
chef-hat:chef|cuoco|cucina gourmet|scuola di cucina|catering
hand-platter:servizio al tavolo|catering servito|cameriere
concierge-bell:reception|accoglienza|servizio in camera|portineria
coffee:caffe|bar|colazione|cappuccino|caffetteria
cup-soda:bibita|bevande|drink|bibite|asporto
wine:vino|vini|cantina|enoteca|degustazione|aperitivo|calice
beer:birra|pub|birrificio|birreria
martini:cocktail|cocktail bar|lounge
glass-water:acqua|bicchiere|idratazione
pizza:pizza|pizzeria
croissant:cornetto|brioche|pasticceria|forno|panetteria
cake:torta|compleanno|festa di compleanno
cake-slice:fetta di torta|dolce|dessert|dolci
ice-cream-cone:gelato|gelateria|cono
cookie:biscotto|biscotti|cookie|frollini
candy:caramella|caramelle|dolciumi
lollipop:lecca lecca|leccalecca
donut:ciambella|donut|bomboloni
popcorn:popcorn|cinema
sandwich:panino|panini|paninoteca|toast|street food
soup:zuppa|minestra|brodo|primo piatto
salad:insalata|vegetariano|sano|healthy|piatto fresco
leafy-green:ortaggi|verdura|verdure|km zero
vegan:vegano|vegan|plant based
beef:carne|macelleria|bistecca|griglia
ham:salumi|prosciutto|salumeria|norcineria
drumstick:pollo|rosticceria|carne bianca
fish:pesce|pescheria|pesca|frutti di mare|sushi
egg:uovo|uova|fattoria
egg-fried:uovo fritto|brunch
milk:latte|latticini|caseificio|formaggi|formaggio
wheat:grano|farina|cereali|pane|panificio|mulino
wheat-off:senza glutine|gluten free|celiachia|celiaci
nut:frutta secca|noci|allergeni
apple:mela|frutta|fruttivendolo
cherry:ciliegia|ciliegie
grape:uva|vigneto|vendemmia|vigna
carrot:carota|ortofrutta|orto
citrus:agrumi|limone|arancia
banana:banana|frutta esotica
cooking-pot:pentola|cucina casalinga|ricette|cucinare
microwave:microonde|elettrodomestici
refrigerator:frigorifero|frigo|surgelati|catena del freddo
washing-machine:lavatrice|lavanderia|bucato|tintoria
heart:cuore|amore|preferiti|passione|benessere
heart-pulse:cardiologia|battito|salute
heart-plus:aggiungi ai preferiti|salva preferito
stethoscope:medico|dottore|visita medica|studio medico|ambulatorio|sanita|medicina
pill:farmaco|farmaci|farmacia|medicinale|integratori
tablets:pastiglie|compresse|parafarmacia
syringe:vaccino|siringa|iniezione|prelievo|analisi del sangue
activity:attivita|performance|monitoraggio|andamento
thermometer:termometro|temperatura|febbre|clima
bandage:cerotto|primo soccorso|medicazione|ferita
cross:croce|soccorso croce
brain:cervello|psicologo|psicologia|mente|intelligenza|neurologia
eye:occhio|vista|ottica|ottico|oculista|visibilita
glasses:occhiali|lettura
ear:orecchio|udito|apparecchi acustici|ascolta
hand:mano|stop|ciao|manuale
footprints:passi|impronte|podologo|camminata|trekking
bone:osso|ortopedia|veterinario
microscope:microscopio|laboratorio analisi|ricerca|scienza
dna:dna|genetica|biotecnologie
flask-conical:chimica|laboratorio chimico|esperimento|test
atom:fisica|tecnologia avanzata|innovazione scientifica
toothbrush:spazzolino|igiene orale|igiene dentale
scissors:forbici|parrucchiere|barbiere|taglio|sartoria|parrucchiera|acconciatura|capelli
sparkles:pulizia|pulizie|brillante|novita|magia|estetica|bellezza|glow
sparkle:stella brillante|speciale|premium
wand-sparkles:trasformazione|effetti|magia digitale
spray-can:spray|graffiti|disinfezione|sanificazione
droplet:goccia|acqua potabile|idraulico|liquido|olio
droplets:umidita|lavaggio|autolavaggio|irrigazione
flower:fiore|fiori|fioraio|fioreria|giardino
flower-2:margherita|spa|centro benessere|relax|primavera
sun:sole|estate|solare|lido|spiaggia|bel tempo
sun-medium:luminosita|luce
cloud-sun:meteo|tempo atmosferico
moon:luna|notte|sera|notturno|serale
cloud:nuvola|cloud|archivio online|servizi cloud
cloud-rain:pioggia|maltempo
snowflake:neve|inverno|sci|freddo|climatizzazione|aria condizionata
mountain:montagna|escursioni|alpinismo|vetta
waves:mare|onde|piscina|nuoto|surf|acquatico
flame:fuoco|fiamma|riscaldamento|caldaia|grigliata|forno a legna
wind:vento|ventilazione|aria pulita
zap:elettricita|energia|elettricista|impianti elettrici|fulmine
plug:spina|presa|elettrico
plug-zap:ricarica elettrica|colonnina|auto elettrica
battery-charging:ricarica|batteria in carica
battery:batteria|autonomia
solar-panel:pannelli solari|fotovoltaico|energia solare|rinnovabili
recycle:riciclo|riciclare|sostenibilita|ecologia|green|raccolta differenziata|economia circolare
leaf:foglia|naturale|biologico|bio|natura|eco|ecologico|erboristeria
sprout:germoglio|crescita|piante|vivaio|startup
tree-pine:albero|pino|bosco|natale
trees:foresta|parco|verde|giardinaggio
tree-palm:palma|vacanza|tropicale|resort
paw-print:animali|zampa|pet|toelettatura|pet shop|animali domestici
dog:cane|cani|dog sitter|addestramento cani
cat:gatto|gatti|felini
bird:uccello|uccelli|birdwatching
rabbit:coniglio|pasqua
fish-symbol:simbolo pesce|acquario
turtle:tartaruga|lento|tartarughe
squirrel:scoiattolo|animali del bosco
bug:insetto|disinfestazione|bug|errore
shell:conchiglia|lusso marino
briefcase:valigetta|lavoro|professionista|business|carriera|consulenza|offerte di lavoro
briefcase-business:servizi aziendali|b2b|aziende|corporate
clipboard:appunti|modulo|checklist|cartella clinica
clipboard-check:verifica|controllo qualita|completato|collaudo
clipboard-list:elenco|lista|to do|attivita da fare|procedure
file-text:documento|documenti|contratto|pratica|testo|certificato|modulistica
file:file|pagina|foglio
file-check:documento approvato|certificazione|conformita
file-signature:firma contratto|firma digitale|sottoscrizione
folder:cartella|archivio documenti|progetti
folder-open:cartella aperta|portfolio|lavori
archive:archivio|archiviazione|storage
book:libro|libri|libreria|lettura|editoria
book-open:catalogo|guida|manuale d'uso|lezione|studio
library:biblioteca|corsi|risorse
notebook:quaderno|taccuino|diario
notebook-pen:appunti a mano|scrittura|copywriting|blog post
newspaper:giornale|news|notizie|rassegna stampa|stampa|articoli
scroll:pergamena|regolamento|diploma
pen:penna|firma|scrivere
pencil:matita|modifica|disegno|bozza
pen-tool:grafica|design|vettoriale|illustrazione|grafico
pencil-ruler:progettazione|architettura|disegno tecnico
drafting-compass:architetto|ingegneria|progetto tecnico|geometra
ruler:righello|misure|metro|su misura|dimensioni
paperclip:allegato|graffetta|allega
printer:stampante|stampa digitale|tipografia|copisteria|fotocopie
presentation:presentazione|lavagna|corso|formazione|formazione aziendale|seminario|conferenza
projector:proiettore|proiezione|meeting|riunione|riunioni|sala riunioni
chart-column:statistiche|dati|report|analisi|risultati
chart-bar:grafico a barre|confronto dati
chart-line:andamento vendite|crescita fatturato|trend|borsa|investimenti
chart-pie:quote|ripartizione|percentuali|torta budget
trending-up:aumento|crescita vendite|miglioramento|successo
gauge:prestazioni|tachimetro|efficienza
target:obiettivo|obiettivi|mira|target|missione|focus
trophy:trofeo|vittoria|premio|campionato|competizione|primo posto
award:riconoscimento|premiato|certificazione qualita|eccellenza|qualita
medal:medaglia|campione
badge-check:verificato|garanzia|garantito|certificato di qualita|affidabile|qualita garantita
shield-check:sicurezza garantita|protezione|assicurazione|privacy|sicuro
shield:scudo|difesa|sicurezza|protetto|antivirus
shield-plus:assicurazione sanitaria|tutela salute
star:stella|recensioni|valutazione|preferito|top|stelle
flag:bandiera|traguardo|segnala|nazione|italia
lightbulb:idea|idee|innovazione|creativita|soluzione|soluzioni|lampadina|consiglio|consigli
rocket:razzo|lancio|crescita rapida|partenza
puzzle:puzzle|su misura|integrazione|gioco
layers:livelli|strati|soluzioni complete
layout-grid:griglia|categorie prodotti|dashboard|moduli
laptop:computer portatile|laptop|pc|lavoro remoto|smart working|informatica
monitor:monitor|schermo|computer|desktop|postazione
tablet:tablet|ipad|dispositivo
cpu:processore|hardware|elettronica|chip
server:server|hosting|data center|infrastruttura
database:database|gestionale
code:codice|sviluppo|programmazione|software|sviluppo web
terminal:terminale|sviluppatori|riga di comando
bot:robot|chatbot|automazione|intelligenza artificiale|ia|ai
brain-circuit:machine learning|ai avanzata|reti neurali
bluetooth:bluetooth|wireless
cable:cavo|cablaggio|collegamenti
hard-drive:disco|backup|memoria
mouse:mouse|clic|click
keyboard:tastiera|digitare|inserimento dati
camera:fotocamera|fotografo|fotografia|foto|servizio fotografico|scatti
image:immagine|immagini|galleria|gallery
film:film|pellicola|videomaker
clapperboard:ciak|produzione video|regia|spot|cortometraggio
music:musica|note|concerto|scuola di musica|dj|canzoni
guitar:chitarra|musicisti|strumenti musicali
piano:pianoforte|piano|lezioni di musica
drum:tamburo|percussioni|batteria musicale
speaker:cassa|altoparlante|impianto audio|service audio
tv:televisione|tv|tv in camera
radio-tower:antenna|trasmissioni|telecomunicazioni
satellite-dish:parabola|antennista|satellite
cast:streaming|trasmissione schermo
gamepad-2:videogiochi|gaming|sala giochi
ticket:biglietto|biglietti|ingresso|spettacolo|teatro
party-popper:festa|feste|celebrazione|eventi privati|inaugurazione|party|matrimoni|matrimonio
link:link|collegamento|link utili
lock:lucchetto|chiuso|riservato|riservatezza|sicurezza dati|password
lock-open:sbloccato|accesso libero
key:chiave|chiavi|affitto|locazione|chiavi in mano|accesso
key-round:chiave della stanza|check-in|self check-in
fingerprint:impronta|identita|biometria|unicita
scan:scansione|scanner|digitalizzazione
scan-face:riconoscimento facciale|viso|trattamenti viso
id-card:documento di identita|tessera|badge|card socio|abbonamento|abbonamenti
settings:impostazioni|configurazione|regolazioni
cog:ingranaggio|meccanica|processi
wrench:chiave inglese|riparazione|riparazioni|manutenzione|assistenza tecnica|officina meccanica|meccanico
hammer:martello|edilizia|lavori|costruzioni|falegname|bricolage|ristrutturazione|ristrutturazioni
drill:trapano|installazione|montaggio
pickaxe:piccone|scavi|miniera
shovel:pala|scavo|movimento terra
axe:ascia|legna|taglio legna
brick-wall:muro|mattoni|muratore|edile
paint-roller:imbianchino|pittura|tinteggiatura|verniciatura|pareti
paintbrush:pennello|pittore|arte|belle arti|decorazione
palette:tavolozza|colori|artista|design colori
brush:spazzola|trucco|make up|estetista
construction:cantiere|lavori in corso|costruzione|impresa edile
hard-hat:caschetto|sicurezza sul lavoro|operaio
fire-extinguisher:estintore|antincendio|prevenzione incendi
siren:sirena|allarme|emergenze|vigilanza
fan:ventilatore|raffrescamento
air-vent:condizionatore|climatizzatore|areazione
shower-head:doccia|idraulica|termoidraulica
bath:vasca|bagno|arredo bagno
bed:letto|camera|dormire|alloggio
bed-double:camera matrimoniale|matrimoniale|suite
sofa:divano|arredamento|mobili|salotto|interior design|arredo
armchair:poltrona|comfort|tappezziere
lamp:lampada|illuminazione|lampadario
lamp-desk:lampada da scrivania|scrivania
blinds:tende|tapparelle|serramenti|infissi
door-open:porta aperta|benvenuto|ingresso libero|entrata
door-closed:porta|porte|serramentista
dumbbell:palestra|fitness|allenamento|pesi|personal trainer|sport
volleyball:pallavolo|volley|beach volley
goal:calcio|porta da calcio|gol|calcetto
graduation-cap:laurea|universita|istruzione|studenti|master
backpack:zaino|escursione
languages:lingue|traduzione|traduzioni|corsi di lingua|multilingue|interprete
gavel:martelletto|asta|aste|giudice
signature:firma autografa|autografo
stamp:timbro|notaio|ufficiale
check:spunta|fatto|ok|incluso
circle-check:completato|disponibile|confermato|successo
x:chiudi|annulla|no|escluso
plus:aggiungi|piu|nuovo
minus:meno|togli|riduci
search:cerca|ricerca|lente|trova|seo
info:informazioni|info|dettagli
circle-help:aiuto|domanda|help
triangle-alert:attenzione|pericolo|avviso importante|allerta
arrow-right:freccia|avanti|prossimo|continua|scopri
arrow-left:indietro|torna
download:scarica|download
upload:carica|upload|invia file
external-link:link esterno|apri sito
thumbs-up:mi piace|like|approvato|consigliato|soddisfatto
thumbs-down:non mi piace|dislike|reclamo
filter:filtro|filtri|selezione
refresh-cw:aggiorna|rinnovo|rinnova|resi|reso|cambio merce
trash-2:cestino|elimina|rifiuti|smaltimento|spazzatura
luggage:valigia|bagagli|agenzia viaggi|tour operator
umbrella:ombrello|ombrellone|stabilimento balneare
life-buoy:salvagente|soccorso in mare
hand-helping:mano tesa|servizi sociali|badante|assistenza anziani
hand-coins:rimborso|cashback|prestito|finanziamento|credito
gem:gioiello|gioielli|gioielleria|diamante|lusso|prezioso|orafo
watch:orologio|orologeria|orologi
crown:corona|vip|esclusivo|regina|re
shirt:maglietta|abbigliamento|vestiti|t-shirt|tessile
venetian-mask:maschera|carnevale|maschere`;
const NAMES=Object.freeze(TABLE.split('\n').map(l=>l.slice(0,l.indexOf(':'))));
// Basics every business has, in the order they are proposed.
const BASICS=Object.freeze(['Telefono','Email','Dove siamo','Orari']);
// Sectors: a word in the project text → the concepts that sector usually needs (all of them map to the table).
const SECTORS=Object.freeze([
 {words:['ristorante','trattoria','osteria','pizzeria','ristorazione','cucina'],concepts:['Menu','Prenotazione','Vino','Asporto','Consegna a domicilio','Senza glutine']},
 {words:['bar','caffetteria','caffe','gelateria','pasticceria','forno','panificio','panetteria'],concepts:['Caffè','Colazione','Dolci','Pane','Torte','Asporto']},
 {words:['hotel','albergo','agriturismo','b&b','residence','ospitalita'],concepts:['Camere','Wi-Fi','Colazione','Parcheggio','Piscina','Reception']},
 {words:['negozio','boutique','moda','abbigliamento','ecommerce','shop'],concepts:['Carrello','Spedizione','Pagamento','Resi','Saldi','Regalo']},
 {words:['medico','dentista','clinica','fisioterapia','studio medico','farmacia','sanita','ambulatorio'],concepts:['Visita medica','Prenotazione','Farmaci','Analisi','Assistenza','Urgente']},
 {words:['palestra','fitness','sport','piscina','personal trainer'],concepts:['Allenamento','Corsi','Orari','Personal trainer','Nuoto','Abbonamento']},
 {words:['parrucchiere','barbiere','estetica','estetista','bellezza','benessere','spa'],concepts:['Taglio','Trattamenti viso','Relax','Prenotazione','Trucco','Regalo']},
 {words:['edilizia','costruzioni','impianti','idraulico','elettricista','ristrutturazione','ristrutturazioni','serramenti'],concepts:['Ristrutturazione','Impianti elettrici','Idraulica','Preventivo','Cantiere','Garanzia']},
 {words:['avvocato','legale','notaio','commercialista','consulenza','consulente','studio professionale'],concepts:['Consulenza','Documenti','Contratto','Fatturazione','Appuntamento','Riservatezza']},
 {words:['cantina','vino','vigneto','agricola','agricoltura','fattoria'],concepts:['Vino','Vigneto','Degustazione','Biologico','Spedizione','Azienda agricola']},
 {words:['officina','auto','autonoleggio','concessionaria','carrozzeria','meccanico'],concepts:['Auto','Riparazioni','Manutenzione','Carburante','Preventivo','Noleggio auto']},
 {words:['immobiliare','immobili','agenzia immobiliare','affitti','case'],concepts:['Casa','Affitto','Chiavi in mano','Ricerca immobili','Mappa','Appuntamento']},
 {words:['scuola','formazione','corsi','universita','accademia'],concepts:['Corsi','Formazione','Laurea','Libri','Calendario','Certificato']},
 {words:['software','informatica','digitale','agenzia','tecnologia','web','sviluppo'],concepts:['Sviluppo web','Cloud','Sicurezza','Assistenza clienti','Dati','Automazione']},
 {words:['viaggi','turismo','tour','vacanze'],concepts:['Viaggi','Volo','Valigia','Mappa','Spiaggia','Biglietti']}]);
const STOP=new Set('di da del della dello dei degli delle il lo la le gli un una uno per con su tra fra in a e o ed al alla allo ai agli alle che nel nella nei nelle sul sulla sui dal dalla dai noi voi nostro nostra nostri nostre vostro vostra'.split(' '));

// ---- text ----
const clean=s=>String(s==null?'':s).replace(/[\s ]+/g,' ').trim();
const fold=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’']/g,' ');
const words=s=>fold(s).split(/[^a-z0-9&]+/).filter(w=>w&&!STOP.has(w));
// A light Italian stem: the final vowels go, so singular and plural meet («pizza»/«pizze», «fiore»/«fiori»).
const stem=w=>w.length>4?w.replace(/[aeiou]+$/,''):w;
const slug=s=>fold(s).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;

// ---- the index: every icon with its phrases (folded) and the stems of their words ----
let INDEX=null;
function index(){if(INDEX)return INDEX;
 INDEX=TABLE.split('\n').map((line,order)=>{const i=line.indexOf(':'),name=line.slice(0,i),phrases=line.slice(i+1).split('|').map(p=>words(p).join(' ')).filter(Boolean);
  return {name,order,phrases,phraseStems:phrases.map(p=>p.split(' ').map(stem).join(' ')),stems:new Set(phrases.flatMap(p=>p.split(' ').map(stem))),english:name.split('-').filter(w=>!/^\d+$/.test(w))}});
 return INDEX}
const has=name=>NAMES.includes(name);
// The Italian words of one icon (the first is its name in the picker).
function wordsOf(name){const line=TABLE.split('\n').find(l=>l.startsWith(name+':'));return line?line.slice(line.indexOf(':')+1).split('|'):[]}
const labelOf=name=>{const w=wordsOf(name)[0]||name;return w.charAt(0).toUpperCase()+w.slice(1)};
// Every icon scored on the concept, best first: [{name, score, cover}] with cover = share of the concept's words matched
// exactly (by stem). 100 the whole phrase, 80 the whole phrase in another number, 60 the English name, then 10 per word
// matched (13 for the first, usually the noun that matters: «spedizione gratuita»), 5 for a word that only shares a prefix.
function findIcons(concept,{limit=6}={}){const toks=words(concept);if(!toks.length)return [];const full=toks.join(' '),fullStem=toks.map(stem).join(' '),ts=toks.map(stem);
 const out=[];for(const ic of index()){let score=0,hit=0;
  if(ic.phrases.includes(full))score=100;else if(ic.phraseStems.includes(fullStem))score=80;else if(full.replace(/ /g,'-')===ic.name||(toks.length===1&&ic.english.length===1&&ic.english[0]===toks[0]))score=60;
  ts.forEach((t,i)=>{if(ic.stems.has(t)){hit++;score+=i===0?13:10}else if(t.length>=4&&[...ic.stems].some(s=>s.length>=4&&(s.startsWith(t)||t.startsWith(s))))score+=5});
  if(score>0)out.push({name:ic.name,score,cover:Math.min(1,hit/ts.length),order:ic.order})}
 return out.sort((a,b)=>b.score-a.score||a.order-b.order).slice(0,limit).map(({name,score,cover})=>({name,score,cover}))}
const FALLBACK=Object.freeze(['star','circle-check','sparkles','lightbulb','heart','info']);
// One concept → {label, icon, found, alternatives}. Found when the whole phrase matches or at least half its words do.
function mapConcept(label){const l=clean(label).slice(0,MAX_LABEL),hits=findIcons(l,{limit:7}),best=hits[0];
 const found=!!best&&(best.score>=60||best.cover>=.5);
 const alternatives=(found?hits.slice(1):hits).map(h=>h.name);for(const f of FALLBACK)if(alternatives.length<6&&!alternatives.includes(f)&&!(found&&f===best.name))alternatives.push(f);
 return {label:l,icon:found?best.name:'',found,alternatives:alternatives.slice(0,6)}}
// The concepts typed by the person: one per line or separated by commas, no doubles, at most 24.
function parseConcepts(text){const out=[],seen=new Set();for(const raw of String(text||'').split(/[\n,;]+/)){const l=clean(raw).slice(0,MAX_LABEL);if(!l)continue;const k=fold(l);if(seen.has(k))continue;seen.add(k);out.push(l);if(out.length>=MAX_CONCEPTS)break}return out}
// The catalogue filtered by a search («pizza», «house»): every icon whose Italian or English words match; '' gives all.
function searchCatalogue(q){const t=words(q);if(!t.length)return NAMES.slice();
 return index().filter(ic=>t.every(w=>{const s=stem(w);return [...ic.stems].some(x=>x.startsWith(s)||s.startsWith(x)&&x.length>=4)||ic.english.some(e=>e===w||w.length>=5&&e.startsWith(w))})).map(ic=>ic.name)}

// ---- concepts suggested from the project ----
// The project's own words (the name without its notes in brackets, such as «(DATI DI ESEMPIO)»).
function textOfProject(project,profile){const p=project||{},pr=profile||{},b=pr.brief||{},out=[];
 const add=v=>{if(v==null)return;if(Array.isArray(v))v.forEach(add);else if(typeof v==='object')Object.values(v).forEach(add);else out.push(String(v))};
 [String(p.name||'').replace(/\([^)]*\)/g,' '),p.kind,p.summary,p.positioning,p.audience,p.notes,p.decisions,pr.kind,pr.services,pr.products,pr.sector,pr.positioning,pr.notes,b.industry,b.goal,b.audience,b.market,b.services,b.products,b.offer].forEach(add);
 return out.join(' \n ').slice(0,20000)}
// Up to `max` concepts: the sector's usual ones, then the single table words found in the project text, then the basics.
function suggestConcepts(project,profile,{max=12}={}){const text=textOfProject(project,profile),toks=words(text),stems=new Set(toks.map(stem)),out=[],seen=new Set(),icons=new Set(),push=l=>{const k=fold(l),m=mapConcept(l);if(seen.has(k)||out.length>=max||(m.icon&&icons.has(m.icon)))return;seen.add(k);if(m.icon)icons.add(m.icon);out.push(l)};
 const ftext=' '+toks.join(' ')+' ';
 for(const s of SECTORS)if(s.words.some(w=>ftext.includes(' '+words(w).join(' ')+' ')))s.concepts.forEach(push);
 const single=new Map();for(const ic of index())for(const ph of ic.phrases)if(!ph.includes(' ')&&ph.length>=4&&!single.has(stem(ph)))single.set(stem(ph),ph);
 for(const t of toks){if(t.length<4)continue;const ph=single.get(stem(t));if(ph&&stems.has(stem(t)))push(ph.charAt(0).toUpperCase()+ph.slice(1))}
 BASICS.forEach(push);return out}

// ---- uses and styles ----
const USES=Object.freeze([
 {id:'sito',label:'Sito web',small:'menu, servizi, contatti',style:'sottile'},
 {id:'social',label:'Social',small:'post, storie, copertine',style:'duotono'},
 {id:'app',label:'App',small:'pulsanti e schede',style:'spesso'},
 {id:'stampa',label:'Stampa',small:'volantini, insegne, menu',style:'spesso'}]);
const SHAPES=Object.freeze([{id:'none',label:'Nessuna'},{id:'circle',label:'Cerchio'},{id:'rounded',label:'Quadrato arrotondato'},{id:'square',label:'Quadrato'}]);
const CORNERS=Object.freeze([{id:'round',label:'Arrotondati'},{id:'sharp',label:'Vivi'}]);
const STYLES=Object.freeze([
 {id:'sottile',title:'Contorno sottile',line:'Tratto leggero da 1,5 px e angoli morbidi: elegante e arioso, per sito e materiali raffinati.',settings:{stroke:1.5,corner:'round',padding:0,shape:'none'}},
 {id:'spesso',title:'Contorno spesso arrotondato',line:'Tratto pieno da 2,5 px, terminali tondi: si legge anche piccolo, per app, pulsanti e stampa.',settings:{stroke:2.5,corner:'round',padding:1,shape:'none'}},
 {id:'duotono',title:'Duotono in contenitore',line:'Icona nel colore di marca su un fondo chiaro della stessa tinta: riconoscibile nei social e nelle schede.',settings:{stroke:2.25,corner:'round',padding:4,shape:'rounded'}}]);
const styleOf=id=>STYLES.find(s=>s.id===id)||null;
// The proposal advised for the uses picked: the first use decides («Consigliata» on its card).
const advised=uses=>{const u=USES.find(x=>(uses||[]).includes(x.id));return u?u.style:'sottile'};

// ---- colours ----
const HEX=/^#[0-9A-F]{6}$/;
const hex=h=>{let s=String(h||'').trim().toUpperCase();if(/^#[0-9A-F]{3}$/.test(s))s='#'+s.slice(1).split('').map(c=>c+c).join('');return HEX.test(s)?s:''};
const rgbOf=h=>[1,3,5].map(i=>parseInt(hex(h).slice(i,i+2),16));
const hexOf=a=>'#'+a.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('').toUpperCase();
const mix=(a,b,t)=>{const x=rgbOf(a),y=rgbOf(b);return hexOf(x.map((v,i)=>v*t+y[i]*(1-t)))};
function luminance(h){return rgbOf(h).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)}
function contrast(a,b){const x=luminance(a),y=luminance(b);return Math.round((Math.max(x,y)+.05)/(Math.min(x,y)+.05)*100)/100}
const NEUTRAL=Object.freeze({primary:'#4338CA',dark:'#1D1A27',light:'#FFFFFF'});
// The Kit identità palette of the project ({role, name, hex}), [] when there is none.
function kitPalette(profile){const k=profile&&profile.identityKit;if(!k||!Array.isArray(k.palette))return [];return k.palette.map(c=>({role:String(c&&c.role||''),name:clean(c&&c.name),hex:hex(c&&c.hex)})).filter(c=>c.hex)}
// The starting colours: the icon in the kit's primary (or dark when the primary is too light on white), the container a
// light tint of it, the page white.
function colorsFrom(profile){const pal=kitPalette(profile),by=r=>(pal.find(c=>c.role===r)||{}).hex;let fg=by('primary')||(pal[0]||{}).hex||NEUTRAL.primary;const dark=by('dark')||NEUTRAL.dark;
 if(contrast(fg,'#FFFFFF')<3)fg=contrast(dark,'#FFFFFF')>=3?dark:NEUTRAL.dark;return {fg,bg:mix(fg,'#FFFFFF',.14),surface:'#FFFFFF',fromKit:pal.length>0}}

// ---- settings ----
// Every setting within its range: stroke 1–3 (step .25, px on the 24 grid), corners, grid 24/32/48, padding 0–6, shape,
// colours (icon, container, the surface it sits on), currentColor in the files.
function settingsOf(s){s=s||{};return {style:styleOf(s.style)?s.style:'',stroke:Math.round(clamp(+s.stroke||2,1,3)*4)/4,corner:s.corner==='sharp'?'sharp':'round',grid:GRIDS.includes(+s.grid)?+s.grid:24,
 padding:Math.round(clamp(s.padding==null?0:+s.padding||0,0,6)*2)/2,shape:SHAPES.some(x=>x.id===s.shape)?s.shape:'none',fg:hex(s.fg)||NEUTRAL.primary,bg:hex(s.bg)||mix(hex(s.fg)||NEUTRAL.primary,'#FFFFFF',.14),
 surface:hex(s.surface)||'#FFFFFF',currentColor:s.currentColor!==false}}
function proposalSettings(id,colors,base){const st=styleOf(id)||STYLES[0],c=colors||{};return settingsOf({...st.settings,...(base||{}),style:st.id,fg:c.fg,bg:c.bg,surface:c.surface,stroke:st.settings.stroke,padding:st.settings.padding,shape:st.settings.shape,corner:st.settings.corner})}
// How thick the stroke looks at `px` pixels: the glyph is drawn at (24 − 2·padding)/24 of the canvas.
const strokeAt=(s,px)=>Math.round(s.stroke*(24-2*s.padding)/24*px/24*100)/100;

// ---- drawing ----
const n=v=>Math.round(v*1000)/1000;
// The glyph markup of the catalogue (Lucide elements: path, circle, rect, line, ellipse, polyline, polygon).
function glyph(name){const S=SET();const g=S&&S.icons&&S.icons[name];if(!g)throw Error('Icona non nel catalogo: '+name);return g}
function containerOf(s,fill,extra){const G=s.grid;if(s.shape==='circle')return '<circle cx="'+n(G/2)+'" cy="'+n(G/2)+'" r="'+n(G/2)+'" fill="'+fill+'"'+extra+'/>';
 if(s.shape==='rounded'||s.shape==='square'){const r=s.shape==='square'?0:s.corner==='sharp'?G*.1:G*.24;return '<rect width="'+G+'" height="'+G+'"'+(r?' rx="'+n(r)+'"':'')+' fill="'+fill+'"'+extra+'/>'}
 return ''}
const esc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// One icon as a standalone SVG: viewBox 0 0 G G, the glyph scaled into the padding, one stroke width for all.
// opts.currentColor: stroke in currentColor and the container a 14 % tint of it; otherwise color= on the group makes the
// few filled dots of Lucide (fill="currentColor") take the icon colour too. opts.size: width/height (default G).
function iconSvg(name,settings,{currentColor=false,size,title}={}){const s=settingsOf(settings),G=s.grid,pad=s.padding*G/24,k=(G-2*pad)/24,sz=size||G;
 const fg=currentColor?'currentColor':s.fg,box=s.shape==='none'?'':currentColor?containerOf(s,'currentColor',' fill-opacity="0.14"'):containerOf(s,s.bg,'');
 const cap=s.corner==='sharp'?'square':'round',join=s.corner==='sharp'?'miter':'round';
 return '<svg xmlns="http://www.w3.org/2000/svg" width="'+sz+'" height="'+sz+'" viewBox="0 0 '+G+' '+G+'" fill="none">'+(title?'<title>'+esc(title)+'</title>':'')+box
  +'<g transform="translate('+n(pad)+' '+n(pad)+') scale('+n(k)+')"'+(currentColor?'':' color="'+s.fg+'"')+' stroke="'+fg+'" stroke-width="'+s.stroke+'" stroke-linecap="'+cap+'" stroke-linejoin="'+join+'">'+glyph(name)+'</g></svg>'}
// The SVG sprite: one <symbol id="icona-…"> per icon, in currentColor, to use with <svg><use href="sprite.svg#icona-…"/></svg>.
function spriteSvg(list,settings){const s=settingsOf(settings);
 return '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">'+list.map(it=>{const one=iconSvg(it.icon,s,{currentColor:true});return '<symbol id="icona-'+it.slug+'" viewBox="0 0 '+s.grid+' '+s.grid+'"><title>'+esc(it.label)+'</title>'+one.replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'')+'</symbol>'}).join('')+'</svg>'}
// The preview sheet: every icon big with its name, then the row at 16, 24 and 32 px on light and dark.
function sheetSvg(list,settings,{name='',date}={}){const s=settingsOf(settings),cols=Math.min(6,Math.max(3,list.length)),cell=150,W=cols*cell+80,rows=Math.ceil(list.length/cols),top=110,H=top+rows*cell+150,dark='#1D1A27';
 const inner=(it,x,y,px,cc)=>{const svg=iconSvg(it.icon,s,cc?{currentColor:true}:{});return '<svg x="'+x+'" y="'+y+'" width="'+px+'" height="'+px+'" viewBox="0 0 '+s.grid+' '+s.grid+'"'+(cc?' color="#FFFFFF"':'')+' fill="none">'+svg.replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'')+'</svg>'};
 let body='<rect width="'+W+'" height="'+H+'" fill="#FFFFFF"/><text x="40" y="52" font-family="Inter,Arial,sans-serif" font-size="26" font-weight="700" fill="'+dark+'">'+esc(clean(name)||'Set di icone')+'</text>'
  +'<text x="40" y="80" font-family="Inter,Arial,sans-serif" font-size="13" fill="#55516A">'+esc(list.length+' icone · '+((styleOf(s.style)||{title:'su misura'}).title)+' · tratto '+String(s.stroke).replace('.',',')+' px · griglia '+s.grid+' px · '+(date?dateText(date):''))+'</text>';
 list.forEach((it,i)=>{const x=40+(i%cols)*cell,y=top+Math.floor(i/cols)*cell;body+='<rect x="'+x+'" y="'+y+'" width="'+(cell-14)+'" height="'+(cell-14)+'" rx="14" fill="'+(s.surface)+'" stroke="#E4E1EC"/>'+inner(it,x+(cell-14)/2-32,y+22,64)
  +'<text x="'+(x+(cell-14)/2)+'" y="'+(y+cell-34)+'" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="12" fill="'+dark+'">'+esc(it.label.slice(0,22))+'</text>'});
 const y0=top+rows*cell+10;body+='<text x="40" y="'+(y0+14)+'" font-family="Inter,Arial,sans-serif" font-size="12" font-weight="700" fill="#55516A">Prova in piccolo: 16, 24 e 32 px su chiaro e su scuro</text>';
 [16,24,32].forEach((px,j)=>{const y=y0+30+j*0;list.slice(0,12).forEach((it,i)=>{const x=40+j*((W-80)/3)+i*(px+6);if(x+px<40+(j+1)*((W-80)/3)-10){body+=inner(it,x,y,px);body+='<rect x="'+x+'" y="'+(y+44)+'" width="'+px+'" height="'+px+'" fill="'+dark+'"/>'+inner(it,x,y+44,px,true)}})});
 return '<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'">'+body+'</svg>'}

// ---- checks ----
// The set as it will be exported: [{label, icon, slug}] for every concept that has an icon (slugs made unique).
function setOf(items){const used=new Map();return (items||[]).filter(x=>x&&x.icon&&has(x.icon)).map(x=>{let s=slug(x.label)||x.icon,k=s,i=2;while(used.has(k))k=s+'-'+i++;used.set(k,1);return {label:clean(x.label)||labelOf(x.icon),icon:x.icon,slug:k}})}
// Element and command count of a glyph: a rough measure of detail.
function detailOf(name){const g=glyph(name),els=(g.match(/<(path|circle|rect|line|ellipse|polyline|polygon)\b/g)||[]).length,cmds=(g.match(/[MLHVCSQTAZmlhvcsqtaz]/g)||[]).length;return {els,cmds}}
const DENSE=d=>d.els>=7||d.cmds>=60;
// [{id, label, state:'ok'|'warn'|'fail', text}] for the set and its settings.
function checks(items,settings){const s=settingsOf(settings),set=setOf(items),out=[],add=(id,label,state,text)=>out.push({id,label,state,text});
 const missing=(items||[]).filter(x=>x&&(!x.icon||!has(x.icon)));
 if(!set.length){add('set','Icone','fail','Nessuna icona nel set: scrivi almeno un concetto e scegli la sua icona.');return out}
 const svgs=set.map(it=>iconSvg(it.icon,s)),attr=(svg,re)=>{const m=re.exec(svg);return m?m[1]:''};
 const strokes=new Set(svgs.map(v=>attr(v,/stroke-width="([^"]+)"/))),boxes=new Set(svgs.map(v=>attr(v,/viewBox="([^"]+)"/)+'|'+attr(v,/<g transform="([^"]+)"/)));
 add('tratto','Stesso tratto',strokes.size===1?'ok':'fail',strokes.size===1?'Tutte le '+set.length+' icone hanno il tratto da '+String(s.stroke).replace('.',',')+' px, terminali '+(s.corner==='sharp'?'vivi':'arrotondati')+'.':'Spessori diversi nel set: '+[...strokes].join(', ')+'.');
 add('griglia','Stessa griglia',boxes.size===1?'ok':'fail',boxes.size===1?'Tutte su griglia '+s.grid+' × '+s.grid+' px con margine '+String(s.padding).replace('.',',')+' px'+(s.shape==='none'?'':' e lo stesso contenitore')+'.':'Griglie o margini diversi nel set.');
 const back=s.shape==='none'?s.surface:s.bg,c=contrast(s.fg,back),where=s.shape==='none'?'sul fondo della pagina':'sul contenitore';
 add('contrasto','Contrasto dei colori',c>=3?'ok':c>=2?'warn':'fail',(c>=3?'Icona '+s.fg+' '+where+' '+back+': '+String(c).replace('.',',')+':1, sopra il 3:1 richiesto per la grafica (WCAG).':'Icona '+s.fg+' '+where+' '+back+': solo '+String(c).replace('.',',')+':1. Serve almeno 3:1: scurisci l’icona o schiarisci il fondo.'));
 if(s.shape!=='none'){const cs=contrast(s.bg,s.surface);if(cs<1.1)add('contenitore','Contenitore','warn','Il contenitore '+s.bg+' quasi non si vede sul fondo '+s.surface+': va bene se è voluto, altrimenti scegli una tinta un po’ più piena.')}
 const px=strokeAt(s,16);
 add('piccolo','Leggibile a 16 px',px>=1?'ok':px>=.75?'warn':'fail',px>=1?'A 16 px il tratto è di '+String(px).replace('.',',')+' px: resta nitido.':'A 16 px il tratto è di '+String(px).replace('.',',')+' px: '+(px>=.75?'diventa sfocato':'quasi sparisce')+'. Aumenta lo spessore o riduci il margine, oppure usa queste icone da 24 px in su.');
 const dense=set.filter(it=>DENSE(detailOf(it.icon)));
 if(dense.length)add('dettagli','Icone con molti dettagli','warn','A 16 px possono impastarsi: '+dense.map(d=>'«'+d.label+'»').join(', ')+'. Provale piccole nell’anteprima o scegli un’alternativa più semplice.');
 if(missing.length)add('mancanti','Icone mancanti','warn','Senza icona, restano fuori dai file: '+missing.map(m=>'«'+clean(m.label)+'»').join(', ')+'.');
 const byIcon=new Map();set.forEach(it=>byIcon.set(it.icon,(byIcon.get(it.icon)||[]).concat([it.label])));
 const twice=[...byIcon.values()].filter(v=>v.length>1);
 if(twice.length)add('doppioni','Stessa icona due volte','warn','La stessa icona per concetti diversi: '+twice.map(v=>v.map(l=>'«'+l+'»').join(' e ')).join('; ')+'. Va bene solo se è voluto.');
 return out}
const blocking=list=>(list||[]).some(c=>c.state==='fail'&&c.id==='set');

// ---- files ----
const dateText=d=>(d||new Date()).toISOString().slice(0,10);
const brandName=(name,fallback)=>clean(name)||clean(fallback)||'Set di icone';
const zipName=name=>'icone-'+(slug(name)||'set')+'.zip';
function exampleHtml(set,s){return '<!doctype html>\n<html lang="it"><head><meta charset="utf-8"><title>Esempio sprite icone</title>\n<style>body{font-family:system-ui,sans-serif;margin:32px;color:#1D1A27}.i{width:'+s.grid+'px;height:'+s.grid+'px;color:'+s.fg+'}li{display:flex;align-items:center;gap:12px;margin:8px 0}</style></head><body>\n'
 +'<h1>Come usare sprite.svg</h1>\n<p>Metti sprite.svg accanto alla pagina e richiama ogni icona con il suo id. Il colore segue la proprietà CSS <code>color</code>.</p>\n<ul>\n'
 +set.map(it=>'<li><svg class="i" role="img" aria-label="'+esc(it.label)+'"><use href="sprite.svg#icona-'+it.slug+'"/></svg> <code>#icona-'+it.slug+'</code> '+esc(it.label)+'</li>').join('\n')+'\n</ul>\n</body></html>\n'}
function readme(set,settings,{name,date,uses,files,checks:ck}={}){const s=settingsOf(settings),st=styleOf(s.style),L=[];
 L.push('SET DI ICONE · '+brandName(name),'Creato con RADIX il '+dateText(date)+' nel browser, senza AI e senza costi.','');
 L.push('STILE','- '+(st?st.title:'Su misura')+' · tratto '+String(s.stroke).replace('.',',')+' px · terminali '+(s.corner==='sharp'?'vivi':'arrotondati')+' · griglia '+s.grid+' × '+s.grid+' px · margine '+String(s.padding).replace('.',',')+' px · contenitore: '+(SHAPES.find(x=>x.id===s.shape)||{}).label.toLowerCase(),
  '- Colori: icona '+s.fg+(s.shape==='none'?'':' · contenitore '+s.bg)+' · fondo d’uso '+s.surface);
 if(uses&&uses.length)L.push('- Uso previsto: '+uses.map(u=>(USES.find(x=>x.id===u)||{label:u}).label.toLowerCase()).join(', '));L.push('');
 L.push('ICONE ('+set.length+')');set.forEach(it=>L.push('- '+it.label+' → '+it.slug+'.svg (Lucide «'+it.icon+'»)'));L.push('');
 L.push('FILE');for(const f of files||[])if(!/^(svg|svg-currentcolor|png)\//.test(f.name))L.push('- '+f.name+(f.label?': '+f.label:''));
 L.push('- svg/: un SVG per icona nei colori scelti','- svg-currentcolor/: gli stessi SVG che prendono il colore dal testo intorno (CSS color)'.concat(s.currentColor?'':' — non inclusi in questo export'),'- png/64, png/128, png/512: PNG trasparenti per presentazioni, social e documenti','');
 if(ck&&ck.length){L.push('CONTROLLI');ck.forEach(c=>L.push('- ['+(c.state==='ok'?'OK':c.state==='warn'?'ATTENZIONE':'DA SISTEMARE')+'] '+c.label+': '+c.text));L.push('')}
 L.push('COME USARLE','- Sito: usa gli SVG (o lo sprite) e dai alle icone un testo alternativo, oppure aria-hidden se accanto c’è già la parola.','- Misura minima consigliata: 16 px sullo schermo, 5 mm in stampa. Sotto i 24 px preferisci lo stile a tratto spesso.','- Stampa: gli SVG sono vettoriali; per la tipografia aprili in Illustrator o Inkscape e convertili in tracciati se richiesto.','');
 L.push('LICENZA','- I disegni delle icone vengono da Lucide (lucide.dev), licenza ISC: si possono usare anche a fini commerciali, modificare e ridistribuire, tenendo la nota di copyright e di licenza (vedi LICENZA-lucide.txt, da tenere insieme ai file).','- Alcune icone derivano da Feather (licenza MIT, stessa nota nel file).','- Le icone non sono un marchio registrabile in esclusiva: per un simbolo di marca serve un disegno originale.','');
 L.push('MASCOTTE','- Non inclusa: il model sheet della mascotte richiede la generazione di immagini a pagamento, ancora da collegare in RADIX.');
 return L.join('\r\n')+'\r\n'}
// Every file of the zip: [{name, data, label}]. opts.png(svg, w, h) → PNG bytes (the browser canvas); without it the PNG
// files are left out (the Node tests pass a stub).
async function files(items,settings,{name,date=new Date(),png,uses}={}){const s=settingsOf(settings),set=setOf(items),out=[],add=(f,data,label)=>out.push({name:f,data,label});
 if(!set.length)throw Error('Nessuna icona da esportare: scrivi almeno un concetto e scegli la sua icona.');
 for(const it of set)add('svg/'+it.slug+'.svg',iconSvg(it.icon,s,{title:it.label}),it.label+' · SVG '+s.grid+' px');
 if(s.currentColor)for(const it of set)add('svg-currentcolor/'+it.slug+'.svg',iconSvg(it.icon,s,{currentColor:true,title:it.label}),it.label+' · SVG in currentColor');
 if(png)for(const px of PNG_SIZES)for(const it of set)add('png/'+px+'/'+it.slug+'.png',await png(iconSvg(it.icon,s,{size:px}),px,px),it.label+' · PNG '+px+' px');
 add('sprite.svg',spriteSvg(set,s),'Tutte le icone in un file (simboli in currentColor)');
 add('esempio-sprite.html',exampleHtml(set,s),'Come richiamare le icone dello sprite in una pagina');
 const sheet=sheetSvg(set,s,{name,date});add('anteprima.svg',sheet,'Foglio di anteprima vettoriale');
 if(png){const w=+/width="(\d+)"/.exec(sheet)[1],h=+/height="(\d+)"/.exec(sheet)[1];add('anteprima.png',await png(sheet,w,h),'Foglio di anteprima '+w+' × '+h+' px')}
 const S=SET();add('LICENZA-lucide.txt',S&&S.LICENSE||'',
  'Licenza ISC di Lucide (e MIT di Feather): da tenere con le icone');
 add('LEGGIMI.txt',readme(set,s,{name,date,uses,files:out.concat([{name:'LEGGIMI.txt',label:'Queste note'}]),checks:checks(items,s)}),'Stile, elenco, controlli, uso e licenza');
 return out}
const bundle=(list,{date}={})=>ZIP().zip(list.map(x=>({name:x.name,data:x.data})),{date:date||new Date()});

// ---- saved in the project: the «agents» document, key «icons» ({items}) ----
const emptyStore=()=>({schemaVersion:1,items:[]});
function readStore(doc){const s=doc&&doc.icons;if(!s||typeof s!=='object')return emptyStore();return {schemaVersion:1,items:Array.isArray(s.items)?s.items.filter(x=>x&&typeof x==='object'&&Array.isArray(x.concepts)&&x.settings):[]}}
function savedRecord(items,settings,{name,uses,by,at}={}){return {id:'icone-'+(slug(name)||'set'),at:at||new Date().toISOString(),by:clean(by).slice(0,80),name:clean(name).slice(0,80),
 uses:(uses||[]).filter(u=>USES.some(x=>x.id===u)),concepts:(items||[]).slice(0,MAX_CONCEPTS).map(x=>({label:clean(x.label).slice(0,MAX_LABEL),icon:x.icon&&has(x.icon)?x.icon:''})),settings:settingsOf(settings)}}
async function saveStore(ws,projectId,patch){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');const doc=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await doc.load())||{},next=patch(readStore(cur));
  try{await doc.save({...cur,schemaVersion:1,conversations:cur.conversations||{},icons:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
const withRecord=rec=>s=>({...s,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)});

// The mascot: shown, never generated here.
const MASCOT=Object.freeze({state:'da collegare',title:'Mascotte e model sheet',line:'Il personaggio della marca con le sue pose (model sheet) richiede la generazione di immagini a pagamento: in RADIX non è ancora collegata. Nessuna chiamata parte da qui.'});

return Object.freeze({MAX_CONCEPTS,MAX_LABEL,MAX_SAVED,PNG_SIZES,GRIDS,TABLE,NAMES,BASICS,SECTORS,USES,SHAPES,CORNERS,STYLES,MASCOT,FALLBACK,
 fold,words,stem,slug,has,wordsOf,labelOf,findIcons,mapConcept,parseConcepts,searchCatalogue,textOfProject,suggestConcepts,styleOf,advised,
 hex,mix,contrast,kitPalette,colorsFrom,settingsOf,proposalSettings,strokeAt,glyph,iconSvg,spriteSvg,sheetSvg,setOf,detailOf,checks,blocking,
 readme,exampleHtml,files,bundle,zipName,brandName,emptyStore,readStore,savedRecord,saveStore,withRecord});
});
