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
les mateixes dades (pots tancar la que no facis servir). Quan tanques la finestra, el programa es
tanca sol al cap d'una estona (o amb el botó «Tanca NotesGim»). Si un dia no pot escriure al fitxer
(disc ple, un USB que s'ha tret), ho diu a dalt de la finestra i ho torna a provar sol; si el fitxer
s'hagués malmès (p. ex. per un tall de llum), obre sol la còpia de seguretat més nova.

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

1. **Gimnastes**: entra-les una a una o *Enganxa des d'Excel* (copia les cel·les amb la fila de
   títols: Nom, Cognoms, Entitat, Gènere, Any de naixement, Nivell, i si vols Categoria i Equip).
   Amb l'any de naixement la **categoria es posa sola**. Es queden guardades per a totes les
   competicions.
2. **L'equip és a la fitxa de cada gimnasta** (també es canvia directament a la llista). Per
   defecte és *Automàtic*: en inscriure-les, les d'una mateixa entitat i grup formen equip si n'hi ha
   3 o més (7 o més → dos equips), i l'equip queda a la fitxa per a les jornades següents. També pots
   triar un equip, crear-ne un de nou o posar *Només individual*. *Gimnastes → Equips* els mostra
   tots.
3. **Competicions → Nova competició**: nom, data i lloc. De la segona jornada en endavant proposa
   copiar les gimnastes de l'anterior (amb la categoria i l'equip de la fitxa d'ara). A
   *Inscripcions* hi apuntes les gimnastes (o una entitat sencera) i cadascuna va al seu equip.
4. **Notes**: tria el grup i escriu la nota final de cada aparell; **Intro** baixa a la següent i, al
   final de la columna, passa a l'aparell següent (val coma, punt o apòstrof). Una nota impossible
   (per exemple 835 amb el màxim de 20) no es desa: proposa «Volies dir 8,35?». **NP** escrit a la
   casella marca la gimnasta com a no presentada. *Dorsal o nom…* hi va directament. Al mòbil o la
   tauleta, **Entrada ràpida**: una gimnasta cada vegada amb un teclat gran, i passa sola a la
   següent sense nota. Tot es desa sol. Un canvi d'equip el mateix dia (des de la graella o
   *Inscripcions*) només val per a aquella competició; el botó «També a la fitxa» el fa fix.
5. **Classificacions**: surten soles (general individual, per aparells, per equips i **podi**
   per a les medalles, amb el desplegable de les gimnastes de cada equip). *Imprimeix / PDF* i
   *Exporta a Excel* treuen els fulls (classificacions, podi, acta de notes, llistat d'inscripcions i
   fulls de jutge en blanc). Si encara falten notes, s'avisa abans d'imprimir.
6. **Rànquing**: suma les jornades del curs (les que marquis), individual i per equips.

A la pantalla d'inici hi ha la competició del dia amb accés directe a Notes, Classificacions, Podi i
Inscripcions. Al mòbil, les seccions són a la barra de baix.

Tot es pot editar o esborrar: fitxes, entitats, equips, competicions, inscripcions, notes,
categories, nivells i aparells.

## Categories

Per anys de naixement, iguals per a noies i nois (curs 2026-2027): Prebenjamí 2019-2020,
Benjamí 2017-2018, Aleví 2015-2016, Infantil 2013-2014, Cadet 2011-2012, Juvenil 2009-2010,
Sènior 2008 i abans. A *Configuració → Categories* es poden canviar els noms i els anys, i cada
estiu el botó **Passa al curs següent (+1 any)** ho avança tot i actualitza la categoria de
cada gimnasta que té l'any de naixement (de les que no en tenen, avisa perquè es revisin a mà). Les competicions ja fetes conserven la categoria d'aquell dia.

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
   amb un teclat gran (o en llista). **No cal internet**: n'hi ha prou amb una Wi-Fi qualsevol (la
   del pavelló, un router sense internet o la zona Wi-Fi d'un mòbil encara que no tingui dades).
4. A l'ordinador les notes surten al moment amb fons groc (per revisar) i les classificacions
   s'actualitzen soles. Les podeu canviar quan vulgueu; una nota que la taula ja ha posat o revisat,
   la tutora ja no la pot canviar. Si un mòbil perd la connexió, les notes es guarden al mòbil i
   s'envien soles quan torna (surt un avís de no tancar la pàgina).

Quan la competició es tanca, les tutores ja no poden entrar notes. Sense el programa servidor,
l'app funciona igual que sempre (només a l'ordinador).

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
- `tests/engine.test.mjs` — `node --test tests/engine.test.mjs` (sense dependències).
- `tests/e2e.mjs` — `node tests/e2e.mjs` prova l'app sencera en un Chromium obrint-la des del
  disc (cal Playwright). Deixa captures, un PDF i un `.xlsx` a `tests/out/`.
- `tests/e2e-fitxer.mjs` — prova el fitxer vinculat: si un altre ordinador l'ha canviat, no s'hi
  escriu sense preguntar.
- `tests/e2e-revisio.mjs` — casos concrets que havien fallat: fitxa sense nivell, «Nivell A» a
  l'Excel, ajuntar nivells, equips amb el mateix nom, canvis d'equip del mateix dia, D + E, «Grup
  següent» i la mida de pantalla de les tauletes.
- `tests/e2e-pwa.mjs` — l'app instal·lable com a GitHub Pages (https): sense internet, posar-se al
  dia sola i que el joc NUS del mateix lloc no li desi versions velles (cal openssl).
- `servidor/` — el programa per a l'ordinador i les tutores (Go, sense dependències). `go test` dins
  la carpeta (després de `sh build.sh` o de copiar `index.html` i `icons/` a `servidor/web/`), i
  `node tests/e2e-servidor.mjs` prova la taula i un mòbil de tutora alhora, també tallant la
  connexió.
