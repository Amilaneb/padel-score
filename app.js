'use strict';

/* =====================================================================
 * 1. MOTEUR DE SCORE (pur, sans DOM — testable sous Node)
 *
 * Le match est entièrement décrit par la pile des points marqués
 * (historique). L'état courant = rejouer la pile depuis 0-0.
 * Annuler = dépiler le dernier point puis rejouer.
 * ===================================================================== */

const OTHER = { blue: 'red', red: 'blue' };
const COLOR_WORD = { blue: 'bleu', red: 'rouge' };
const SETS_TO_WIN = 2;
const GAMES_PER_SET = 6;
const TIEBREAK_POINTS = 7;

/* ---------- Formes des données (JSDoc, pour l'autocomplétion de l'éditeur) ---------- */

/**
 * @typedef {'blue'|'red'} Team
 */

/**
 * Un score par équipe : points, jeux, sets...
 * @typedef {Object} Pair
 * @property {number} blue
 * @property {number} red
 */

/**
 * Un set terminé.
 * @typedef {Object} CompletedSet
 * @property {number} blue        jeux de l'équipe bleue
 * @property {number} red         jeux de l'équipe rouge
 * @property {Pair|null} tiebreak points du tie-break, ou null s'il n'y en a pas eu
 */

/**
 * L'état du match à un instant donné.
 * @typedef {Object} State
 * @property {Pair} points                points du jeu en cours (ou du tie-break)
 * @property {Pair} games                 jeux du set en cours
 * @property {Pair} sets                  sets gagnés
 * @property {boolean} tiebreak           true pendant un tie-break
 * @property {CompletedSet[]} completedSets
 * @property {Team|null} winner           null tant que le match n'est pas fini
 */

/**
 * @typedef {Object} Names
 * @property {string} blue
 * @property {string} red
 */

/**
 * Une ligne du journal.
 * @typedef {Object} LogEntry
 * @property {number} t          heure, en millisecondes (Date.now())
 * @property {'voice'|'touch'} src
 * @property {string} text       ce qui a été entendu ('' pour un toucher)
 * @property {string} result     'blue' | 'red' | 'undo' | 'unknown' | 'ignored'
 */

/**
 * Un match rangé dans les archives.
 * @typedef {Object} Archive
 * @property {Names} names
 * @property {State} state
 * @property {LogEntry[]} log
 */

/**
 * @typedef {'point'|'deuce'|'advantage'|'tiebreak-point'|'game'|'tiebreak-start'|'set'|'match'|'ignored'} EventType
 */

/**
 * Ce qui vient de se passer après un point.
 * @typedef {Object} GameEvent
 * @property {EventType} type
 * @property {Team} team   l'équipe qui a marqué
 */

/**
 * Résultat d'un point : le nouvel état et l'événement.
 * @typedef {Object} PointResult
 * @property {State} state
 * @property {GameEvent} event
 */

/**
 * @typedef {'blue'|'red'|'undo'} Command
 */

/** @returns {State} */
function initialState() {
  return {
    points: { blue: 0, red: 0 },  // points bruts du jeu courant (ou du tie-break)
    games: { blue: 0, red: 0 },   // jeux du set courant
    sets: { blue: 0, red: 0 },    // sets gagnés
    tiebreak: false,
    completedSets: [],            // [{ blue, red, tiebreak: {blue, red} | null }]
    winner: null,
  };
}

/**
 * @param {State} s
 * @returns {State}
 */
function cloneState(s) {
  return JSON.parse(JSON.stringify(s));
}

/**
 * Applique un point pour `team` ('blue' | 'red').
 * Retourne { state, event } ; event.type parmi :
 *   point, deuce, advantage, tiebreak-point, game, tiebreak-start, set, match, ignored
 * @param {State} prev
 * @param {Team} team
 * @returns {PointResult}
 */
function applyPoint(prev, team) {
  const s = cloneState(prev);
  if (s.winner) return { state: s, event: { type: 'ignored', team } };

  const other = OTHER[team];
  s.points[team] += 1;
  const p = s.points[team];
  const q = s.points[other];

  if (s.tiebreak) {
    if (p >= TIEBREAK_POINTS && p - q >= 2) return winGame(s, team);
    return { state: s, event: { type: 'tiebreak-point', team } };
  }

  if (p >= 4 && p - q >= 2) return winGame(s, team);
  if (p >= 3 && q >= 3) {
    return { state: s, event: { type: p === q ? 'deuce' : 'advantage', team } };
  }
  return { state: s, event: { type: 'point', team } };
}

