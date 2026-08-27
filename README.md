# @scripteurist/streamlike-client

Player Streamlike côté **navigateur** : URL d'embed et pilotage de l'iframe.
Agnostique du framework, aucune dépendance. ESM / CJS / UMD.

## À quoi ça sert

Le protocole `postMessage` du player était réimplémenté à trois endroits, chacun
avec sa propre variante du filtrage de provenance. Ce qu'on gagne à l'unifier
n'est pas la taille du code : c'est qu'un player qui ne répond pas se diagnostique
très mal depuis une salle, et qu'il vaut mieux un seul endroit où chercher.

## Installation

```jsonc
"dependencies": {
  "@scripteurist/streamlike-client": "git+ssh://git@github.com/guillaume-scripteurist/streamlike-client.git#v0.1.0"
}
```

Sans bundler, le build UMD suffit :

```html
<script src="/vendor/streamlike-client.global.js"></script>
<script>const { StreamlikePlayer } = window.MediatechStreamlikeClient;</script>
```

## Usage

```js
import { StreamlikePlayer, EMBED_PRESETS, buildEmbedUrl } from '@scripteurist/streamlike-client';

const player = new StreamlikePlayer(EMBED_PRESETS.broadcast);
player.attach(document.getElementById('scene'));
player.on('ended', () => passerALaSuivante());   // enchaîne une file sans intervention
player.on('progress', t => afficher(t));
player.load('mon-permalink');

player.setSpeed(1.5);
player.detach();   // retire l'iframe ET cesse d'écouter
```

Deux réglages tout faits :

| Preset | Pour | Effet |
| --- | --- | --- |
| `broadcast` | écran TV, téléphone joueur | démarre seul, sans contrôles — il n'y a personne pour cliquer |
| `preview` | console d'administration | contrôles visibles, ne démarre pas dans le dos de l'organisateur |

Les deux activent `events=1` : sans lui le player reste muet, et une file de
diffusion s'arrête à la première vidéo.

## Le protocole, tel que Streamlike le documente

Le player **pousse** vers la page :

```
["sl-progress", <timecode>]                  ~4 fois par seconde
["sl-state", "play" | "pause" | "ended"]     à chaque changement d'état
```

La page lui **envoie**, en JSON : `["play"]` `["pause"]` `["stop"]`
`["seek", s]` `["speed", x]` `["volume", v]`.

Pour une iframe posée en dur dans le HTML, `buildPlayerCommand()` sérialise au
bon format sans passer par la classe.

## Deux détails qui coûtent cher

- **Le filtrage se fait sur la fenêtre émettrice, pas sur l'origine.** Plusieurs
  players peuvent coexister sur une page (prévisualisation + diffusion) et
  partagent la même origine : sans ce filtrage, la prévisualisation de
  l'organisateur ferait enchaîner la file diffusée dans la salle.
- **`clear()` pose `about:blank`, jamais une `src` vide.** Une `src` vide
  recharge la page *courante* dans l'iframe, et le son continue par-dessus la
  suite du programme.

## Développement

```bash
npm install
npm test        # jsdom, aucun appel réseau
```

## Licence

UNLICENSED — usage interne.
