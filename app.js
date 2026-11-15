'use strict';

/* =====================================================================
 * 1. MOTEUR DE SCORE (pur, sans DOM — testable sous Node)
 *
 * Le match est entièrement décrit par la pile des points marqués
 * (historique). L'état courant = rejouer la pile depuis 0-0.
 * Annuler = dépiler le dernier point puis rejouer.
 * ===================================================================== */

const LANG = 'fr-FR';   // langue de la reconnaissance, des annonces et des dates
const OTHER = { blue: 'red', red: 'blue' };
const DEFAULT_NAMES = { blue: 'Bleu', red: 'Rouge' };   // nom affiché quand l'équipe n'a pas de nom
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
 * @property {'voice'|'touch'|'mic'|'app'} src
 * @property {string} text       ce qui a été entendu ('' pour un toucher ; mode du micro pour 'mic')
 * @property {string} result     voice/touch : 'blue' | 'red' | 'undo' | 'refused' (match terminé) |
 *                                 'unknown' | 'ignored' (pendant une annonce)
 *                               mic : 'start' | 'end' | 'reset' | 'error:<code>'   app : 'hidden' | 'visible'
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
  const startOfGame = state.points.blue === 0 && state.points.red === 0;
  return 'point annulé, retour à ' + scorePhrase(state, GAME_ENDING.has(undoneType) || startOfGame);
}

/**
 * Score actuel en toutes lettres : « trente quinze », « jeu décisif, trois à deux »,
 * suivi des jeux si `withGames` (« quinze zéro, deux jeux à un »).
 * @param {State} state
 * @param {boolean} withGames
 * @returns {string}
 */
