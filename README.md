# Läsäventyret

Webbapp (PWA) som lär Oscar, 6 år, att läsa svenska med ljudningsmetoden. Byggd för iPad i
landskapsläge. Ingen text behövs för att navigera: allt läses upp med en neural svensk röst.

## Köra lokalt

```
npm install
npm run dev        # http://localhost:5180  (även på LAN-IP för iPaden)
npm run test       # motor-tester (behärskning, passbyggare, upplåsning)
npm run build      # typkontroll + produktionsbygge till dist/
```

Dropbox låser filer i `node_modules` och `dist`. Båda mapparna är markerade `com.dropbox.ignored`
(PowerShell: `Set-Content -Path dist -Stream com.dropbox.ignored -Value 1`) och Vites cache ligger i
tempkatalogen. Får du `EBUSY`/`EPERM` ändå: pausa Dropbox en stund.

Testläge: kryssrutan "Alla planeter öppna" i föräldravyn, eller öppna appen en gång med
`?unlockAll=1` i adressen (`?unlockAll=0` stänger av). I dev öppnar `?task=build-word:mor` en enda uppgift.

## Generera ljud (Azure TTS)

1. Skapa en Speech-resurs i Azure (gratisnivån räcker: 500 000 tecken/mån).
2. Kopiera `.env.example` till `.env` och fyll i `AZURE_SPEECH_KEY` och `AZURE_SPEECH_REGION`.
3. Kör:

```
npm run audio:list   # visar alla ljud-id och vilka som saknas
npm run audio        # genererar bara det som saknas eller ändrats
npm run audio -- --force            # gör om allt (t.ex. byte av röst)
npm run audio -- --only phrase.     # bara id:n med visst prefix
```

Ljudet hamnar i `public/audio/*.mp3` med `public/audio/manifest.json` som index. Manifestet
hashar röst + SSML per id, så en ändrad fras genereras om automatiskt. Röst byts med
`AZURE_VOICE` (`sv-SE-SofieNeural` är standard, `sv-SE-MattiasNeural` finns också).

Utan ljudfiler är appen tyst (kort paus i stället för tal). Den använder aldrig Web Speech API.

### Bokstavsljud

Bokstäverna sägs som ljud ("sss", inte "ess") via IPA-fonem i `src/content/letters.json`
(`ipa`-fältet). TTS klarar hållbara ljud (s, m, l, vokaler) bra men stopp-ljud (p, t, k, b, d, g)
blir svaga. Föräldravyn får i fas 4 en inspelningsfunktion; egen inspelning går alltid före TTS.

## Lägga till innehåll

Allt innehåll ligger i `src/content/*.json`. Ändra JSON, kör `npm run audio`, klart.

| Fil | Innehåll |
|---|---|
| `letters.json` | bokstäver i inlärningsordning, ljud (IPA), exempelord |
| `words.json` | ord med emoji och ljudsekvens (`sounds`); `decodable: false` = kluster/dubbelteckning, väntar på Verkstan; tom `emoji` = stavelse utan bild |
| `phrases.json` | alla instruktioner, beröm, knappetiketter (id → text) |
| `levels.json` | planeter: bokstäver, spel, vad som krävs för upplåsning, position på kartan |
| `mascots.json`, `names.json` | maskoter och namnförslag |
| `outfits.json`, `stickers.json` | kläder (stjärntröskel) och klistermärken |
| `config.json` | barnets namn, uppgifter per pass, andel repetition, passlängd |
| `sightwords.json` | ordbilder (och, är, jag ...) |
| `rhymes.json` | rimpar av ord-id (båda måste ha emoji) |
| `sentences.json` | tokiga meningar: text, rätt bild (emoji), två fel bilder |
| `stories.json` | berättelser: titel, meningar, fråga, tre bild-alternativ, index för rätt svar |

Nytt ord: lägg till en rad i `words.json` med `id`, `text`, `emoji`, `sounds` och kör
`npm run audio`. Ny fras: lägg till nyckel i `phrases.json` och använd `phraseId('nyckel')`.

## Pedagogik och motor

- `src/engine/mastery.ts` – behärskning: tre rätt i rad spridda över minst två pass. Fel
  nollställer. Repetitionsintervall 0/1/3/7/14/30 dagar, fördubblas efter behärskning.
- `src/engine/sessionBuilder.ts` – bygger ett pass: varje bokstav i nivån minst en gång, resten
  viktat mot det svaga, plus ~25 % repetition från tidigare planeter (förfallna först). Ordandelen
  (Ljudtåget/Bygg ordet) växer från 25 % till 60 % i takt med att planetens bokstäver behärskas.
  Ord väljs bara bland dem vars alla ljud barnet mött (`decodable: true`, kända bokstäver).
  Stavelser utan bild (sa, os) körs bara i Ljudtåget; bildord varvar Bygg ordet och Ljudtåget.
- `src/engine/unlock.ts` – en planet är klar vid 80 % behärskade bokstäver; nästa låses upp.
- Två fel i rad på samma uppgift ger scaffolding (bara rätt bokstav visas, pekare, långsamt ljud).

