// Vercel Serverless Function (Node) – kein Build-Step, ruft die Brevo REST API direkt per fetch auf.
//
// Diese Datei ist die EINZIGE Quelle für Scoring, Disqualifizierung und Empfehlungstexte. Das Ergebnis
// wird bewusst nie auf der Website angezeigt (index.html kennt nur Fragetexte/Optionen fürs Rendering),
// sondern ausschließlich per E-Mail verschickt. Wird eine Frage in index.html geändert (Text, Reihenfolge
// der Optionen), muss die Tabelle unten entsprechend nachgezogen werden – die Antwort wird als
// Options-Index pro Frage-ID übertragen.
//
// Benötigte Vercel-Umgebungsvariablen (siehe SETUP.md):
//   BREVO_API_KEY       – API-Key von brevo.com (Transactional → API-Keys)
//   AGENCY_NOTIFY_EMAIL – Postfach, an das die interne Lead-Benachrichtigung geht
//   RESULT_FROM_EMAIL   – Absenderadresse (muss in Brevo als Absender verifiziert sein)
//   RESULT_FROM_NAME    – optional, Absendername (Default: "Werbe-Check")
//   BREVO_LIST_ID       – optional, Brevo-Kontaktlisten-ID; wenn gesetzt, wird der Lead zusätzlich
//                         als Kontakt in Brevo angelegt/aktualisiert (für spätere Automationen/Follow-ups)

