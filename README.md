# Lodní fond

Minihra do Aktuárské kariérní hry Aktify. Hráč spravuje flotilu 30 malých vikingských obchodních lodí, nastavuje **pojistné na loď** a z přístavní věže **vyfukuje vítr**, kterým odfukuje flotilu z cesty piráty, krakenovi a bouři. Z pojistného se platí opravy ztroskotaných lodí, zbytek fondu se vrací do zisku, a co není ve fondu, jede jako zboží, které se prodá dráž, než stálo. Hra učí princip pojištění jako společného fondu a odhad pojistného z pravděpodobnosti škody.

Stack: React 18, TypeScript, Vite. Určeno pro iframe hlavní hry. Ovládání: ↑ ↓ (též ← → W A S D, podržení opakuje poryv) nebo tažení do strany prstem či myší.

Návrh: [`specification.md`](specification.md) (pravidla, ekonomika, vzorce), [`grafika.md`](grafika.md) (vzhled), [`implementation-plan.md`](implementation-plan.md) (postup).

## Spuštění

Potřebuje Node.js 20.19+ (testy a skripty používají `node` s odstraňováním typů, Node 24).

```powershell
npm ci            # nainstaluje přesně podle package-lock.json
npm run dev       # http://localhost:5173
npm run build     # kontrola typů + produkční build do dist/ (hra a stránka /data)
npm test          # testy modelu (node --test, do ~10 s)
npm run check     # tabulka automaticky ověřitelných cílů T1–T14 (spec 7.4), vrací chybu při nesplnění
npm run calc -- ships=30 premium=8 survive=80 rounds=5   # kalkulátor očekávané hodnoty
```

Samostatně (mimo iframe) bere hra `level` a `payload` z adresy: `/?level=2&payload={"rounds":3,"tutorial":false}`. Zprávy pro hlavní hru se vypisují do konzole.

### Vývojové stránky (nejsou v produkčním buildu)

| Stránka | K čemu |
|---|---|
| `/dev/index.html` | **vývojářský přehled**: rozcestník všech nástrojů (stránky, příkazy, soubory) |
| `/dev/playground.html` | hřiště: skutečná plavba, posuvníky všech parametrů (platí pro další plavbu), výběr uskupení / ruční řady `P.P \| .P. \| P.P`, seed, záznam a přehrání lidských poryvů, běh „nic nedělá“, ladicí vrstvy, měření přežití podle druhu a uskupení, návrh `W_dobrá` / `W_průměrná`, diagnostika ekonomiky, sady parametrů, **Exportovat konfiguraci** |
| `/dev/calculator.html` | kalkulátor jednoho kola, tabulka přes `x`, kalkulátor předpovědi, diagnostika (křivka skóre, citlivost, zlom, perly, rozdělení `successRate`) |
| `/dev/style-guide.html` | vzorník barev, tvarů, postav a stavů lodí (kontrola `grafika.md`) |
| `/dev/host-test.html` | simulátor hlavní hry: odpovídá na `READY` zprávou `INIT` a vypisuje, co hra posílá |

## Ladění čísel

Všechna čísla jsou v [`game.config.json`](game.config.json), žádné ladicí číslo není v kódu. Ladí se **hraním v hřišti**: posuvníky, měření a diagnostika ukážou důsledky, tlačítko Exportovat konfiguraci zkopíruje JSON do schránky a vloží se do `game.config.json`. V konfiguraci jsou i prahy cílů T1–T14 pro `npm run check`.

Hranice lodí je pružná (`ships.elasticity`): loď tlačená za svou hranici se zabrzdí a pomalu se vrací, přitom si odnese rychlost, takže se po odrazu flotila rozptýlí (krajní pruh nejde použít jako úkryt celé flotily). `stiffness` je tuhost vratné síly (0 = stará tvrdá hranice s `gust.softEdge`), `damping` tlumení za hranicí (vysoké = loď se plíží zpět, nízké = odrazí se) a `depth` nejhlubší průnik jako podíl vzdálenosti lodi od okraje. Všechny tři jsou v hřišti mezi posuvníky pohybu.

Stav výchozích hodnot (`npm run check`): automatické cíle T1, T2, T3, T4, T10, T11, T14 a délka kola 20–30 s platí. Cíle T5–T9, T12 a T13 vyžadují člověka v hřišti. Zejména `forecast.wGood` a `forecast.wAverage` jsou jen odhady a je nutné je změřit (proto je horní mez přežití ve statistikách téměř 100 %). Nesrovnalosti zjištěné při implementaci jsou v `specification.md`, kap. 10.

## Integrace s hlavní hrou (iframe)

Protokol verze 1 (`../universal-specification.md`), implementace v `src/minihra-protokol.ts` (kopie ze `skladani_karty`, needitovat).

