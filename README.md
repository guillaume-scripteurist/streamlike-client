# @scripteurist/streamlike-client

Player Streamlike côté **navigateur** : URL d'embed, pilotage de l'iframe,
enveloppe responsive et lecture des protections.
Agnostique du framework, aucune dépendance. ESM / CJS / UMD.

## À quoi ça sert

Le protocole `postMessage` du player était réimplémenté à trois endroits, chacun
avec sa propre variante du filtrage de provenance. Ce qu'on gagne à l'unifier
n'est pas la taille du code : c'est qu'un player qui ne répond pas se diagnostique
très mal depuis une salle, et qu'il vaut mieux un seul endroit où chercher.

## Installation

```jsonc
"dependencies": {
  "@scripteurist/streamlike-client": "git+ssh://git@github.com/guillaume-scripteurist/streamlike-client.git#v0.3.1"
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

Trois réglages tout faits :

| Preset | Pour | Effet |
| --- | --- | --- |
| `broadcast` | écran de salle | démarre seul **avec le son**, sans contrôles — il n'y a personne pour cliquer |
| `preview` | console d'administration | contrôles visibles, ne démarre pas dans le dos de l'organisateur |
| `feed` | fil vertical sur téléphone | remplit la carte en rognant, démarre muet, plafonne la qualité à 720p |

Tous activent `events=1` : sans lui le player reste muet, et une file de
diffusion s'arrête à la première vidéo.

## Les autres cibles, et les autres paramètres

```js
import { buildPlayerUrl } from '@scripteurist/streamlike-client';

buildPlayerUrl({ mediaId: 'abc' }, { pid: 'CFG42', userToken: 'u-123' });
buildPlayerUrl({ liveId: 'canal-1' }, { controls: true });
buildPlayerUrl({ streamoutId: 's-7' });

// Ce qui n'a pas de nom dédié passe tel quel — le player en accepte ~70 :
buildPlayerUrl({ permalink: 'marie' }, { params: { download: true, logo: false, skin: 'sombre' } });
```

`permalink` est préférable dans une URL que quelqu'un peut voir : il se lit, et
il survit à une réimportation du média là où l'identifiant change.

## Poser l'iframe à la bonne taille

L'iframe du player n'a **aucune taille propre** : sans enveloppe, elle prend
300 × 150, quelles que soient les règles CSS posées à côté.

```js
import { applyResponsiveFrame } from '@scripteurist/streamlike-client';

// `ratio` vient de metadata.global.ratio de /ws/media ; 16/9 par défaut.
const scene = applyResponsiveFrame(document.getElementById('boite'), media.ratio);
player.attach(scene);
```

## Ce média va-t-il se lire ?

Un catalogue n'est jamais entièrement lisible. Les trois drapeaux arrivent déjà
dans la liste envoyée par le serveur : la question se tranche au rendu, sans un
appel de plus.

```js
import { playability, isEmbeddable, probePlayerUrl } from '@scripteurist/streamlike-client';

playability(media);   // 'open' | 'password' | 'restricted' | 'token-required'
if (!isEmbeddable(media)) montrerLaVignetteEtUnMessage();
```

Un média protégé **à la fois** par jeton et par mot de passe se lit : le player
réclame le mot de passe lui-même. `probePlayerUrl()` vérifie pour de bon, en
`HEAD` : seul un **404** vaut échec — une erreur réseau ou un refus CORS ne
prouvent rien, et masquer sur un doute retire du contenu qui se serait affiché.

## Le protocole, tel que Streamlike le documente

Le player **pousse** vers la page :

```
["sl-progress", <timecode>]                  ~4 fois par seconde
["sl-state", "play" | "pause" | "ended"]     à chaque changement d'état
```

La page lui **envoie**, en JSON : `["play"]` `["pause"]` `["stop"]`
`["mute"]` `["unmute"]` `["fullscreen"]`
`["seek", s]` `["speed", x]` `["volume", v]`.

Pour une iframe posée en dur dans le HTML, `buildPlayerCommand()` sérialise au
bon format sans passer par la classe.

## Les détails qui coûtent cher

- **La configuration de player s'appelle `pid`, pas `profile`.** Jusqu'à la
  0.2.0 incluse, `profileId` émettait `profile=` — un paramètre que le player
  ne connaît pas. Il l'ignorait sans rien dire et retombait sur les réglages par
  défaut du compte, souvent proches, d'où l'absence de plainte : les couleurs,
  le logo et les contrôles configurés dans le back-office n'ont jamais été
  appliqués. `profileId` reste accepté et part désormais en `pid`.
- **`autostart` seul ne démarre pas — et `muted` n'est pas toujours la bonne
  réponse.** Les navigateurs refusent une lecture automatique **avec le son**
  tant que la page n'a pas reçu de geste. Deux issues, une par situation :
  une **porte** cliquée une fois par l'organisateur (« Activer le son »), et la
  lecture démarre avec le son ; ou `muted: true`, qui démarre à coup sûr mais en
  silence. Ne rien faire des deux laisse l'image figée, sans erreur.
  `broadcast` **garde le son** : c'est l'objet d'une diffusion en salle, et les
  pages qui l'utilisent ont une porte. `feed`, qui vise une carte de fil sans
  porte, est muet. Forcer `muted` dans `broadcast` réglerait le second cas en
  cassant le premier — une salle muette, qui ne se découvre que le soir même.
- **Le filtrage se fait sur la fenêtre émettrice, pas sur l'origine.** Plusieurs
  players peuvent coexister sur une page (prévisualisation + diffusion) et
  partagent la même origine : sans ce filtrage, la prévisualisation de
  l'organisateur ferait enchaîner la file diffusée dans la salle.
- **Un même état n'est pas ré-émis.** Le player répète son état ; propager deux
  fois `ended` ferait sauter une vidéo dans une file.
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
