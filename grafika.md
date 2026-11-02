# Lodní fond – grafický manuál

Závazný pro všechny obrazovky i plavbu. Doplňuje `specification.md` (kap. 3.6, 9). Styl: **minimalistický a hravý**
(plochá barva, oblé tvary, tlustý obrys, postavičky s obličeji). Původní „low poly“ (trojúhelníková síť moře,
mnohoúhelníkové bouře) se ruší, působilo sterilně.

## 1. Principy

1. **Plochá barva.** Žádné přechody, textury, stíny s rozmazáním ani trojúhelníková síť. Hloubku dává jen tmavší tón
   téže barvy a ploché „podstavení“ (kap. 3). **Detailní plochá grafika (plavba):** postavy a moře se zdobí dalšími plochými
   tóny téže barvy (světlý okraj, tmavá polovina, švy, prkna, přísavky). Pořád žádné přechody ani rozmazání.
2. **Oblé tvary.** Rohy, konce čar i spoje jsou zaoblené (`round`). Ostré hrany jen u blesku a pirátské lodi.
3. **Jedna silueta, nejvýše tři barvy** na objekt v rozhraní a v ikonách. Co se nepozná v 11 px, se nekreslí. **Ikony v rozhraní
   (stav lodí, bedny, ikony nebezpečí, tečky stavu fondu) zůstávají jednoduché**, šum by je u malých velikostí zhoršil.
   Postavy v plavbě mají víc detailu, ale jen ve velikosti, kde je vidět: drobné detaily jsou označené `fine` a pod 18 px
   se spolu s obrysem nekreslí.
4. **Tvar nese význam, ne jen barva** (barvoslepost): stav lodi, stav fondu i druh bedny se liší tvarem nebo znakem.
5. **Charakter.** Nebezpečí mají oči (bouře se mračí, kraken kouká, piráti mají lebku). Pohyb je s lehkým „natažením a
   zmáčknutím“ (squash & stretch, max. 15 %). Nic nevypadá hrozivě, je to hra o fondu, ne horor.
6. **Viditelný tvar = zásahová oblast.** Co hráč vidí jako bouři, kraken či piráta, přibližně odpovídá oblasti,
   kde lodě ztroskotají (silueta vyplňuje ≥ 90 % elipsy zásahu). Hra je tím férová.

## 2. Barvy (tokeny)

Jediný zdroj pravdy: `src/theme.ts` (viz kap. 9). Nikde jinde se hexadecimální barva nepíše.

| Token | Hodnota | Použití |
|---|---|---|
| `navy` | `#061a45` | pozadí obrazovek, obrysy (`ink`) |
| `blue` | `#0b3a96` | karty, záhlaví, sekundární tlačítka |
| `gold` | `#ffcc00` | primární tlačítko, mince, zdůraznění |
| `text` | `#f4f7ff` | text |
| `muted` | `#b8c3e0` | vedlejší text (kontrast ≥ 4,5 : 1 na `navy`) |
| `sea` | `#2c8fd0` | moře (jedna plocha) |
| `sea-light` | `#52aee3` | vlnky a linky pruhů |
| `foam` | `#ffffff` | pěna, vítr, hrany vln |
| `sand` | `#f3dfa2` | břeh, molo |
| `wood` / `wood-dark` | `#c8763a` / `#8a4a22` | trup lodí, bedny |
| `sail` | `#fff6df` | plachta (pruhy červená, modrá, žlutá) |
| `ok` | `#3ecf6e` | loď doplula, „fond stačil“ |
| `repaired` | `#4aa8ff` | loď opravená z fondu, „přebytek fondu“ |
| `lost` | `#8b93a8` | navždy ztracená loď, neúčtované |
| `warn` | `#f59e0b` | varování (okno před opakováním kola) |
| `danger` | `#e5484d` | „fond nestačil“, škoda, pirátská vlajka |
| `storm` / `storm-dark` | `#5b6aa8` / `#3a4680` | bouře |
| `kraken` / `kraken-dark` | `#8e4fc9` / `#5d2a8e` | kraken |
| `mermaid` | `#1fb5a6` | mořská panna (ocas) |
| `pearl` | `#f4f0ff` | perla |
| `sea-deep` / `sea-deeper` | `#1f6c9e` / `#185b87` | hluboká místa moře, ryby |
| `shallow` / `shallow-mid` / `shallow-light` | `#3fb0d8` / `#5cc6e0` / `#86dcec` | stupňovité mělčiny u břehu |
| `sand-dark` | `#d4bb78` | mokrý písek, oblázky |
| `weed` | `#6ea85a` | řasy v moři |
| `wood-rim` / `wood-deck` | `#e8a266` / `#dd9a5c` | světlý okraj trupu a paluba, prkna mola |
| `sail-shade` | `#e6d8b8` | stín plachty |
| `storm-light` / `rain` / `blush` | `#8c9ad6` / `#c8e6ff` / `#ff9bb0` | okraj mraku, déšť, tváře postav |
| `kraken-light` / `kraken-sucker` | `#b684e6` / `#f6dcff` | světlý okraj a přísavky krakena |
| `mermaid-dark` / `hair-dark` | `#12857a` / `#c27200` | stín ocasu, stín vlasů |
| `pirate-hull` / `pirate-deck` / `pirate-window` / `pirate-flag` | `#1a2352` / `#6b4a33` / `#3c4568` / `#14162e` | pirátská loď |