| Směr | Zpráva |
|---|---|
| hra → hlavní hra | `{ type: "READY", version: 1 }` po načtení |
| hlavní hra → hra | `{ type: "INIT", version: 1, level?, payload? }`; další `INIT` hru restartuje |
| hra → hlavní hra | `{ type: "FINISH", version: 1, successRate, succesRate, payload }` právě jednou |
| hra → hlavní hra | `{ type: "ERROR", version: 1, code, message }` |

### `level`

1–3, výchozí 2 (1 = hra spočítá přežití i pojistné, 2 = ukáže přežití, pojistné počítá hráč, 3 = jen statistiky po druzích). Neplatná hodnota se nahradí výchozí.

### `payload` (vstup)

Objekt (jiný typ včetně pole → `ERROR` `INVALID_PAYLOAD`), všechna pole nepovinná, neplatné hodnoty se nahradí výchozími, neznámá pole se ignorují.

| Pole | Rozsah | Výchozí |
|---|---|---|
| `rounds` | 1–10 | 5 |
| `ships` | 10–60 | 30 |
| `capitalPerShip` | 10–100 | 50 |
| `tutorial` | `true` / `false` | `true` |
| `retries` | 0–10 | 3 |
| `seed` | celé číslo | náhodné |

### `successRate` a výstupní `payload`

`successRate = clamp(T / T_ref, 0, 1)`, kde `T = Σ zisk + N_konec · shipValue` a `T_ref = rounds · (N₀ · (m − 1) · c + maxPearls · pearlValue) + N₀ · shipValue` je teoretické maximum (nikdo se nepojistí, nikdo neztroskotá, všechny perly sebrány, všechny lodě zůstanou), takže 100 % je nedosažitelná mez. U opakovaného kola se počítá jen poslední pokus, nehraná kola nepřinášejí zisk.

Výstup: `{ level, seed, result, retriesUsed, finalShips, totalProfit, fleetValue, rounds }`, kde `result` je `completed`, `gaveUp` nebo `bankrupt` a každé kolo je buď `{ round, result: "played", attempts, obstacles, premiumPerShip, fund, wrecked, repaired, lost, unusedRepairs, cargoDelivered, pearls, revenue, profit, fundStatus }` (`fundStatus`: `short`, `enough`, `surplus`), nebo `{ round, result: "notPlayed" }`.

## Zabezpečení

- Nastav `VITE_ALLOWED_PARENT_ORIGINS` (viz `.env.example`) na doménu hlavní hry. Zprávy z jiných domén se ignorují. Při nasazení posílej také `Content-Security-Policy: frame-ancestors <doména hlavní hry>`.
- `.npmrc` blokuje instalační skripty závislostí, pinuje přesné verze a ignoruje čerstvé verze balíčků. Používej `npm ci` a před odevzdáním spusť `npm audit`.

## Nasazení (Vercel)

Projekt na Vercelu: Root Directory `lodni_fond`, build `npm run build:vercel` (je ve `vercel.json`), výstup `dist`. Build zkontroluje typy, sestaví hru i stránku `/data`, vytvoří tabulky v databázi (pokud je nastavená `DATABASE_URL`) a zabalí API funkce do `server-dist/`.

Proměnné prostředí: `VITE_ALLOWED_PARENT_ORIGINS` (viz výše) a pro statistiky `DATABASE_URL` a `SCORE_SECRET` (viz další kapitola). Bez nich hra funguje, jen nic neukládá a nezobrazuje srovnání.

## Statistiky hráčů a stránka /data

Po skončení hry se odehraná hra pošle na server. Hráč na souhrnu uvidí, o kolik je lepší než ostatní hráči (celkové skóre = zlato + hodnota lodí, histogram, percentily zlata a lodí zvlášť). Stránka **`/data`** ukazuje podrobnější statistiky: přežití podle druhu a uskupení překážek (i po řadách), rozdělení počtu lodí v kolech, pojistné a skóre a nejlepší desetinu hráčů (hranice skóre a typické pojistné). Statistiky jsou vždy pro jedno zadání (úroveň, počet kol, lodí a kapitál na loď), lze je přepínat nahoře. Druhá záložka ukazuje žebříček 20 nejlepších dohraných her zadání (datum, zlato, hodnota lodí, celkem a další údaje), řazený podle celkového skóre, zlata nebo hodnoty lodí.

**Verze skóre.** `scoreVersion` v `game.config.json` (výchozí 1) se ukládá ke každé hře (`games.score_version`). Porovnání hráče, statistiky i žebříček počítají jen hry aktuální verze. Změníš-li výpočet skóre nebo jiné věci, které výsledky mění, zvyš číslo a starší hry se přestanou započítávat (zůstanou v databázi).