/**
 * Jeu gagné par `team` (modifie `s` directement).
 * @param {State} s
 * @param {Team} team
 * @returns {PointResult}
 */
function winGame(s, team) {
  const other = OTHER[team];
  const tiebreakScore = s.tiebreak ? { blue: s.points.blue, red: s.points.red } : null;

  s.points = { blue: 0, red: 0 };
  s.tiebreak = false;
  s.games[team] += 1;
  const g = s.games[team];
  const h = s.games[other];

  const setWon = tiebreakScore !== null || (g >= GAMES_PER_SET && g - h >= 2);
  if (setWon) {
    s.completedSets.push({ blue: s.games.blue, red: s.games.red, tiebreak: tiebreakScore });
    s.sets[team] += 1;
    s.games = { blue: 0, red: 0 };
    if (s.sets[team] >= SETS_TO_WIN) {
      s.winner = team;
      return { state: s, event: { type: 'match', team } };
    }
    return { state: s, event: { type: 'set', team } };
  }

  if (g === GAMES_PER_SET && h === GAMES_PER_SET) {
    s.tiebreak = true;
    return { state: s, event: { type: 'tiebreak-start', team } };
  }
  return { state: s, event: { type: 'game', team } };
}

/**
 * Rejoue une pile de points (['blue', 'red', ...] ou [{team}, ...]).
 * @param {Array<Team|{team: Team}>} history
 * @returns {{state: State, event: GameEvent|null}}
 */
function replay(history) {
  let state = initialState();
  let event = null;
  for (const entry of history) {
    const team = typeof entry === 'string' ? entry : entry.team;
    ({ state, event } = applyPoint(state, team));
  }
  return { state, event };
}

const GAME_ENDING = new Set(['game', 'tiebreak-start', 'set', 'match']);

/* ---------- Textes (affichage + annonces en toutes lettres) ---------- */

const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit',
  'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const TENS = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' };

/**
 * @param {number} n
 * @returns {string}
 */
function numberFr(n) {
  if (n <= 16) return UNITS[n];
  if (n < 20) return 'dix-' + UNITS[n - 10];
  if (n < 70) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return TENS[t];
    if (u === 1) return TENS[t] + ' et un';
    return TENS[t] + '-' + UNITS[u];
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : 'soixante-' + numberFr(n - 60);
  if (n < 100) return n === 80 ? 'quatre-vingts' : 'quatre-vingt-' + numberFr(n - 80);
  return String(n);
}

const POINT_WORDS = ['zéro', 'quinze', 'trente', 'quarante'];
const POINT_DIGITS = ['0', '15', '30', '40'];

/**
 * Score de points d'un jeu normal, bleu en premier : "quinze zéro", "égalité"...
 * @param {Pair} points
 * @returns {string}
 */
function gamePointsPhrase(points) {
  const b = points.blue;
  const r = points.red;
  if (b >= 3 && r >= 3) {
    if (b === r) return 'égalité';
    return 'avantage ' + COLOR_WORD[b > r ? 'blue' : 'red'];
  }
  if (b === r) return POINT_WORDS[b] + ' partout';
  return POINT_WORDS[b] + ' ' + POINT_WORDS[r];
}

/**
 * @param {Pair} points
 * @returns {string}
 */
function tiebreakPhrase(points) {
  const b = points.blue;
  const r = points.red;
  if (b === r) return numberFr(b) + ' partout';
  return numberFr(b) + ' à ' + numberFr(r);
}

/**
 * "quatre jeux à trois", "un jeu partout", "deux sets à zéro"... (bleu en premier)
 * @param {Pair} counts
 * @param {string} singular
 * @param {string} plural
 * @returns {string}
 */
function countPhrase(counts, singular, plural) {
  const b = counts.blue;
  const r = counts.red;
  const word = b >= 2 ? plural : singular;
  if (b === r) return numberFr(b) + ' ' + word + ' partout';
  return numberFr(b) + ' ' + word + ' à ' + numberFr(r);
}

/** @param {Pair} games @returns {string} */
const gamesPhrase = (games) => countPhrase(games, 'jeu', 'jeux');
/** @param {Pair} sets @returns {string} */
const setsPhrase = (sets) => countPhrase(sets, 'set', 'sets');

/**
 * Texte de l'annonce vocale après un point.
 * @param {GameEvent} event
 * @param {State} state
 * @returns {string}
 */
