# NUS

Joc de puzles per a mòbil, en un sol fitxer (`index.html`). Sense dependències, sense
compilació: obres el fitxer i funciona, també sense internet.

## Com es juga

Arrossegues el dit d'una bola a una altra i queden **lligades**. Quan has gastat totes
les cordes, el temps s'engega: les parelles s'estiren, xoquen i peten. Aquella explosió
mata les boles que té a prop i empeny les de més lluny — i les que moren també exploten.
Guanyes si no en queda cap.

Cada nivell té les cordes **justes**: ni una de sobrera.

### Peces

| Peça | Què fa |
|---|---|
| Blava | Normal. L'explosió la mata. |
| Rosa (bomba) | Explosió molt més gran. |
| Taronja (pesada) | Cap explosió la mata; només un xoc molt fort o una corda. |
| Grisa (columna) | Indestructible. Només fa nosa. |

## Com estan fets els nivells

No n'hi ha cap escrit a mà. `generate(n)` reparteix les boles a l'atzar (amb llavor fixa,
o sigui que el nivell 12 és sempre el mateix) i després **el joc es resol a si mateix**:
prova totes les combinacions de cordes amb la mateixa física que jugaràs tu i es queda la
disposició només si el mínim de cordes necessàries coincideix exactament amb el pressupost.

Conseqüències: cap nivell és impossible, cap és regalat, i n'hi ha infinits.

Els nivells 1–23 segueixen una corba escrita a `spec()`; a partir del 24 es genera sola.
Als vuit primers també s'exigeix que hi hagi més d'una solució, perquè no espantin.

## Fitxers

- `index.html` — el joc sencer (física, generador, solver, render, so).
- La versió publicada com a enllaç es genera treient les etiquetes `<html>/<head>/<body>`
  d'aquest fitxer.

## Per tocar-hi

Els números que canvien com se sent el joc són a `P` (física) i `BOOM` (radis d'explosió),
al principi de l'script. Si els mous, els nivells guardats deixen de ser vàlids: canvia
també la llavor de `generate()` o esborra `localStorage` (`nus.lvl`).
