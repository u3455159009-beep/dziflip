# Wakeify — budík s vlastní hudbou a ranními úkoly

Wakeify budí skladbou uloženou v telefonu (bez internetu). Vypnout ho jde až po splnění úkolu: příklady, kroky, QR kód, fotka předmětu nebo jejich kombinace.

- **Stack:** Expo SDK 57 (React Native 0.86, TypeScript) a vlastní nativní modul `modules/wakeify-alarm`.
- **Android:** AlarmManager `setAlarmClock` a služba v popředí.
- **iOS 26+:** AlarmKit. Starší iOS buzení jen přes oznámení.

> **Stav:** aplikace ještě **nikdy neběžela na skutečném telefonu** a nebyla sestavena nativním buildem (Gradle / Xcode / EAS). Přehled toho, co je ověřeno a jak, je v sekci 3. Před prvním spolehnutím se na budík proveď test ze sekce 2.

---

## 1. Instalace do telefonu (EAS Build)

Na svém počítači potřebuješ jen Node.js 22.13+. Sestavení proběhne v cloudu Expo. **Hesla ani klíče do repozitáře nepatří**, EAS je spravuje sám.

```bash
cd wakeify
npm install
npx eas-cli@latest login          # účet na expo.dev (zdarma)
npx eas-cli@latest init           # vytvoří EAS projekt a zapíše projectId do app.json → commitni
```

> Identifikátory `app.wakeify` (Android `package`, iOS `bundleIdentifier`) v `app.json` nemusí být volné. Pokud je EAS nebo Apple odmítne, změň je na vlastní, např. `com.tvojejmeno.wakeify`.

### Android (APK)

```bash
npm run build:android:preview     # = eas build -p android --profile preview
```

1. Po dokončení (cca 10–20 min) otevři v telefonu odkaz nebo QR kód z výstupu EAS a stáhni APK.
2. Povol instalaci z tohoto zdroje a nainstaluj.
3. Při prvním spuštění projdi obrazovku **Spolehlivost** a povol přesné budíky, oznámení, zobrazení přes zamčenou obrazovku a výjimku z úspory baterie.

Profil `preview` obsahuje JS přímo v aplikaci, takže je vhodný pro test buzení. Profil `development` potřebuje běžící `npx expo start` a slouží jen k vývoji.

### iPhone (iOS 26+ kvůli AlarmKit) — přes TestFlight

Bez Macu, bez registrace zařízení a bez Režimu vývojáře. Build a odeslání do TestFlightu může spustit kdokoli, kdo má tajné údaje v proměnných prostředí, včetně Claude v cloudovém prostředí. Skript `scripts/eas-ios-testflight.sh` je nikdy nezapisuje do repozitáře.

**Jednou ruční kroky (vlastník účtů):**

1. **Apple Developer Program** (99 USD/rok): https://developer.apple.com/programs/enroll/ (schválení obvykle 24–48 h, někdy déle).
2. **App Store Connect API klíč:** https://appstoreconnect.apple.com → *Uživatelé a přístup* → *Integrace* → *App Store Connect API* → *Klíče týmu* → **+**.
   - Role **Admin** (Expo ji potřebuje ke správě certifikátů).
   - Stáhni `AuthKey_XXXX.p8`. **Jde stáhnout jen jednou.**
   - Opiš si *Key ID* a *Issuer ID*.
   - *Team ID* najdeš na https://developer.apple.com/account → *Membership details*.
3. **Expo účet a token:**
   - Registrace na https://expo.dev/signup.
   - Token vytvoříš na https://expo.dev/settings/access-tokens → *Create token*.
   - Token se zobrazí jen jednou. Nevkládej ho do chatu ani do souborů.
4. **Záznam aplikace v App Store Connect** (až po prvním kroku `credentials`, který zaregistruje bundle ID):
   - *Aplikace* → **+** → *Nová aplikace*, platforma iOS, bundle ID `app.wakeify`, libovolné SKU.
   - Číselné Apple ID aplikace si skript zjistí sám.
5. **iPhone:** nainstaluj aplikaci **TestFlight** z App Store, přihlas se stejným Apple ID. Jako vývojář účtu jsi automaticky interní tester.

**Proměnné prostředí** (cloudové prostředí: *Edit* → *Environment variables*; lokálně `export …`):