const QUESTIONS = [
  { id: 'budget', text: 'Monatliches Werbebudget', gate: 'budget', options: [
    { label: 'Unter 500 €', disqualifies: true },
    { label: '500 – 1.500 €', bucket: 1 },
    { label: '1.500 – 5.000 €', bucket: 2 },
    { label: 'Über 5.000 €', bucket: 3 }
  ]},
  { id: 'margin', text: 'Ø Gewinn pro Neukunde', gate: 'margin', options: [
    { label: 'Unter 500 €', disqualifies: true },
    { label: '500 – 2.000 €' },
    { label: '2.000 – 10.000 €' },
    { label: 'Über 10.000 € oder wiederkehrend/Abo' }
  ]},
  { id: 'branche', text: 'Angebotstyp', options: [
    { label: 'Lokale Dienstleistung (z. B. Handwerk, Praxis, Beratung vor Ort)' },
    { label: 'Online-Shop / E-Commerce' },
    { label: 'B2B-Dienstleistung oder Beratung' },
    { label: 'Sonstiges' }
  ]},
  { id: 'suche', text: 'Suchintention', scored: true, shortTitle: 'Suchintention', options: [
    { label: 'Ja, sehr konkret (z. B. „Notdienst XY in [Stadt]“)', meta: 0, google: 5, insight: 'Wird aktiv und konkret nach eurem Angebot gesucht, kann Google Ads genau in diesem Moment einspringen – das ist die stärkste Kaufabsicht, die es gibt.' },
    { label: 'Eher ja, aber mit allgemeineren Begriffen', meta: 1, google: 4, insight: 'Es wird gesucht, aber mit breiteren Begriffen – Google Ads funktioniert gut, braucht aber etwas mehr Streuung als bei sehr spezifischen Suchanfragen.' },
    { label: 'Eher nein, die meisten kennen unser Angebot noch nicht', meta: 4, google: 1, insight: 'Wenn kaum aktiv gesucht wird, bringt die beste Suchanzeige nichts – hier muss die Nachfrage erst geweckt werden, und genau das kann Meta besonders gut.' },
    { label: 'Nein, wir müssen die Nachfrage erst wecken', meta: 5, google: 0, insight: 'Ohne bestehende Suchnachfrage ist Meta der richtige Hebel: Ihr zeigt euer Angebot Menschen, die noch gar nicht danach gesucht haben, aber zur Zielgruppe passen.' }
  ]},
  { id: 'entscheidung', text: 'Entscheidungsart', scored: true, shortTitle: 'Entscheidungsart', options: [
    { label: 'Spontaner Impuls-/Wunschkauf', meta: 5, google: 0, insight: 'Impulskäufe entstehen durch einen guten Anstoß im richtigen Moment – das ist die Stärke von Meta-Anzeigen im Feed.' },
    { label: 'Meistens spontan, aber mit kurzem Vergleich', meta: 3, google: 2, insight: 'Ein kurzer Vergleich vor dem Kauf spricht für eine Mischung aus Impuls (Meta) und punktueller Suche (Google).' },
    { label: 'Meist recherchiert, aber überschaubar', meta: 2, google: 3, insight: 'Etwas Recherche vor dem Kauf verschiebt den Vorteil leicht Richtung Google – Nutzer suchen aktiv nach Optionen und Bewertungen.' },
    { label: 'Immer gut recherchiert & verglichen, geplante Anschaffung', meta: 0, google: 5, insight: 'Bei geplanten, gut verglichenen Anschaffungen erwischt ihr Interessenten am besten genau im Sucherlebnis auf Google – dort, wo verglichen wird.' }
  ]},
  { id: 'ansprache', text: 'Zielgruppen-Ansprache', scored: true, shortTitle: 'Zielgruppen-Ansprache', options: [
    { label: 'Sehr gut über Interessen, Hobbys oder demografische Merkmale eingrenzbar', meta: 5, google: 0, insight: 'Eine klar eingrenzbare Zielgruppe nach Interessen/Demografie ist der Kern-Vorteil von Meta-Targeting.' },
    { label: 'Teils über Interessen, teils über Suchbegriffe', meta: 3, google: 2, insight: 'Eure Zielgruppe lässt sich auf beiden Wegen erreichen – ein Mix aus Interessen-Targeting und Suchbegriffen ist realistisch.' },
    { label: 'Eher über konkrete Suchbegriffe fassbar', meta: 1, google: 4, insight: 'Ohne klare demografische Eingrenzung, aber mit klaren Suchbegriffen, ist Google Ads der treffsicherere Kanal.' },
    { label: 'Nur über sehr spezifische Fachbegriffe/Suchanfragen fassbar', meta: 0, google: 5, insight: 'Eine sehr spezifische Nische lässt sich über Suchbegriffe auf Google punktgenau treffen – über Interessen-Targeting kaum.' }
  ]},
  { id: 'visuell', text: 'Visuelle Präsentierbarkeit', scored: true, shortTitle: 'Visuelle Präsentierbarkeit', options: [
    { label: 'Ja, sehr gut – starke Fotos/Videos, emotional zeigbar', meta: 5, google: 1, insight: 'Ein visuell starkes Angebot ist wie gemacht für Meta – Bild und Video sind dort der wichtigste Hebel für Aufmerksamkeit.' },
    { label: 'Teilweise, geht mit guten Produktbildern', meta: 3, google: 2, insight: 'Solide Bildsprache hilft auf Meta, ist aber kein Muss – auch textbasierte Google-Anzeigen funktionieren bei euch.' },
    { label: 'Eher schwierig, wenig visuell darstellbar', meta: 1, google: 3, insight: 'Ohne starke visuelle Wirkung verliert Meta einen Teil seiner Stärke – Text-/Leistungsanzeigen auf Google performen dann oft besser.' },
    { label: 'Nein, reine Text-/Fachleistung', meta: 0, google: 5, insight: 'Eine reine Fach- oder Textleistung lässt sich kaum emotional bebildern – hier zieht die klare, textbasierte Google-Suchanzeige klar vor.' }
  ]},
  { id: 'einzugsgebiet', text: 'Einzugsgebiet', scored: true, shortTitle: 'Einzugsgebiet', options: [
    { label: 'Sehr lokal begrenzt (ein Ort/Landkreis)', meta: 1, google: 4, insight: '„In der Nähe“-Suchen sind bei lokal begrenzten Angeboten extrem stark – Google Ads holt genau diese Nutzer im richtigen Moment ab.' },
    { label: 'Regional (mehrere Städte/Bundesland)', meta: 2, google: 3, insight: 'Auf regionaler Ebene bleibt Google leicht im Vorteil, Meta lässt sich aber gut zur Ergänzung für Reichweite nutzen.' },
    { label: 'Deutschlandweit', meta: 3, google: 2, insight: 'Bei deutschlandweiter Reichweite lohnt sich Meta zunehmend, um Bekanntheit und Nachfrage überhaupt erst aufzubauen.' },
    { label: 'International / mehrsprachig', meta: 3, google: 2, insight: 'International lässt sich mit Meta oft kosteneffizienter Reichweite über Ländergrenzen hinweg aufbauen als rein über Suchanzeigen.' }
  ]},
  { id: 'werbemittel', text: 'Vorhandene Werbemittel', scored: true, shortTitle: 'Vorhandene Werbemittel', options: [
    { label: 'Ja, gute Fotos/Videos/Kundenstimmen vorhanden', meta: 4, google: 2, insight: 'Vorhandenes Bild- und Videomaterial ist sofort einsetzbar für Meta-Anzeigen – ein klarer Startvorteil.' },
    { label: 'Ein bisschen vorhanden, müsste ergänzt werden', meta: 3, google: 2, insight: 'Mit etwas zusätzlichem Material lässt sich Meta gut bespielen – bis dahin ist Google auch ohne viel Kreativ-Material startklar.' },
    { label: 'Kaum vorhanden, eher Text/Leistungsbeschreibung', meta: 1, google: 4, insight: 'Ohne vorhandenes Bildmaterial ist Google Ads der pragmatischere Einstieg – Textanzeigen lassen sich sofort und ohne Fotoshooting aufsetzen.' },
    { label: 'Gar nichts vorhanden', meta: 0, google: 4, insight: 'Ganz ohne Werbemittel startet ihr am schnellsten über textbasierte Google-Anzeigen – Meta würde erst eine kurze Vorlaufzeit für Kreativ-Material brauchen.' }
  ]},
  { id: 'dringlichkeit', text: 'Dringlichkeit / Anlass', scored: true, shortTitle: 'Dringlichkeit / Anlass', options: [
    { label: 'Akuter, plötzlicher Bedarf (z. B. Notfall, Ausfall, Termindruck)', meta: 0, google: 5, insight: 'Bei akutem Bedarf wird sofort gesucht – genau in diesem Moment schlägt Google Ads zu, ohne Umwege.' },
    { label: 'Eher spontan, aber nicht akut', meta: 2, google: 3, insight: 'Ohne echten Zeitdruck bleibt die Suche das stärkere Signal, Meta kann aber gut als Erinnerung/Anstoß ergänzen.' },
    { label: 'Dauerhaft vorhanden, wird meist nicht von selbst gesucht', meta: 4, google: 1, insight: 'Ein latenter, aber nicht aktiv gesuchter Bedarf muss angestoßen werden – dafür ist Meta gebaut.' },
    { label: 'Muss aktiv geweckt werden, sonst passiert nichts', meta: 5, google: 0, insight: 'Ohne aktiven Anstoß passiert bei euch nichts von selbst – Meta unterbricht gezielt und weckt genau diesen Bedarf.' }
  ]},
  { id: 'alter', text: 'Zielgruppen-Alter', scored: true, shortTitle: 'Zielgruppen-Alter', options: [
    { label: 'Überwiegend jünger (18–34)', meta: 4, google: 2, insight: 'Eine jüngere Zielgruppe ist auf Instagram & Facebook besonders gut und günstig erreichbar.' },
    { label: 'Gemischt, alle Altersgruppen', meta: 2, google: 3, insight: 'Bei einer breit gemischten Altersgruppe sind beide Plattformen relevant – die Suchintention gibt hier oft den Ausschlag.' },
    { label: 'Überwiegend 35–54', meta: 2, google: 3, insight: 'In dieser Altersgruppe wird viel aktiv recherchiert und verglichen – ein leichter Vorteil für Google.' },
    { label: 'Überwiegend 55+', meta: 1, google: 4, insight: 'Ältere Zielgruppen suchen gezielter und aktiver über Google, statt sich von Social-Ads überraschen zu lassen.' }
  ]},
  { id: 'zielgruppe', text: 'B2B oder B2C', scored: true, shortTitle: 'B2B oder B2C', options: [
    { label: 'Privatpersonen (B2C)', meta: 3, google: 2, insight: 'Bei Privatpersonen funktioniert emotionales, visuelles Meta-Targeting oft besonders gut – ergänzt um Suchanzeigen für die aktive Nachfrage.' },
    { label: 'Kleine Unternehmen / Selbstständige', meta: 2, google: 3, insight: 'Kleinunternehmer und Selbstständige suchen oft gezielt und kurzfristig nach Lösungen – ein Vorteil für Google.' },
    { label: 'Mittelständische oder größere Unternehmen', meta: 1, google: 4, insight: 'Bei größeren Unternehmen mit mehreren Entscheidern läuft die Recherche meist sehr gezielt über Suchmaschinen.' },
    { label: 'Gemischt / beides', meta: 2, google: 2, insight: 'Eine gemischte Zielgruppe spricht für eine ausgewogene Mischung aus beiden Plattformen.' }
  ]}
];