function scorePhrase(state, withGames) {
  if (state.tiebreak) return 'jeu décisif, ' + tiebreakPhrase(state.points);
  const points = gamePointsPhrase(state.points);
  return withGames ? points + ', ' + gamesPhrase(state.games) : points;
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

/* ---------- Journal : export texte ---------- */

const JOURNAL_TITLE = 'Journal Score';   // en-tête du fichier envoyé et titre du partage

/**
 * Lignes du journal d'un match, colonnes séparées par des tabulations (se colle dans un tableur) :
 * heure, écart avec la ligne précédente, source, résultat, texte entendu.
 * @param {LogEntry[]} logs
 * @returns {string}
 */
function formatLog(logs) {
  return logs
    .map((log, i) => {
      const time = new Date(log.t).toLocaleTimeString(LANG);
      const gap = i === 0 ? '' : '+' + Math.round((log.t - logs[i - 1].t) / 1000) + 's';
      return [time, gap, log.src, log.result, log.text].join('\t');
    })
    .join('\n');
}

/**
 * Score d'un match pour le titre de son bloc : sets terminés, set en cours si le match a été
 * abandonné, puis le statut. Bleu en premier : « 6-4, 3-1 (abandonné) ».
 * @param {State} state
 * @returns {string}
 */
function formatScore(state) {
  const parts = state.completedSets.map((set) => formatSet(set, 'blue'));
  if (state.winner === null) parts.push(`${state.games.blue}-${state.games.red}`);
  return parts.join(', ') + (state.winner !== null ? ' (terminé)' : ' (abandonné)');
}

/**
 * Texte complet du journal à envoyer : un en-tête, puis un bloc par match archivé
 * (titre, puis ses lignes), avec une ligne vide entre chaque.
 * @param {Archive[]} archives
 * @param {Date} [now]  date d'envoi (en-tête)
 * @returns {string}
 */
function formatAllLogs(archives, now = new Date()) {
  const sentAt = now.toLocaleString(LANG, {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const blocks = [`${JOURNAL_TITLE} - ${archives.length} match(s) - envoyé le ${sentAt}`];
  for (const match of archives) {
    const blue = match.names.blue || DEFAULT_NAMES.blue;
    const red = match.names.red || DEFAULT_NAMES.red;
    const date = new Date(match.log[0].t).toLocaleDateString(LANG);
    const title = `### ${blue} vs ${red} - ${date} - ${formatScore(match.state)} - ${match.log.length} entrées ###`;
    blocks.push(title + '\n' + formatLog(match.log));
  }
  return blocks.join('\n\n');
}

/**
 * Nom du fichier envoyé, daté sans caractère interdit dans un nom de fichier (ni « / » ni « : ») :
 * journal-score_11-10-2026_18h42.txt
 * @param {Date} now
 * @returns {string}
 */
function exportFileName(now) {
  const day = now.toLocaleDateString(LANG).replaceAll('/', '-');
  const time = now.toLocaleTimeString(LANG, { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
  return `journal-score_${day}_${time}.txt`;
}

/* ---------- Match en cours : état, journal, archives, sauvegarde ---------- */

const STORAGE_KEY = 'padel-score-v1';   // clé de la sauvegarde dans le navigateur
const LOG_MAX = 2000;      // entrées de journal gardées par match
const ARCHIVES_MAX = 10;   // matchs gardés dans les archives

/** @typedef {{voice: number, touch: number, voiceUndo: number, touchUndo: number}} Counters */
/** @typedef {{team: Team, source: 'voice'|'touch', type: EventType}} HistoryEntry */

/** @returns {Counters} */
const newCounters = () => ({ voice: 0, touch: 0, voiceUndo: 0, touchUndo: 0 });

/** @param {*} a  archive relue depuis la sauvegarde */
const isValidArchive = (a) => !!(a && a.names && a.state && Array.isArray(a.log) && a.log.length > 0);

/**
 * Ce que l'écran doit faire après une commande.
 * @typedef {Object} CommandEffect
 * @property {'point'|'undo'|'nothing-to-undo'|'refused'} kind
 * @property {Team} [team]               équipe qui a marqué (kind 'point')
 * @property {string} [say]              annonce à faire
 * @property {'point'|'undo'} [beep]     bip à jouer avant l'annonce
 */

/**
 * Match en cours : possède les noms, l'historique des points (d'où le score est recalculé),
 * les compteurs de saisie, le journal et les archives. Il produit et relit aussi la sauvegarde :
 * le format sauvegardé n'existe qu'ici.
 */
function createMatchSession() {
  let names = { blue: '', red: '' };
  /** @type {HistoryEntry[]} */
  let history = [];
  let state = initialState();
  let counters = newCounters();
  /** @type {LogEntry[]} */
  let log = [];
  /** @type {Archive[]} */
  let archives = [];

  return {
    get names() { return names; },
    get state() { return state; },
    get history() { return history; },
    get counters() { return counters; },
    get log() { return log; },
    get archives() { return archives; },

    /** @param {Names} newNames */
    start(newNames) {
      names = { blue: newNames.blue || '', red: newNames.red || '' };
      history = [];
      state = initialState();
      counters = newCounters();
      log = [];
    },

    /**
     * Point pour `team`. Renvoie l'événement, ou null si le match est déjà fini.
     * @param {Team} team
     * @param {'voice'|'touch'} source
     * @returns {GameEvent|null}
     */
    point(team, source) {
      if (state.winner) return null;
      const result = applyPoint(state, team);
      history.push({ team, source, type: result.event.type });
      state = result.state;
      counters[source] += 1;
      return result.event;
    },

    /**
     * Retire le dernier point. Renvoie le point retiré, ou null s'il n'y avait rien à annuler.
     * @param {'voice'|'touch'} source
     * @returns {HistoryEntry|null}
     */
    undo(source) {
      counters[source === 'voice' ? 'voiceUndo' : 'touchUndo'] += 1;
      if (history.length === 0) return null;
      const undone = history.pop();
      state = replay(history).state;
      return undone;
    },

    /**
     * Applique une commande (voix ou toucher) : note la ligne de journal, met le score à jour
     * et dit ce que l'écran doit faire.
     * @param {Command} cmd
     * @param {'voice'|'touch'} source
     * @param {string} text   ce qui a été entendu ('' pour un toucher)
     * @param {number} now
     * @returns {CommandEffect}
     */
    command(cmd, source, text, now) {
      const refused = cmd !== 'undo' && !!state.winner;
      this.addLog({ t: now, src: source, text, result: refused ? 'refused' : cmd });
      if (refused) return { kind: 'refused' };   // match terminé : seul « annule » reste actif
      if (cmd === 'undo') {
        const undone = this.undo(source);
        if (!undone) return { kind: 'nothing-to-undo', say: 'rien à annuler', beep: 'undo' };
        return { kind: 'undo', say: undoPhrase(undone.type, state, history.length), beep: 'undo' };
      }
      const event = this.point(cmd, source);
      return { kind: 'point', team: cmd, say: announceEvent(event, state), beep: 'point' };
    },

    /** @param {LogEntry} entry */
    addLog(entry) {
      log.push(entry);
      if (log.length > LOG_MAX) log.shift();
    },

    /** Fin du match (Quitter / Nouveau match) : archivé si au moins un point a été marqué. */
    quit() {
      if (counters.voice + counters.touch > 0) {
        archives.push({ names: { ...names }, state, log });
        if (archives.length > ARCHIVES_MAX) archives.shift();
      }
      history = [];
      state = initialState();
      counters = newCounters();
      log = [];
    },

    /** Données à sauvegarder. @param {string} screen  écran affiché */
    toSave(screen) {
      return { screen, names, history, counters, log, archives };
    },

    /**
     * Relit une sauvegarde. Renvoie true s'il y a un match en cours à reprendre.
     * @param {*} data
     * @returns {boolean}
     */
    load(data) {
      if (!data || typeof data !== 'object') return false;
      if (data.names) names = { blue: data.names.blue || '', red: data.names.red || '' };
      log = Array.isArray(data.log) ? data.log : [];
      archives = Array.isArray(data.archives) ? data.archives.filter(isValidArchive) : [];
      if (data.screen === 'setup' || !Array.isArray(data.history)) return false;
      // Le type de chaque point (utile à l'annulation) est recalculé en rejouant le match.
      state = initialState();
      history = data.history
        .filter((h) => h && (h.team === 'blue' || h.team === 'red'))
        .map((h) => {
          const result = applyPoint(state, h.team);
          state = result.state;
          return { team: h.team, source: h.source === 'voice' ? 'voice' : 'touch', type: result.event.type };
        });
      counters = Object.assign(newCounters(), data.counters);
      return true;
    },
  };
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
  { cmd: 'blue', re: /\bbleu/ },
  { cmd: 'red', re: /\brouge/ },
  { cmd: 'undo', re: /\bannule/ },
];

/**
 * Le texte (normalisé) ressemble-t-il à l'écho d'une annonce de l'appli ?
 * @param {string} n
 * @returns {boolean}
 */
function isAnnouncementEcho(n) {
  // "point annulé, retour à ..."
  if (/\bretour a\b/.test(n)) return true;
  // Annonces contenant une couleur : "jeu bleu", "avantage rouge", "set bleu", "équipe bleue"...
  return /\b(jeu|jeux|avantage|set|sets|match|equipe)\b/.test(n);
}

/** Au-delà, la phrase est une conversation (ex. quelqu'un qui explique "il faut dire point bleu") : ignorée. */
const MAX_COMMAND_WORDS = 3;

/** Mots regardés pour reconnaître un écho d'annonce : la commande et les 2 mots qui la précèdent ("jeu bleu"). */
const ECHO_CONTEXT_WORDS = 3;

/**
 * Première commande présente dans un texte déjà normalisé, sans aucun filtre.
 * @param {string} n
 * @returns {Command|null}
 */
function firstCommand(n) {
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

/**
 * Retourne 'blue' | 'red' | 'undo' | null (première commande trouvée dans le texte).
 * @param {string} text
 * @returns {Command|null}
 */
function detectCommand(text) {
  const n = normalize(text);
  if (n.split(' ').length > MAX_COMMAND_WORDS) return null;
  if (isAnnouncementEcho(n)) return null;
  return firstCommand(n);
}

/** Au-delà de ce nombre de mots sans silence, l'écoute repart de zéro (phrase trop longue). */
const MAX_PHRASE_WORDS = 10;

/**
 * Cherche une commande dans les mots NOUVEAUX d'une phrase en cours d'écoute.
 * Les `from` premiers mots ont déjà été traités (commande prise, ou entendus pendant une annonce) :
 * on ne les relit pas, ce qui permet de trouver « bleu » au milieu d'une phrase sans le compter deux fois.
 * Chaque mot est vérifié avec les 2 mots qui le précèdent, pour reconnaître les échos d'annonce ("jeu bleu").
 * @param {string} text   la phrase entendue jusqu'ici
 * @param {number} from   nombre de mots déjà traités
 * @returns {{cmd: Command|null, words: number}}  la commande et le nombre de mots traités après elle
 */
function detectInNewWords(text, from) {
  const words = normalize(text).split(' ').filter(Boolean);
  for (let k = from; k < words.length; k++) {
    const cmd = firstCommand(words[k]);
    if (!cmd) continue;
    const context = words.slice(Math.max(0, k - ECHO_CONTEXT_WORDS + 1), k + 1).join(' ');
    if (!isAnnouncementEcho(context)) return { cmd, words: k + 1 };
  }
  return { cmd: null, words: words.length };
}

/** Délai pendant lequel un nouveau résultat peut encore être la suite de la phrase précédente. */
const PHRASE_CONTINUATION_MS = 1500;

/* ---------- Anti-écho : quand le micro doit-il ignorer ce qu'il entend ? ---------- */

const TAP_DEBOUNCE_MS = 350;   // anti double-tap accidentel sur les zones
const ECHO_GUARD_MS = 800;     // marge après la fin d'une annonce (écho dans la pièce)
const SPEECH_MAX_MS = 6000;    // durée max supposée d'une annonce (filet si la fin n'est jamais signalée)

/**
 * Anti-écho, côté temps : le micro est « sourd » dès qu'une commande est acceptée, pendant toute
 * l'annonce qui suit, puis ECHO_GUARD_MS après sa fin. Une annonce remplacée par une autre ne
 * rouvre pas le micro (jeton). L'heure est toujours passée en paramètre.
 * Côté texte, les échos qui passent malgré tout sont reconnus par isAnnouncementEcho.
 */
function createEchoGuard() {
  let deafUntil = 0;
  let token = 0;
  return {
    /** Commande acceptée : sourd jusqu'à la fin de l'annonce qui va suivre. */
    hold(now) {
      token += 1;
      deafUntil = now + SPEECH_MAX_MS;
    },
    /** Une annonce commence. Renvoie le jeton à rendre à sa fin. */
    speechStarted(now) {
      token += 1;
      deafUntil = now + SPEECH_MAX_MS;
      return token;
    },
    /** L'annonce `speechToken` est finie : le micro rouvre après la marge, sauf si une autre a pris sa place. */
    speechEnded(speechToken, now) {
      if (speechToken === token) deafUntil = now + ECHO_GUARD_MS;
    },
    /** Le micro doit-il ignorer ce qu'il entend en ce moment ? */
    muted(now) {
      return now < deafUntil;
    },
  };
}

/**
 * Ce que l'écoute de phrase décide pour un résultat du micro.
 * @typedef {Object} HearDecision
 * @property {'command'|'ignored'|'unknown'|'interim'|'none'} type
 *   command : nouvelle commande à appliquer · ignored : phrase définitive entendue pendant une annonce ·
 *   unknown : phrase définitive sans commande · interim : phrase en cours sans commande · none : rien à faire
 * @property {Command} [cmd]       la commande (type 'command')
 * @property {boolean} restart     phrase trop longue sans silence : relancer l'écoute tout de suite
 */

/**
 * Écoute de phrase : décide, pour chaque résultat du micro, s'il contient une NOUVELLE commande.
 * Garde en mémoire la phrase en cours et ses mots déjà traités, pour trouver « bleu » au milieu
 * d'une phrase sans jamais compter deux fois le même mot. Une phrase continue tant qu'un résultat
 * commence par ses mots déjà traités : sur Android, Chrome renvoie la phrase qui grandit
 * (« et », « et c'est du », « et c'est du rouge »…) en résultats définitifs successifs.
 * Après un résultat définitif, la phrase n'est plus continuée au-delà de PHRASE_CONTINUATION_MS :
 * un « bleu » dit plus tard est une nouvelle commande, même identique.
 */
function createPhraseListener() {
  let words = [];        // phrase en cours (mots normalisés)
  let consumed = 0;      // nombre de ses mots déjà traités
  let closedAt = null;   // instant du dernier résultat définitif, ou null si la phrase est en cours
  const toWords = (text) => normalize(text).split(' ').filter(Boolean);

  return {
    /** Nouvelle session d'écoute : on oublie la phrase en cours. */
    reset() {
      words = [];
      consumed = 0;
      closedAt = null;
    },

    /**
     * @param {Object} result
     * @param {string[]} result.transcripts   interprétations du micro, la plus probable en premier
     * @param {boolean} result.isFinal
     * @param {boolean} result.muted          l'appli parle (anti-écho) : tout ce qui est entendu est consommé
     * @param {number} result.now             heure (ms)
     * @returns {HearDecision}
     */
    hear({ transcripts, isFinal, muted, now }) {
      const heard = toWords(transcripts[0] || '');
      const continues = consumed > 0
        && (closedAt === null || now - closedAt <= PHRASE_CONTINUATION_MS)
        && words.slice(0, consumed).every((w, k) => heard[k] === w);
      const from = continues ? consumed : 0;
      words = heard;
      consumed = from;
      closedAt = isFinal ? now : null;
      const restart = !isFinal && heard.length >= MAX_PHRASE_WORDS;

      if (muted) {
        consumed = heard.length;
        return { type: isFinal && heard.length > from ? 'ignored' : 'none', restart };
      }
      for (const text of transcripts) {
        const found = detectInNewWords(text, from);
        if (found.cmd) {
          words = toWords(text);   // les mots comptés sont ceux de l'interprétation retenue
          consumed = found.words;
          return { type: 'command', cmd: found.cmd, restart };
        }
      }
      if (!isFinal) return { type: heard.length > 0 ? 'interim' : 'none', restart };
      return { type: from === 0 && heard.length > 0 ? 'unknown' : 'none', restart };
    },
  };
}

/* ---------- Relance de l'écoute ---------- */

const SHORT_SESSION_MS = 1500;   // session d'écoute plus courte que ça : compte comme un échec rapide
const MAX_QUICK_FAILS = 3;       // au-delà d'autant d'échecs rapides de suite, on espace les relances
const RESTART_DELAY_MS = 250;    // relance normale
const BACKOFF_DELAY_MS = 3000;   // relance espacée (le micro échoue en boucle)

/**
 * Délai avant de relancer une écoute que le navigateur a coupée.
 * @param {number} sessionMs     durée de la session qui vient de se terminer
 * @param {number} quickFails    échecs rapides de suite jusqu'ici
 * @returns {{delay: number, quickFails: number}}
 */
function restartPlan(sessionMs, quickFails) {
  const fails = sessionMs < SHORT_SESSION_MS ? quickFails + 1 : 0;
  return { delay: fails > MAX_QUICK_FAILS ? BACKOFF_DELAY_MS : RESTART_DELAY_MS, quickFails: fails };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initialState, applyPoint, replay, numberFr, gamePointsPhrase, tiebreakPhrase,
    gamesPhrase, setsPhrase, announceEvent, undoPhrase, scorePhrase, displayPoints, formatSet,
    normalize, isAnnouncementEcho, detectCommand, detectInNewWords, createPhraseListener, createEchoGuard,
    MAX_PHRASE_WORDS, PHRASE_CONTINUATION_MS, ECHO_GUARD_MS, SPEECH_MAX_MS, TAP_DEBOUNCE_MS, STORAGE_KEY,
    restartPlan, RESTART_DELAY_MS, BACKOFF_DELAY_MS,
    formatLog, formatScore, formatAllLogs, exportFileName, createMatchSession, LOG_MAX, ARCHIVES_MAX,
  };
}

/* =====================================================================
 * 2. APPLICATION (navigateur)
 * ===================================================================== */

if (typeof document !== 'undefined') {
  (function () {
    const ANNOUNCE_DELAY_MS = 180; // le bip passe avant l'annonce
    const SAVE_DELAY_MS = 1000;      // les lignes de journal sont sauvegardées par paquets
    const HEARD_DISPLAY_MS = 6000;   // durée d'affichage de « Entendu : … »
    const FLASH_MS = 180;            // éclair de la zone qui marque
    const BUTTON_MESSAGE_MS = 1000;  // message temporaire sur le bouton d'envoi

    const $ = (id) => document.getElementById(id);

    const session = createMatchSession();
    let screen = 'setup';   // écran affiché : 'setup' | 'game' | 'end'

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

    const echo = createEchoGuard();

    const Speaker = {
      supported: 'speechSynthesis' in window,
      voice: null,
      utterance: null,  // référence gardée : évite que Chrome perde l'événement onend
      init() {
        if (!this.supported) return;
        const pick = () => {
          const voices = window.speechSynthesis.getVoices();
          this.voice = voices.find((v) => v.lang === LANG)
            || voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('fr'))
            || null;
        };
        pick();
        window.speechSynthesis.addEventListener('voiceschanged', pick);
      },
      say(text) {
        const token = echo.speechStarted(Date.now());
        const done = () => echo.speechEnded(token, Date.now());
        if (!this.supported || !text) { done(); return; }
        const synth = window.speechSynthesis;
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = LANG;
        if (this.voice) u.voice = this.voice;
        u.rate = 1.05;
        u.onend = done;
        u.onerror = done;
        this.utterance = u;
        synth.speak(u);
      },
    };

    /* ---------- Reconnaissance vocale ---------- */

    /**
     * Événement envoyé par la reconnaissance vocale à l'appli (un seul écouteur, voir onVoiceEvent) :
     *   { type: 'status', state, detail }   état du micro (listening, restarting, off, unavailable, denied)
     *   { type: 'mode' }                     mode local / en ligne changé (lire Voice.mode / localStatus)
     *   { type: 'log', src, text, result }   ligne de journal (src 'mic' par défaut, ou 'voice')
     *   { type: 'heard', text, note }        texte entendu à montrer
     *   { type: 'command', cmd, text }       commande à appliquer
     * @typedef {Object} VoiceEvent
     */

    const Voice = {
      SR: window.SpeechRecognition || window.webkitSpeechRecognition || null,
      rec: null,
      /** @type {(event: VoiceEvent) => void} */
      emit: () => {},
      wanted: false,
      blocked: false,   // permission refusée / pas de micro : on n'insiste plus
      startedAt: 0,
      quickFails: 0,
      restartTimer: null,
      quickRestart: false,   // relance immédiate demandée (phrase trop longue)
      listener: createPhraseListener(),
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
          this.emit({ type: 'mode' });
          return;
        }
        try {
          this.localStatus = await this.SR.available({ langs: [LANG], processLocally: true });
        } catch (e) {
          this.localStatus = 'unavailable';
        }
        if (this.localStatus === 'available') this.useLocal();
        this.emit({ type: 'mode' });
      },

      /** Télécharge le français pour l'appareil. Doit être appelé pendant un geste utilisateur. */
      installLocal() {
        if (!this.localSupported || this.localStatus !== 'downloadable') return;
        this.localStatus = 'downloading';
        this.emit({ type: 'mode' });
        this.SR.install({ langs: [LANG], processLocally: true })
          .then((ok) => {
            this.localStatus = ok ? 'available' : 'unavailable';
            if (ok) this.useLocal();
          })
          .catch(() => { this.localStatus = 'unavailable'; })
          .then(() => this.emit({ type: 'mode' }));
      },

      /**
       * Passe à la reconnaissance sur le téléphone. Il n'y a pas de chemin inverse : une fois le
       * mode local en place, l'appli ne repasse jamais par le service en ligne.
       */
      useLocal() {
        if (!this.rec || this.mode === 'local') return;
        this.mode = 'local';
        this.rec.processLocally = true;
        this.emit({ type: 'mode' });
        // Relance pour appliquer le nouveau mode tout de suite (onend redémarre l'écoute).
        if (this.wanted) {
          try { this.rec.abort(); } catch (e) { /* ignore */ }
        }
      },

      /** Arrête le vocal pour de bon (micro refusé, absent, ou mode local en échec). */
      block(detail) {
        this.blocked = true;
        this.wanted = false;
        this.emit({ type: 'status', state: 'denied', detail });
      },

      /** @param {(event: VoiceEvent) => void} onEvent */
      init(onEvent) {
        this.emit = onEvent;
        if (!this.SR) {
          this.emit({ type: 'status', state: 'unavailable' });
          return;
        }
        const rec = new this.SR();
        rec.lang = LANG;
        rec.continuous = true;
        // Résultats provisoires : on réagit dès que « bleu » est entendu, sans attendre la fin de la phrase.
        rec.interimResults = true;
        rec.maxAlternatives = 3;

        rec.onstart = () => {
          this.startedAt = Date.now();
          this.listener.reset();   // nouvelle session d'écoute : nouvelle phrase
          this.emit({ type: 'status', state: 'listening' });
          this.emit({ type: 'log', text: this.mode, result: 'start' });
        };

        rec.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const result = e.results[i];
            const transcripts = Array.from(result, (alt) => alt.transcript);
            const heard = transcripts.join(' / ');
            const decision = this.listener.hear({
              transcripts, isFinal: result.isFinal, muted: echo.muted(Date.now()), now: Date.now(),
            });
            switch (decision.type) {
              case 'command':
                this.emit({ type: 'heard', text: transcripts[0], note: null });
                this.emit({ type: 'command', cmd: decision.cmd, text: heard + (result.isFinal ? '' : ' [provisoire]') });
                break;
              case 'ignored':
                this.emit({ type: 'log', src: 'voice', text: heard, result: 'ignored' });
                this.emit({ type: 'heard', text: transcripts[0], note: 'ignoré pendant l\'annonce' });
                break;
              case 'unknown':
                this.emit({ type: 'log', src: 'voice', text: heard, result: 'unknown' });
                this.emit({ type: 'heard', text: transcripts[0], note: 'non reconnu' });
                break;
              case 'interim':
                this.emit({ type: 'heard', text: transcripts[0], note: '…' });   // l'appli montre qu'elle entend
                break;
              default: break;
            }
            // Phrase trop longue sans silence : on efface tout et on repart de zéro tout de suite.
            if (decision.restart) {
              this.restartNow();
              break;
            }
          }
        };

        rec.onerror = (e) => {
          if (this.wanted) this.emit({ type: 'log', text: e.message || '', result: 'error:' + e.error });
          // Échec du mode « sur l'appareil » : on ne repasse PAS par les serveurs de Google
          // (lent et dépendant du réseau) ; le vocal s'arrête et le match continue au toucher.
          if (this.mode === 'local'
            && (e.error === 'language-not-supported' || e.error === 'service-not-allowed')) {
            this.localStatus = 'unavailable';
            this.block('local-failed');
            return;
          }
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
            this.block(e.error);
          }
          // Autres erreurs (no-speech, network, aborted...) : onend relancera.
        };

        rec.onend = () => {
          if (!this.wanted || this.blocked) {
            if (!this.blocked) this.emit({ type: 'status', state: 'off' });
            return;
          }
          if (this.quickRestart) {
            // Relance demandée par l'appli (phrase trop longue) : immédiate, sans compter comme un échec.
            this.quickRestart = false;
            this.emit({ type: 'log', text: this.mode, result: 'reset' });
            this.start();
            return;
          }
          this.emit({ type: 'log', text: this.mode, result: 'end' });
          // Session coupée par le navigateur : on relance automatiquement.
          const plan = restartPlan(Date.now() - this.startedAt, this.quickFails);
          this.quickFails = plan.quickFails;
          this.emit({ type: 'status', state: 'restarting' });
          clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => this.start(), plan.delay);
        };

        this.rec = rec;
        this.checkLocal();
      },

      /** Efface la phrase en cours et repart de zéro (relance immédiate de l'écoute). */
      restartNow() {
        if (!this.rec || this.quickRestart) return;
        this.quickRestart = true;
        try { this.rec.abort(); } catch (e) { this.quickRestart = false; }
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
        if (!this.blocked && this.available) this.emit({ type: 'status', state: 'off' });
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
          warn.textContent = detail === 'local-failed'
            ? 'La reconnaissance vocale sur le téléphone a échoué : utilisez les zones tactiles '
              + '(rechargez la page pour réessayer).'
            : detail === 'audio-capture'
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

    /**
     * Seul point d'entrée des événements de la reconnaissance vocale dans l'appli.
     * @param {VoiceEvent} event
     */
    function onVoiceEvent(event) {
      switch (event.type) {
        case 'status': setMicStatus(event.state, event.detail); break;
        case 'mode': renderVoiceMode(); break;
        case 'log': addLog(event.src || 'mic', event.text, event.result); break;
        case 'heard': showHeard(event.text, event.note); break;
        case 'command': handleCommand(event.cmd, 'voice', event.text); break;
        default: break;
      }
    }

    let heardTimer = null;
    function showHeard(transcript, note) {
      const el = $('heard');
      el.textContent = 'Entendu : « ' + transcript.trim() + ' »' + (note ? ' — ' + note : '');
      clearTimeout(heardTimer);
      heardTimer = setTimeout(() => { el.textContent = ''; }, HEARD_DISPLAY_MS);
    }

    function teamName(team) {
      return session.names[team] || DEFAULT_NAMES[team];
    }

    function showScreen(name) {
      screen = name;
      $('screen-setup').hidden = name !== 'setup';
      $('screen-game').hidden = name !== 'game';
      $('screen-end').hidden = name !== 'end';
      if (name === 'setup') ScreenLock.release(); else ScreenLock.request();
    }

    function render() {
      const s = session.state;
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
      const s = session.state;
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

      const c = session.counters;
      $('end-stats').textContent = 'Saisie : ' + c.voice + ' point(s) à la voix, '
        + c.touch + ' au tactile · Annulations : ' + (c.voiceUndo + c.touchUndo)
        + ' (' + c.voiceUndo + ' à la voix, ' + c.touchUndo + ' au tactile)';
    }

    function flashZone(team) {
      const el = $('zone-' + team);
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), FLASH_MS);
    }

    function announce(text, kind) {
      echo.hold(Date.now());   // micro sourd dès maintenant, avant même le bip
      Beep.play(kind);
      setTimeout(() => Speaker.say(text), ANNOUNCE_DELAY_MS);
    }

    /* ---------- Actions ---------- */

    /**
     * Seule entrée pour une commande, à la voix comme au toucher.
     * @param {Command} cmd
     * @param {'voice'|'touch'} source
     * @param {string} [text]  ce qui a été entendu (voix)
     */
    function handleCommand(cmd, source, text = '') {
      if (screen === 'setup') return;
      const effect = session.command(cmd, source, text, Date.now());
      if (effect.kind === 'point' || effect.kind === 'undo') render();
      if (effect.kind === 'point') flashZone(effect.team);
      if (effect.say) announce(effect.say, effect.beep);
      save();
      const next = session.state.winner ? 'end' : 'game';
      if (next !== screen) showScreen(next);
    }

    function startMatch() {
      session.start({
        blue: $('name-blue').value.trim(),
        red: $('name-red').value.trim(),
      });
      render();
      showScreen('game');
      save();
      Voice.start();
      announce('début du match', 'point');
    }

    function backToSetup() {
      session.quit();
      Voice.stop();
      if (Speaker.supported) window.speechSynthesis.cancel();
      $('name-blue').value = session.names.blue;
      $('name-red').value = session.names.red;
      showScreen('setup');
      updateShareButton();
      save();
    }

    function updateShareButton() {
      const button = $('btn-share-logs');
      button.hidden = (session.archives.length === 0);
    }

    /** Affiche un message temporaire sur le bouton d'envoi, puis remet son texte d'origine (celui du HTML). */
    let shareLabel = null;
    function flashButton(message) {
      const button = $('btn-share-logs');
      if (shareLabel === null) shareLabel = button.textContent;
      button.textContent = message;
      setTimeout(() => { button.textContent = shareLabel; }, BUTTON_MESSAGE_MS);
    }

    /** Envoie le journal de tous les matchs archivés : partage de fichier, ou copie en secours. */
    async function shareLogs() {
      const now = new Date();
      const text = formatAllLogs(session.archives, now);
      const file = new File([text], exportFileName(now), { type: 'text/plain' });
      const shareData = { files: [file], title: JOURNAL_TITLE };
      const canShareFile = navigator.canShare && navigator.canShare(shareData);

      try {
        if (canShareFile) {
          await navigator.share(shareData);
        } else {
          await navigator.clipboard.writeText(text);
          flashButton('Copié ✓');
        }
      } catch (e) {
        if (e.name === 'AbortError') return;   // menu de partage fermé : pas une erreur
        flashButton('Envoi impossible');
      }
    }

    /* ---------- Sauvegarde locale (survit à un rechargement) ---------- */

    /** Stockage dans le navigateur (seul adapter aujourd'hui ; les tests unitaires passent par session.toSave/load). */
    const storage = {
      read() {
        try {
          return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        } catch (e) {
          return null;
        }
      },
      write(data) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) { /* stockage indisponible : sans conséquence */ }
      },
    };

    let saveTimer = null;

    /** Sauvegarde tout de suite (score, changement d'écran). */
    function save() {
      clearTimeout(saveTimer);
      saveTimer = null;
      storage.write(session.toSave(screen));
    }

    /** Sauvegarde un peu plus tard, une seule fois pour plusieurs lignes de journal. */
    function saveSoon() {
      if (!saveTimer) saveTimer = setTimeout(save, SAVE_DELAY_MS);
    }

    /**
     * @param {'voice'|'touch'|'mic'|'app'} src
     * @param {string} text
     * @param {string} result
     */
    function addLog(src, text, result) {
      session.addLog({ t: Date.now(), src, text, result });
      saveSoon();
    }

    /** Relit la sauvegarde. Renvoie true s'il y a un match en cours à reprendre. */
    function restore() {
      const resume = session.load(storage.read());
      $('name-blue').value = session.names.blue;
      $('name-red').value = session.names.red;
      if (!resume) return false;
      render();
      showScreen(session.state.winner ? 'end' : 'game');
      return true;
    }

    /* ---------- Initialisation ---------- */

    function init() {
      // Copie de l'appli gardée sur le téléphone : lancement possible sans réseau (voir sw.js).
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

      Speaker.init();
      Voice.init(onVoiceEvent);

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
        if (screen === 'setup') return;
        // Écran verrouillé / appli en arrière-plan : utile pour expliquer une coupure du micro
        addLog('app', '', document.visibilityState);
        if (document.visibilityState !== 'visible') {
          save();   // l'appli peut être fermée en arrière-plan : on ne garde rien en attente
          return;
        }
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
          if (!session.state.winner) announce('reprise, ' + scorePhrase(session.state, true), 'point');
        }, { once: true });
      }
    }

    init();
  })();
}