| Proměnná | Hodnota |
|---|---|
| `EXPO_TOKEN` | token z expo.dev |
| `EXPO_ASC_KEY_ID` | Key ID |
| `EXPO_ASC_ISSUER_ID` | Issuer ID |
| `EXPO_APPLE_TEAM_ID` | Team ID |
| `EXPO_APPLE_TEAM_TYPE` | `INDIVIDUAL` (nebo `COMPANY_OR_ORGANIZATION`) |
| `EXPO_ASC_API_KEY_P8_BASE64` | obsah `.p8` v base64 na jednom řádku: macOS/Linux `base64 -i AuthKey_XXXX.p8 \| tr -d '\n'`, Windows PowerShell `[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXX.p8"))` |

**Povolené domény** (jen pro cloudové prostředí; *Network access* → *Custom*, ponech výchozí balíčkové registry):

```
api.expo.dev
expo.dev
logs.expo.dev
storage.googleapis.com
api.appstoreconnect.apple.com
```

**Spuštění:**

```bash
scripts/eas-ios-testflight.sh check        # ověří proměnné, síť a token; vytvoří EAS projekt
scripts/eas-ios-testflight.sh credentials  # jen poprvé: certifikát + profil + API klíč pro odeslání (dotazy v terminálu)
scripts/eas-ios-testflight.sh build        # build v cloudu Expo + odeslání do TestFlightu
```

Po zpracování v App Store Connect (zhruba 10–30 min) se build objeví v aplikaci TestFlight → *Instalovat*. Interní testování nevyžaduje schválení od Apple. Bezplatný plán Expo má omezený počet iOS buildů za měsíc a pomalejší frontu.

> Pokud Apple odmítne bundle ID `app.wakeify` (už ho používá někdo jiný), změň `ios.bundleIdentifier` v `app.json` na vlastní, např. `cz.tvojejmeno.wakeify`.

### Lokálně bez EAS (alternativa)

`npx expo run:android` (Android Studio a SDK 36) nebo `npx expo run:ios --device` (macOS, Xcode 26.4+). Expo Go **nestačí**, protože neobsahuje nativní modul.

## 2. Test na skutečném telefonu (cca 20 min, nutné před ostrým použitím)

| # | Postup | Očekávání |
|---|---|---|
| 1 | Vytvoř budík, importuj MP3, v Nastavení → Spolehlivost povol vše | všechny položky zelené |
| 2 | Editor budíku → **Uložit a vyzkoušet (za 10 s)**, zamkni telefon | rozsvítí se displej a hraje tvoje skladba (iOS: 29s úryvek, po otevření aplikace celá skladba) |
| 3 | Totéž v **režimu letadlo** | stejné |
| 4 | Budík na +3 min, zamkni telefon, nech zazvonit, dej **Odložit** | ztichne, za N minut zazvoní znovu; v historii 1 záznam s odložením |
| 5 | Při zvonění otevři úkol, uprostřed **zamkni telefon** nebo odejdi na plochu | *Zamýšleno:* Android hraje dál; iOS hraje dál, a pokud ztichne, systém zazvoní znovu do ~90 s. **Tento bod rozhodne, zda to platí.** |
| 6 | Spusť úkol a **vyřeš ho** | ticho; **žádné další zazvonění** během 15 min (záložní budíky zrušené); v historii „úspěch“ |
| 7 | iOS: při zvonění stiskni systémové **Zastavit** a aplikaci neotvírej | *Zamýšleno:* do ~1 min zazvoní záložní budík (opakuje se 10×) |
| 8 | Jednorázový budík nech zazvonit a vyřeš | v seznamu je vypnutý a druhý den nezazvoní |
| 9 | Budík na +5 min, **restartuj telefon**, odemkni | zazvoní (Android: obnova po bootu; iOS: AlarmKit) |
| 10 | Změň časové pásmo v nastavení systému | budík 07:00 zůstane 07:00 místního času |
| 11 | Úkoly: QR (vytiskni kód), fotka (předloha + ranní fotka ze stejného místa), kroky | splnění vypne budík; po 3 nezdarech u fotky nabídne náhradní ověření |

Pokud některý bod selže, pošli mi číslo bodu, model telefonu a verzi systému.

## 3. Co je ověřeno — a jak

