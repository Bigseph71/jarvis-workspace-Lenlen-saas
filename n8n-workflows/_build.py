import json, uuid, os

def nid(): return str(uuid.uuid4())

SYS_PROMPT = (
"Du bist ein Vertriebs-Qualifizierungsassistent fuer JHN2 - AI Factory, "
"einen Anbieter von KI-Telefonassistenten (KI Voice Agents) fuer die Branchen "
"Gastronomie, Handwerk sowie Gesundheit & Beauty.\n\n"
"Bewerte die eingehende Kontaktanfrage und gib AUSSCHLIESSLICH ein JSON-Objekt zurueck. "
"Kein Markdown, keine Code-Bloecke, kein Erklaertext. Exakt dieses Format:\n"
'{"urgenz": <1-5>, "potenzial": <1-5>, "serioes": <true|false>, '
'"kategorie": "<Hoch|Mittel|Niedrig|Pruefen>", "begruendung": "<kurze Begruendung auf Deutsch>"}\n\n'
"Regeln:\n"
"- Die Branche stammt aus einem Dropdown (Gastronomie, Handwerk, Gesundheit & Beauty) und ist "
"immer ein gueltiges Zielsegment. Den Fit NICHT erneut bewerten.\n"
"- serioes = false NUR wenn die Anfrage offensichtlich Kaltakquise, eine Agentur / ein Dienstleister, "
"ein Wettbewerber, Spam oder eine Privatperson ohne beruflichen Kontext ist.\n"
"- urgenz (1-5): Zeitdruck, verlorene Anrufe/Kunden, baldiger Start, akuter Bedarf.\n"
"- potenzial (1-5): Groesse/Volumen, mehrere Standorte, hohes Anrufvolumen, Interesse an "
"erweiterten Funktionen (mehrsprachig, CRM-Integration, Rueckrufkampagnen).\n"
"- Kategorisierung: serioes=false => Niedrig; sonst score = urgenz + potenzial: score>=8 => Hoch, "
"4-7 => Mittel. Wenn das Anliegen zu vage ist, um es zu bewerten => Pruefen.\n"
"Gib nur das JSON zurueck."
)

trigger = {
  "parameters": {
    "pollTimes": {"item": [{"mode": "everyMinute"}]},
    "simple": False,
    "filters": {"q": "to:info@jhn2.de subject:Kontaktformular"},
    "options": {}
  },
  "id": nid(),
  "name": "Neue Anfrage (Gmail)",
  "type": "n8n-nodes-base.gmailTrigger",
  "typeVersion": 1.2,
  "position": [240, 400],
  "credentials": {"gmailOAuth2": {"id": "REPLACE_GMAIL", "name": "Gmail - info@jhn2.de"}}
}

extract_code = r"""
const item = $input.first().json;
let body = item.text || item.textPlain || item.snippet || '';
if (!body && item.html) { body = String(item.html).replace(/<[^>]+>/g, ' '); }
body = String(body).replace(/\r/g, '');

function grab(labels) {
  for (const label of labels) {
    const re = new RegExp(label + '\\s*[:\\-]?\\s*(.+)', 'i');
    const m = body.match(re);
    if (m && m[1].trim()) return m[1].trim();
  }
  return '';
}

const name = grab(['Name']);
const email = grab(['E-?Mail', 'Email']);
const telefon = grab(['Telefon(?:nummer)?', 'Phone']);
let branche = grab(['Branche']);

let anliegen = '';
const am = body.match(/Anliegen\s*[:\-]?\s*([\s\S]+)/i);
if (am) anliegen = am[1].trim();

const bl = branche.toLowerCase();
if (bl.includes('gastro')) branche = 'Gastronomie';
else if (bl.includes('handwerk')) branche = 'Handwerk';
else if (bl.includes('gesund') || bl.includes('beauty')) branche = 'Gesundheit & Beauty';

return [{ json: { name, email, telefon, branche, anliegen } }];
"""
extract = {
  "parameters": {"jsCode": extract_code},
  "id": nid(),
  "name": "Formularfelder extrahieren",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [460, 400]
}

