#!/usr/bin/env node
/**
 * genera-report.js
 * -----------------------------------------------------------------------------
 * Legge un file di testo con l'elenco delle attività e produce un PDF ordinato
 * con il mese di riferimento e una tabella Data / Argomento / Descrizione.
 *
 * Uso:
 *   node genera-report.js <input.txt> [output.pdf]
 *
 * Formato del file di input:
 *   ------------------------        <- righe di separazione: ignorate
 *   LUGLIO 2026                     <- prima riga utile = mese di riferimento
 *
 *   2026-07-01                      <- riga data (YYYY-MM-DD, DD/MM/YYYY, ...)
 *   - Argomento - Descrizione       <- attività di quella data
 *   - Descrizione senza argomento
 *
 * Dipendenze: npm install pdfkit
 * -----------------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

/* ============================ CONFIGURAZIONE ============================== */

const CONFIG = {
  pageSize: 'A4',
  margin: 40,

  // Larghezze delle prime due colonne; la descrizione occupa lo spazio restante
  colData: 78,
  colArgomento: 150,

  font: { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique' },
  size: { title: 24, subtitle: 9.5, tableHeader: 9, cell: 9, footer: 8 },

  color: {
    title: '#0F172A',
    muted: '#64748B',
    accent: '#1D4ED8',
    headerBg: '#0F172A',
    headerText: '#FFFFFF',
    rowAlt: '#F1F5F9',
    line: '#CBD5E1',
    groupLine: '#94A3B8',
    text: '#1E293B',
  },

  cellPaddingX: 7,
  cellPaddingY: 6,
  minRowHeight: 22,

  // "Libretti - Poteri di firma - Test ..." → se il secondo pezzo è corto viene
  // unito all'argomento. Metti a false per dividere sempre al primo " - ".
  mergeShortTopic: true,
  shortTopicMaxLen: 24,

  showWeekday: true,

  // true  = la data viene ripetuta su ogni task, anche se dello stesso giorno
  // false = la data compare solo sulla prima task di ogni giornata
  ripetiData: true,
};

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/* ================================ PARSING ================================= */

const RE_SEPARATOR = /^[-=_*#\s]{3,}$/;              // ------------------------
const RE_ISO = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/; // 2026-07-01
const RE_EU = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/; // 01/07/2026

function parseData(riga) {
  const s = riga.trim();
  let m = s.match(RE_ISO);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(RE_EU);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return null;
}

function splitArgomento(testo) {
  const parti = testo.split(/\s+-\s+/); // separatore " - " (con spazi)
  if (parti.length === 1) return { argomento: '', descrizione: testo.trim() };

  let argomento = parti[0].trim();
  let resto = parti.slice(1);

  if (CONFIG.mergeShortTopic && resto.length > 1 && resto[0].trim().length <= CONFIG.shortTopicMaxLen) {
    argomento += ' - ' + resto[0].trim();
    resto = resto.slice(1);
  }
  return { argomento, descrizione: resto.join(' - ').trim() };
}

function parseFile(contenuto) {
  const righe = contenuto.split(/\r?\n/);
  let mese = null;
  let dataCorrente = null;
  const tasks = [];

  for (const rigaRaw of righe) {
    const riga = rigaRaw.trim();
    if (!riga || RE_SEPARATOR.test(riga)) continue;

    const data = parseData(riga);
    if (data) { dataCorrente = data; continue; }

    if (!mese) { mese = riga.replace(/^[-•*]\s*/, '').trim(); continue; }

    const testo = riga.replace(/^[-•*]\s*/, '').trim();
    if (!testo) continue;

    const { argomento, descrizione } = splitArgomento(testo);
    tasks.push({ data: dataCorrente, argomento, descrizione });
  }

  if (!mese) throw new Error('Mese di riferimento non trovato: deve essere la prima riga utile del file.');
  if (!tasks.length) throw new Error('Nessuna attività trovata nel file.');

  tasks.sort((a, b) => (a.data ? a.data.getTime() : 0) - (b.data ? b.data.getTime() : 0));
  return { mese, tasks };
}

/* ============================ RENDERING PDF =============================== */

function formatData(d) {
  if (!d) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function creaPdf({ mese, tasks }, outputPath) {
  const doc = new PDFDocument({
    size: CONFIG.pageSize,
    margin: CONFIG.margin,
    bufferPages: true,
    info: { Title: `Attività ${mese}`, Author: 'genera-report.js', Subject: 'Riepilogo attività' },
  });
  doc.pipe(fs.createWriteStream(outputPath));

  // La paginazione è gestita a mano: evita i salti pagina automatici di pdfkit
  // quando si scrive vicino al bordo inferiore (es. il footer).
  doc.on('pageAdded', () => { doc.page.margins.bottom = 0; });
  doc.page.margins.bottom = 0;

  const left = CONFIG.margin;
  const right = doc.page.width - CONFIG.margin;
  const bottom = doc.page.height - CONFIG.margin - 20; // spazio per il footer
  const larghezza = right - left;

  const cols = [
    { key: 'data', label: 'DATA', w: CONFIG.colData },
    { key: 'argomento', label: 'ARGOMENTO', w: CONFIG.colArgomento },
    { key: 'descrizione', label: 'DESCRIZIONE', w: larghezza - CONFIG.colData - CONFIG.colArgomento },
  ];

  /* ---- Intestazione documento (solo prima pagina) ---- */
  const oggi = new Date();
  doc.font(CONFIG.font.bold).fontSize(CONFIG.size.title).fillColor(CONFIG.color.title)
    .text(mese.toUpperCase(), left, CONFIG.margin);

  doc.font(CONFIG.font.regular).fontSize(CONFIG.size.subtitle).fillColor(CONFIG.color.muted)
    .text(
      `Riepilogo attività  ·  ${tasks.length} task  ·  generato il ` +
      `${oggi.getDate()} ${MESI[oggi.getMonth()]} ${oggi.getFullYear()}`,
      left, doc.y + 2
    );

  let y = doc.y + 8;
  doc.moveTo(left, y).lineTo(right, y).lineWidth(2).strokeColor(CONFIG.color.accent).stroke();
  y += 16;

  /* ---- Header della tabella ---- */
  function disegnaHeaderTabella(yPos) {
    const h = 20;
    doc.rect(left, yPos, larghezza, h).fill(CONFIG.color.headerBg);
    doc.font(CONFIG.font.bold).fontSize(CONFIG.size.tableHeader).fillColor(CONFIG.color.headerText);
    let x = left;
    for (const c of cols) {
      doc.text(c.label, x + CONFIG.cellPaddingX, yPos + 6, {
        width: c.w - CONFIG.cellPaddingX * 2, lineBreak: false,
      });
      x += c.w;
    }
    return yPos + h;
  }

  y = disegnaHeaderTabella(y);

  /* ---- Righe ---- */
  let zebra = false;
  let dataPrecedente = null;

  tasks.forEach((task, idx) => {
    const mostraData = CONFIG.ripetiData || formatData(task.data) !== dataPrecedente;

    // Altezza necessaria per la riga
    doc.font(CONFIG.font.regular).fontSize(CONFIG.size.cell);
    const hDesc = doc.heightOfString(task.descrizione || '\u2014', {
      width: cols[2].w - CONFIG.cellPaddingX * 2,
    });
    doc.font(CONFIG.font.bold);
    const hArg = doc.heightOfString(task.argomento || '', {
      width: cols[1].w - CONFIG.cellPaddingX * 2,
    });
    const hData = mostraData ? (CONFIG.showWeekday ? 24 : 12) : 0;
    const rowH = Math.max(hDesc, hArg, hData, CONFIG.minRowHeight - CONFIG.cellPaddingY * 2)
      + CONFIG.cellPaddingY * 2;

    // Salto pagina: la prima riga della nuova pagina mostra sempre la data
    if (y + rowH > bottom) {
      doc.addPage();
      y = CONFIG.margin;
      y = disegnaHeaderTabella(y);
      zebra = false;
      dataPrecedente = null;
    }
    const scriviData = CONFIG.ripetiData || formatData(task.data) !== dataPrecedente;

    if (zebra) doc.rect(left, y, larghezza, rowH).fill(CONFIG.color.rowAlt);

    let x = left;

    // Colonna data
    if (scriviData) {
      doc.font(CONFIG.font.bold).fontSize(CONFIG.size.cell).fillColor(CONFIG.color.title)
        .text(formatData(task.data), x + CONFIG.cellPaddingX, y + CONFIG.cellPaddingY, {
          width: cols[0].w - CONFIG.cellPaddingX * 2, lineBreak: false,
        });
      if (CONFIG.showWeekday && task.data) {
        doc.font(CONFIG.font.regular).fontSize(7.5).fillColor(CONFIG.color.muted)
          .text(GIORNI[task.data.getDay()], x + CONFIG.cellPaddingX, y + CONFIG.cellPaddingY + 12, {
            width: cols[0].w - CONFIG.cellPaddingX * 2, lineBreak: false,
          });
      }
    }
    x += cols[0].w;

    // Colonna argomento
    doc.font(CONFIG.font.bold).fontSize(CONFIG.size.cell).fillColor(CONFIG.color.accent)
      .text(task.argomento || '', x + CONFIG.cellPaddingX, y + CONFIG.cellPaddingY, {
        width: cols[1].w - CONFIG.cellPaddingX * 2,
      });
    x += cols[1].w;

    // Colonna descrizione
    doc.font(CONFIG.font.regular).fontSize(CONFIG.size.cell).fillColor(CONFIG.color.text)
      .text(task.descrizione || '\u2014', x + CONFIG.cellPaddingX, y + CONFIG.cellPaddingY, {
        width: cols[2].w - CONFIG.cellPaddingX * 2, align: 'left',
      });

    y += rowH;

    // Linea di chiusura riga: più marcata quando cambia la giornata
    const prossima = tasks[idx + 1];
    const cambioGiorno = !prossima || formatData(prossima.data) !== formatData(task.data);
    doc.moveTo(left, y).lineTo(right, y)
      .lineWidth(cambioGiorno ? 1 : 0.5)
      .strokeColor(cambioGiorno ? CONFIG.color.groupLine : CONFIG.color.line)
      .stroke();

    zebra = !zebra;
    dataPrecedente = formatData(task.data);
  });

  /* ---- Footer con numerazione pagine ---- */
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.font(CONFIG.font.regular).fontSize(CONFIG.size.footer).fillColor(CONFIG.color.muted)
      .text(mese, left, doc.page.height - CONFIG.margin - 6, {
        width: larghezza, align: 'left', lineBreak: false,
      })
      .text(`Pagina ${i + 1} di ${range.count}`, left, doc.page.height - CONFIG.margin - 6, {
        width: larghezza, align: 'right', lineBreak: false,
      });
  }

  doc.end();
}

/* ================================= MAIN =================================== */

function main() {
  const [, , input, output] = process.argv;

  if (!input) {
    console.error('Uso: node genera-report.js <input.txt> [output.pdf]');
    process.exit(1);
  }
  if (!fs.existsSync(input)) {
    console.error(`File non trovato: ${input}`);
    process.exit(1);
  }

  const outputPath = output || path.join(
    path.dirname(input),
    path.basename(input, path.extname(input)) + '.pdf'
  );

  try {
    const dati = parseFile(fs.readFileSync(input, 'utf8'));
    creaPdf(dati, outputPath);
    console.log(`${dati.tasks.length} attività  -  mese: ${dati.mese}`);
    console.log(`PDF generato: ${outputPath}`);
  } catch (err) {
    console.error(`Errore: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { parseFile, creaPdf };
