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
   títols: Nom, Cognoms, Entitat, Categoria, Nivell, Any, i si vols Equip). Es queden guardades
   per a totes les competicions.
2. **Equips**: crea'ls a mà o amb *Proposa equips automàticament* (agrupa per entitat,
   categoria i nivell, de 3 a 6).
3. **Competicions → Nova competició**: nom, data i lloc. Pots copiar les inscripcions d'una
   competició anterior. A *Inscripcions* hi afegeixes equips sencers o gimnastes soltes.
4. **Notes**: tria categoria/nivell i aparell. Escriu la nota i prem **Intro** per baixar a la
   següent (val coma o punt). Tot es desa sol.
5. **Classificacions**: surten soles. *Imprimeix / PDF* i *Exporta a Excel* treuen els fulls
   (classificacions, acta de notes, llistat d'inscrites i fulls de jutge en blanc).

## Regles que aplica

- Cada **categoria + nivell** té les seves classificacions.
- **General individual** = suma dels aparells que compten (per defecte salt, barra i terra).
- **Equips** de 3 a 6 gimnastes: a cada aparell només compten les **3 millors notes**; la resta
  surten ratllades. Un equip amb menys de 3 gimnastes surt però no classifica.
- **Empats**: per defecte mateixa posició (1, 1, 3). Es pot triar desempatar per la millor nota
  d'aparell o, si s'entren D i E, com la FIG (primer E, després D).
- **No presentada (NP)**: surt a baix, sense posició, i no suma per a l'equip.
- Configurable per competició: aparells (minitramp o paral·leles com a classificació a part o
  dins la general), 1 o 2 intents (compta la millor, la mitjana o la suma), nota final o
  **D + E − penalització**, nota mínima per a qui fa l'exercici, quantes notes compten per equip.

## Dades i còpies de seguretat

Les dades es desen soles al navegador a cada canvi. A *Configuració → Dades*:

- **Desa també a un fitxer** (Chrome/Edge): tria un fitxer `.json` i cada canvi s'hi escriu.
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