### Nastavení na Vercelu (jednorázově)

1. **Storage / Marketplace → Neon (Postgres)**, připojit k projektu. Vercel přidá `DATABASE_URL`.
2. **Environment Variables → `SCORE_SECRET`**: libovolný dlouhý náhodný řetězec (např. `openssl rand -base64 32`), jím se podepisují tokeny her.
3. Nasadit. Tabulky vytvoří `npm run db:migrate`, který běží v buildu (je idempotentní, jde spustit i ručně: `vercel env pull .env.local` a `npm run db:migrate`).

### Jak to funguje

| Krok | Co se děje |
|---|---|
| Start hry | klient zavolá `POST /api/start` s nastavením hry (úroveň, kola, lodě, kapitál, opakování, seed); server vrátí **token** = podepsané (HMAC-SHA256) `{id hry, čas, nastavení}`, nic neukládá |
| Konec hry | klient pošle `POST /api/submit` s tokenem a záznamem hry (`buildReport`) |
| Ověření | token platí nejvýše 6 hodin a **jen jednou** (`id` je primární klíč, druhé odeslání končí `409`); server znovu vygeneruje trať ze seedu, zkontroluje formace, řetěz počtu lodí a přeživších, pojistné, perly, počet opakování a že hra netrvala nemožně krátce, a **všechna odvozená čísla přepočítá sám** (zisk, opravy, skóre); ověřená hra se uloží |
| Odpověď | pořadí hráče mezi ostatními (`Comparison`); u vzdané hry žádné |

Ukládá se: hra (nastavení, výsledek, počet využitých opakování), každé odehrané kolo (lodě na začátku, pojistné, ztroskotání, opravy, ztráty, perly, výnos, výsledek, počty překážek), každé uskupení překážek v kole (druh, id, podoba, počet lodí před ním a po každé jeho řadě). **Do hlavních dat (`rounds`, `hazards`) jde jen poslední pokus kola. Pokusy zahozené opakováním jdou zvlášť do `discarded_attempts`.** Do porovnání a statistik se počítají jen hry, které nebyly vzdané (kola vzdaných her se počítají do přežití a počtů lodí). Žádné osobní údaje se neukládají.

Hráč s upraveným klientem může poslat vymyšlený, ale možný záznam (plavbu nelze přehrát, závisí na jeho poryvech). Token a kontroly brání jen hromadnému a opakovanému odesílání, nemožným výsledkům a falešným konfiguracím. Stránka `/data` je veřejná a ukazuje jen souhrny; chceš-li ji omezit, nastav ochranu nasazení ve Vercelu.

### Lokální vývoj

```powershell
npm run dev:api   # API na :8787 s lokální databází v .devdb/ (bez účtů a bez DATABASE_URL); Vite na /api přesměruje
npm run dev       # hra na :5173, /data na http://localhost:5173/data
npm run seed -- 300      # (dev:api zastavit) naplní .devdb simulovanými hrami; seed -- 40 1 = 40 jednokolových
npm run build:api # zabalí funkce do server-dist/ (pro `vercel dev`)
```

`DEV_DATABASE_URL` v `.env.local` přepne dev API na Postgres/Neon. Bez běžícího `dev:api` hra funguje beze změny, jen nezobrazí srovnání.

Postup ověření serveru: `npm test` (`test/server.test.ts` běží proti Postgresu v procesu, PGlite).

## Struktura

```
src/model/       čistá logika bez DOM a Reactu (ekonomika, skóre, trať, lodě, plavba, statistiky, předpověď, diagnostika, stav hry, init)
src/engine/      FixedStepper (60 Hz), vstup (klávesy, tažení), plátno (SailView, render), zvuk
src/art/         všechny tvary jednou jako SVG cesty (React <svg> i Path2D na plátně)
src/theme.ts     jediné místo s barvami (tokeny z grafika.md)
src/*.tsx        obrazovky: Prepare, Sail, Evaluate, Summary, Tutorial a komponenty (FleetRow, Crates, StatsCard, PremiumCard, Comparison, charts)
src/data/        stránka /data (vstup data/index.html)
src/telemetry.ts klient statistického API (start hry, odeslání)
server/          API: app.ts (start, submit, stats), token.ts, verify.ts (ověření záznamu), queries.ts (SQL), schema.ts; entries/ = funkce pro Vercel
api/             tenké funkce pro Vercel, re-exportují balíčky ze server-dist/ (vznikají v buildu)
dev/             hřiště, kalkulátor, vzorník, simulátor hlavní hry, čistá logika měření (measure.ts)
scripts/         calc.ts, check.ts
test/            testy modelu (node --test)
game.config.json všechna ladicí čísla
```