| Oblast | Ověření v tomto prostředí | Na telefonu |
|---|---|---|
| TypeScript celé aplikace | `tsc --noEmit` → 0 chyb | — |
| Doménová logika (plánování vč. letního času a změny pásma, rotace úkolů, matematika, statistiky, odložení, dohledání zmeškaných, statistiky) | **84 testů Vitest** (vč. repozitářů proti skutečnému SQLite) | — |
| Tok zvonění (pořadí nativních volání, odložení, dokončení, testovací zvonění, souběh) | 9 testů s nahrazeným nativním modulem. Test, který chybu skutečně chytá, je ověřený: prohození pořadí volání nechá 2 testy spadnout | ❌ |
| JS bundle | `expo export` pro Android i iOS → OK | — |
| Konfigurace | `expo prebuild` → manifest, Info.plist, entitlements a autolinking modulu na obou platformách OK; `eas.json` validní (`@expo/eas-json`) | — |
| UI tok | webový náhled + Playwright: onboarding → nový budík → zvonění → 3 příklady → uvítání, světlý i tmavý režim, bez chyb | ❌ (nativní UI neověřeno) |
| Android engine (Kotlin) | Jádro (9 souborů bez závislosti na Expo) se **kompiluje** proti `android-all` API 35. **39 JUnit testů** prošlo (čas, změna času, obnova po restartu, JSON, ukončení zvonění, cesty k souborům). Vrstva pro Expo (`WakeifyAlarmModule.kt`) je ověřená jen částečnou kompilací proti zdrojům expo-modules-core | ❌ |
| iOS engine (Swift) | **Typová kontrola** všech 7 souborů skutečným Swift 6.2.4 (Linux) proti ručně psaným náhradám Apple frameworků a Expo; 0 chyb. **15 scénářů** úložiště a plánovače skutečně spuštěno (odložení, záložní budíky, testovací zvonění, dokončení). Nejde o build v Xcode | ❌ |
| AlarmKit chování | jen podle dokumentace a fór Apple | ❌ **neověřeno** |

Opakování kontrol:

```bash
npm run verify                         # tsc + vitest + expo export
npx tsx scripts/calibrate-vision.ts    # rozpoznávání fotek, ladicí sada
python3 scripts/vision-heldout/prepare.py /tmp/ho && npx tsx scripts/vision-heldout/evaluate.ts /tmp/ho
docker run --rm -v "$PWD":/w -w /w/tools/ios-typecheck swift:6.2-noble sh run.sh   # iOS typecheck + harness
(cd tools/android-verify && gradle clean test)                                      # Kotlin jádro + 39 JUnit testů (JDK 21)
```

### Rozpoznávání fotek — co čísla znamenají

Porovnání ranní fotky s 1–3 předlohami běží offline v TS (barvy, HOG, rozložení jasu, dHash). Sady:

- **Ladicí sada** (`src/vision/__fixtures__`): 12 fotografií (scikit-image, matplotlib) × 6 syntetických „ranních“ úprav (posun, rotace, tma/světlo, šum, teplé světlo) + 1 stereo pár = 73 pravých dvojic. Na této sadě se **ladily i prahy**. Střední přísnost: přijato 72/73 (98,6 %), cizí scény 0. **Číslo je optimistické**, protože ladicí a testovací data jsou stejná.
- **Nezávislá sada** (`scripts/vision-heldout`): 54 fotografií z repozitářů OpenCV, prahy zmrazené předem. Střední přísnost:
  - syntetické úpravy: **317/324 (97,8 %)**
  - cizí scény přijaté omylem: **1/11 032**
  - **skutečná změna pozice kamery** (panoramata, stereo páry): jen **10/23 (43,5 %)**

**Co z toho plyne:** fotka spolehlivě projde, když ji ráno uděláš **ze stejného místa a podobným záběrem** jako předlohu. Při posunu o krok nebo jiném úhlu často neprojde. Proto se po 3 nezdarech nabídne náhradní ověření (5 těžkých příkladů). Přesnost na skutečných ranních fotkách z telefonu změřená není.

> **Zamýšlené vs. ověřené chování.** Všechna tvrzení o tom, *kdy* budík znovu zazvoní (~1 min záložní budík, ~90 s pojistka, ~2 s obnovení skladby) a že budík „neztichne“, popisují, **jak je kód napsaný**. Na skutečném telefonu ověřená nejsou. Kotlin testy, Swift typová kontrola i testy toku zvonění běží proti náhradám systému, nikoli proti Androidu nebo iOS.

