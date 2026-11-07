'use strict';
/* Fake data and fake AI replies for the agency-grade Studio Testi services (lib/copy-studio.js: comunicato, persona,
   concorrenza, sequenze, tono, influencer, sms). Used by tests/copy-studio-agency.test.js and by the browser check
   that stubs /api/chat: nothing here is ever sent to a real model. «Forno Rossi» is an invented bakery. */
const PROJECT={name:'Forno Rossi',kind:'Panificio',audience:'Famiglie e uffici di Torino',voice:'Caldo e diretto',summary:'Forno artigianale a Torino: pane a lievito madre e dolci'};
const OFFER='Forno artigianale a Torino: pane a lievito madre e dolci';
const AUDIENCE='Famiglie del quartiere e uffici della zona';

// The values typed in each service's fields.
const VALUES={
 comunicato:{news:'Sabato 8 novembre Forno Rossi apre il secondo forno a Torino, in via Po 12',when:'Torino, 3 novembre 2026',
  facts:'Il forno nasce nel 1987 in borgo San Paolo. Il nuovo punto vendita ha 6 dipendenti, 4 assunti per l’apertura. Aperto dalle 7 alle 19.',
  people:'Mario Rossi, titolare — il pane fatto come una volta, ma più vicino ai clienti',offer:OFFER,press:'Anna Bianchi, 333 1234567, stampa@fornorossi.it'},
 persona:{offer:OFFER,best:'Impiegati degli uffici di via Roma che comprano la pausa pranzo; famiglie del quartiere che ordinano la torta della domenica; due bar della zona che prendono 20 kg di pane al giorno.',
  why:'Pane che dura tre giorni, consegna in ufficio entro le 12',objections:'Costa più del supermercato; la domenica chiudiamo alle 13'},
 concorrenza:{offer:OFFER,rivals:'Panificio Verdi — www.panificioverdi.it — prezzi bassi, aperto anche la sera\nBottega del Pane — bottegadelpane.it — molto attivi su Instagram\nSupermercato Centro — reparto pane industriale, aperto fino alle 21',own:'Pane più buono ma orari più corti'},
 sequenze:{offer:OFFER,audience:AUDIENCE,goal:'prenotare una degustazione gratuita su www.fornorossi.it/degustazione',facts:'Ai nuovi iscritti 10% sul primo ordine online con il codice BENVENUTO10'},
 tono:{offer:OFFER,audience:AUDIENCE,samples:'Buongiorno! Oggi in vetrina c’è la focaccia genovese, appena sfornata. Vi aspettiamo in via Roma.',banned:'eccellenza, top'},
 influencer:{product:'La nuova linea di biscotti senza zucchero',goal:'Far provare i biscotti a Torino e far usare il codice sconto',mentions:'@fornorossi #biscottirossi',dates:'Bozza entro il 10/11, pubblicazione il 15/11',offer:OFFER},
 sms:{message:'Sabato 8 novembre apriamo il nuovo forno in via Po 12: assaggi gratis dalle 8 alle 12',sender:'FornoRossi',link:'fornorossi.it/po',optout:'STOP SMS al 339 0000000'}
};