Pravidla: text kontrastuje ≥ 4,5 : 1, nezbytná grafika ≥ 3 : 1. Plavba: lodě (teplé dřevo a světlá plachta) musí
na moři vyniknout, proto je moře sytá modrá s jemnými, málo kontrastními vrstvami (kap. 5, řádek Moře).

## 3. Tvary, obrys, tlačítka

- **Obrys** `ink` (= `navy`): 2 px v rozhraní, v plavbě 1,5 px u objektů nad 18 px, pod tím bez obrysu.
- **Poloměry rohů:** 4 / 8 / 16 px (malé prvky / tlačítka a štítky / karty a okna). Bez ostrých karet.
- **Podstavení místo stínu:** plochý tmavší pruh 3 px pod objektem (`0 3px 0` v tmavším tónu, bez rozmazání).
- **Tlačítko:** pilulka, výška ≥ 44 px, text tučně. Primární `gold` s textem `navy`, sekundární `blue`, nebezpečné
  (Vzdát se) obrys `danger`. Při stisku se tlačítko posune o 2 px dolů a podstavení zmizí.
- **Karty:** `blue` plocha, obrys, poloměr 16, rozestupy ze stupnice 4 / 8 / 12 / 16 / 24 px.
- **Okno (modal):** karta uprostřed, pozadí `navy` 70 %. Stejný vzor pro „Vzdát se?“ i varování před opakováním kola
  (ikona oranžového vykřičníku v kolečku).
- **Záhlaví obrazovek:** `blue` pás s vlnkovitým (půlkruhovým) spodním okrajem, jediný dekorativní prvek rozhraní.

## 4. Písmo

- Rodina: `ui-rounded, 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif` (bez stahování písma, plná čeština).
  Georgia z dřívější verze se ruší. Volitelně lze přibalit zaoblené OFL písmo (např. Nunito, podmnožina latin-ext, woff2
  do 40 kB), jen když bude přínos na zkoušku viditelný.
- Velikosti: 14 / 16 / 20 / 28 px, nadpisy tučně (800), čísla `tabular-nums`.
- Zkouška diakritiky ve vzorníku: `ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ áčďéěíňóřšťúůýž`.

## 5. Postavy v plavbě (pohled shora)

Jednotka `u` = délka lodi flotily (14–28 px podle velikosti obrazovky, flotila má cca 30 lodí). Každý objekt je křivka (kap. 9),
vždy stejná podoba v plavbě, ikonách i souhrnu.