function computeResult(answers) {
  answers = answers || {};
  let metaTotal = 0, googleTotal = 0;
  let qualified = true;
  const reasons = [];
  const readable = [];
  const scoredAnswers = [];

  QUESTIONS.forEach(q => {
    const idx = answers[q.id];
    const opt = (typeof idx === 'number' && q.options[idx]) ? q.options[idx] : null;

    if (!opt) {
      readable.push({ frage: q.text, antwort: '— (keine Angabe)' });
      return;
    }

    readable.push({ frage: q.text, antwort: opt.label });

    if (q.gate && opt.disqualifies) {
      qualified = false;
      if (q.gate === 'budget') reasons.push('Mit einem Werbebudget unter 500 €/Monat lässt sich in den meisten Branchen kein aussagekräftiger Test fahren – das Budget verpufft eher in der Lernphase der Werbeplattformen, bevor sich etwas rechnet.');
      if (q.gate === 'margin') reasons.push('Bei einem Gewinn von unter 500 € pro neuem Kunden ist das Risiko hoch, dass die Werbekosten eure Marge auffressen, bevor sich eine Kampagne überhaupt rechnet.');
    }

    if (q.scored) {
      metaTotal += opt.meta || 0;
      googleTotal += opt.google || 0;
      scoredAnswers.push({ shortTitle: q.shortTitle, opt, diff: Math.abs((opt.meta || 0) - (opt.google || 0)) });
    }
  });

  const total = metaTotal + googleTotal;
  const metaPct = total > 0 ? Math.round((metaTotal / total) * 100) : 50;
  const googlePct = 100 - metaPct;

  const budgetIdx = answers['budget'];
  const budgetOpt = (typeof budgetIdx === 'number') ? QUESTIONS[0].options[budgetIdx] : null;
  const budgetBucket = budgetOpt ? (budgetOpt.bucket || 0) : 0;

  const topInsights = scoredAnswers.sort((a, b) => b.diff - a.diff).slice(0, 3);

  // zielgruppeIdx: 0=B2C, 1=Kleinunternehmen/Selbstständige, 2=Mittelstand/größere Unternehmen, 3=gemischt
  const zielgruppeIdx = answers['zielgruppe'];
  // alterIdx: 0=jünger 18–34, 1=gemischt, 2=35–54, 3=55+
  const alterIdx = answers['alter'];
  const extraChannels = buildExtraChannels({ zielgruppeIdx, alterIdx, budgetBucket });

  return { qualified, reasons, metaPct, googlePct, budgetBucket, topInsights, readable, extraChannels };
}

