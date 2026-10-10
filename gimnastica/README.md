# NotesGim — notes de gimnàstica artística

Programa per entrar les notes d'una competició de gimnàstica artística i treure les
classificacions **individual**, **per aparells** i **per equips** al moment.
**Funciona sense internet**: és un sol fitxer (`index.html`), sense instal·lar res.

## Com aconseguir-lo

**A l'ordinador de la taula (recomanat): el programa `NotesGim.exe`.** Obre'l amb doble clic: s'obre
en una finestra pròpia, com qualsevol programa, i funciona sense internet. Les dades es guarden a
*Documents\NotesGim\notesgim-dades.json* (amb còpies automàtiques) i les tutores hi poden entrar
les notes des del mòbil. Si ja hi ha un `notesgim-dades.json` al costat del programa (per exemple en
un USB), fa servir aquell. Si el tornes a obrir mentre ja està obert (encara que sigui fent doble
clic dues vegades seguides), no s'engega un altre programa: s'obre una altra finestra del mateix, amb
les mateixes dades. Només la finestra que has obert o fet servir l'última pot canviar les dades: l'altra
queda en pausa (no desa res, però hi continuen arribant les notes de les tutores) fins que hi cliques
«Treballa en aquesta finestra»; abans de deixar-ho, la que manava desa el que tenia (una nota a mig
escriure, com «8,», no: quan hi tornes, la trobes tal com l'havies deixada i hi continues escrivint). Si tanques la que
manava, l'altra continua sola. Pots tancar la que no facis servir. Quan tanques la finestra, el
programa es tanca sol al cap d'una estona (o amb el botó «Tanca NotesGim»). Si un dia no pot escriure al fitxer
(disc ple, un USB que s'ha tret), ho diu a dalt de la finestra i ho torna a provar sol; si el fitxer
s'hagués malmès (p. ex. per un tall de llum), obre sol la còpia de seguretat més nova.
Les dades de les versions de proves d'abans no es fan servir: la primera vegada, el programa les
guarda apart (*notesgim-dades-proves-…json*, a la mateixa carpeta; es poden recuperar amb «Restaura
una còpia…») i comença de zero.

**Al mòbil o la tauleta: l'app instal·lada.** Obre l'adreça de l'opció B amb Chrome (Android) o
Safari (iPhone/iPad) i instal·la-la (*Configuració → Instal·la NotesGim* explica els passos de cada
aparell; a l'ordinador, *Configuració* també mostra un codi QR per obrir-la al mòbil). Funciona
sense internet i es posa al dia sola. A l'iPhone, instal·la-la abans d'entrar-hi dades: el que
s'escriu a Safari no passa a l'app instal·lada.

**Opció A — fitxer.** Descarrega `index.html`, posa'l en una carpeta fixa
(per exemple *Documents/NotesGim*) i obre'l amb doble clic. S'obre al navegador i ja està.
Recomanat: Chrome o Edge. Obre'l sempre **des del mateix lloc i amb el mateix navegador**,
perquè les dades es guarden al navegador d'aquell ordinador.

**Opció B — instal·lat com una app.** Quan aquesta carpeta és a la branca `main`, es publica a
`https://enricmarin48-alt.github.io/nus/gimnastica/`. Obre-la amb Chrome o Edge i clica la icona
d'«Instal·la» de la barra d'adreces: queda com un programa més, amb icona, i funciona sense
internet.

## Com es fa servir

1. **Gimnastes**: la manera més ràpida és **📥 Fulls d'inscripció dels clubs**: tria (o arrossega a la
   finestra) els fitxers d'Excel d'inscripció que envien els clubs, tal com te'ls passen (el model del
   Consell, nivell A o B, amb les fulles INDIVIDUAL i EQUIPS). L'app en treu l'entitat, el nivell,
   l'entrenador/a i el delegat/da, i cada gimnasta (cognoms, nom i any) amb el seu equip (EQUIP 1, 2,
   3 → «CG Lleida», «CG Lleida 2»…). Les de la fulla INDIVIDUAL queden com a individuals, tal com diu el
   full; si alguna podria formar part d'un equip de la seva entitat, surt l'avís «pot fer equip» (a la
   importació i a Inscripcions). Abans
   d'importar es veu tot i es pot corregir l'entitat, el nivell i si són noies o nois (el full no ho
   diu), i es tria a quina competició s'inscriuen (des d'una competició, *Inscripcions*, ja surt
   triada). **Els equips que diu l'entitat es respecten tal qual** (un de 6 i un de 3 es queden de 6 i
   de 3): a la competició triada cada gimnasta queda a l'equip del full encara que ja hi fos inscrita
   amb un altre equip, i l'app no hi posa ni n'hi treu ningú pel seu compte ni en fa d'«igualats». Les
   altres competicions no es toquen (cada competició té els seus equips; si n'hi ha alguna amb uns altres
   equips, l'avís ho diu). Si una gimnasta ja hi és, se n'actualitzen el grup, l'any i l'equip. Si ja hi és amb el
   mateix nom i cognoms però d'una altra entitat o amb un altre any (ha canviat de club, o l'any estava malament), surt
   «ja hi és (abans a INEF Lleida · any 2013)»: per defecte és la mateixa (la fitxa passa a l'entitat i l'any del full,
   i a la competició no s'inscriu mai dues vegades); si és una altra persona amb el mateix nom, tria «és una altra». Si
   aquella ja és inscrita a la competició pel full de la seva entitat, o ja hi té notes, per defecte és una altra (una
   gimnasta no surt al full de dues entitats per al mateix dia), i una inscripció amb notes mai no canvia d'entitat. Si
   dues entitats porten cadascuna una gimnasta amb el mateix nom, arribin els fulls en l'ordre que arribin, cadascuna té
   la seva fitxa i la seva inscripció, i la de sempre (amb les competicions d'abans) es queda a la seva entitat. El nom
   de l'entitat es posa com el diu el full, amb les sigles en majúscules (INEF, CEIP, AMPA, UE…), i el d'una entitat
   nova es pot canviar abans d'importar; si el full l'escriu d'una altra manera («CLUB GIMNÀSTIC LLEIDA») però gairebé
   totes les gimnastes ja són d'una entitat, es tria aquella i s'avisa. En una **competició que ja ha passat** (p. ex.
   feta en paper i entrada després), les fitxes que ja hi eren no es canvien, però les noves (i les que encara no
   tenien equip) es queden amb l'equip del full, i «Jornada següent» proposa els equips que van dir les entitats; una
   que ja hi era amb una altra entitat o un altre any també passa a dir el que diu el full, llevat que en una competició
   posterior hi sigui amb una altra entitat (l'avís ho diu). També les pots entrar una a una o *Enganxa des
   d'Excel* qualsevol llista (amb la fila de títols: Nom, Cognoms, Entitat, Gènere, Any de naixement,
   Nivell, i si vols Categoria i Equip). Amb l'any de naixement la **categoria es posa sola**. Es
   queden guardades per a totes les competicions.
2. **L'equip és a la fitxa de cada gimnasta** (també es canvia directament a la llista). Per
   defecte és *Automàtic*: en inscriure-les, les d'una mateixa entitat i grup formen equip si n'hi ha
   3 o més (7 o més → dos equips), i l'equip queda a la fitxa per a les jornades següents. També pots
   triar un equip, crear-ne un de nou o posar *Només individual*. *Gimnastes → Equips* els mostra
   tots. Un canvi d'equip a la fitxa, a la llista de gimnastes o a la d'equips també val per a les competicions que
   vénen (encara que tinguin els equips del full de l'entitat: ho has decidit tu); les passades no es toquen, i l'avís
   diu on ha canviat i on no (i per què). Si l'equip ja és ple, abans de desar es diu; des d'una competició (una
   gimnasta nova que en substitueix una altra) es pot triar *Només en aquesta competició*, i la fitxa de l'equip es
   queda com era.
3. **Competicions → Nova competició**: nom, data i lloc. De la segona jornada en endavant proposa
   copiar les gimnastes de l'anterior (amb la categoria i l'equip de la fitxa d'ara). El nom que proposa
   (també amb **Jornada següent**) és el de l'anterior amb el número de la fase o de la jornada un més
   («1a Fase comarcal 2026-2027» → «2a Fase comarcal 2026-2027», «Jornada 3» → «Jornada 4»); l'any i el
   curs no es toquen. Si el nom no té cap número així («Final comarcal»), surt seleccionat per escriure'n
   un altre. A *Inscripcions* hi apuntes les gimnastes (o una entitat sencera) i cadascuna va al seu equip.
4. **Notes**: tria el grup i escriu la nota final de cada aparell; **Intro** baixa a la següent i, al
   final de la columna, passa a l'aparell següent (val coma, punt o apòstrof). Una nota impossible
   (per exemple 835 amb el màxim de 20) no es desa: proposa «Volies dir 8,35?». **NP** escrit a la
   casella marca la gimnasta com a no presentada. *Dorsal o nom…* hi va directament. Al mòbil o la
   tauleta, **Entrada ràpida**: una gimnasta cada vegada amb un teclat gran, i passa sola a la
   següent sense nota. A dalt del teclat hi diu sempre l'aparell on va la nota (i quantes en porta),
   també a l'ordinador; en un portàtil o una tauleta girada, el teclat surt al costat de la gimnasta
   i a sobre es veuen els grups i els aparells, i en un mòbil petit tot el teclat, fins a «Següent»,
   hi cap sense baixar. Tot es desa sol. Amb les rotacions fetes, si tries un aparell
   les gimnastes surten en l'ordre del full de jutge (el de pas per aquell aparell, amb una fila a sobre de cada
   rotació): el full es copia de dalt a baix amb Intro. Amb «Totes les notes», per dorsal. Un canvi d'equip el
   mateix dia (des de la graella o *Inscripcions*) només val per a aquella competició; el botó «També a la fitxa»
   el fa fix.
5. **Classificacions**: surten soles (general individual, per aparells, per equips i **podi**
   per a les medalles, amb el desplegable de les gimnastes de cada equip). *Imprimeix / PDF* i
   *Exporta a Excel* treuen els fulls (classificacions, podi, acta de notes, llistat d'inscripcions i
   fulls de jutge en blanc; amb 2 salts, cada salt té la seva columna, «1r salt» i «2n salt», i la
   «Final»; amb les rotacions fetes, cada full de jutge té les gimnastes en l'ordre en què passen per
   aquell aparell, en un bloc per rotació: «2a subdivisió · rotació 1 · Grup 2»). Si encara falten notes, s'avisa abans
   d'imprimir, i cada full de
   classificació diu a dalt **«PROVISIONAL · falten N notes»** (també a cada pàgina); al podi, les
   gimnastes i els equips a qui encara falten notes hi surten marcats. Al mòbil, el total de cada
   classificació es veu sempre, a la dreta, i el lloc, a l'esquerra (les columnes que no hi caben es
   miren fent lliscar la taula; la que hi queda a mitges es tapa sencera, perquè mai es llegeixi una
   xifra tallada).
6. **Rànquing**: suma les jornades del curs (les que marquis), individual i per equips (al mòbil, el
   total també es veu sempre). Si un equip canvia de gimnastes d'una jornada a l'altra, surt l'avís
   (qui entra i qui en surt) al rànquing i a la classificació per equips de la competició, i l'equip
   continua sumant igual. Un equip és el mateix
   encara que li canviïs el nom; un equip que s'esborra i després es torna a fer igual (mateix nom i
   entitat), també. Dos equips que han competit alguna vegada a la mateixa jornada, o que el dia d'una
   jornada existien tots dos (p. ex. un de reanomenat i un de nou amb el nom d'abans), no s'ajunten mai,
   tampoc si aquella jornada es desmarca del rànquing (desmarcar-ne una només en treu la columna; cada
   equip surt amb el nom de l'última jornada del curs on va competir).
   El total de cada fila és sempre la suma de les seves jornades, i el rànquing d'un curs ja acabat no
   canvia quan es passa al curs següent (ni quan després s'esborren equips).

7. **Rotacions i horari** (pestanya de cada competició): vegeu més avall.

A la pantalla d'inici hi ha la competició del dia amb accés directe a Notes, Classificacions, Podi i
Inscripcions. Al mòbil, les seccions són a la barra de baix. El primer dia, amb l'app buida, hi surt
**Com començar** amb aquests passos (Nova competició → Inscripcions amb els fulls dels clubs →
Rotacions i horari → Tutores i Notes → Classificacions i Podi). Mentre una competició no té cap
inscripció, *Inscripcions* (i *Inscriu gimnastes*, si encara no hi ha cap fitxa) ofereix directament
**📥 Fulls d'inscripció dels clubs…**, també al mòbil sense obrir el menú «⋯».

Tot es pot editar o esborrar: fitxes, entitats, equips, competicions, inscripcions, notes,
categories, nivells i aparells. A cada llista (Gimnastes, Equips, Entitats, Competicions i les
Inscripcions d'una competició) hi ha una casella a cada fila: marca les que vulguis, o
**Marca-les totes** (només les que es veuen amb la cerca i els filtres), i **Esborra les marcades**
les esborra d'un cop. A *Entitats*, si canvies el nom d'una entitat, proposa canviar també el dels seus equips que
es diuen com ella; **Fusiona amb…** ajunta dues entitats que són la mateixa i, si vols, també les fitxes repetides
d'una mateixa gimnasta (amb les seves inscripcions: si en una competició totes dues tenen notes, es queden totes dues
i l'avís ho diu; no es perd cap nota). Per començar de nou: *Configuració → Dades → 🗑 Esborra-ho tot…* (tries què:
competicions, gimnastes i equips, entitats i, si vols, la configuració). Abans se'n fa una còpia, i
amb **Desfés** tot torna.

## Rotacions i horari

A la pestanya **Rotacions i horari** de la competició, **Fes les rotacions** fa sola les subdivisions i
els grups, i en calcula l'horari. Després tot es pot canviar.

- **Subdivisions**: cada una competeix sola, amb el seu escalfament general, les seves rotacions i els
  seus premis. Noies i nois sempre van per separat; per defecte, tots els nois junts. Una categoria
  massa gran (més de 3 grups × 15) es parteix per nivells, i les categories amb poques gimnastes
  s'ajunten amb la del costat (com Cadet i Juvenil amb Infantil). **Quines categories van juntes…**
  deixa ajuntar o separar categories, separar els nois, canviar el màxim per grup o triar la
  subdivisió de cada categoria i nivell. L'ordre del dia es canvia amb ↑ ↓. Tot això es recorda per a
  les properes competicions (un dia que una regla no hi fa res, p. ex. perquè d'una categoria només hi
  ha un nivell, no s'oblida), i «Jornada següent» copia les subdivisions.
- **Com es fan els grups** (per ordre d'importància): 1) un equip no se separa mai, i les individuals
  d'una entitat i d'un mateix nivell van juntes; 2) si s'ha dit quantes **entrenadores** porta una
  entitat, les seves gimnastes no van en més grups dels que pot portar; 3) cada categoria i nivell al
  seu grup (o, si es tria «Grups tan igualats com es pugui», s'hi poden barrejar); 4) grups tan
  igualats com es pugui; 5) els equips d'una mateixa entitat, junts. El càlcul és exacte i sempre dona
  el mateix resultat.
- **Moure** un equip: el desplegable de cada equip diu a quin grup va i com quedaran els grups
  («→ Grup 3 · Terra (6 → 12)»). Queda fixat (📌): «Reequilibra» no el mourà. **Reequilibra** torna a
  repartir la resta movent el mínim de gimnastes, i abans d'aplicar-ho ensenya què es mourà. «comença
  a» canvia l'aparell on comença cada grup. Res no es mou sol: una inscripció nova surt marcada
  «NOU» amb el seu equip o la seva entitat fins que es desa, i si es canvia l'equip d'una gimnasta (a
  Inscripcions, a la seva fitxa, a la llista d'equips o amb un full d'inscripció) es queda on era i
  l'avís ho diu («Mou-la amb l'equip», o «Mou-lo» si és un noi; a la pestanya, «Ajunta-les», o
  «Ajunta'ls» si són nois). Si se li corregeix el nivell o la categoria i
  passa a una altra subdivisió, no surt com a nova: es diu d'on a on ha passat, amb l'hora («Gina Jové Gil ha passat
  de la 2a subdivisió (9:25) a la 3a (10:25)»), també en desar la inscripció o la fitxa.
- **Aparells i ordre…**: l'ordre de les rotacions per a noies i nois, i els aparells que es fan «tots
  junts al final». Als nois, **＋ Afegeix la barra fixa** la posa com al model del Consell.
- **Horari**: comença a les 8:30, amb 30 minuts d'escalfament general abans de cada subdivisió.
  Durada = rotacions × (3′ d'escalfament per aparell + el grup més llarg × temps per gimnasta) i, si
  n'hi ha, els aparells tots junts al final; arrodonit als 5 minuts. Temps per gimnasta i aparell:
  1′28″ fins a Aleví i 1′48″ d'Infantil amunt (noies), i 1′ i 1′30″ d'escalfament (nois). Premis: 5′
  per cada 3 categories i nivells. Es pot fixar la durada, els premis o l'hora d'inici de cada
  subdivisió, afegir exhibicions o pauses, i canviar els temps i les observacions. Amb les dades del
  18/04/2026, surt l'horari del model (de 8:00 a 15:00).
- **Imprimeix**: un full A4 per subdivisió (amb l'aparell, la categoria, el grup, i gimnasta, entitat
  i nivell de cadascuna, i l'ordre de rotació) i l'horari general, com els models. L'ordre de cada grup al full
  (per categoria i nivell, entitat, primer els equips i després les individuals, i per dorsal) és l'ordre en què
  passen per cada aparell: el mateix que segueixen el mòbil de les tutores i els fulls de jutge. Si es canvien les
  rotacions després d'imprimir-les, o l'ordre de les gimnastes d'un grup (p. ex. en renumerar els dorsals), l'app ho
  avisa; i si l'horari imprès ja no és el d'ara (una NP que escurça una subdivisió, una durada, una exhibició…), ho diu
  a les dues pestanyes amb les hores d'abans i les d'ara («4a subdivisió 11:25 – 12:40 → 11:25 – 12:35»).
- **Renumera dorsals** (pestanya Inscripcions): amb les rotacions fetes, numera en l'ordre en què competeixen
  (subdivisió, grup, l'ordre del full i cognoms); si no, per categoria i nivell, i a cada grup per entitat, equip (les
  individuals al final) i cognoms.

## Categories

Per anys de naixement, iguals per a noies i nois (curs 2026-2027): Prebenjamí 2019-2020,
Benjamí 2017-2018, Aleví 2015-2016, Infantil 2013-2014, Cadet 2011-2012, Juvenil 2009-2010,
Sènior 2008 i abans. A *Configuració → Categories* es poden canviar els noms i els anys, i cada
estiu el botó **Passa al curs següent (+1 any)** ho avança tot i actualitza la categoria de
cada gimnasta que té l'any de naixement (de les que no en tenen, avisa perquè es revisin a mà). Les competicions ja fetes conserven la categoria d'aquell dia.

- Abans de canviar res, diu qui canvia de categoria, quins equips es desfan (hi quedarien menys del
  mínim; també els que va dir l'entitat al full d'inscripció, i qui s'hi quedaria), qui es quedaria sense
  equip (també les que canvien de categoria, si la seva entitat ja ha dit els seus equips al full: van
  com a individuals), els equips nous i a quines competicions que vénen canvien inscripcions i equips. Es
  pot triar *Actualitza-les* o *Només els anys de les categories*. Tot plegat és un sol canvi: el
  **Desfés** de l'avís ho torna tot com era.
- Si sembla un clic sense voler, primer pregunta si de debò es vol passar al curs següent ara (amb el
  botó en vermell): quan el curs ja ha començat (ja se n'ha fet alguna competició) i encara en queden per
  fer o no és estiu, o quan ja s'ha passat al curs següent per a aquest curs. Al setembre, abans de la
  primera competició del curs nou, no pregunta res de més.
- **Desfés un curs (−1)** just després del +1, sense cap altre canvi entremig (les notes que arriben no
  compten), ho deixa tot exactament com era abans del +1: categories, gimnastes i equips (també els que
  havia dit l'entitat al full). També si mentrestant s'ha tancat i tornat a obrir NotesGim, o des d'una
  altra finestra del mateix ordinador. Si després s'ha canviat alguna cosa (o el +1 es va fer en un altre
  ordinador), ho avisa abans: diu quins equips del full no tornaran a ser com eren i a quines
  competicions es tornen a fer els equips.
- A *Gimnastes* (i a *Configuració → Categories*), si alguna gimnasta no té la categoria que li toca per
  l'any, **Posa a tothom la categoria que li toca** pregunta sempre abans (amb qui canvia, quins equips
  es desfan i qui es quedaria sense equip) i l'avís diu quins equips han canviat i qui s'ha quedat sense
  equip.

## Regles que aplica

Per defecte, les de la normativa UCEC de gimnàstica artística dels JEEC:

- Cada **categoria + gènere + nivell** té les seves classificacions.
- Nivells **A** i **B**.
- **Noies**: salt, barra i terra. **Nois**: salt, terra i minitramp (**2 salts, compta el
  millor**). Es pot canviar per aparell (que compti, que tingui classificació a part o que no es
  faci) a la configuració.
- Nota mínima de **3 punts** per a qui fa l'exercici (un 0 vol dir que no l'ha fet).
- **General individual** = suma dels aparells que compten.
- Nota màxima configurable (20 per defecte): una de més alta no es deixa entrar.
- **Equips** de 3 a 6 gimnastes: a cada aparell només compten les **3 millors notes**; la resta
  surten ratllades. Una entitat amb 7 o més gimnastes en un grup en fa dos equips. Si un equip
  es queda amb menys de 3 perquè algú no es presenta, **s'anul·la** (les gimnastes segueixen
  comptant com a individuals).
- **Empats**: mateixa posició (per exemple, dues segones i la següent és quarta). Es pot triar
  desempatar per la millor nota d'aparell o, si s'entren D i E, com la FIG (primer E, després D).
- **No presentada (NP)**: surt a baix, sense posició, i no suma per a l'equip.
- Configurable per competició: aparells (minitramp o paral·leles com a classificació a part o
  dins la general), 1 o 2 intents (compta la millor, la mitjana o la suma), nota final o
  **D + E − penalització**, nota mínima per a qui fa l'exercici, quantes notes compten per equip.

## Tutores entrant les notes des del mòbil (sense internet)

Amb el programa **NotesGim.exe** (un sol fitxer, no cal instal·lar res; porta l'app a dins):

1. A l'ordinador de la taula, obre `NotesGim.exe`. S'obre l'app en una finestra pròpia. Les dades es
   guarden a *Documents\NotesGim\notesgim-dades.json* i cada 10 minuts es fa una còpia a
   `copies-notesgim/` (*Configuració → Obre la carpeta de les dades*).
   - Windows pot avisar «Windows ha protegit l'ordinador»: *Més informació → Executa igualment*.
   - La primera vegada, el tallafoc pregunta si el deixes accedir a la xarxa: digues que **sí**
     (xarxes privades).
2. A la competició: *Configuració → Tutores* → marca «Permet que les tutores entrin notes». Surt
   un **codi QR**, el codi numèric i l'adreça (per exemple `http://192.168.1.23:8080`). També es
   pot imprimir un full per a les tutores amb el QR i les instruccions.
3. Les tutores connecten el mòbil a **la mateixa Wi-Fi** que l'ordinador i **escanegen el QR** (entren
   directament, sense escriure res). Trien el seu aparell i entren la nota final de cada gimnasta
   amb un teclat gran (o en llista). Amb les rotacions fetes, després de l'aparell trien la **subdivisió** (surt
   triada la primera on encara falten notes del seu aparell) i les gimnastes surten en l'ordre en què passen per
   l'aparell, com al full de rotacions: la rotació 1 (el grup que hi comença), la 2…, i la categoria canvia sola (a
   cada gimnasta hi diu la seva categoria i nivell). En acabar una subdivisió, «Passa a la 3a subdivisió». «Per
   categoria» torna a la manera de sempre (un grup per categoria i nivell, per dorsal), al grup de la gimnasta que
   puntuava i amb ella a la pantalla. **No cal internet**: n'hi ha
   prou amb una Wi-Fi qualsevol (la del pavelló, un router sense internet o la zona Wi-Fi d'un mòbil encara que no
   tingui dades).
4. A l'ordinador les notes surten al moment amb fons groc (per revisar) i les classificacions
   s'actualitzen soles. Les podeu canviar quan vulgueu; una nota que la taula ja ha posat o revisat,
   la tutora ja no la pot canviar. Si un mòbil perd la connexió, les notes es guarden al mòbil i
   s'envien soles quan torna (a dalt surt «⚠ Sense connexió · 1 nota al mòbil · No tanquis la pàgina»).

Quan la competició es tanca («🔒 Bloqueja les notes»), les tutores ja no poden entrar notes: el mòbil
diu que la taula les ha bloquejat i, si la taula les torna a obrir, hi torna a entrar sol (amb les
notes que s'hi haguessin quedat). Sense el programa servidor, l'app funciona igual que sempre (només
a l'ordinador).

On es descarrega: a la pàgina *Releases* del repositori (etiqueta `notesgim-servidor`), que es
torna a generar sola cada cop que hi ha canvis a `main`. També es pot compilar amb
`sh servidor/build.sh` (cal Go).

## Dades i còpies de seguretat

Les dades es desen soles al navegador a cada canvi. A *Configuració → Dades*:

- **Crea un fitxer de dades nou…** / **Fes servir un fitxer de dades que ja tinc…** (Chrome/Edge):
  cada canvi s'escriu també en aquest fitxer `.json` (si ja té dades, pregunta abans de tocar res).
- **Descarrega còpia de seguretat** / **Restaura una còpia**: per passar les dades a un altre
  ordinador o guardar-les en un USB. L'app avisa si fa dies que no en fas cap.

## Per a qui hi toqui

- `index.html` — tota l'app. El càlcul de notes i classificacions és el bloc entre
  `ENGINE-START` i `ENGINE-END` (sense DOM; treballa en mil·lèsimes enteres).
- `sw.js` + `manifest.webmanifest` + `icons/` — només per a l'opció B (instal·lable). La publicació
  a GitHub Pages hi posa sola la versió (el commit); si la publiques a mà, puja `VERSION` a `sw.js`.
- `tests/engine.test.mjs` i `tests/rotacions.test.mjs` — `node --test tests/*.test.mjs` (sense dependències). Les
  rotacions es proven amb les dades reals del 18/04/2026 i comparant el repartiment amb provar-ho tot.
- `tests/e2e-rotacions.mjs` — la pestanya Rotacions i horari sencera (amb `tests/fixture-rotacions.mjs`):
  fer-les, moure, reequilibrar, entrenadores, barra fixa, horari, fulls en PDF, bloqueig i mòbil.
- `tests/e2e.mjs` — `node tests/e2e.mjs` prova l'app sencera en un Chromium obrint-la des del
  disc (cal Playwright). Deixa captures, un PDF i un `.xlsx` a `tests/out/`.
- `tests/e2e-fitxer.mjs` — prova el fitxer vinculat: si un altre ordinador l'ha canviat, no s'hi
  escriu sense preguntar.
- `tests/fixtures/` — fulls d'inscripció d'exemple (model del Consell, nivell A i B, un de buit, i els de la setena
  revisió: una gimnasta que ha canviat d'entitat, anys corregits, una entitat amb sigles, una escrita d'una altra manera i
  una entitat amb gimnastes que es diuen com les d'una altra).
- `tests/e2e-revisio.mjs` — casos concrets que havien fallat: fitxa sense nivell, «Nivell A» a
  l'Excel, ajuntar nivells, equips amb el mateix nom, canvis d'equip del mateix dia, D + E, «Grup
  següent», la mida de pantalla de les tauletes, el que es veu al portàtil i al mòbil (entrada ràpida,
  totals i xifres a mitges, grup, pastilles dels aparells a 320 px, categories) i als fulls amb notes
  que falten, i una temporada sencera (la mateixa gimnasta en una altra
  entitat o amb un altre any, dues gimnastes amb el mateix nom a dues entitats, fusionar entitats, sigles, un equip ple
  i una competició passada entrada després).
- `tests/e2e-pwa.mjs` — l'app instal·lable com a GitHub Pages (https): sense internet, posar-se al
  dia sola i que el joc NUS del mateix lloc no li desi versions velles (cal openssl).
- `servidor/` — el programa per a l'ordinador i les tutores (Go, sense dependències). `go test` dins
  la carpeta (després de `sh build.sh` o de copiar `index.html` i `icons/` a `servidor/web/`), i
  `node tests/e2e-servidor.mjs` prova la taula i un mòbil de tutora alhora, també tallant la
  connexió i amb dues finestres de la taula (només una pot canviar les dades).
