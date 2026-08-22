/**
 * Werbe-Check → Google Tabelle
 * =============================================================================
 * Nimmt die Lead-Daten von api/werbecheck/send-result.js entgegen und haengt sie
 * als Zeile an. Zusaetzlich eine kleine Vertriebs-Pipeline: Lead-Status als
 * Auswahlliste, daraus abgeleitet der naechste Schritt.
 *
 * Tabelle wird ueber ihre ID angesprochen, nicht ueber eine Bindung: dadurch
 * laeuft das Skript eigenstaendig und kann nicht versehentlich in eine falsche
 * Tabelle schreiben.
 *
 * Einrichtung der Pipeline-Spalten: einmalig die Funktion richteCrmEin()
 * ausfuehren (Editor: Funktion auswaehlen -> Ausfuehren). Mehrfaches Ausfuehren
 * ist unschaedlich, es werden keine Spalten doppelt angelegt.
 */

const TABELLEN_ID = '1rZWqQ9KRSAKyg6nYj49O0MJchQ_pvG47kEX_QViacJc';

/* ---------- Pipeline-Definition ----------
   Reihenfolge = Reihenfolge in der Auswahlliste. Der zweite Wert ist der
   Vorschlag fuer den naechsten Schritt, der automatisch daneben erscheint. */
const PIPELINE = [
  ['Nicht erreicht 1',              'Erneut anrufen – andere Tageszeit als beim 1. Versuch'],
  ['Nicht erreicht 2',              'Dritter Anruf, vorher kurze SMS/WhatsApp ankündigen'],
  ['Nicht erreicht 3',              'Letzte E-Mail schicken, dann Wiedervorlage in 4 Wochen'],
  ['Erreicht',                      'Erstgespräch terminieren'],
  ['Erstgespräch vereinbart',      'Termin am Vortag bestätigen'],
  ['Erstgespräch nicht erschienen','Nachfassen und neuen Termin anbieten'],
  ['Closing vereinbart',            'Angebot vorbereiten, Termin am Vortag bestätigen'],
  ['Closing nicht erschienen',      'Nachfassen und neuen Closing-Termin setzen'],
  ['Gewonnen',                      'Onboarding starten'],
  ['Verloren',                      '—'],
  ['Nicht qualifiziert',            '—'],
  ['Kein Interesse',                'In 6 Monaten erneut ansprechen']
];

/* Farben je Status: Nicht-erreicht-Stufen werden zunehmend kraeftiger,
   Termin-Ausfaelle rot, Endzustaende grau, Gewonnen im Marken-Lime. */
const STATUS_FARBEN = {
  'Nicht erreicht 1':               '#FFF4D6',
  'Nicht erreicht 2':               '#FFE4B3',
  'Nicht erreicht 3':               '#FFD08A',
  'Erreicht':                       '#DBEAFE',
  'Erstgespräch vereinbart':       '#E8F5D0',
  'Erstgespräch nicht erschienen': '#FDE2E2',
  'Closing vereinbart':             '#CDEAA6',
  'Closing nicht erschienen':       '#FDE2E2',
  'Gewonnen':                       '#A8C93E',
  'Verloren':                       '#ECECEC',
  'Nicht qualifiziert':             '#ECECEC',
  'Kein Interesse':                 '#ECECEC'
};

const CRM_SPALTEN = ['Lead-Status', 'Nächster Schritt', 'Wiedervorlage', 'Notiz'];