// One fake reply per service: three proposals in the requested marker format. The first is clean; the others carry
// the mistakes the checks must catch (they are listed next to each reply in the tests).
const R={};
R.comunicato=`===PROPOSTA 1===
IDEA: La notizia secca
TITOLO: Forno Rossi apre il secondo forno in via Po a Torino
SOTTOTITOLO: Sabato 8 novembre l’inaugurazione, con 4 nuovi posti di lavoro in centro
LUOGO E DATA: Torino, 3 novembre 2026
ATTACCO:
Sabato 8 novembre Forno Rossi, il forno artigianale nato nel 1987 in borgo San Paolo, apre il secondo punto vendita a Torino, in via Po 12, per portare il pane a lievito madre anche in centro.
CORPO:
Il nuovo forno sarà aperto dalle 7 alle 19 e impiega 6 persone, 4 delle quali assunte per l’apertura.

In vetrina ci saranno il pane a lievito madre e i dolci che i clienti di borgo San Paolo conoscono già.
CITAZIONE:
«Vogliamo fare il pane come una volta, ma più vicino ai nostri clienti» — Mario Rossi, titolare
PROFILO AZIENDALE:
Forno Rossi è un forno artigianale di Torino, nato nel 1987 in borgo San Paolo. Produce pane a lievito madre e dolci.
CONTATTI STAMPA:
Anna Bianchi · 333 1234567 · stampa@fornorossi.it
===PROPOSTA 2===
IDEA: La storia della famiglia
TITOLO: Da borgo San Paolo a via Po: la famiglia Rossi apre il secondo forno
SOTTOTITOLO: Il miglior pane della città arriva in centro
LUOGO E DATA: Torino, 3 novembre 2026
ATTACCO:
La famiglia Rossi fa il pane dal 1987 e sabato 8 novembre apre il secondo forno, in via Po 12 a Torino.
CORPO:
In più di trent’anni il forno ha conquistato oltre 1.200 clienti affezionati.
CITAZIONE:
«Per noi è un sogno che si avvera dopo tanti anni di lavoro» — Giulia Rossi, figlia del fondatore
PROFILO AZIENDALE:
Forno Rossi è un forno artigianale di Torino.
CONTATTI STAMPA:
Anna Bianchi · 333 1234567 · stampa@fornorossi.it
===PROPOSTA 3===
IDEA: Il lavoro in centro
TITOLO: Quattro nuovi posti di lavoro in via Po con il secondo Forno Rossi
LUOGO E DATA: Torino, 3 novembre 2026
ATTACCO:
Sabato 8 novembre in via Po 12 a Torino apre il secondo punto vendita di Forno Rossi, il forno artigianale nato nel 1987 in borgo San Paolo che produce pane a lievito madre e dolci, con 6 dipendenti di cui 4 assunti proprio per questa apertura, un orario continuato dalle 7 alle 19 e la stessa cura di sempre per le farine e per i tempi di lievitazione lunghi.
CORPO:
L’apertura porta in centro un forno di quartiere.
PROFILO AZIENDALE:
Forno Rossi è un forno artigianale di Torino, nato nel 1987.
CONTATTI STAMPA:
Anna Bianchi · 333 1234567 · stampa@fornorossi.it
===FINE===`;

const persona=(n,a,b,c)=>`PERSONA ${n}:
Chi è: ${a} (dal cliente)
Obiettivi: ${b} (ipotesi da verificare)
Problemi: poco tempo nella pausa pranzo (dal cliente)
Obiezioni: costa più del supermercato (dal cliente)
Canali: Google Maps e passaparola in ufficio (ipotesi da verificare)
Messaggio: ${c}`;
R.persona=`===PROPOSTA 1===
IDEA: Per bisogno
${persona(1,'Luca, impiegato degli uffici di via Roma','un pranzo buono e veloce','Il tuo pranzo pronto in 5 minuti, con il pane di oggi.')}
${persona(2,'Elena, mamma del quartiere che ordina la torta della domenica','una torta sicura per la famiglia','La torta della domenica, prenotata il venerdì.')}
${persona(3,'Marco, titolare di un bar della zona','20 kg di pane al giorno sempre puntuale','Il pane per il tuo bar, consegnato prima dell’apertura.')}
PERCORSO:
- Scoperta: Google Maps e passaparola
- Acquisto: banco del forno e consegna in ufficio
DA VERIFICARE:
- Quanti clienti arrivano da Google Maps: chiederlo alla cassa per due settimane
===PROPOSTA 2===
IDEA: Per tipo di cliente
${persona(1,'Uffici della zona','ordini per riunioni','Colazioni per le riunioni, consegnate entro le 12.')}
Età: 30-45 anni
${persona(2,'Famiglie del quartiere','dolci per le feste','I dolci delle feste, fatti qui.')}
Problemi: il 45% compra al supermercato (dal cliente)
===PROPOSTA 3===
IDEA: Per momento d’acquisto
${persona(1,'Chi passa la mattina','pane fresco prima del lavoro','Pane caldo dalle 7.')}
${persona(2,'Chi compra a pranzo','pranzo veloce','Pranzo pronto in via Roma.')}
${persona(3,'Chi ordina per la domenica','torta prenotata','Prenota la torta entro il venerdì.')}
===FINE===`;

