# Report Generator

Script Node.js che trasforma un semplice file di testo con l'elenco delle attività mensili in un PDF ordinato e stampabile.

Nessun browser headless, nessun template esterno: solo [PDFKit](https://pdfkit.org/).

## Caratteristiche

- Titolo con il mese di riferimento, numero di task e data di generazione
- Tabella **Data / Argomento / Descrizione** con testo che va a capo automaticamente
- Intestazione della tabella ripetuta a ogni pagina, righe a zebra, separatore più marcato al cambio di giornata
- Giorno della settimana sotto la data, footer con mese e numerazione pagine
- Task ordinate automaticamente per data: il file di input non deve essere già in ordine
- Parser tollerante (righe di separazione, spazi mancanti, date in formati diversi)
- Tutto lo stile è concentrato in un unico oggetto `CONFIG` in cima al file

## Requisiti

- Node.js 14 o superiore
- `pdfkit`

```bash
npm install pdfkit
```

## Uso

```bash
node genera-report.js <input.txt> [output.pdf]
```

Esempi:

```bash
node genera-report.js luglio.txt              # crea luglio.pdf nella stessa cartella
node genera-report.js luglio.txt report.pdf   # nome di output esplicito
```

Output in console:

```
 26 attività  ·  mese: LUGLIO 2026
 PDF generato: luglio.pdf
```

## Formato del file di input

```
------------------------
LUGLIO 2026

2026-07-01
- Patching Cluster - Verifiche Grafana e metriche per buchi di sample.
2026-07-06
- Patching Cluster - Risoluzione fault dei sample nei monitoraggi.
- FEU - Test di verifica degli iniettori di carico.
- Verifica e aggiornamento catena dei certificati.
```

Regole:

| Riga | Interpretazione |
| --- | --- |
| Solo trattini, uguali, asterischi o cancelletti (`---`, `===`) | Ignorata |
| Prima riga utile | Mese di riferimento, usato come titolo del PDF |
| `2026-07-01` oppure `01/07/2026` | Imposta la data corrente |
| Riga che inizia con `-`, `*` o `•` | Task assegnata alla data corrente |
| Riga vuota | Ignorata |

Il testo della task viene diviso al primo `" - "` (trattino circondato da spazi) in **Argomento** e **Descrizione**. Se il separatore non c'è, l'argomento resta vuoto e tutto il testo finisce nella descrizione. Un trattino senza spazi, come in `VMWare-OCPVirt`, non viene considerato separatore.

### Argomenti composti

Con un testo come `Libretti - Poteri di firma - Test prestazionale`, l'euristica `mergeShortTopic` unisce all'argomento anche il secondo segmento quando è corto (≤ 24 caratteri) ed è seguito da altro testo, ottenendo:

- Argomento: `Libretti - Poteri di firma`
- Descrizione: `Test prestazionale`

Per disattivarla e dividere sempre al primo separatore, imposta `mergeShortTopic: false`.

## Configurazione

Tutte le opzioni si trovano nell'oggetto `CONFIG` all'inizio di `genera-report.js`.

| Opzione | Default | Descrizione |
| --- | --- | --- |
| `pageSize` | `'A4'` | Formato pagina (qualsiasi valore supportato da PDFKit) |
| `margin` | `40` | Margine della pagina in punti |
| `colData` | `78` | Larghezza colonna Data |
| `colArgomento` | `150` | Larghezza colonna Argomento (la Descrizione occupa lo spazio restante) |
| `font` | Helvetica | Famiglie di font regular / bold / italic |
| `size` | — | Corpo di titolo, sottotitolo, intestazione tabella, celle, footer |
| `color` | — | Palette: titolo, accento, sfondo intestazione, righe alternate, linee |
| `cellPaddingX` / `cellPaddingY` | `7` / `6` | Padding interno delle celle |
| `minRowHeight` | `22` | Altezza minima di una riga |
| `mergeShortTopic` | `true` | Unisce all'argomento un secondo segmento corto |
| `shortTopicMaxLen` | `24` | Soglia di caratteri per l'euristica sopra |
| `showWeekday` | `true` | Mostra il giorno della settimana sotto la data |
| `ripetiData` | `true` | Ripete la data su ogni task; con `false` compare solo sulla prima task della giornata |

## Uso come modulo

Lo script esporta le due funzioni principali, utili per integrarlo in un altro tool:

```js
const { parseFile, creaPdf } = require('./genera-report');

const dati = parseFile(fs.readFileSync('luglio.txt', 'utf8'));
// dati.mese  -> 'LUGLIO 2026'
// dati.tasks -> [{ data: Date, argomento: string, descrizione: string }, ...]

creaPdf(dati, 'report.pdf');
```

## Esempio file di dati

Luglio.txt
```txt
------------------------
LUGLIO 2026

2026-07-01
- Patching Cluster - Verifiche configurazioni namespace OCP Monitoraggio e metriche per buchi di sample.
2026-07-03
- Patching Cluster - Verifiche configurazioni namespace OCP Monitoraggio e metriche per buchi di sample.
- Libretti - Poteri di Firma - Report e verbalizzazione.
```

## Errori gestiti

| Messaggio | Causa |
| --- | --- |
| `File non trovato` | Il percorso passato come primo argomento non esiste |
| `Mese di riferimento non trovato` | Il file non contiene una riga di testo iniziale con il mese |
| `Nessuna attività trovata nel file` | Nessuna riga di task riconosciuta |

In tutti i casi lo script termina con exit code `1`.

## Licenza

MIT