json_body_expr = (
"={{ JSON.stringify({ "
"model: 'claude-haiku-4-5-20251001', "
"max_tokens: 500, "
"system: " + json.dumps(SYS_PROMPT) + ", "
"messages: [{ role: 'user', content: "
"'Name: ' + $json.name + '\\n' + "
"'E-Mail: ' + $json.email + '\\n' + "
"'Telefon: ' + $json.telefon + '\\n' + "
"'Branche: ' + $json.branche + '\\n' + "
"'Anliegen: ' + $json.anliegen } ] "
"}) }}"
)
claude = {
  "parameters": {
    "method": "POST",
    "url": "https://api.anthropic.com/v1/messages",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "anthropicApi",
    "sendHeaders": True,
    "headerParameters": {"parameters": [
      {"name": "anthropic-version", "value": "2023-06-01"},
      {"name": "content-type", "value": "application/json"}
    ]},
    "sendBody": True,
    "specifyBody": "json",
    "jsonBody": json_body_expr,
    "options": {"timeout": 30000}
  },
  "id": nid(),
  "name": "Qualifizierung durch Claude",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [680, 400],
  "onError": "continueRegularOutput",
  "credentials": {"anthropicApi": {"id": "REPLACE_ANTHROPIC", "name": "Anthropic - JHN2"}}
}

parse_code = r"""
const lead = $('Formularfelder extrahieren').first().json;
const resp = $input.first().json;

let raw = '';
try {
  if (resp && Array.isArray(resp.content)) {
    raw = resp.content.map(c => c.text || '').join('');
  } else if (typeof resp === 'string') {
    raw = resp;
  } else if (resp && typeof resp.text === 'string') {
    raw = resp.text;
  }
} catch (e) { raw = ''; }

let parsed = null;
try {
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) parsed = JSON.parse(match[0]);
} catch (e) { parsed = null; }

let urgenz = 0, potenzial = 0, serioes = false, kategorie = 'Pruefen', begruendung = '';

if (parsed && typeof parsed === 'object') {
  urgenz = Math.min(5, Math.max(0, Number(parsed.urgenz) || 0));
  potenzial = Math.min(5, Math.max(0, Number(parsed.potenzial) || 0));
  serioes = parsed.serioes === true || parsed.serioes === 'true';
  begruendung = parsed.begruendung || '';
  const sc = urgenz + potenzial;
  if (!serioes) kategorie = 'Niedrig';
  else if (parsed.kategorie === 'Pruefen') kategorie = 'Pruefen';
  else if (sc >= 8) kategorie = 'Hoch';
  else kategorie = 'Mittel';
} else {
  kategorie = 'Pruefen';
  begruendung = 'Claude-Antwort war kein auswertbares JSON - automatisch zur menschlichen Pruefung markiert.';
}

const score = urgenz + potenzial;

return [{ json: {
  zeitstempel: new Date().toISOString(),
  name: lead.name || '',
  email: lead.email || '',
  telefon: lead.telefon || '',
  branche: lead.branche || '',
  anliegen: lead.anliegen || '',
  urgenz, potenzial, serioes, score, kategorie, begruendung
} }];
"""
parse = {
  "parameters": {"jsCode": parse_code},
  "id": nid(),
  "name": "Claude-Antwort auswerten",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [900, 400]
}

sheets = {
  "parameters": {
    "operation": "append",
    "documentId": {"__rl": True, "value": "REPLACE_SHEET_ID", "mode": "id"},
    "sheetName": {"__rl": True, "value": "Leads", "mode": "name"},
    "columns": {
      "mappingMode": "autoMapInputData",
      "matchingColumns": [],
      "schema": [],
      "value": {}
    },
    "options": {}
  },
  "id": nid(),
  "name": "Im CRM speichern (Google Sheets)",
  "type": "n8n-nodes-base.googleSheets",
  "typeVersion": 4.5,
  "position": [1120, 400],
  "credentials": {"googleSheetsOAuth2Api": {"id": "REPLACE_SHEETS", "name": "Google Sheets - JHN2"}}
}

def cond(val):
  return {
    "conditions": {
      "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
      "conditions": [{
        "id": nid(),
        "leftValue": "={{ $json.kategorie }}",
        "rightValue": val,
        "operator": {"type": "string", "operation": "equals"}
      }],
      "combinator": "and"
    },
    "renameOutput": True,
    "outputKey": val
  }