R.concorrenza=`===PROPOSTA 1===
IDEA: Lettura difensiva
ASSI DELLA MAPPA:
Asse orizzontale: prezzo, da basso ad alto
Asse verticale: artigianalità, da industriale ad artigianale
Panificio Verdi: prezzo basso, artigianalità media (dal cliente: prezzi bassi; artigianalità ipotesi da verificare)
Bottega del Pane: prezzo medio, artigianalità alta (ipotesi da verificare)
Supermercato Centro: prezzo basso, industriale (dal cliente)
Forno Rossi: prezzo alto, artigianalità alta (dal cliente)
CONFRONTO:
| Concorrente | Punti di forza | Punti deboli | Fonte |
|---|---|---|---|
| Panificio Verdi | prezzi bassi, aperto anche la sera | qualità del pane da verificare | dal cliente |
| Bottega del Pane | molto attivi su Instagram | prezzi e orari non noti | dal cliente; il resto ipotesi da verificare |
| Supermercato Centro | aperto fino alle 21 | pane industriale | dal cliente |
OPPORTUNITÀ:
- Raccontare il lievito madre su Instagram, dove Bottega del Pane è già forte
- Un orario serale il venerdì per rispondere a Panificio Verdi
DA VERIFICARE:
- I prezzi di Panificio Verdi su www.panificioverdi.it
===PROPOSTA 2===
IDEA: Lettura d’attacco
ASSI DELLA MAPPA:
Asse orizzontale: comodità
Asse verticale: qualità
Panificio Verdi: comodo, qualità media
CONFRONTO:
- Panificio Verdi | prezzi bassi | 4,2 stelle su Google | ipotesi
- Bottega del Pane | Instagram con 12.000 follower (vedi www.bottega-pane.com) | nessuno
OPPORTUNITÀ:
- Prendere i clienti serali di Panificio Verdi
===PROPOSTA 3===
IDEA: Lettura di nicchia
ASSI DELLA MAPPA:
Asse orizzontale: servizio alle aziende, da nessuno a completo (ipotesi da verificare)
Asse verticale: prodotto, da industriale ad artigianale (ipotesi da verificare)
CONFRONTO:
- Panificio Verdi | aperto la sera | nessun servizio per uffici noto | ipotesi da verificare
- Bottega del Pane | Instagram | consegne non note | ipotesi da verificare
- Supermercato Centro | orari lunghi | pane industriale | dal cliente
OPPORTUNITÀ:
- Consegne in ufficio la mattina: nessun concorrente noto lo fa
===FINE===`;

