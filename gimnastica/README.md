# NotesGim — notes de gimnàstica artística

Programa per entrar les notes d'una competició de gimnàstica artística i treure les
classificacions **individual**, **per aparells** i **per equips** al moment.
**Funciona sense internet**: és un sol fitxer (`index.html`), sense instal·lar res.

## Com aconseguir-lo

**Opció A — fitxer (la més senzilla).** Descarrega `index.html`, posa'l en una carpeta fixa
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
2. **Competicions → Nova competició**: nom, data i lloc. Pots copiar les inscripcions d'una
   competició anterior. A *Inscripcions* hi apuntes les gimnastes i **els equips es fan sols**:
   les d'una mateixa entitat i grup formen equip si n'hi ha 3 o més (més de 6 → se'n fan dos).
   Si preferiu equips fixos, es poden preparar a *Equips* i inscriure'ls sencers.
3. **Notes**: tria el grup i escriu la nota final de cada aparell que donen les tutores;
   **Intro** baixa a la següent (val coma, punt o apòstrof). Tot es desa sol, també si es tanca
   la finestra sense prémer Intro. Des de la mateixa graella es pot canviar una gimnasta d'equip.
4. **Classificacions**: surten soles (general individual, per aparells, per equips i **podi**
   per a les medalles). *Imprimeix / PDF* i *Exporta a Excel* treuen els fulls (classificacions,
   podi, acta de notes, llistat d'inscripcions i fulls de jutge en blanc).
5. **Rànquing**: suma les jornades del curs (les que marquis), individual i per equips.

Tot es pot editar o esborrar: fitxes, entitats, equips, competicions, inscripcions, notes,
categories, nivells i aparells.

## Categories

Per anys de naixement, iguals per a noies i nois (curs 2026-2027): Prebenjamí 2019-2020,
Benjamí 2017-2018, Aleví 2015-2016, Infantil 2013-2014, Cadet 2011-2012, Juvenil 2009-2010,
Sènior 2008 i abans. A *Configuració → Categories* es poden canviar els noms i els anys, i cada
estiu el botó **Passa al curs següent (+1 any)** ho avança tot i actualitza la categoria de
cada gimnasta. Les competicions ja fetes conserven la categoria d'aquell dia.

## Regles que aplica

Per defecte, les de la normativa UCEC de gimnàstica artística dels JEEC:

- Cada **categoria + gènere + nivell** té les seves classificacions.
- Nivells **A** i **B**.
- **Noies**: salt, barra i terra. **Nois**: salt, terra i minitramp (**2 salts, compta el
  millor**). Es pot canviar per aparell (que compti, que tingui classificació a part o que no es
  faci) a la configuració.
- Nota mínima de **3 punts** per a qui fa l'exercici (un 0 vol dir que no l'ha fet).
- **General individual** = suma dels aparells que compten.
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

Amb el programa **NotesGim-servidor** (un sol fitxer, no cal instal·lar res; porta l'app a dins):

1. A l'ordinador de la taula, posa `NotesGim-servidor-windows.exe` en una carpeta (per exemple
   *Documents/NotesGim*) i obre'l. S'obre una finestra negra (deixa-la oberta) i l'app al
   navegador. Les dades es guarden a `notesgim-dades.json`, a la mateixa carpeta, i cada 10
   minuts es fa una còpia a `copies-notesgim/`.
   - Windows pot avisar «Windows ha protegit l'ordinador»: *Més informació → Executa igualment*.
   - La primera vegada, el tallafoc pregunta si el deixes accedir a la xarxa: digues que **sí**
     (xarxes privades).
2. A la competició: *Configuració → Tutores* → marca «Permet que les tutores entrin notes». Surt
   un **codi** i l'adreça que han d'obrir (per exemple `http://192.168.1.23:8080`).
3. Les tutores connecten el mòbil a **la mateixa Wi-Fi** que l'ordinador, obren l'adreça, posen el
   codi, trien el grup i el seu aparell i escriuen la nota final. **No cal internet**: n'hi ha
   prou amb una Wi-Fi qualsevol (la del pavelló, un router sense internet o la zona Wi-Fi d'un
   mòbil encara que no tingui dades).
4. A l'ordinador les notes surten al moment amb fons groc (per revisar) i les classificacions
   s'actualitzen soles. Les podeu canviar quan vulgueu. Si un mòbil perd la connexió, les notes
   es guarden al mòbil i s'envien soles quan torna.

Quan la competició es tanca, les tutores ja no poden entrar notes. Sense el programa servidor,
l'app funciona igual que sempre (només a l'ordinador).

On es descarrega: a la pàgina *Releases* del repositori (etiqueta `notesgim-servidor`), que es
torna a generar sola cada cop que hi ha canvis a `main`. També es pot compilar amb
`sh servidor/build.sh` (cal Go).

## Dades i còpies de seguretat

Les dades es desen soles al navegador a cada canvi. A *Configuració → Dades*:

- **Desa també a un fitxer** (Chrome/Edge): crea un fitxer `.json` o fes servir el que ja tens
  (si ja té dades, pregunta abans de tocar res) i cada canvi s'hi escriu.
- **Descarrega còpia de seguretat** / **Restaura una còpia**: per passar les dades a un altre
  ordinador o guardar-les en un USB. L'app avisa si fa dies que no en fas cap.

## Per a qui hi toqui

- `index.html` — tota l'app. El càlcul de notes i classificacions és el bloc entre
  `ENGINE-START` i `ENGINE-END` (sense DOM; treballa en mil·lèsimes enteres).
- `sw.js` + `manifest.webmanifest` + `icons/` — només per a l'opció B (instal·lable).
  **Si toques `index.html`, puja `VERSION` a `sw.js`.**
- `tests/engine.test.mjs` — `node --test tests/engine.test.mjs` (sense dependències).
- `tests/e2e.mjs` — `node tests/e2e.mjs` prova l'app sencera en un Chromium obrint-la des del
  disc (cal Playwright). Deixa captures, un PDF i un `.xlsx` a `tests/out/`.
- `servidor/` — el programa per a les tutores (Go, sense dependències). `go test` dins la
  carpeta, i `node tests/e2e-servidor.mjs` prova la taula i un mòbil de tutora alhora, també
  tallant la connexió.
