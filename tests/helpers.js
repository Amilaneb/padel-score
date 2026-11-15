'use strict';

// Aides partagées par les tests unitaires : fabriquer un historique de points.

/** n points de suite pour `team`. */
const points = (team, n) => Array(n).fill(team);
/** n jeux blancs de suite pour `team` (4 points chacun). */
const games = (team, n) => points(team, 4 * n);
/** Un set 6-0 pour `team`. */
const set60 = (team) => games(team, 6);

module.exports = { points, games, set60 };
