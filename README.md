# dziflip — analýza flipů nemovitostí

Osobní nástroj pro vyhledávání, analýzu a plánování flipů nemovitostí v ČR.
Vložíte odkaz nebo text inzerátu → aplikace extrahuje dostupné údaje, vypočítá
cenovou analýzu, maximální nákupní cenu, ekonomiku flipu a rozpočet rekonstrukce.

## Architektura

- **Next.js 14 (App Router) + TypeScript** — frontend i backend (API routes) v jednom projektu
- **Prisma + SQLite** (`prisma/dev.db`) — databáze projektů, srovnání, rozpočtu a fotografií
- **Tailwind CSS** — prémiové minimalistické UI (bílá/béžová, zaoblené karty)
- Oddělené vrstvy v `src/lib/`:
  - `extract.ts` — extrakce údajů z textu/HTML inzerátu (regex heuristiky, nikdy nevymýšlí data)
  - `fetchListing.ts` — server-side stažení URL inzerátu
  - `calc.ts` — čistě matematický výpočtový engine (max. nákupní cena, Flip Score pásma, ekonomika, citlivostní analýza)

## Spuštění

```bash
npm install
cp .env.example .env   # výchozí SQLite databáze, funguje bez úprav
npx prisma db push     # vytvoří dev.db
npm run dev            # http://localhost:3000
```

## Stav aplikace

### CO UŽ FUNGUJE
- Vložení URL nebo textu inzerátu → automatická extrakce údajů s vyznačením
  **OVĚŘENO / ODHADNUTO / NEZNÁMÉ** u každého pole (nikdy se nic nevymýšlí)
- Ruční oprava/doplnění libovolného pole (okamžitě označeno jako OVĚŘENO)
- Cenový engine se srovnatelnými nemovitostmi (ruční přidávání, průměr/medián/rozpětí Kč/m²,
  jasné rozlišení nabídková/odhadovaná/realizovaná cena)
- Flip Score (🔴🟠🟢⚡) počítaný matematicky z vašich parametrů, ne odhadem AI
- Maximální nákupní cena (MAX BUY PRICE) s live přepočtem při změně jakéhokoli čísla
- Kompletní ekonomika flipu (3 scénáře: konzervativní/základní/optimistický, marže, ROI)
- Interaktivní citlivostní analýza (matice cena × náklady rekonstrukce)
- Fotografie — galerie, ruční třídění dle místnosti a poznámky
- Rekonstrukční rozpočet po položkách i místnostech, kategorie, 3 cenové varianty
- Historie projektů (6 stavů) a porovnání 2–5 nemovitostí vedle sebe

### CO JE ZATÍM MOCK/DEMO
- Nic není fingované — chybějící data jsou vždy označena NEZNÁMÉ, nikdy nejsou nahrazena
  vymyšlenými hodnotami. "Levná/Premium" varianta rozpočtu je transparentní procentní odchylka
  od skutečně zadané "doporučené" varianty, ne reálně dohledaná data.

### CO POTŘEBUJE EXTERNÍ API (zatím nepřipojeno)
- **Automatické vyhledávání srovnatelných nemovitostí** — nyní se přidávají ručně;
  potřeba API/scraping realitních portálů nebo MLS zdroje
- **AI analýza fotografií** (rozpoznání místnosti, stav, co opravit/vyměnit) — potřeba Vision API
- **AI vizualizace rekonstrukce** (před/po) — potřeba image-generation API zachovávající
  perspektivu a geometrii místnosti
- **Vyhledávání konkrétních produktů a cen** pro nákupní seznam — potřeba API e-shopů/vyhledávání
- Extrakce z URL funguje jen pro portály, které vykreslují obsah na serveru; portály náročné
  na JavaScript (např. sreality.cz) vrátí málo dat — aplikace na to upozorní a vyzve k vložení
  textu inzerátu ručně

### DALŠÍ KROKY
1. Napojit vyhledávací API pro automatické srovnatelné nabídky
2. Napojit Vision API pro analýzu fotografií místnost po místnosti
3. Napojit image-generation API pro vizualizace rekonstrukce (PŘED/PO)
4. Napojit produktové vyhledávání pro automatický nákupní seznam
5. Rozšířit extrakci o další portály a strukturovaná data (JSON-LD), kde jsou dostupná

Citlivé API klíče patří výhradně do `.env` (server-side), nikdy do klientského kódu —
viz `.env.example` pro připravené proměnné budoucích integrací.