| Objekt | Podoba | Pohyb a odezva |
|---|---|---|
| **Loď flotily** (1 u) | oblý trup se špičatým přídím, prkenná paluba, tmavší pravá polovina trupu, světlý okraj, jedna široká plachta s pruhem a švy, kulatý „dračí“ knoflík na přídi a lucerna na zádi. Tři barvy pruhu (červená, modrá, žlutá). **Šířka plachty odpovídá citlivosti lodě na vítr** (větší plachta = poletí dál). Pod 18 px jen trup + plachta | po poryvu se loď nakloní a plachta nafoukne s malým zpožděním, každá trochu jinak (vlna přes flotilu). Za lodí se táhne **stopa** (bílý klín, který slábne), po zabrzdění u mola zmizí |
| **Pruhy trati** | tři pruhy jsou jemně naznačené dvěma čárkovanými linkami z `sea-light` (průhlednost 25 %) | stojí, čtou se jako dráhy vlaku |
| **Bouře** | 4–5 překrývajících se kulatých mraků `storm`, tmavší `storm-dark` spodek, **mračící se obličej** na největším mraku, šikmé čárky deště. Zabírá 2 pruhy a **o kousek přesahuje do sousedního volného pruhu** (přesah 0,05 šířky) | pomalu se vlní na místě, občas zlatý blesk (jen bez `reduced-motion`) |
| **Piráti** | tmavý ostrý trup `ink`, červená plachta s bílou lebkou (kruh + dva body), vlajka. Úzká loď, bez přesahu. V uskupení se loď „přesouvá“ mezi řadami (každá řada má svou loď) | houpe se na místě |
| **Kraken** | fialová klenutá hlava s mračícíma se očima se žlutou duhovkou, tvářemi a malými tesáky, osm kuželovitých chapadel s kroucenými konci a dvěma řadami světlých přísavek (čáry jsou vyplněné tvary se světlým okrajem a tmavým stínem). Přesah 0,03 šířky | **varování**: tmavá kruhová skvrna a bublinky rostou a pulzují 2 s, **úder**: chapadla vyrazí s přetažením a zase se zasunou |
| **Poryv větru** | několik zahnutých bílých čar přes celé moře ve směru poryvu, síla = počet a délka čar | vznikne při vstupu hráče, doznívá 0,6 s, doprovází ho zvuk „fúú“ |
| **Mořská panna** | tyrkysový ocas, tvář, oranžové vlasy, drží **perlu** (bílá s odleskem). Stojí na kraji volného pruhu u nebezpečí | houpe se, po sebrání „puk“ a plovoucí text s hodnotou perly („+150“) |
| **Ztroskotání** | loď se nakloní, zmenší a zmizí, kolem bílý kruh a 3 bubliny | zvuk „wreck“, krátké (≤ 0,4 s) zachvění jen při větším počtu lodí |
| **Moře** | základní plocha `sea` s vrstvami, které plují různou rychlostí (paralaxa): hluboké vlnité pásy, světlejší pásy s přerušovanými pěnovými hřebeny, pěnové značky `~`, ryby, řasy, plovoucí prkno, třpytky a stíny racků. Vzhled určuje **číslo kola** (nikoli seed hry): kolo 3 vypadá v každé hře stejně, kolo 2 jinak (odstín moře o několik stupňů, počet a rozmístění ryb, řas, racků a prkna). Odstín zůstává v rozsahu tyrkysová až modrá, aby bouře a kraken zůstaly v popředí | s `reduced-motion` stojí třpytky, houpání a dýchání břehu; vrstvy se posouvají společně s tratí |
| **Břeh a cíl** | vlnitý pás `sand` s mokrým pískem `sand-dark`, oblázky, pěnovou linkou a třemi stupni mělčiny u vody; molo z dřevěných prkének, kostkovaný praporek v cíli | mělčina a pěna se pomalu „nadechují“ |

Platí: žádný objekt nemá víc než jeden výrazný pohyb. Nebezpečí se kreslí **pod** loděmi, jejich oči a ústa **nad** nimi.
Hranice nebezpečí na obrazovce se kryje s hranicí zásahové oblasti včetně přesahu, protože střed lodi rozhoduje o zásahu (viz principy 6).
**Uskupení** (řady stejného druhu s krátkým rozestupem) se kreslí jako jedna „rodina“: stejné postavy, v následujících řadách se mění jen
místo průchodu. Mezera se tím čte jako cesta, kterou musí flotila projet.

## 6. Ikony stavu (příprava, vyhodnocení, souhrn)

Řada lodí (1 ikona = 1 loď, při 30 lodích 2 řádky po 15 na šířku 360 px, buňka 20 px):

| Stav | Barva | Znak |
|---|---|---|
| Doplula | `ok` | plná loď s plachtou |
| Ztroskotala, opravena fondem | `repaired` | stejná loď + **klíč** v odznaku vpravo dole (6 px) |
| Navždy ztracena | `lost` | trup bez plachty + **křížek** |
| Oprava, na kterou fond měl, ale nebyla potřeba (vrátila se do zisku) | bez výplně, čárkovaný obrys `lost` | „duch“ lodi, popisek „mohlo vydělat jako zboží“ |

Rozlišitelnost se ověří ve stupních šedi a při 20 px.

**Zlato jako bedny** (1 bedna = jednotka `goldUnit`, částečná bedna se plní zdola). Rozpočet kola je jen fond a náklad, **žádná hotovost**:

| Role | Barva | Znak |
|---|---|---|
| Fond | `repaired` | štít |
| Náklad | `gold` | balík |
| Zisk | `ok` | mince |
| Oprava (platba z fondu) | `danger` | prasklina |

**Stav fondu:** hlavní ukazatel je řada lodí včetně duchů a věta. K ní patří **malá tečka** (`danger` chybělo, `ok` stačilo,
`repaired` přebytek) se znakem uvnitř (×, ✓, ↑), aby se nespoléhalo jen na barvu. Semafor se čtyřmi lampami z dřívější verze se ruší.