const email=(n,day,subj,pre,body,cta)=>`### Email ${n} · Giorno ${day}\nScopo: ${['accogliere','far provare','chiedere la prenotazione'][n-1]||'ricordare'}\nOggetto: ${subj}\nAnteprima: ${pre}\nTesto:\n${body}\nInvito: ${cta}`;
R.sequenze=`===PROPOSTA 1===
IDEA: Benvenuto caldo
STRATEGIA:
Tre email in una settimana per chi si è appena iscritto: benvenuto, storia del forno, invito alla degustazione.
SEQUENZA:
${email(1,0,'{{nome|Ciao}}, benvenuto da Forno Rossi','Il pane a lievito madre di Torino, da oggi anche nella tua casella','Ciao {{nome|}},\ngrazie per esserti iscritto. Ogni settimana ti raccontiamo cosa sforniamo.\nPer il primo ordine online usa il codice BENVENUTO10: hai il 10% di sconto.','Scopri il forno')}
${email(2,3,'Come nasce il nostro pane','48 ore di lievitazione: te le raccontiamo','{{nome|Ciao}}, il nostro pane riposa a lungo prima di andare in forno.\nPassa a trovarci in {{città|negozio}}.','Leggi la storia')}
${email(3,7,'Ti aspettiamo per una degustazione gratuita','Prenota il tuo posto: è gratis','{{nome|Ciao}}, vieni ad assaggiare il pane e i dolci: la degustazione è gratuita.','Prenota la degustazione')}
USCITA:
- Esce chi prenota la degustazione
- Esce chi si disiscrive
METRICHE:
- Aperture e clic di ogni email
- Prenotazioni della degustazione
===PROPOSTA 2===
IDEA: Diretta all’offerta
SEQUENZA:
${email(1,0,'[Nome], il tuo sconto del 10% sul primo ordine online ti aspetta da Forno Rossi','Codice BENVENUTO10','Ciao {{first_name}}, ecco il tuo codice.','Usa il codice')}
### Email 2 · Giorno 2
Oggetto: Ultimi giorni per il tuo sconto del 20%
Testo:
Lo sconto scade presto.
===PROPOSTA 3===
IDEA: Racconto in tre tappe
SEQUENZA:
${email(1,0,'Benvenuto nel forno di borgo San Paolo','La nostra storia di famiglia','{{nome|Ciao}}, siamo un forno di famiglia.','Conosci il forno')}
${email(2,2,'Il lievito madre spiegato bene','Perché il nostro pane dura tre giorni','Il segreto è il tempo.','Scopri il pane')}
${email(3,5,'{{nome|Ciao}}, ti offriamo un assaggio','Degustazione gratuita su prenotazione','Vieni a trovarci: la degustazione è gratuita.','Prenota ora')}
===FINE===`;

const channel=(reg,yes,no,ex)=>`Registro: ${reg}\nSì: ${yes}\nNo: ${no}\nEsempio: ${ex}`;
R.tono=`===PROPOSTA 1===
IDEA: Il fornaio di fiducia
TRATTI:
- Caldo: è accogliente / non è sdolcinato
- Concreto: è preciso sul prodotto / non è tecnico per forza
- Di quartiere: è vicino / non è provinciale
SITO:
${channel('del tu, frasi complete','raccontare come lavoriamo','frasi fatte','Facciamo il pane a lievito madre, come in borgo San Paolo dal 1987.')}
LINKEDIN:
${channel('del tu ma professionale, 3-5 righe','parlare delle consegne agli uffici','emoji','Portiamo il pane fresco negli uffici di via Roma entro le 12.')}
INSTAGRAM:
${channel('del tu, brevissimo, emoji con misura','foto del banco e del lievito','testi lunghi','Appena sfornata: la focaccia di oggi ti aspetta in via Roma.')}
EMAIL:
${channel('del tu, personale','iniziare con il nome','oggetti urlati','Ciao Luca, questa settimana in vetrina c’è la torta di nocciole.')}
WHATSAPP:
${channel('del tu, una riga','conferme e promemoria','promozioni non richieste','La tua torta è pronta: ti aspettiamo fino alle 19.')}
PAROLE SÌ:
- lievito madre
- appena sfornato
PAROLE NO:
- eccellenza → buono, fatto bene
- top → il nostro preferito
===PROPOSTA 2===
IDEA: L’artigiano preciso
TRATTI:
- Tecnico: spiega le farine
SITO:
${channel('del tu','spiegare le farine','gergo','Un’eccellenza del pane torinese.')}
LINKEDIN:
Registro: professionale
Esempio: Il nostro forno lavora per gli uffici.
INSTAGRAM:
${channel('breve','foto','testi lunghi','Pane top, solo oggi.')}
EMAIL:
${channel('personale','nome','urlare','Ciao, ecco le novità.')}
===PROPOSTA 3===
IDEA: Il vicino di casa
TRATTI:
- Simpatico: è ironico / non è sarcastico
- Semplice: è chiaro / non è banale
- Presente: è puntuale / non è invadente
SITO:
${channel('del tu','storie del quartiere','numeri inventati','Siamo il forno sotto casa: pane buono, ogni mattina.')}
LINKEDIN:
${channel('del tu','consegne agli uffici','slogan','Colazioni per le riunioni, consegnate in tempo.')}
INSTAGRAM:
${channel('del tu','dietro le quinte','hashtag a raffica','Ore 6: il lievito madre si sveglia prima di noi.')}
EMAIL:
${channel('del tu','una novità per email','allegati','Ciao, la torta della domenica si prenota il venerdì.')}
WHATSAPP:
${channel('del tu','risposte veloci','vocali lunghi','Ciao! Il pane è pronto, passa quando vuoi.')}
===FINE===`;

