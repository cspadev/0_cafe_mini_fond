// Developer hub: one overview of every development tool (pages and commands). Deployed read-only: the tools cannot change game parameters.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme } from '../src/theme';
import { READ_ONLY } from './readonly';

interface PageTool {
  href: string;
  title: string;
  purpose: string;
  features: string[];
  open: string;
}

interface CliTool {
  cmd: string;
  title: string;
  purpose: string;
}

const PAGES: PageTool[] = [
  {
    href: './playground.html',
    title: 'Hřiště pro ladění',
    purpose: 'Hlavní nástroj pro optimalizaci parametrů: skutečná plavba a posuvníky všech čísel pohybu a ekonomiky.',
    features: [
      'posuvníky pohybu (poryv, doznívání, hranice lodí, elasticita hranice, překážky) a ekonomiky; platí pro další plavbu',
      'výběr uskupení nebo ruční řady, např. P.P | .P. | P.P, seed, záznam a přehrání poryvů, běh „nic nedělá“',
      'ladicí vrstvy (pruhy, hranice lodí, kᵢ, šířka W, histogram)',
      'měření přežití podle druhu a uskupení, návrh W_dobrá / W_průměrná, diagnostika ekonomiky',
      'sady parametrů a Exportovat konfiguraci (JSON do game.config.json)',
    ],
    open: 'Otevřít hřiště',
  },
  {
    href: './calculator.html',
    title: 'Kalkulátor očekávané hodnoty',
    purpose: 'Rychle ukáže důsledky parametrů ekonomiky bez plavby.',
    features: ['kalkulátor jednoho kola a tabulka přes x', 'kalkulátor předpovědi', 'diagnostika: křivka skóre, citlivost, zlom, perly, rozdělení successRate'],
    open: 'Otevřít kalkulátor',
  },
  {
    href: './style-guide.html',
    title: 'Vzorník',
    purpose: 'Kontrola vzhledu podle grafika.md před odevzdáním.',
    features: ['barvy, typografie, tvary a ikony', 'postavy a stavy lodí', 'čte přímo src/theme.ts a src/art/shapes.ts'],
    open: 'Otevřít vzorník',
  },
  {
    href: './host-test.html',
    title: 'Simulátor hlavní hry',
    purpose: 'Zkouška integrace hry v iframe.',
    features: ['odpovídá na READY zprávou INIT s různými payloady', 'vypisuje všechny zprávy, které hra posílá', 'VITE_ALLOWED_PARENT_ORIGINS zkouší filtrování původu'],
    open: 'Otevřít simulátor',
  },
  {
    href: '../data/',
    title: 'Statistiky hráčů (/data)',
    purpose: 'Souhrn odehraných her všech hráčů podle zadání: přežití podle druhu překážek a uskupení, rozdělení skóre.',
    features: ['zadání se vybírá na stránce (úroveň, kola, lodě, kapitál)', 'čte data ze statistického serveru, jen pro čtení'],
    open: 'Otevřít statistiky',
  },
  {
    href: '../',
    title: 'Hra (samostatně)',
    purpose: 'Hra tak, jak ji uvidí hráč. Úroveň a payload jdou z adresy.',
    features: ['/?level=2&payload={"rounds":3,"tutorial":false}', 'zprávy pro hlavní hru se vypisují do konzole'],
    open: 'Otevřít hru',
  },
];

const CLI: CliTool[] = [
  { cmd: 'npm run dev', title: 'Vývojový server', purpose: 'Spustí tuto stránku, hru a všechny nástroje na http://localhost:5173.' },
  { cmd: 'npm test', title: 'Testy modelu', purpose: 'node --test: plavba, trať, ekonomika, předpověď, měření (do ~10 s).' },
  { cmd: 'npm run check', title: 'Cíle T1–T14', purpose: 'Tabulka automaticky ověřitelných cílů (spec 7.4), při nesplnění vrací chybu. Prahy jsou v game.config.json, sekce targets.' },
  { cmd: 'npm run calc -- ships=30 premium=8 survive=80 rounds=5', title: 'Kalkulátor v terminálu', purpose: 'Stejné funkce jako stránka kalkulátoru.' },
  { cmd: 'npm run build', title: 'Produkční build', purpose: 'Kontrola typů a build do dist/. Vývojové stránky jsou v něm jen ke čtení (parametry nejdou měnit ani exportovat).' },
];

// The host simulator posts arbitrary INIT payloads to the game, so it is development-only.
const VISIBLE_PAGES = PAGES.filter((t) => !(READ_ONLY && t.href === './host-test.html'));

const FILES: { file: string; what: string }[] = [
  { file: 'game.config.json', what: 'všechna ladicí čísla a prahy cílů; sem se vkládá export z hřiště' },
  { file: 'specification.md', what: 'specifikace, cíle T1–T14 (kap. 7.4), zjištěné nesrovnalosti (kap. 10)' },
  { file: 'grafika.md', what: 'grafický manuál, podle něj se kontroluje vzorník' },
  { file: 'implementation-plan.md', what: 'plán implementace a struktura souborů' },
  { file: 'README.md', what: 'spuštění, integrace s hlavní hrou, struktura projektu' },
];

function CopyCommand({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <div className="cmd">
      <code>{cmd}</code>
      <button onClick={copy}>{copied ? 'Zkopírováno' : 'Kopírovat'}</button>
    </div>
  );
}

function PageCard({ t, primary }: { t: PageTool; primary?: boolean }) {
  return (
    <div className="card">
      <span className="tag">stránka</span>
      <h3>{t.title}</h3>
      <p>{t.purpose}</p>
      <ul>{t.features.map((f) => <li key={f}>{f}</li>)}</ul>
      <a className={`btn ${primary ? '' : 'secondary'}`} href={t.href}>{t.open}</a>
    </div>
  );
}

function App() {
  return (
    <>
      <h1>Lodní fond: vývojářský přehled</h1>
      <p className="muted">Všechny vývojové nástroje na jednom místě.{READ_ONLY ? ' Nasazená verze je jen ke čtení: žádný parametr hry nejde změnit.' : ''}</p>
      <div className="note-box">
        Ladí se <strong>hraním v hřišti</strong>, kalkulátor a <code>npm run check</code> ukážou důsledky. Výsledek se exportuje z hřiště a vloží do <code>game.config.json</code>.
      </div>

      <h2>Webové nástroje</h2>
      <div className="cards">
        {VISIBLE_PAGES.map((t, i) => <PageCard key={t.href} t={t} primary={i === 0} />)}
      </div>

      <h2>Příkazy (v terminálu ve složce lodni_fond)</h2>
      <div className="cards">
        {CLI.map((t) => (
          <div className="card" key={t.cmd}>
            <span className="tag cli">příkaz</span>
            <h3>{t.title}</h3>
            <p>{t.purpose}</p>
            <CopyCommand cmd={t.cmd} />
          </div>
        ))}
      </div>

      <h2>Soubory a dokumentace</h2>
      <table>
        <thead>
          <tr><th>Soubor</th><th>K čemu</th></tr>
        </thead>
        <tbody>
          {FILES.map((f) => (
            <tr key={f.file}>
              <td><code>{f.file}</code></td>
              <td>{f.what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

applyTheme();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