## 4. Omezení systému (nelze obejít)

**iOS (AlarmKit, ověřeno v dokumentaci a na fórech Apple):**
- Tlačítko **Zastavit** nejde odebrat ani zablokovat; i fyzická tlačítka alarm ztiší. Wakeify proto plánuje **záložní budíky** (výchozí každou 1 min, 10×) do splnění úkolu.
- Vlastní zvuk musí být **< 30 s** a podle hlášení vývojářů **hraje jednou, ne ve smyčce**. Zvuk ze složky `Library/Sounds` měl v iOS 26.0 potvrzenou chybu.
- **Celá skladba hraje jen v otevřené aplikaci.** *Zamýšlené chování, neověřené na iPhonu:* když řešíš úkol a aplikace přejde na pozadí, skladba pokračuje díky režimu audio na pozadí. Když ji přeruší systém, aplikace se ji pokusí každé ~2 s obnovit. Když ztichne nebo aplikace zanikne, má systém zazvonit znovu do ~90 s (průběžně posouvaná pojistka). Testy s náhradami Apple frameworků tohle **nepotvrzují**. Chování AlarmKitu a audio session se ukáže až na telefonu (sekce 2, body 5 a 7).
- Budíky aplikace **skryté nebo zamčené přes Face ID** podle Apple tiše selžou.
- **iOS < 26:** jen oznámení. Neprorazí tichý režim (to by vyžadovalo entitlement Critical Alerts od Apple) a platí limit 64 naplánovaných oznámení.

**Android:**
- **Vynucené zastavení** aplikace (Nastavení → Vynutit zastavení) zruší všechny budíky. Vrátí se po dalším spuštění Wakeify.
- **Po restartu před prvním odemčením** zazní systémový tón místo skladby (soubor je v šifrovaném úložišti). Obrazovka s úkolem se otevře až po odemčení.
- **Bez oprávnění k oznámením** budík hraje, ale obrazovka zvonění se sama neotevře; musíš otevřít aplikaci.
- Někteří výrobci (Xiaomi, Huawei, …) aplikace agresivně uspávají. Nastav výjimku z úspory baterie.
- **Při hovoru** se budík jen ztiší (ne úplně). *Zamýšleno, neověřeno na zařízení:* jiná aplikace přehrávající zvuk by ho neměla umlčet (kód při ztrátě audio focusu nepauzuje). Někteří výrobci ale mohou zvuk budíku během hovoru ztlumit systémově.
- Smyčka skladby začíná od 0:00, ne od nastaveného začátku.

## 5. Architektura (stručně)

```
src/app/            obrazovky (expo-router): záložky, editor, zvonění, uvítání, oprávnění, cíle úkolů
src/domain/         čistá logika — plně testovaná
src/vision/         offline porovnání fotek
src/data/           SQLite: schéma, migrace, repozitáře
src/services/       most k nativnímu enginu, tok zvonění (ringFlow), hudba, audio
modules/wakeify-alarm/
  src/WakeifyAlarm.types.ts   kontrakt JS ↔ nativní
  android/  README.md — architektura, chování, co ověřit na zařízení
  ios/      README.md — AlarmKit, záložní budíky, odložení, „Unverified on device“
tools/ios-typecheck/  reprodukovatelná typová kontrola Swiftu
scripts/vision-heldout/  nezávislé vyhodnocení rozpoznávání fotek
```

**Tok budíku:**

1. Uložení budíku zapíše data do SQLite a zavolá `syncAlarms`. Nativní engine dostane **pravidla** (čas, dny, zvuk), ne jednotlivé časy, takže po restartu nebo změně času přeplánuje sám.
2. Když budík zazvoní, obrazovka zvonění vybere úkol a zapíše provizorní záznam „zmeškáno“ (deterministické ID, takže každé probuzení má jeden záznam).
3. Splnění úkolu → `markOccurrenceHandled(alarmId)` zruší zvonění, odložení i **všechny záložní budíky** daného probuzení a záznam změní na „úspěch“.
4. Odložení nejdřív naplánuje další zazvonění a **teprve potom** ztiší aktuální. Když plánování selže, budík zvoní dál.

Všechna data jsou jen v telefonu: žádný účet, žádný server.