**Karta statistik překážek** (příprava) má řádek na druh překážky: ikona nebezpečí v kolečku × počet řad, **úsečka s dolní a horní mezí**
odhadu předem (`sea-light`, zaoblené konce) a **značku pozorování** (kolečko `gold` na úsečce, nebo čárkované s popiskem „zatím neznámé“).
Pod řádky je výpočet celkového přežití jako řada čipů s násobením (`0,95 × 0,95 × …`) a výsledkem v procentech pro dolní mez, horní mez a pozorování,
vždy se stejným pořadím a barvami (`danger`, `ok`, `gold`). Čísla se píší s `tabular-nums`. Výpočet je vedle textové věty („Pojistné ≈ (1 − přežití) × cena opravy“).
Panel **Jak to funguje?** má čtyři krátké věty s ikonou (fond, vrácení zbytku, zboží, ztráta lodí) podle pravidel fondu v `specification.md` kap. 2.

**Ikony nebezpečí v předpovědi** jsou zjednodušené postavy z kap. 5 v kolečku (mrak, loď s lebkou, oko s chapadlem). Přesná mapa se
hráči neukazuje.
Všechny ikony: viewBox 24 × 24, jednotná tloušťka čáry 2, zaoblené konce.

## 7. Obrazovky

- Obrazovky mimo plavbu: jednosloupcové rozvržení, `max-width: 480 px` na střed, šířka od 360 px bez vodorovného posunu.
- Příprava: záhlaví, karta statistik překážek, karta pojistného (posuvník se značkami odhadů + bedny fondu a nákladu), tlačítka dole.
- Plavba: celá obrazovka je moře a orientace sleduje okno (na počítači doleva→doprava, na mobilu zdola nahoru). Nahoře malé štítky
  (kolo, lodě, perly), tlačítko Vzdát se v rohu. Žádný ovládací prvek: ovládá se tažením kdekoli (dotyk) nebo klávesami ↑ ↓.
  V tutoriálu se krátce ukáže nápověda s ikonou ↑ ↓ nebo prstu.
- Vyhodnocení: řádky se odkrývají postupně (400 ms), každý s příslušnou vizualizací; ikony lodí se přebarvují
  postupně (30 ms na loď, celkem nejvýše 1,5 s). Stav fondu (tečka a věta) jako poslední.
- Souhrn: tabulka kol, lodě a bedny na začátku a na konci hry, celkový zisk a hodnota lodí, počet použitých opakování.

## 8. Animace a zvuk

- Přechody rozhraní 120–200 ms `ease-out`. Všechno se řídí časem, ne počtem snímků (60 i 120 Hz).
- `prefers-reduced-motion`: bez zachvění, blesků, postupného odkrývání a plující vlnek; vše se ukáže hned.
- Každý zvuk má grafický protějšek: ztroskotání (zvuk + bubliny), perla (zvonek + „puk“), výnos ve vyhodnocení (cinkot mincí
  při objevení beden). Žádný zvuk bez obrazu.

## 9. Pravidla pro implementaci

1. `src/theme.ts` obsahuje paletu z kap. 2 a při startu ji vloží do CSS proměnných. Plátno čte barvy odtud, CSS používá
   `var(--…)`. Tím je každá barva v projektu jen jednou.
2. Tvary (loď, mrak, kraken, ikony) jsou uloženy **jednou** jako SVG cesty (`src/art/`). Rozhraní je vykreslí jako `<svg>`,
   plátno jako `Path2D` s předrenderovaným spritem podle velikosti a hustoty pixelů. Dvě podoby téhož objektu se nesmějí rozcházet.
   Část tvaru může mít `clip` (ořez jinou cestou) a `fine` (jemný detail, který se pro malé velikosti vynechá). Moře (`src/engine/sea.ts`)
   se kreslí z předrenderovaných dlaždic, které se jen posouvají.
3. Žádné rastrové obrázky ani cizí odkazy, žádné stahované písmo ve výchozí variantě.
4. Vzorník `dev/style-guide.html` ukáže všechny barvy, tlačítka, ikony, postavy a stavy lodí ve třech velikostech
   a ve stupních šedi. Slouží jako kontrola konzistence před odevzdáním.
5. Odstraní se: trojúhelníková síť moře a mnohoúhelníkové mraky v `render.ts`, per-ship palety v `sprites.ts`
   (nahradí je tři barvy plachty), písmo Georgia, poloprůhledné bílé karty (`rgba(255,255,255,.08)`).

## 10. Kontrola před odevzdáním

- [ ] Každá barva v kódu pochází z `theme.ts`.
- [ ] Každý objekt vypadá stejně v plavbě, ikoně a souhrnu.
- [ ] Stavy lodí a stav fondu se rozliší ve stupních šedi.
- [ ] Siluety nebezpečí odpovídají zásahové oblasti.
- [ ] Texty mají kontrast ≥ 4,5 : 1, tlačítka ≥ 44 × 44 px, čeština se správnou diakritikou.
- [ ] S `prefers-reduced-motion` je hra plně hratelná a čitelná.
