// Fake data only (DATI DI ESEMPIO): the made-up bakery «Forno Aurora» as the person would fill the studio «Media kit e
// cartella stampa». People, numbers, awards, outlets and journalists are invented for the tests and the sample, and use
// example.com / example.org addresses: none of them is real.
const ANSWERS={
 about:'Forno Aurora è un panificio artigianale nel quartiere San Salvario di Torino. Impasta ogni giorno pane a lievito madre, focacce e dolci da forno con farine di mulini piemontesi, per le famiglie del quartiere e per bar e ristoranti della zona.',
 story:'Nasce nel 1987 dalla bottega di Giovanni Ferraris; oggi la guidano la figlia Lucia e il nipote Marco, che hanno aggiunto la pasticceria e le colazioni.',
 founded:'1987',place:'Via Nizza 12, 10125 Torino',sector:'Panificio e pasticceria artigianale',social:'instagram.com/fornoaurora.esempio',
 people:[{name:'Lucia Ferraris',role:'Titolare e panificatrice',bio:'Guida il forno dal 2009 e segue gli impasti a lievito madre.'},{name:'Marco Ferraris',role:'Pasticciere',bio:'Ha aperto il laboratorio di pasticceria nel 2019.'}],
 numbers:[{value:'1987',label:'l’anno in cui apre la bottega'},{value:'48 ore',label:'di lievitazione per la pagnotta di casa'},{value:'3',label:'generazioni della stessa famiglia'}],
 offer:[{title:'Pane a lievito madre',text:'Pagnotte, filoni e pane di segale, sfornati due volte al giorno.'},{title:'Pasticceria da forno',text:'Torte, crostate e biscotti, anche su ordinazione per le feste.'},{title:'Colazioni',text:'Brioche e caffè al banco dalle 7.'}],
 awards:[{year:'2024',title:'Bottega dell’anno (premio di esempio)',by:'Guida immaginaria dei forni del Piemonte'}],
 boiler:'Forno Aurora è un panificio artigianale di Torino, aperto nel 1987 in via Nizza. Produce ogni giorno pane a lievito madre, focacce e dolci da forno con farine piemontesi. È guidato da Lucia e Marco Ferraris.',
 press:{name:'Anna Bianchi',role:'Ufficio stampa',email:'stampa@fornoaurora.example.com',phone:'011 555 1234'},
 event:{name:'Open day del lievito madre',when:'8 novembre 2026',hours:'10:00–18:00',place:'Forno Aurora',address:'Via Nizza 12, Torino',what:'Laboratorio aperto: si impasta con i panettieri e si assaggia il pane appena sfornato.',program:'10:00 apertura\n11:30 impasto con Lucia\n16:00 merenda per i bambini',accredit:'Accrediti stampa entro il 5 novembre a stampa@fornoaurora.example.com'}};
const CONTACTS_CSV=['Nome;Testata;Email;Tema;Ultimo contatto','Paola Esempio;Gazzetta di Esempio;paola@gazzetta.example.com;Cibo e locali;03/10/2026',
 'Luca Prova;Radio Prova FM;luca.prova@radio.example.org;Cronaca cittadina;2026-09-12','Sara Demo;Rivista Demo Gusto;sara@demo.example.com;Pane e pasticceria;',
 'Senza Mail;Blog Finto;non-una-email;Ricette;','paola@gazzetta.example.com;;;;'].join('\r\n');
const CLIPS=[{id:'c1',date:'2026-09-20',outlet:'Gazzetta di Esempio',title:'Il forno di via Nizza che impasta da tre generazioni',url:'https://www.gazzetta.example.com/torino/forno-aurora-tre-generazioni',reach:'12.000 copie (dato della testata)',kind:'carta'},
 {id:'c2',date:'2026-10-05',outlet:'Radio Prova FM',title:'Intervista a Lucia Ferraris sul lievito madre',url:'',reach:'',kind:'radio'}];
module.exports={ANSWERS,CONTACTS_CSV,CLIPS};