function announceEvent(event, state) {
  const color = COLOR_WORD[event.team];
  switch (event.type) {
    case 'point': return gamePointsPhrase(state.points);
    case 'deuce': return 'égalité';
    case 'advantage': return 'avantage ' + color;
    case 'tiebreak-point': return tiebreakPhrase(state.points);
    case 'game': return 'jeu ' + color + ', ' + gamesPhrase(state.games);
    case 'tiebreak-start': return 'jeu ' + color + ', six jeux partout, jeu décisif';
    case 'set': return 'set ' + color + ', ' + setsPhrase(state.sets);
    case 'match': return 'match gagné, équipe ' + (event.team === 'blue' ? 'bleue' : 'rouge');
    default: return '';
  }
}

/**
 * Texte de l'annonce après annulation. `undoneType` = type d'événement du point retiré.
 * @param {EventType} undoneType
 * @param {State} state
 * @param {number} remaining   nombre de points restant dans l'historique
 * @returns {string}
 */
function undoPhrase(undoneType, state, remaining) {
  if (remaining === 0) return 'point annulé, retour au début du match';
  let text;
  if (state.tiebreak) {
    text = 'jeu décisif, ' + tiebreakPhrase(state.points);
  } else {
    text = gamePointsPhrase(state.points);
    const startOfGame = state.points.blue === 0 && state.points.red === 0;
    if (GAME_ENDING.has(undoneType) || startOfGame) text += ', ' + gamesPhrase(state.games);
  }
  return 'point annulé, retour à ' + text;
}

/**
 * Points à afficher à l'écran : { blue, red, banner }.
 * @param {State} state
 * @returns {{blue: string, red: string, banner: string}}
 */
function displayPoints(state) {
  const b = state.points.blue;
  const r = state.points.red;
  if (state.winner) return { blue: '–', red: '–', banner: '' };
  if (state.tiebreak) return { blue: String(b), red: String(r), banner: 'JEU DÉCISIF' };
  if (b >= 3 && r >= 3) {
    if (b === r) return { blue: '40', red: '40', banner: 'ÉGALITÉ' };
    const leader = b > r ? 'blue' : 'red';
    return {
      blue: leader === 'blue' ? 'AV' : '40',
      red: leader === 'red' ? 'AV' : '40',
      banner: 'AVANTAGE ' + COLOR_WORD[leader].toUpperCase(),
    };
  }
  return { blue: POINT_DIGITS[b], red: POINT_DIGITS[r], banner: '' };
}

/**
 * "6-4" ou "7-6 (7-5)" du point de vue de `first`.
 * @param {CompletedSet} set
 * @param {Team} first
 * @returns {string}
 */
function formatSet(set, first = 'blue') {
  const second = OTHER[first];
  let txt = set[first] + '-' + set[second];
  if (set.tiebreak) txt += ' (' + set.tiebreak[first] + '-' + set.tiebreak[second] + ')';
  return txt;
}

/** @param {LogEntry[]} logs */
function formatLog(logs) {
  return logs
      .map((log, i) => {
        const date = new Date(log.t).toLocaleTimeString('fr-FR');
        const gap = i === 0 ? '' : '+' + Math.round((log.t - logs[i - 1].t)/1000) + 's';
        return [date, gap, log.src, log.result, log.text].join('\t | \t');
      })
      .join('\n');
}

/** @param {State} state */
function formatScore(state) {
  const gameParts = state.completedSets.map(s => formatSet(s, 'blue'));
  if (state.winner === null) {
    gameParts.push(`${state.games.blue}-${state.games.red}`);
  }
  return gameParts.join(', ') + (state.winner !== null ? ' (terminé)' : ' (abandonné)');
}

/**
 * @param {Archive[]} archives
 * @param {LogEntry[]} currentLog
 */
function formatAllLogs(archives, currentLog) {

  const logFile = [];

  const header = [
    'Journal App',
    archives.length + ' match(s)',
    'envoyé le ' + new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
  ].join(' - ');
  logFile.push(header);

  for (const match of archives) {
    const blueTeam = match.names.blue || 'Bleu';
    const redTeam = match.names.red || 'Rouge';
    const date = new Date(match.log[0].t).toLocaleDateString('fr-FR');
    const score = formatScore(match.state);
    const matchTitle = `=== ${blueTeam} vs ${redTeam} - ${date} - ${score} - ${match.log.length} entrées ===`;
    logFile.push(matchTitle + '\n' + formatLog(match.log));
  }

  // ── 4. L'ASSEMBLAGE ──────────────────────────────────────────────────────
  // On colle tous les morceaux de la liste, avec une ligne vide entre chaque
  // (deux retours à la ligne), et on renvoie le texte obtenu.
  return logFile.join('\n\n');
}
/* ---------- Reconnaissance des commandes vocales ---------- */

