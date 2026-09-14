# NUS

**Jugar-hi:** https://enricmarin48-alt.github.io/nus/

Joc de puzles per a mòbil. Al telèfon, el navegador et proposarà instal·lar-lo: queda com
una app, amb icona pròpia, a pantalla completa i **funciona sense cobertura**.

El joc és un sol fitxer (`index.html`) sense dependències ni compilació. La resta són les
peces que el fan instal·lable.

## Com es juga

Arrossegues el dit d'una bola a una altra i queden **lligades**. Quan has gastat totes
les cordes, el temps s'engega: les parelles s'estiren, xoquen i peten. Aquella explosió
mata les boles que té a prop i empeny les de més lluny — i les que moren també exploten.
Guanyes si no en queda cap.

Cada nivell té les cordes **justes**: ni una de sobrera.

### Peces

| Peça | Què fa |
|---|---|
| Normal | L'explosió la mata. |
| Bomba | Explosió molt més gran. |
| Pesada | Cap explosió la mata; només un xoc molt fort o una corda. |
| Columna | Indestructible. Només fa nosa. |

## Lliga, missions i estrelles

**Lliga setmanal.** De dilluns a diumenge. Guanyes punts amb tot el que facis i competeixes
en una taula de deu. Els 3 primers pugen de divisió i els 3 últims baixen:
Bronze → Plata → Or → Diamant → Llegenda.

> **Els rivals no són gent real.** Es generen a partir de la setmana i la divisió, i van
> sumant punts sols a mesura que passa la setmana. Per competir de debò caldria un servidor:
> només s'han de substituir `genRivals()` i `taulaLliga()` per una crida a Supabase.

**Missions del dia.** Tres, triades a partir de la data (iguals per a tothom). Paguen
monedes i punts.

**Estrelles.** Tres per nivell: passar-lo, passar-lo al primer intent, i fer-hi **la cadena
més llarga que el tauler permet**. Aquest tercer llistó no és un número inventat: es calcula
provant totes les solucions bones del nivell, perquè sempre sigui assolible — amb un llindar
fix era impossible a la meitat dels nivells. Es calcula en segon pla mentre penses la
jugada, perquè fer-ho abans de començar afegia fins a un segon d'espera.

## Modes

- **NIVELLS** — la progressió. Infinits, cada un amb el seu pressupost de cordes.
- **REPTE DEL DIA** — un tauler generat a partir de la data: el mateix per a tothom, un
  cada dia. Manté una ratxa de dies seguits i paga més com més llarga sigui.
- **RÀPID** — minijocs contra el rellotge, tres vides, i cada ronda amb menys temps:
  - *Lliga'ls* — el de sempre, amb pressa.
  - *Un sol tret* — sense cordes: apuntes, deixes anar, i la cadena ho ha de netejar tot.
  - *No toquis la verda* — neteja-ho tot menys una.
  - *La cadena* — una corda i un número al qual has d'arribar.

## Recompenses

Jugant es guanyen monedes (nivell nou, repte del dia, cada ronda del ràpid). Serveixen per
desbloquejar **pistes** (el terra: camp de futbol, bàsquet, tennis, muntanya, fons marí) i
**boles** (cares, pilotes, animals). Són dues coses independents: pots posar cares sobre
una pista de tennis.

## Com estan fets els nivells

No n'hi ha cap escrit a mà. `generate(n)` reparteix les boles a l'atzar (amb llavor fixa,
o sigui que el nivell 12 és sempre el mateix) i després **el joc es resol a si mateix**:
prova totes les combinacions de cordes amb la mateixa física que jugaràs tu i es queda la
disposició només si el mínim de cordes necessàries coincideix exactament amb el pressupost.

Conseqüències: cap nivell és impossible, cap és regalat, i n'hi ha infinits.

Els nivells 1–23 segueixen una corba escrita a `spec()`; a partir del 24 es genera sola.
Als vuit primers també s'exigeix que hi hagi més d'una solució, perquè no espantin.

El repte *un sol tret* es valida igual, però provant angles i forces en dues passades: una
malla basta que descarta de seguida els taulers sense sortida, i una de fina només per als
que la passen. Sense això la generació trigava fins a 2,7 s; ara en són ~130 ms.

## Velocitat

Dues decisions que hi pesen molt al mòbil:

- **Els fons es pinten un sol cop.** Cada pista es dibuixa a un llenç a part
  (`renderScene`) i després només es copia. Es refà quan canvies de pista o gira el mòbil.
- **Les boles són sprites.** La resplendor (`shadowBlur`) és molt cara i es pagava 60 cops
  per segon per bola; ara cada bola es dibuixa una vegada a un llenç petit (`sprite()`) i
  la resta és copiar imatges.

## Fitxers

- `index.html` — el joc sencer (física, generador, solver, escenaris, render, so).
- `manifest.webmanifest` — el que fa que el telèfon l'ofereixi com a app.
- `sw.js` — desa el joc al telèfon perquè funcioni sense cobertura. **Si toques
  `index.html`, puja el número de `VERSION`**, si no els telèfons seguiran amb la còpia vella.
- `icons/` — la icona, generada amb GDI+ des de PowerShell.
- `.github/workflows/pages.yml` — publica sol a cada `git push` a `main`.

## Publicar un canvi

```bash
git add -A && git commit -m "..." && git push
```

I ja està: el workflow el desplega en un parell de minuts. Recorda pujar `VERSION` a `sw.js`.

## Per tocar-hi

Els números que canvien com se sent el joc són a `P` (física) i `BOOM` (radis d'explosió),
al principi de l'script. Si els mous, els nivells guardats deixen de ser vàlids: canvia
també la llavor de `generate()` o esborra `localStorage` (`nus.save`).

Per afegir una pista, una entrada més a `SKINS` amb la seva funció `paint(g)`. Per afegir
un estil de bola, una entrada a `BALLS` amb `cols`, `body(t)` i `inner(g,t,r)`.