switch = {
  "parameters": {
    "rules": {"values": [cond("Hoch"), cond("Mittel"), cond("Niedrig"), cond("Pruefen")]},
    "options": {}
  },
  "id": nid(),
  "name": "Nach Kategorie sortieren",
  "type": "n8n-nodes-base.switch",
  "typeVersion": 3.2,
  "position": [1340, 400]
}

P = "$('Claude-Antwort auswerten').item.json"

def gmail(name, pos, to_expr, subject, message):
  return {
    "parameters": {
      "sendTo": to_expr,
      "subject": subject,
      "emailType": "text",
      "message": message,
      "options": {"appendAttribution": False, "senderName": "JHN2 - AI Factory"}
    },
    "id": nid(),
    "name": name,
    "type": "n8n-nodes-base.gmail",
    "typeVersion": 2.1,
    "position": pos,
    "credentials": {"gmailOAuth2": {"id": "REPLACE_GMAIL", "name": "Gmail - info@jhn2.de"}}
  }

hoch_msg = (
"=Guten Tag {{ " + P + ".name }},\n\n"
"vielen Dank fuer Ihre Anfrage zu unseren KI-Telefonassistenten fuer die Branche {{ " + P + ".branche }}.\n\n"
"Ihr Anliegen passt sehr gut zu dem, was wir umsetzen. Lassen Sie uns die Details in einem kurzen Gespraech klaeren.\n\n"
"Buchen Sie hier direkt einen Termin, der Ihnen passt:\n"
"https://cal.com/joseph-nje-njock-yjqw88/jhn2-ai-factory\n\n"
"Ich freue mich auf das Gespraech.\n\n"
"Beste Gruesse\nJoseph Njock\nJHN2 - AI Factory\ninfo@jhn2.de"
)
hoch = gmail("Bestaetigung + Terminlink (Hoch)", [1580, 120],
  "={{ " + P + ".email }}",
  "=Ihre Anfrage bei JHN2 - AI Factory: Termin buchen",
  hoch_msg)

hoch_int_msg = (
"=NEUER HOCH-LEAD\n\n"
"Name: {{ " + P + ".name }}\n"
"E-Mail: {{ " + P + ".email }}\n"
"Telefon: {{ " + P + ".telefon }}\n"
"Branche: {{ " + P + ".branche }}\n"
"Anliegen: {{ " + P + ".anliegen }}\n\n"
"Urgenz: {{ " + P + ".urgenz }}/5 | Potenzial: {{ " + P + ".potenzial }}/5 | Score: {{ " + P + ".score }}\n"
"Begruendung: {{ " + P + ".begruendung }}\n\n"
"Terminlink wurde dem Interessenten bereits zugesendet."
)
hoch_int = gmail("Interne Info: Hoch-Lead", [1580, 280],
  "info@jhn2.de",
  "=HOCH-Lead: {{ " + P + ".name }} ({{ " + P + ".branche }})",
  hoch_int_msg)

mittel_msg = (
"=Guten Tag {{ " + P + ".name }},\n\n"
"vielen Dank fuer Ihre Anfrage zu unseren KI-Telefonassistenten fuer die Branche {{ " + P + ".branche }}.\n\n"
"Damit ich Ihnen eine passende Loesung vorschlagen kann, haette ich noch ein paar kurze Rueckfragen:\n\n"
"1. Wie viele Anrufe erhalten Sie taeglich ungefaehr - und wie viele davon bleiben unbeantwortet?\n"
"2. Welche Aufgaben soll der KI-Assistent uebernehmen? (z. B. Reservierungen, Terminvereinbarung, "
"Notfaelle weiterleiten, Angebote, Rueckrufe)\n"
"3. Welche Tools nutzen Sie aktuell? (Kalender, CRM, Reservierungs- oder Buchungssystem)\n"
"4. Bis wann moechten Sie idealerweise starten?\n\n"
"Antworten Sie einfach direkt auf diese E-Mail - ich melde mich dann zeitnah mit konkreten Vorschlaegen.\n\n"
"Beste Gruesse\nJoseph Njock\nJHN2 - AI Factory\ninfo@jhn2.de"
)
mittel = gmail("Rueckfragen (Mittel)", [1580, 440],
  "={{ " + P + ".email }}",
  "=Ihre Anfrage bei JHN2 - AI Factory: ein paar Rueckfragen",
  mittel_msg)