// LinkedIn und TikTok laufen bewusst NICHT als dritter/vierter Posten im Meta/Google-Prozent-Split mit:
// LinkedIns Zielgruppe ist im Kern eine Teilmenge dessen, was man auch über Meta erreicht (nur mit
// präziserem B2B-Filter wie Jobtitel/Branche/Senioritätslevel) – ein eigener Prozentanteil würde das
// verzerren. Stattdessen werden beide als ergänzende Kanalempfehlung ausgegeben, wenn die Signale klar
// genug sind (B2B-Zielgruppe → LinkedIn, junge Zielgruppe → TikTok).
function buildExtraChannels({ zielgruppeIdx, alterIdx, budgetBucket }) {
  const channels = [];

  if (zielgruppeIdx === 2) {
    channels.push({
      name: 'LinkedIn Ads',
      text: budgetBucket >= 2
        ? 'Ihr sprecht Unternehmen mit mehreren Entscheidern an – dafür ist LinkedIn besonders stark: Ihr könnt gezielt nach Jobtitel, Branche und Senioritätslevel targetieren. Die Menschen, die ihr dort erreicht, erreicht ihr technisch auch über Meta – LinkedIn punktet aber mit der präziseren B2B-Filterung, ist dafür pro Klick spürbar teurer. Bei eurem Budget würden wir LinkedIn ergänzend zu eurem Hauptkanal einplanen.'
        : 'Ihr sprecht Unternehmen mit mehreren Entscheidern an – eigentlich ideales LinkedIn-Terrain (präzises Jobtitel-Targeting). LinkedIn-Klicks sind aber deutlich teurer als auf Google oder Meta. Bei eurem aktuellen Budget würden wir zuerst mit eurem Hauptkanal starten und LinkedIn ergänzen, sobald das Budget wächst.'
    });
  } else if (zielgruppeIdx === 1) {
    channels.push({
      name: 'LinkedIn Ads',
      text: 'Als Kleinunternehmen oder Selbstständige könnte LinkedIn interessant sein, wenn eure Kunden selbst Entscheider in Unternehmen sind – die Klickpreise liegen dort aber deutlich über Google oder Meta. Für den Einstieg würden wir uns zunächst auf euren Hauptkanal konzentrieren und LinkedIn bei Bedarf ergänzen.'
    });
  }

  if (alterIdx === 0) {
    channels.push({
      name: 'TikTok Ads',
      text: 'Eure Zielgruppe ist überwiegend jung (18–34) – TikTok ist dort aktuell einer der günstigsten Wege, Aufmerksamkeit und Reichweite aufzubauen, wenn ihr unterhaltsamen, authentischen Video-Content liefern könnt. Wir würden TikTok ergänzend zu eurem Hauptkanal testen.'
    });
  }

  return channels;
}

