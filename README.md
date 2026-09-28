# Score Padel — PWA de suivi de score

Application web (PWA) pour suivre le score d'un match de padel amateur en temps réel, **à la voix**
(« point bleu », « point rouge », « annule ») avec des **zones tactiles** en secours.

HTML / CSS / JavaScript vanilla : aucun framework, aucune dépendance, aucun build, aucun backend.

```
index.html      3 écrans : configuration → jeu → fin de match
style.css       design fort contraste, score très grand
app.js          moteur de score + reconnaissance/synthèse vocale + interface
manifest.json   manifest PWA (ajout à l'écran d'accueil, mode standalone)
icons/          icônes 192 et 512 px
```

## Utilisation

1. Saisir les noms des équipes bleue et rouge, puis **Démarrer le match** (autoriser le micro).
2. Pendant le match, dire :
   - **« point bleu »** / **« point rouge »** : point pour l'équipe ;
   - **« annule »** : retire le dernier point (à répéter pour remonter plus loin, y compris à travers
     une fin de jeu, de set ou de match).
3. Chaque commande reconnue déclenche un bip, puis l'annonce du score en toutes lettres.
4. Les deux zones colorées (touchez la zone de l'équipe qui marque) et le bouton **Annule** restent
   actifs en permanence, même quand le vocal fonctionne.
5. En fin de match : récapitulatif set par set, statistiques de saisie (voix / tactile / annulations,
   utiles pour le test terrain), bouton **Nouveau match**.

Si la reconnaissance vocale est indisponible ou si le micro est refusé, un message s'affiche et
l'application fonctionne en mode tactile uniquement.

### Règles appliquées

- Points : 0 → 15 → 30 → 40 ; à 40-40 « égalité », puis « avantage » (pas de point décisif) ;
- Jeux : set en 6 jeux avec 2 jeux d'écart (7-5 possible) ; **tie-break à 6-6** (tous les sets) ;
- Tie-break : premier à 7 points avec 2 points d'écart ;
- Match : 2 sets gagnants.

### Annonces vocales

Le score est toujours énoncé **équipe bleue en premier** (« quinze trente » = bleu 15, rouge 30 ;
« jeu rouge, trois jeux à quatre » = bleu 3 jeux, rouge 4), comme à l'écran, pour éviter toute
ambiguïté puisque l'application ne suit pas le service.

| Situation | Exemple |
|---|---|
| Point | « quinze zéro », « trente partout », « quarante trente » |
| Égalité / avantage | « égalité », « avantage bleu » |
| Jeu | « jeu bleu, quatre jeux à trois » |
| 6-6 | « jeu rouge, six jeux partout, jeu décisif » |
| Tie-break | « quatre à trois », « six partout » |
| Set | « set bleu, un set partout » |
| Match | « match gagné, équipe bleue » |
| Annulation | « point annulé, retour à trente quinze » (+ jeux si l'annulation traverse un jeu) |

### Détails de comportement

- **Anti-écho** : le micro ignore ce qu'il entend pendant l'annonce et 0,8 s après, pour que
  l'application ne réagisse pas à sa propre voix (« point annulé… ») ni à deux joueurs qui annoncent
  le même point en même temps. Pour enchaîner plusieurs « annule », attendre la fin de chaque annonce.
- **Reconnaissance sur le téléphone** : si Chrome sait reconnaître le français directement sur
  l'appareil (API `processLocally`, Chrome récent), l'application l'utilise ; si le pack de langue est
  téléchargeable, il est téléchargé au démarrage du match. Sinon, ou en cas d'erreur, elle utilise
  le service en ligne habituel. Le mode utilisé est affiché sur l'écran d'accueil et en bas de l'écran
  de jeu (« Vocal : sur le téléphone / en ligne »). Objectif : éviter le bip système d'Android à
  chaque relance du micro, émis par le service de reconnaissance en ligne. À ce jour, Chrome Android
  répond généralement « indisponible » : ce mode concerne surtout Chrome ordinateur pour l'instant.
- **Écoute continue** : si le navigateur coupe la reconnaissance (silence, réseau), elle redémarre
  automatiquement ; l'indicateur en haut à gauche passe brièvement à « Reconnexion… ».
- **Rechargement** : le match en cours est sauvegardé dans le `localStorage` du téléphone ; après un
  rechargement accidentel, un écran « Touchez pour reprendre » réactive le son et le micro.
- **Écran allumé** : l'application demande au téléphone de ne pas mettre l'écran en veille pendant
  le match (Screen Wake Lock, si le navigateur le permet).
- Sous le bouton Annule, la dernière phrase entendue est affichée (« Entendu : … ») pour diagnostiquer
  les faux positifs / faux négatifs pendant le test terrain.

## Test en local

La reconnaissance vocale exige un **contexte sécurisé** : `https://` ou `http://localhost`.

```bash
# depuis la racine du dépôt
python3 -m http.server 8000
# puis ouvrir http://localhost:8000 dans Chrome
```

(Ou `npx serve .` si Node est installé.) Ouvrir `index.html` directement en `file://` fonctionne
pour les boutons tactiles mais pas pour le micro.

**Tester sur le téléphone** avant déploiement : l'adresse `http://<ip-du-pc>:8000` n'est pas
sécurisée, donc le micro y sera bloqué. Utiliser le débogage à distance de Chrome
(`chrome://inspect` → *Port forwarding* 8000 → `localhost:8000`) ou directement l'URL GitHub Pages.

### Vérifications dans Chrome (DevTools)

- **Console** : aucune erreur au chargement.
- **Application → Manifest** : nom, icônes 192/512, `display: standalone`, aucune erreur
  d'installabilité.
- **Parcours de score** : tout se vérifie aux zones tactiles — 15/30/40, égalité, avantage et retour
  à l'égalité, jeu, set à 6-4 / 7-5 (pas à 6-5), tie-break à 6-6 (7 points, 2 d'écart, ex. 8-6),
  match en 2 ou 3 sets, puis « Annule » répété à travers une fin de jeu / set / match.

## Déploiement sur GitHub Pages

1. Sur GitHub : **Settings → Pages**.
2. *Build and deployment* → **Source : Deploy from a branch**.
3. **Branch : `main`**, dossier **`/ (root)`**, puis **Save**.
4. Après une à deux minutes, l'application est en ligne sur :
   **https://amilaneb.github.io/padel-score/**

Aucune étape de build : les fichiers de la racine sont servis tels quels, en HTTPS.

Sur le téléphone (Chrome Android) : ouvrir l'URL, autoriser le micro, puis menu ⋮ →
**Ajouter à l'écran d'accueil** / **Installer l'application**.

> Note : selon le téléphone, la reconnaissance vocale de Chrome peut passer par un service en ligne et nécessiter
> une connexion réseau. Il n'y a pas de service worker : l'application n'est pas utilisable hors
> ligne (volontaire pour ce MVP, afin d'éviter les problèmes de cache lors des mises à jour).