/**
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const COMMAND_PATTERNS = [
  { cmd: 'blue', re: /\b(point|points|poing|poings) bleu/ },
  { cmd: 'red', re: /\b(point|points|poing|poings) rouge/ },
  { cmd: 'undo', re: /\bannule/ },
];

/**
 * Retourne 'blue' | 'red' | 'undo' | null (première commande trouvée dans le texte).
 * @param {string} text
 * @returns {Command|null}
 */
function detectCommand(text) {
  const n = normalize(text);
  // Écho de notre propre annonce "point annulé, retour à ..." : à ignorer.
  if (/\bretour a\b/.test(n)) return null;
  let best = null;
  let bestIndex = Infinity;
  for (const { cmd, re } of COMMAND_PATTERNS) {
    const m = re.exec(n);
    if (m && m.index < bestIndex) {
      best = cmd;
      bestIndex = m.index;
    }
  }
  return best;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initialState, applyPoint, replay, numberFr, gamePointsPhrase, tiebreakPhrase,
    gamesPhrase, setsPhrase, announceEvent, undoPhrase, displayPoints, formatSet,
    normalize, detectCommand, formatLog,
  };
}

/* =====================================================================
 * 2. APPLICATION (navigateur)
 * ===================================================================== */

if (typeof document !== 'undefined') {
  (function () {
    const STORAGE_KEY = 'padel-score-v1';
    const ECHO_GUARD_MS = 800;   // ignorer le micro juste après une annonce (anti-écho)
    const TAP_DEBOUNCE_MS = 350; // anti double-tap accidentel
    const ANNOUNCE_DELAY_MS = 180; // le bip passe avant l'annonce
    const SPEECH_MAX_MS = 6000;    // durée max supposée d'une annonce
    const LANG = 'fr-FR';
    const LOG_MAX = 1999;
    const ARCHIVES_MAX = 10;

    const $ = (id) => document.getElementById(id);

    const app = {
      screen: 'setup',
      names: { blue: '', red: '' },
      history: [],   // [{ team, source, type }]
      state: initialState(),
      counters: { voice: 0, touch: 0, voiceUndo: 0, touchUndo: 0 },
      /** @type {LogEntry[]} */
      log: [],
      /** @type {Archive[]} */
      archives: [],
    };window.app = app;

    /* ---------- Son de confirmation ---------- */

    const Beep = {
      ctx: null,
      unlock() {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!this.ctx && AC) this.ctx = new AC();
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      },
      tone(freq, start, duration) {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = ctx.currentTime + start;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + duration + 0.02);
      },
      play(kind) {
        if (!this.ctx) return;
        try {
          if (kind === 'undo') {
            this.tone(660, 0, 0.08);
            this.tone(440, 0.09, 0.1);
          } else {
            this.tone(1175, 0, 0.1);
          }
        } catch (e) { /* audio indisponible : on ignore */ }
      },
    };

    /* ---------- Synthèse vocale ---------- */

    const Speaker = {
      supported: 'speechSynthesis' in window,
      voice: null,
      utterance: null,  // référence gardée : évite que Chrome perde l'événement onend
      busyUntil: 0,     // micro ignoré jusqu'à cet instant (anti-écho / anti-doublon)
      token: 0,
      init() {
        if (!this.supported) return;
        const pick = () => {
          const voices = window.speechSynthesis.getVoices();
          this.voice = voices.find((v) => v.lang === 'fr-FR')
            || voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('fr'))
            || null;
        };
        pick();
        window.speechSynthesis.addEventListener('voiceschanged', pick);
      },
      /** Bloque le micro dès qu'une commande est acceptée, avant même l'annonce. */
      hold() {
        this.token += 1;
        this.busyUntil = Date.now() + SPEECH_MAX_MS;
      },
      say(text) {
        const token = ++this.token;
        const done = () => {
          if (token === this.token) this.busyUntil = Date.now() + ECHO_GUARD_MS;
        };
        if (!this.supported || !text) { done(); return; }
        const synth = window.speechSynthesis;
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'fr-FR';
        if (this.voice) u.voice = this.voice;
        u.rate = 1.05;
        u.onend = done;
        u.onerror = done;
        this.utterance = u;
        // Filet de sécurité si onend ne se déclenche jamais.
        this.busyUntil = Date.now() + SPEECH_MAX_MS;
        synth.speak(u);
      },
      busy() {
        return Date.now() < this.busyUntil;
      },
    };

    /* ---------- Reconnaissance vocale ---------- */

    const Voice = {
      SR: window.SpeechRecognition || window.webkitSpeechRecognition || null,
      rec: null,
      wanted: false,
      blocked: false,   // permission refusée / pas de micro : on n'insiste plus
      startedAt: 0,
      quickFails: 0,
      restartTimer: null,
      // Reconnaissance sur l'appareil (Chrome récent) : 'local' si active, sinon 'cloud'.
      mode: 'cloud',
      // available | downloadable | downloading | unavailable | unsupported | unknown
      localStatus: 'unknown',

      get available() { return !!this.SR; },

      /** L'API « sur l'appareil » existe-t-elle dans ce navigateur ? */
      get localSupported() {
        return !!(this.SR && typeof this.SR.available === 'function'
          && typeof this.SR.install === 'function' && this.rec && 'processLocally' in this.rec);
      },

      /** Vérifie si le français est reconnaissable sur l'appareil, et l'active si oui. */
      async checkLocal() {
        if (!this.localSupported) {
          this.localStatus = 'unsupported';
          renderVoiceMode();
          return;
        }
        try {
          this.localStatus = await this.SR.available({ langs: [LANG], processLocally: true });
        } catch (e) {
          this.localStatus = 'unavailable';
        }
        if (this.localStatus === 'available') this.setMode('local');
        renderVoiceMode();
      },

      /** Télécharge le français pour l'appareil. Doit être appelé pendant un geste utilisateur. */
      installLocal() {
        if (!this.localSupported || this.localStatus !== 'downloadable') return;
        this.localStatus = 'downloading';
        renderVoiceMode();
        this.SR.install({ langs: [LANG], processLocally: true })
          .then((ok) => {
            this.localStatus = ok ? 'available' : 'unavailable';
            if (ok) this.setMode('local');
          })
          .catch(() => { this.localStatus = 'unavailable'; })
          .then(() => renderVoiceMode());
      },

      setMode(mode) {
        if (!this.rec || this.mode === mode) return;
        this.mode = mode;
        this.rec.processLocally = mode === 'local';
        renderVoiceMode();
        // Relance pour appliquer le nouveau mode tout de suite (onend redémarre l'écoute).
        if (this.wanted) {
          try { this.rec.abort(); } catch (e) { /* ignore */ }
        }
      },

      init() {
        if (!this.SR) {
          setMicStatus('unavailable');
          return;
        }
        const rec = new this.SR();
        rec.lang = LANG;
        rec.continuous = true;
        rec.interimResults = false;
        rec.maxAlternatives = 3;

        rec.onstart = () => {
          this.startedAt = Date.now();
          setMicStatus('listening');
        };

        rec.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const result = e.results[i];
            if (!result.isFinal) continue;
            const transcripts = Array.from(result, (alt) => alt.transcript);
            const transcript = transcripts[0];
            const heard = transcripts.join(' / ');
            if (Speaker.busy()) {
              addLog('voice', heard, 'ignored');
              showHeard(transcript, 'ignoré pendant l\'annonce');
              continue;
            }

            let cmd = null;
            for (const t of transcripts) {
              cmd = detectCommand(t);
              if (cmd) break;
            }
            addLog('voice', heard, cmd || 'unknown');
            showHeard(transcript, cmd ? null : 'non reconnu');
            if (cmd) handleCommand(cmd, 'voice');
          }
        };

        rec.onerror = (e) => {
          // Échec du mode « sur l'appareil » : on revient au service en ligne sans bloquer le vocal.
          if (this.mode === 'local'
            && (e.error === 'language-not-supported' || e.error === 'service-not-allowed')) {
            this.localStatus = 'unavailable';
            this.setMode('cloud');
            return;
          }
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
            this.blocked = true;
            this.wanted = false;
            setMicStatus('denied', e.error);
          }
          // Autres erreurs (no-speech, network, aborted...) : onend relancera.
        };

        rec.onend = () => {
          if (!this.wanted || this.blocked) {
            if (!this.blocked) setMicStatus('off');
            return;
          }
          // Session coupée par le navigateur : on relance automatiquement.
          const shortLived = Date.now() - this.startedAt < 1500;
          this.quickFails = shortLived ? this.quickFails + 1 : 0;
          const delay = this.quickFails > 3 ? 3000 : 250;
          setMicStatus('restarting');
          clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => this.start(), delay);
        };

        this.rec = rec;
        this.checkLocal();
      },

      start() {
        if (!this.rec || this.blocked) return;
        this.wanted = true;
        try {
          this.rec.start();
        } catch (e) {
          // InvalidStateError : déjà démarrée, rien à faire.
        }
      },

      stop() {
        this.wanted = false;
        clearTimeout(this.restartTimer);
        if (this.rec) {
          try { this.rec.abort(); } catch (e) { /* ignore */ }
        }
        if (!this.blocked && this.available) setMicStatus('off');
      },
    };

    /* ---------- Maintien de l'écran allumé ---------- */

    const ScreenLock = {
      sentinel: null,
      async request() {
        if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
        try {
          this.sentinel = await navigator.wakeLock.request('screen');
        } catch (e) { /* refusé : sans conséquence */ }
      },
      release() {
        if (this.sentinel) this.sentinel.release().catch(() => {});
        this.sentinel = null;
      },
    };

    /* ---------- Affichage ---------- */

    function setMicStatus(state, detail) {
      const el = $('mic-status');
      const text = $('mic-text');
      const warn = $('voice-warning');
      el.dataset.state = state;
      warn.hidden = true;
      switch (state) {
        case 'listening': text.textContent = 'Écoute active'; break;
        case 'restarting': text.textContent = 'Reconnexion…'; break;
        case 'off': text.textContent = 'Micro inactif'; break;
        case 'unavailable':
          text.textContent = 'Vocal indisponible';
          warn.textContent = 'Reconnaissance vocale non disponible sur ce navigateur : '
            + 'utilisez les zones tactiles (Chrome sur Android recommandé).';
          warn.hidden = false;
          break;
        case 'denied':
          text.textContent = 'Micro bloqué';
          warn.textContent = detail === 'audio-capture'
            ? 'Aucun micro détecté : utilisez les zones tactiles.'
            : 'Accès au micro refusé : utilisez les zones tactiles. '
              + 'Pour réactiver le vocal, autorisez le micro pour ce site puis rechargez la page.';
          warn.hidden = false;
          break;
        default: break;
      }
    }

    /** Affiche où se fait la reconnaissance (utile pour le test terrain). */
    function renderVoiceMode() {
      const el = $('voice-mode');
      const texts = {
        local: 'Reconnaissance vocale : sur le téléphone',
        downloading: 'Reconnaissance vocale : en ligne (téléchargement du français pour le téléphone en cours…)',
        downloadable: 'Reconnaissance vocale : en ligne (le français sera téléchargé sur le téléphone au démarrage du match)',
        cloud: 'Reconnaissance vocale : en ligne (mode « sur le téléphone » non disponible)',
        unsupported: 'Reconnaissance vocale : en ligne (mode « sur le téléphone » non pris en charge par ce navigateur)',
      };
      let key = Voice.mode === 'local' ? 'local' : 'cloud';
      if (Voice.mode !== 'local') {
        if (Voice.localStatus === 'downloading' || Voice.localStatus === 'downloadable') key = Voice.localStatus;
        if (Voice.localStatus === 'unsupported') key = 'unsupported';
      }
      const known = Voice.available && Voice.localStatus !== 'unknown';
      el.hidden = !known;
      $('mic-mode-wrap').hidden = !known;
      if (!known) return;
      el.textContent = texts[key];
      $('mic-mode').textContent = Voice.mode === 'local' ? 'sur le téléphone' : 'en ligne';
    }

    let heardTimer = null;
    function showHeard(transcript, note) {
      const el = $('heard');
      el.textContent = 'Entendu : « ' + transcript.trim() + ' »' + (note ? ' — ' + note : '');
      clearTimeout(heardTimer);
      heardTimer = setTimeout(() => { el.textContent = ''; }, 6000);
    }

    function teamName(team) {
      return app.names[team] || (team === 'blue' ? 'Bleu' : 'Rouge');
    }

    function showScreen(name) {
      app.screen = name;
      $('screen-setup').hidden = name !== 'setup';
      $('screen-game').hidden = name !== 'game';
      $('screen-end').hidden = name !== 'end';
      if (name === 'setup') ScreenLock.release(); else ScreenLock.request();
    }

    function render() {
      const s = app.state;
      const pts = displayPoints(s);
      for (const team of ['blue', 'red']) {
        $('label-' + team).textContent = teamName(team);
        $('points-' + team).textContent = pts[team];
        $('games-' + team).textContent = s.games[team];
        $('sets-' + team).textContent = s.sets[team];
      }
      $('banner').textContent = pts.banner;
      $('sets-line').textContent = s.completedSets.map((set) => formatSet(set, 'blue')).join('  ·  ');
      if (s.winner) renderEnd();
    }

    function renderEnd() {
      const s = app.state;
      const w = s.winner;
      const winnerEl = $('winner-name');
      winnerEl.textContent = teamName(w);
      winnerEl.className = 'winner team-' + w;
      $('end-score').textContent = s.completedSets.map((set) => formatSet(set, w)).join(', ');

      const head = $('sets-table-head');
      head.innerHTML = '';
      head.appendChild(document.createElement('th'));
      s.completedSets.forEach((_, i) => {
        const th = document.createElement('th');
        th.textContent = 'Set ' + (i + 1);
        head.appendChild(th);
      });
      for (const team of ['blue', 'red']) {
        const row = $('sets-row-' + team);
        row.innerHTML = '';
        row.classList.toggle('is-winner', team === w);
        const name = document.createElement('td');
        name.textContent = teamName(team);
        row.appendChild(name);
        for (const set of s.completedSets) {
          const td = document.createElement('td');
          td.textContent = set[team];
          if (set.tiebreak) {
            const sup = document.createElement('sup');
            sup.textContent = ' ' + set.tiebreak[team];
            td.appendChild(sup);
          }
          if (set[team] > set[OTHER[team]]) td.classList.add('won');
          row.appendChild(td);
        }
      }

      const c = app.counters;
      $('end-stats').textContent = 'Saisie : ' + c.voice + ' point(s) à la voix, '
        + c.touch + ' au tactile · Annulations : ' + (c.voiceUndo + c.touchUndo)
        + ' (' + c.voiceUndo + ' à la voix, ' + c.touchUndo + ' au tactile)';
    }

    function flashZone(team) {
      const el = $('zone-' + team);
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 180);
    }

    function announce(text, kind) {
      Speaker.hold();
      Beep.play(kind);
      setTimeout(() => Speaker.say(text), ANNOUNCE_DELAY_MS);
    }

    /* ---------- Actions ---------- */

    function handleCommand(cmd, source) {
      if (app.screen === 'setup') return;
      if (source === 'touch') addLog('touch', ' ', cmd);
      if (cmd === 'undo') undo(source);
      else scorePoint(cmd, source);
    }

    function scorePoint(team, source) {
      if (app.state.winner) return; // match terminé : seul "annule" reste actif
      const { state, event } = applyPoint(app.state, team);
      app.history.push({ team, source, type: event.type });
      app.state = state;
      app.counters[source] += 1;
      render();
      flashZone(team);
      announce(announceEvent(event, state), 'point');
      save();
      if (state.winner) showScreen('end');
    }

    function undo(source) {
      app.counters[source === 'voice' ? 'voiceUndo' : 'touchUndo'] += 1;
      if (app.history.length === 0) {
        announce('rien à annuler', 'undo');
        save();
        return;
      }
      const undone = app.history.pop();
      app.state = replay(app.history).state;
      render();
      if (app.screen === 'end') showScreen('game');
      announce(undoPhrase(undone.type, app.state, app.history.length), 'undo');
      save();
    }

    function startMatch() {
      app.names = {
        blue: $('name-blue').value.trim(),
        red: $('name-red').value.trim(),
      };
      app.history = [];
      app.state = initialState();
      app.counters = { voice: 0, touch: 0, voiceUndo: 0, touchUndo: 0 };
      app.log = [];
      render();
      showScreen('game');
      save();
      Voice.start();
      announce('début du match', 'point');
    }

    function backToSetup() {
      if (app.log.length > 0) {
        const archive = {
          names: app.names,
          state: app.state,
          log: app.log,
        };
        app.archives.push(archive);
        app.log = [];
        if (app.archives.length > ARCHIVES_MAX) app.archives.shift();
      }
      Voice.stop();
      Speaker.supported && window.speechSynthesis.cancel();
      app.history = [];
      app.state = initialState();
      $('name-blue').value = app.names.blue;
      $('name-red').value = app.names.red;
      showScreen('setup');
      updateShareButton();
      save();
    }

    function updateShareButton() {
      const button = $('btn-share-logs');
      button.hidden = (app.archives.length === 0);
    }

    function flashButton(message) {
      const button = $('btn-share-logs');
      button.textContent = message;
      setTimeout(() => button.textContent = 'Envoyer les Logs', 1000);
    }

    async function shareLogs() {

      const allLogs = formatAllLogs(app.archives);

      // 2. Le nom du fichier, avec la date et l'heure d'envoi : journal-padel_11-10-2026_18h42.txt
      const now = new Date();
      const day = now.toLocaleDateString('fr-FR').replaceAll('/', '-');
      const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
      const fileName = `journal-score${day}_${time}.txt`;
      const file = new File(
          [allLogs],
          fileName,
          { type: "text/plain" }
      );

      const shareData = { files: [file], title: 'Journal Score' };
      const canShareFile = navigator.canShare && navigator.canShare(shareData);

      try {
        if (canShareFile){
          await navigator.share(shareData)
        }
         await navigator.clipboard.writeText(allLogs)
        flashButton('Copié ✓');
      } catch (e) {
        if (e.name === 'AbortError') return flashButton('Envoi impossible');
      }
    }

    /* ---------- Sauvegarde locale (survit à un rechargement) ---------- */

    function save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          screen: app.screen,
          names: app.names,
          history: app.history,
          counters: app.counters,
          log: app.log,
          archives: app.archives,
        }));
      } catch (e) { /* stockage indisponible : sans conséquence */ }
    }

    /**
     * @param {'voice'|'touch'} src
     * @param {string} text
     * @param {string} result
     */
    function addLog(src, text, result) {
      if (app.log.length > LOG_MAX) app.log.shift();
      const newLog = {t: Date.now(), src, text, result};
      app.log.push(newLog);
      save();
    }

    function restore() {
      try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (!data) return false;
        app.names = data.names || app.names;
        $('name-blue').value = app.names.blue || '';
        $('name-red').value = app.names.red || '';
        app.log = data.log || [];
        app.archives = data.archives || [];
        if (data.screen === 'setup' || !Array.isArray(data.history)) return false;
        app.history = data.history.filter((h) => h && (h.team === 'blue' || h.team === 'red'));
        app.counters = Object.assign(app.counters, data.counters);
        app.state = replay(app.history).state;
        render();
        showScreen(app.state.winner ? 'end' : 'game');
        return true;
      } catch (e) {
        return false;
      }
    }

    /* ---------- Initialisation ---------- */

    function init() {
      Speaker.init();
      Voice.init();

      if (!Voice.available) {
        const w = $('setup-warning');
        w.textContent = 'Reconnaissance vocale non disponible sur ce navigateur : '
          + 'le match se jouera avec les zones tactiles uniquement (Chrome sur Android recommandé).';
        w.hidden = false;
      } else if (!window.isSecureContext) {
        const w = $('setup-warning');
        w.textContent = 'Le micro nécessite une connexion HTTPS : ouvrez l\'application via son adresse https://.';
        w.hidden = false;
      }

      // Le son ne peut démarrer qu'après une interaction utilisateur.
      document.addEventListener('pointerdown', () => Beep.unlock(), { capture: true });
      document.addEventListener('keydown', () => Beep.unlock(), { capture: true });

      $('setup-form').addEventListener('submit', (e) => {
        e.preventDefault();
        Beep.unlock();
        Voice.installLocal();
        startMatch();
      });

      let lastTap = 0;
      for (const team of ['blue', 'red']) {
        $('zone-' + team).addEventListener('click', () => {
          const now = Date.now();
          if (now - lastTap < TAP_DEBOUNCE_MS) return;
          lastTap = now;
          handleCommand(team, 'touch');
        });
      }
      $('btn-undo').addEventListener('click', () => handleCommand('undo', 'touch'));
      $('btn-end-undo').addEventListener('click', () => handleCommand('undo', 'touch'));
      $('btn-new').addEventListener('click', backToSetup);
      $('btn-quit').addEventListener('click', () => {
        if (window.confirm('Abandonner le match en cours ?')) backToSetup();
      });
      $('btn-share-logs').addEventListener('click', shareLogs);

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || app.screen === 'setup') return;
        ScreenLock.request();
        if (Voice.wanted) Voice.start();
      });

      const restored = restore();
      updateShareButton();
      if (restored) {
        const overlay = $('resume-overlay');
        overlay.hidden = false;
        overlay.addEventListener('click', () => {
          overlay.hidden = true;
          Beep.unlock();
          Voice.start();
          const s = app.state;
          if (!s.winner) {
            const text = s.tiebreak
              ? 'jeu décisif, ' + tiebreakPhrase(s.points)
              : gamePointsPhrase(s.points) + ', ' + gamesPhrase(s.games);
            announce('reprise, ' + text, 'point');
          }
        }, { once: true });
      }
    }

    init();
  })();
}