// ============================================================================
// Lead-Eingang
// ============================================================================
function doPost(e) {
  // Gleichzeitige Einsendungen koennten sonst dieselbe Zeile ueberschreiben.
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var daten = JSON.parse(e.postData.contents);
    var blatt = SpreadsheetApp.openById(TABELLEN_ID).getSheets()[0];

    var letzteSpalte = blatt.getLastColumn();
    var ueberschriften = letzteSpalte > 0
      ? blatt.getRange(1, 1, 1, letzteSpalte).getValues()[0].filter(String)
      : [];

    // Unbekannte Felder als neue Spalten hinten anhaengen.
    Object.keys(daten).forEach(function (schluessel) {
      if (ueberschriften.indexOf(schluessel) === -1) ueberschriften.push(schluessel);
    });

    blatt.getRange(1, 1, 1, ueberschriften.length).setValues([ueberschriften])
         .setFontWeight('bold').setBackground('#EEF2DF');
    blatt.setFrozenRows(1);

    var zeile = ueberschriften.map(function (spalte) {
      return daten[spalte] !== undefined ? daten[spalte] : '';
    });
    blatt.appendRow(zeile);

    // Neue Leads starten ohne Status; der naechste Schritt wird als Formel
    // gesetzt, damit er sich beim Aendern des Status automatisch mitzieht.
    setzeSchrittFormel(blatt, blatt.getLastRow(), ueberschriften);

    return antwort({ ok: true });
  } catch (fehler) {
    console.error('Werbe-Check Sheet-Fehler: ' + fehler);
    return antwort({ ok: false, fehler: String(fehler) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return antwort({ ok: true, hinweis: 'Werbe-Check Webhook ist aktiv. Leads kommen per POST.' });
}

function antwort(objekt) {
  return ContentService
    .createTextOutput(JSON.stringify(objekt))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// Einmalige Einrichtung der Pipeline
// ============================================================================
function richteCrmEin() {
  var blatt = SpreadsheetApp.openById(TABELLEN_ID).getSheets()[0];
  var ueberschriften = blatt.getRange(1, 1, 1, blatt.getLastColumn()).getValues()[0];

  // CRM-Spalten direkt hinter die Kontaktdaten setzen, damit sie ohne Scrollen
  // sichtbar sind. Nur anlegen, was noch fehlt.
  var einfuegePos = ueberschriften.indexOf('Beste Erreichbarkeit') + 2;
  if (einfuegePos < 2) einfuegePos = ueberschriften.length + 1;

  CRM_SPALTEN.slice().reverse().forEach(function (name) {
    if (ueberschriften.indexOf(name) === -1) {
      blatt.insertColumnBefore(einfuegePos);
      blatt.getRange(1, einfuegePos).setValue(name);
    }
  });

  ueberschriften = blatt.getRange(1, 1, 1, blatt.getLastColumn()).getValues()[0];
  var statusSpalte = ueberschriften.indexOf('Lead-Status') + 1;
  var letzteZeile = Math.max(blatt.getLastRow(), 2);

  // Auswahlliste auf der Status-Spalte, grosszuegig nach unten fuer neue Leads.
  var bereich = blatt.getRange(2, statusSpalte, 2000);
  bereich.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(PIPELINE.map(function (p) { return p[0]; }), true)
      .setAllowInvalid(false)
      .build()
  );

  setzeFarbregeln(blatt, statusSpalte);
  setzeSpaltenbreiten(blatt, ueberschriften);

  for (var z = 2; z <= letzteZeile; z++) setzeSchrittFormel(blatt, z, ueberschriften);

  // Kopfzeile und Kontaktspalten fixieren, damit beim Scrollen klar bleibt,
  // zu wem eine Zeile gehoert.
  blatt.setFrozenRows(1);
  blatt.setFrozenColumns(2);
  blatt.getRange(1, 1, 1, blatt.getLastColumn())
       .setFontWeight('bold').setBackground('#EEF2DF').setVerticalAlignment('middle');
  blatt.getRange(1, 1, letzteZeile, blatt.getLastColumn()).setVerticalAlignment('middle');

  SpreadsheetApp.flush();
}

/** Setzt in "Nächster Schritt" eine Formel, die sich aus dem Lead-Status ergibt. */
function setzeSchrittFormel(blatt, zeile, ueberschriften) {
  var statusIdx = ueberschriften.indexOf('Lead-Status');
  var schrittIdx = ueberschriften.indexOf('Nächster Schritt');
  if (statusIdx === -1 || schrittIdx === -1) return;

  var s = '$' + spaltenBuchstabe(statusIdx + 1) + zeile;
  var teile = [s + '=""', '"Erstkontakt: anrufen"'];
  PIPELINE.forEach(function (p) {
    teile.push(s + '="' + p[0] + '"');
    teile.push('"' + p[1] + '"');
  });

  // setFormula erwartet die kanonische Schreibweise mit Komma als Trennzeichen;
  // Sheets zeigt sie danach in der lokalen Notation an.
  blatt.getRange(zeile, schrittIdx + 1).setFormula('=IFS(' + teile.join(',') + ')');
}

function setzeFarbregeln(blatt, statusSpalte) {
  var bereich = blatt.getRange(2, statusSpalte, 2000);
  var regeln = blatt.getConditionalFormatRules().filter(function (r) {
    // Alte Regeln dieser Spalte entfernen, damit mehrfaches Ausfuehren nicht stapelt.
    return r.getRanges().every(function (b) { return b.getColumn() !== statusSpalte; });
  });

  Object.keys(STATUS_FARBEN).forEach(function (status) {
    var regel = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(status)
      .setBackground(STATUS_FARBEN[status])
      .setRanges([bereich]);
    if (status === 'Gewonnen') regel = regel.setBold(true);
    regeln.push(regel.build());
  });

  blatt.setConditionalFormatRules(regeln);
}

function setzeSpaltenbreiten(blatt, ueberschriften) {
  // Breiten so gewaehlt, dass die laengsten realen Antworttexte ohne Abschneiden
  // lesbar sind; die zwoelf Antwortspalten bekommen einheitlich viel Platz.
  var breiten = {
    'Zeitpunkt': 150, 'Name': 170, 'E-Mail': 220, 'Telefon': 140, 'Firma': 180,
    'Beste Erreichbarkeit': 190,
    'Lead-Status': 210, 'Nächster Schritt': 340, 'Wiedervorlage': 120, 'Notiz': 300,
    'Status': 120, 'Google %': 90, 'Meta %': 90, 'Zusatzkanäle': 200,
    'Einwilligung erteilt am': 160, 'Einwilligung IP': 140
  };

  ueberschriften.forEach(function (name, i) {
    blatt.setColumnWidth(i + 1, breiten[name] || 260);
  });

  blatt.getRange(1, 1, blatt.getMaxRows(), blatt.getLastColumn()).setWrap(true);
}

/** 1 -> A, 27 -> AA */
function spaltenBuchstabe(nummer) {
  var s = '';
  while (nummer > 0) {
    var rest = (nummer - 1) % 26;
    s = String.fromCharCode(65 + rest) + s;
    nummer = Math.floor((nummer - 1) / 26);
  }
  return s;
}