R.influencer=`===PROPOSTA 1===
IDEA: La colazione senza zucchero
OBIETTIVO:
Far provare i nuovi biscotti senza zucchero a chi vive a Torino e far usare il codice sconto.
CONSEGNE:
- 1 reel da 30-45 secondi con la colazione
- 3 stories con il codice sconto
MENZIONI OBBLIGATORIE:
- @fornorossi
- #biscottirossi
- «Pubblicità» oppure #adv nella prima riga
TRASPARENZA:
Scrivi «Pubblicità» o #adv all’inizio della didascalia e dillo nei primi secondi del video: non in mezzo agli hashtag.
DA FARE:
- Mostrare il biscotto spezzato
- Dire che sono senza zucchero aggiunto solo se è scritto in etichetta
DA NON FARE:
- Promettere effetti sulla salute
- Nascondere la dicitura
TEMPI:
- Bozza entro il 10/11
- Pubblicazione il 15/11
KPI:
- Visualizzazioni del reel
- Usi del codice sconto
DIRITTI DI UTILIZZO:
Solo sui profili del creator, senza uso nelle pubblicità di Forno Rossi.
===PROPOSTA 2===
IDEA: Il test dei bambini
OBIETTIVO:
Far assaggiare i biscotti ai bambini.
CONSEGNE:
- 2 reel
MENZIONI OBBLIGATORIE:
- #biscottirossi
TRASPARENZA:
Ringrazia il forno alla fine del video.
KPI:
- Almeno 5.000 visualizzazioni
===PROPOSTA 3===
IDEA: La pausa in ufficio
OBIETTIVO:
Raccontare i biscotti come pausa in ufficio.
CONSEGNE:
- 1 carosello con 5 foto
MENZIONI OBBLIGATORIE:
- @fornorossi
- #biscottirossi
- #adv
TRASPARENZA:
#adv nella prima riga della didascalia.
TEMPI:
- Pubblicazione il 15/11
KPI:
- Salvataggi del carosello
DIRITTI DI UTILIZZO:
Solo organico.
===FINE===`;

R.sms=`===PROPOSTA 1===
IDEA: Diretto all'evento
MITTENTE: FornoRossi
SMS:
Forno Rossi: sabato 8 novembre apriamo in via Po 12! Assaggi gratis dalle 8 alle 12. Ti aspettiamo: fornorossi.it/po STOP SMS al 339 0000000
PERCHÉ: Data, luogo e invito in un solo messaggio.
===PROPOSTA 2===
IDEA: Tono caldo
MITTENTE: FornoRossi
SMS:
È arrivato il giorno: sabato 8 novembre apriamo il nuovo forno in via Po 12. Vieni all’assaggio gratis dalle 8 alle 12! fornorossi.it/po STOP SMS al 339 0000000
PERCHÉ: Un attacco emotivo.
===PROPOSTA 3===
IDEA: Con tutti i dettagli
MITTENTE: Forno Rossi Torino
SMS:
Ciao! Forno Rossi apre il secondo forno a Torino: sabato 8 novembre in via Po 12, assaggi gratis di pane a lievito madre e dolci dalle 8 alle 12, e per i primi 50 clienti un regalo. Ti aspettiamo! fornorossi.it/po STOP SMS al 339 0000000
PERCHÉ: Tutte le informazioni.
===FINE===`;

module.exports={PROJECT,VALUES,REPLIES:R};