function buildRecommendation(metaPct, googlePct, budgetBucket) {
  const diff = Math.abs(metaPct - googlePct);
  const dominant = metaPct > googlePct ? 'Meta' : 'Google';
  const dominantPct = Math.max(metaPct, googlePct);

  if (diff >= 40) {
    if (dominant === 'Google') {
      return {
        title: 'Klare Empfehlung: Google Ads',
        text: `Bei euch dominiert die Suchabsicht ganz klar: ${googlePct}% Google gegen ${metaPct}% Meta. Wir würden das komplette Budget zu Beginn auf Google Ads konzentrieren, statt es zu splitten – das bringt in eurem Fall die schnellsten, günstigsten Anfragen.`
      };
    }
    return {
      title: 'Klare Empfehlung: Meta Ads',
      text: `Bei euch überwiegt ganz klar die Meta-Eignung: ${metaPct}% Meta gegen ${googlePct}% Google. Wir würden das komplette Budget zu Beginn auf Meta Ads (Facebook & Instagram) konzentrieren – ihr müsst die Nachfrage erst wecken, und genau das kann Meta besonders gut.`
    };
  }

  if (budgetBucket >= 2) {
    return {
      title: `Empfehlung: Mix aus Google (${googlePct}%) & Meta (${metaPct}%)`,
      text: `Bei euch sprechen beide Plattformen an. Wir würden das Budget entsprechend aufteilen: ca. ${googlePct}% Google Ads und ca. ${metaPct}% Meta Ads – so deckt ihr sowohl die aktive Suche als auch das Wecken neuer Nachfrage ab.`
    };
  }

  return {
    title: `Tendenz: ${dominant} Ads (${dominantPct}%) – Budget aktuell noch zu knapp zum Splitten`,
    text: `Euer Ergebnis ist relativ ausgeglichen (${googlePct}% Google / ${metaPct}% Meta). Bei eurem aktuellen Budget würden wir trotzdem zunächst auf einen Kanal konzentrieren (${dominant} Ads), damit genug Budget pro Tag für aussagekräftige Daten zusammenkommt. Sobald ihr skaliert, lohnt sich der Mix.`
  };
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function buildLeadEmailHtml({ name, qualified, reasons, metaPct, googlePct, budgetBucket, topInsights, extraChannels }) {
  const firstName = escapeHtml((name || '').split(' ')[0] || 'zusammen');

  if (!qualified) {
    const reasonItems = reasons.map(r => `<li style="margin-bottom:10px;">${escapeHtml(r)}</li>`).join('');
    return `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#14203A;">
        <h2 style="color:#14203A;">Hallo ${firstName},</h2>
        <p>danke für deine Teilnahme am Werbe-Check. Hier ist unsere ehrliche Einschätzung:</p>
        <p><strong>Aktuell würden wir von bezahlter Werbung eher abraten:</strong></p>
        <ul style="padding-left:20px;color:#3B4A60;">${reasonItems}</ul>
        <p>Unser Rat: Erst organisch wachsen (Empfehlungen, lokale Sichtbarkeit, Google-Unternehmensprofil)
        und Budget bzw. Marge erhöhen. Wir melden uns, sobald sich eure Situation ändert, oder mit einem
        Tipp, wie ihr schneller dahin kommt.</p>
        <p>Viele Grüße<br>Dein Werbe-Check-Team</p>
      </div>`;
  }

  const reco = buildRecommendation(metaPct, googlePct, budgetBucket);
  const insightItems = topInsights.map(item => `
    <li style="margin-bottom:14px;">
      <strong>${escapeHtml(item.shortTitle)}:</strong> ${escapeHtml(item.opt.insight)}
    </li>`).join('');
  const extraChannelsHtml = (extraChannels && extraChannels.length) ? `
      <h3 style="color:#14203A;">Zusätzlich für euch interessant</h3>
      <ul style="padding-left:20px;color:#3B4A60;">
        ${extraChannels.map(c => `<li style="margin-bottom:14px;"><strong>${escapeHtml(c.name)}:</strong> ${escapeHtml(c.text)}</li>`).join('')}
      </ul>` : '';

  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#14203A;">
      <h2 style="color:#14203A;">Hallo ${firstName},</h2>
      <p>hier ist deine persönliche Werbe-Auswertung:</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <tr>
          <td style="text-align:center;padding:16px;background:#E5EEFD;border-radius:10px 0 0 10px;">
            <div style="font-size:32px;font-weight:700;color:#2A63C7;">${googlePct}%</div>
            <div style="font-size:13px;color:#3B4A60;">Google Ads</div>
          </td>
          <td style="text-align:center;padding:16px;background:#F1E7FE;border-radius:0 10px 10px 0;">
            <div style="font-size:32px;font-weight:700;color:#5E1FC4;">${metaPct}%</div>
            <div style="font-size:13px;color:#3B4A60;">Meta Ads</div>
          </td>
        </tr>
      </table>
      <h3 style="color:#14203A;">${escapeHtml(reco.title)}</h3>
      <p>${escapeHtml(reco.text)}</p>
      <h3 style="color:#14203A;">Die wichtigsten Gründe für diese Empfehlung</h3>
      <ul style="padding-left:20px;color:#3B4A60;">${insightItems}</ul>
      ${extraChannelsHtml}
      <p>Wir melden uns innerhalb von 24 Stunden bei dir, um zu besprechen, wie eine erste Kampagne
      für dich konkret aussehen könnte.</p>
      <p>Viele Grüße<br>Dein Werbe-Check-Team</p>
    </div>`;
}

function buildAgencyEmailHtml({ name, firma, email, telefon, qualified, metaPct, googlePct, budgetBucket, readable, extraChannels }) {
  const rows = readable.map(r =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #E7E2D8;color:#3B4A60;">${escapeHtml(r.frage)}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #E7E2D8;font-weight:600;">${escapeHtml(r.antwort)}</td></tr>`
  ).join('');
  const reco = qualified ? buildRecommendation(metaPct, googlePct, budgetBucket) : null;
  const extraChannelsText = (extraChannels && extraChannels.length)
    ? `<p><strong>Zusätzlich empfohlen:</strong> ${extraChannels.map(c => escapeHtml(c.name)).join(', ')}</p>`
    : '';

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#14203A;">
      <h2 style="color:${qualified ? '#0E7F57' : '#C0392B'};">
        ${qualified ? 'Neuer qualifizierter Lead' : 'Neuer Lead – UNQUALIFIZIERT (Budget/Marge zu niedrig)'}
      </h2>
      <p>
        <strong>Name:</strong> ${escapeHtml(name)}<br>
        <strong>Firma:</strong> ${escapeHtml(firma) || '—'}<br>
        <strong>E-Mail:</strong> ${escapeHtml(email)}<br>
        <strong>Telefon:</strong> ${escapeHtml(telefon) || '—'}
      </p>
      <p><strong>Plattform-Split:</strong> ${googlePct}% Google / ${metaPct}% Meta</p>
      ${reco ? `<p><strong>${escapeHtml(reco.title)}</strong><br>${escapeHtml(reco.text)}</p>` : ''}
      ${extraChannelsText}
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">${rows}</table>
    </div>`;
}

async function sendBrevoEmail({ apiKey, fromEmail, fromName, to, toName, subject, htmlContent }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: to, name: toName || undefined }],
      subject,
      htmlContent
    })
  });
  if (!res.ok) console.error('Brevo email error', res.status, await res.text());
  return res.ok;
}

async function upsertBrevoContact({ apiKey, listId, email, name, firma, telefon, qualified, metaPct, googlePct }) {
  const res = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      email,
      updateEnabled: true,
      listIds: [Number(listId)],
      attributes: {
        FIRSTNAME: (name || '').split(' ')[0] || '',
        LASTNAME: (name || '').split(' ').slice(1).join(' ') || '',
        FIRMA: firma || '',
        SMS: telefon || '',
        QUALIFIZIERT: !!qualified,
        GOOGLE_PCT: googlePct,
        META_PCT: metaPct
      }
    })
  });
  if (!res.ok) console.error('Brevo contact upsert error', res.status, await res.text());
  return res.ok;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const contact = body.contact || {};
  const name = (contact.name || '').trim();
  const email = (contact.email || '').trim();
  const firma = (contact.firma || '').trim();
  const telefon = (contact.telefon || '').trim();

  if (!name || !email) {
    res.status(400).json({ error: 'Name und E-Mail sind Pflichtfelder.' });
    return;
  }

  const { qualified, reasons, metaPct, googlePct, budgetBucket, topInsights, readable, extraChannels } = computeResult(body.answers);

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const AGENCY_NOTIFY_EMAIL = process.env.AGENCY_NOTIFY_EMAIL;
  const RESULT_FROM_EMAIL = process.env.RESULT_FROM_EMAIL || 'no-reply@example.com';
  const RESULT_FROM_NAME = process.env.RESULT_FROM_NAME || 'Werbe-Check';
  const BREVO_LIST_ID = process.env.BREVO_LIST_ID;

  if (!BREVO_API_KEY) {
    console.error('BREVO_API_KEY fehlt – E-Mail-Versand übersprungen. Siehe SETUP.md.');
    res.status(200).json({ ok: true, mailSent: false, reason: 'not-configured' });
    return;
  }

  const leadSubject = qualified
    ? `Deine Werbe-Auswertung: ${googlePct}% Google · ${metaPct}% Meta`
    : 'Deine Werbe-Auswertung';

  const tasks = [
    sendBrevoEmail({
      apiKey: BREVO_API_KEY,
      fromEmail: RESULT_FROM_EMAIL,
      fromName: RESULT_FROM_NAME,
      to: email,
      toName: name,
      subject: leadSubject,
      htmlContent: buildLeadEmailHtml({ name, qualified, reasons, metaPct, googlePct, budgetBucket, topInsights, extraChannels })
    })
  ];

  if (AGENCY_NOTIFY_EMAIL) {
    const agencySubject = `Neuer Lead: ${name}${firma ? ' (' + firma + ')' : ''} – ${qualified ? 'qualifiziert' : 'UNQUALIFIZIERT'}`;
    tasks.push(sendBrevoEmail({
      apiKey: BREVO_API_KEY,
      fromEmail: RESULT_FROM_EMAIL,
      fromName: RESULT_FROM_NAME,
      to: AGENCY_NOTIFY_EMAIL,
      subject: agencySubject,
      htmlContent: buildAgencyEmailHtml({ name, firma, email, telefon, qualified, metaPct, googlePct, budgetBucket, readable, extraChannels })
    }));
  } else {
    console.error('AGENCY_NOTIFY_EMAIL fehlt – interne Benachrichtigung übersprungen. Siehe SETUP.md.');
  }

  if (BREVO_LIST_ID) {
    tasks.push(upsertBrevoContact({ apiKey: BREVO_API_KEY, listId: BREVO_LIST_ID, email, name, firma, telefon, qualified, metaPct, googlePct }));
  }

  await Promise.allSettled(tasks);
  res.status(200).json({ ok: true, mailSent: true, qualified, metaPct, googlePct });
};