## Spel

| Spel | Fil | Tränar |
|---|---|---|
| Fånga ljudet | `src/games/CatchSound.tsx` | bokstav–ljud |
| Ljudtåget | `src/games/SoundTrain.tsx` | ljuda ihop i ordning, sedan välja rätt bild |
| Bygg ordet | `src/games/BuildWord.tsx` | dra/tryck brickor till rutor, ordet ljudas ihop |
| Vilket ord? | `src/games/WhichWord.tsx` | hör ett ord, välj rätt skrivet ord (ordbilder eller lika långa ljudenliga ord) |
| Ordbilds-memory | `src/games/SightMemory.tsx` | tre par ordbilder, varje kort läses upp |
| Rimjakt | `src/games/RhymeHunt.tsx` | hör ett ord, välj bilden som rimmar (`rhymes.json`) |
| Tokiga meningar | `src/games/SillySentences.tsx` | läs själv, välj rätt bild; högtalaren läser ord för ord (`sentences.json`) |
| Berättelse | `src/games/StoryReader.tsx` | 3–5 meningar, pil för nästa, bildfråga (`stories.json`) |

Nytt spel: skapa komponent med samma props (`task`, `scaffold`, `celebrating`, `onWrong`, `onSolved`),
lägg till id i `GameId` (`src/content/index.ts`), i `AVAILABLE_GAMES` (`src/games/index.ts`), i
passbyggaren och i `SessionScreen.tsx`, och lista spelet på planeterna i `levels.json`.

## Planeter och klarkrav

`levels.json` har `kind`: `letters` (bokstäver + ord), `sightwords`, `cluster` (Turboverkstan: ord med
`decodable: false`), `sentences`, `stories`, `phonology` (Startrampen, bonus). En planet är klar när en
andel av dess innehåll behärskas (`src/engine/unlock.ts`): bokstäver 80 %, ordbilder 80 %, kluster 50 %,
meningar 50 %, berättelser 60 %. Kartan är 175 vw bred och panoreras med finger/mus eller pilknapparna.

## Svårighetsgrad och genvägar

Föräldravyn: Lätt/Medel/Svår styr ordandel (25/45/60 % som grund), max stavelser utan bild (2/1/0) och
ordspelens ordning. Planeter kan bockas som klara där, så att nästa låses upp direkt.

## Bokstavsljud

Vokalerna sägs som bokstavsnamn (i svenska = det långa ljudet). Konsonanter via IPA-fonem; stopp-ljuden
(p, t, k, b, d, g) blir aldrig bra i TTS. Spela in dem själv i föräldravyn (🎙️): inspelningen sparas i
IndexedDB, går alltid före TTS och följer med i Exportera/Importera (base64) så att den kan flyttas från
datorn till iPaden. Inspelning kräver https eller localhost.

## Progress

Sparas i localStorage (`lasaventyret-progress-v1`). Export/import som JSON finns i föräldravyn
(håll in kugghjulet 3 s + räkneuppgift).

## Egna ord

Föräldravyn, avsnittet Egna ord: skriv ordet, välj emoji, spela in uttalet (krävs, det finns ingen TTS
i appen vid körning). Ordet registreras i den vanliga ordlistan och dyker upp i Ljudtåget, Bygg ordet
och Vilket ord? när barnet mött ordets bokstäver. Sparas i IndexedDB och följer med i export/import.

## Ljudregler

Allt tal går via `audio.speak()`/`audio.speakEach()` i `src/audio/AudioManager.ts`: ett nytt anrop
avbryter det pågående, även ljud som ännu inte laddats. Anropa aldrig `audio.play()` direkt från spel,
då kan två röster överlappa.

## Deploy

1. DNS: A-post `lasaventyret.elf98.com` → 159.89.22.162.
2. På servern (PuTTY): kopiera `deploy/apache-lasaventyret.conf` till `~/lasaventyret.conf` och kör
   raderna i `deploy/server-setup.sh` (vhost, `a2ensite`, certbot). Vhosten är IP-baserad enligt
   serverns konvention.
3. Här: `.\deploy.ps1` bygger och kopierar `dist/` med tar över ssh till `/var/www/lasaventyret/`.
   HTTPS krävs för PWA-installation och mikrofon på iPaden.

## Status per fas

- [x] Fas 1: grund, ljudsystem, maskot, karta, progressmodell, föräldralås, Fånga ljudet
- [x] Fas 2: alla bokstäver i spel, Bygg ordet, Ljudtåget, klistermärkesbok, adaptiv repetition (ord + bokstäver)
- [x] Fas 3: ordbilder (Vilket ord?, memory), Rimjakt, Turboverkstan (kluster/dubbelteckning), Tokiga meningar, miniberättelser, svårighetsgrad
- [x] Fas 4: inspelning av bokstavsljud, egna ord med bild, export/import av allt, PWA-manifest
- [x] Deploy: live på https://lasaventyret.elf98.com sedan 13 sep 2026 (DNS i Cloudflare, IP-baserad vhost, certbot). Uppdateringar: `.\deploy.ps1`