niedrig_msg = (
"=Guten Tag {{ " + P + ".name }},\n\n"
"vielen Dank fuer Ihr Interesse an JHN2 - AI Factory und Ihre Anfrage.\n\n"
"Aktuell koennen wir Ihrem Anliegen leider nicht weiter nachgehen. Wir moechten Sie nicht "
"unnoetig warten lassen und sagen Ihnen daher offen, dass es derzeit nicht zu einer "
"Zusammenarbeit kommt.\n\n"
"Sollte sich Ihre Situation aendern, melden Sie sich gerne jederzeit erneut.\n\n"
"Beste Gruesse\nJoseph Njock\nJHN2 - AI Factory\ninfo@jhn2.de"
)
niedrig = gmail("Hoefliche Absage (Niedrig)", [1580, 600],
  "={{ " + P + ".email }}",
  "=Ihre Anfrage bei JHN2 - AI Factory",
  niedrig_msg)

pruefen_msg = (
"=LEAD ZUR MANUELLEN PRUEFUNG\n\n"
"Name: {{ " + P + ".name }}\n"
"E-Mail: {{ " + P + ".email }}\n"
"Telefon: {{ " + P + ".telefon }}\n"
"Branche: {{ " + P + ".branche }}\n"
"Anliegen: {{ " + P + ".anliegen }}\n\n"
"Urgenz: {{ " + P + ".urgenz }}/5 | Potenzial: {{ " + P + ".potenzial }}/5 | Score: {{ " + P + ".score }}\n"
"Begruendung: {{ " + P + ".begruendung }}\n\n"
"Es wurde KEINE automatische E-Mail an den Interessenten gesendet. Bitte manuell pruefen."
)
pruefen = gmail("Interne Info: Pruefen", [1580, 760],
  "info@jhn2.de",
  "=Lead zur Pruefung: {{ " + P + ".name }} ({{ " + P + ".branche }})",
  pruefen_msg)

nodes = [trigger, extract, claude, parse, sheets, switch,
         hoch, hoch_int, mittel, niedrig, pruefen]

connections = {
  "Neue Anfrage (Gmail)": {"main": [[{"node": "Formularfelder extrahieren", "type": "main", "index": 0}]]},
  "Formularfelder extrahieren": {"main": [[{"node": "Qualifizierung durch Claude", "type": "main", "index": 0}]]},
  "Qualifizierung durch Claude": {"main": [[{"node": "Claude-Antwort auswerten", "type": "main", "index": 0}]]},
  "Claude-Antwort auswerten": {"main": [[{"node": "Im CRM speichern (Google Sheets)", "type": "main", "index": 0}]]},
  "Im CRM speichern (Google Sheets)": {"main": [[{"node": "Nach Kategorie sortieren", "type": "main", "index": 0}]]},
  "Nach Kategorie sortieren": {"main": [
    [{"node": "Bestaetigung + Terminlink (Hoch)", "type": "main", "index": 0},
     {"node": "Interne Info: Hoch-Lead", "type": "main", "index": 0}],
    [{"node": "Rueckfragen (Mittel)", "type": "main", "index": 0}],
    [{"node": "Hoefliche Absage (Niedrig)", "type": "main", "index": 0}],
    [{"node": "Interne Info: Pruefen", "type": "main", "index": 0}]
  ]}
}

workflow = {
  "name": "JHN2 - Lead-Qualifizierung (AI Factory)",
  "nodes": nodes,
  "connections": connections,
  "active": False,
  "settings": {"executionOrder": "v1"},
  "pinData": {},
  "meta": {"templateId": "jhn2-lead-qualification"},
  "tags": []
}

out = os.path.join(os.path.dirname(__file__), "jhn2-lead-qualification.json")
with open(out, "w", encoding="utf-8") as f:
  json.dump(workflow, f, ensure_ascii=False, indent=2)

print("OK - fichier ecrit:", out)
print("Noeuds:", len(nodes))
print("Taille JSON:", len(json.dumps(workflow)), "octets")
json.loads(json.dumps(workflow))
print("JSON valide (round-trip OK)")
