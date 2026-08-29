/**
 * Le protocole `postMessage` du player était réimplémenté à trois endroits, avec
 * trois filtrages de provenance différents. Ces tests fixent le comportement de
 * l'implémentation unique — en particulier les deux choses qui se diagnostiquent
 * très mal depuis une salle : un player qui n'obéit pas, et une fin de vidéo qui
 * n'enchaîne pas sur la suivante.
 *
 * Tourne sur jsdom, qui fournit un vrai DOM et un vrai `window.postMessage`.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  buildEmbedUrl,
  EMBED_PRESETS,
  StreamlikePlayer,
  isEndedMessage,
  buildPlayerCommand,
} from '../dist/index.js';

let dom;

before(() => {
  dom = new JSDOM('<!doctype html><body><div id="scene"></div></body>', { url: 'https://exemple.test/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.MessageEvent = dom.window.MessageEvent;
});

// --- URL d'embed -------------------------------------------------------------

test('les drapeaux sortent en 1/0, jamais en true/false', () => {
  // Le player lit la valeur comme une chaîne : `false` y serait non vide, donc
  // pris pour un « oui ». C'est le genre d'erreur qui n'apparaît qu'à l'écran,
  // sous forme de contrôles qu'on croyait avoir masqués.
  const url = new URL(buildEmbedUrl('perma-1', { events: true, controls: false, autostart: true }));
  assert.equal(url.searchParams.get('events'), '1');
  assert.equal(url.searchParams.get('controls'), '0');
  assert.equal(url.searchParams.get('autostart'), '1');
});

test('le permalink est échappé', () => {
  const url = new URL(buildEmbedUrl('a b&c=d'));
  assert.equal(url.searchParams.get('permalink'), 'a b&c=d');
});

test('les deux usages du jeu sont cohérents', () => {
  // Diffusion : personne devant l'écran pour cliquer.
  const diffusion = new URL(buildEmbedUrl('p', EMBED_PRESETS.broadcast));
  assert.equal(diffusion.searchParams.get('autostart'), '1');
  assert.equal(diffusion.searchParams.get('controls'), '0');
  assert.equal(diffusion.searchParams.get('events'), '1', 'sans events, la file ne peut pas enchaîner');

  // Prévisualisation : l'organisateur pilote, on ne démarre pas dans son dos.
  const apercu = new URL(buildEmbedUrl('p', EMBED_PRESETS.preview));
  assert.equal(apercu.searchParams.get('autostart'), '0');
  assert.equal(apercu.searchParams.get('controls'), '1');
});

test('un hôte de remplacement est respecté', () => {
  assert.ok(buildEmbedUrl('p', { baseUrl: 'https://recette.exemple/' }).startsWith('https://recette.exemple/play?'));
});

test('un profil de player est transmis — en pid, pas en profile', () => {
  // Ce test verrouillait le bug : il vérifiait `profile=`, que le player ne
  // connaît pas. La configuration n'était donc jamais appliquée, en silence.
  const url = new URL(buildEmbedUrl('p', { profileId: 'prof-9' }));
  assert.equal(url.searchParams.get('pid'), 'prof-9');
  assert.equal(url.searchParams.get('profile'), null);
});

// --- Détection de fin de lecture ---------------------------------------------

test('la fin de lecture est reconnue sous ses deux formes', () => {
  assert.equal(isEndedMessage('["sl-state","ended"]'), true);
  assert.equal(isEndedMessage(['sl-state', 'ended']), true);
  assert.equal(isEndedMessage('["sl-state","pause"]'), false);
  assert.equal(isEndedMessage('["sl-progress",12.5]'), false);
  assert.equal(isEndedMessage('pas du json'), false);
  assert.equal(isEndedMessage(null), false);
});

test('buildPlayerCommand sérialise comme le player l\'attend', () => {
  // Utilisé par les iframes posées en dur dans le HTML, qui ne passent pas par
  // StreamlikePlayer. Le format doit être exactement le même des deux côtés.
  assert.equal(buildPlayerCommand({ action: 'play' }), '["play"]');
  assert.equal(buildPlayerCommand({ action: 'speed', value: 1.5 }), '["speed",1.5]');
  assert.equal(buildPlayerCommand({ action: 'seek', value: '42' }), '["seek",42]');
});

// --- Player ------------------------------------------------------------------

/** Simule un message poussé par l'iframe du player. */
function pousserDepuisIframe(player, data, sourceOverride) {
  const iframe = document.querySelector('#scene iframe');
  const event = new dom.window.MessageEvent('message', { data });
  // jsdom ne laisse pas écrire `source` : on le pose nous-mêmes.
  Object.defineProperty(event, 'source', {
    value: sourceOverride !== undefined ? sourceOverride : iframe.contentWindow,
  });
  window.dispatchEvent(event);
}

test('la fin de lecture remonte à la page', () => {
  const player = new StreamlikePlayer(EMBED_PRESETS.broadcast);
  player.attach(document.getElementById('scene'));
  player.load('perma-1');

  let fins = 0;
  const etats = [];
  player.on('ended', () => { fins += 1; });
  player.on('state', s => etats.push(s));

  pousserDepuisIframe(player, '["sl-state","play"]');
  pousserDepuisIframe(player, '["sl-state","ended"]');

  assert.deepEqual(etats, ['play', 'ended']);
  assert.equal(fins, 1, 'sans cet événement, la file de diffusion s\'arrête à la première vidéo');
  player.detach();
});

test('un message venu d\'une AUTRE fenêtre est ignoré', () => {
  // Deux players peuvent coexister sur la page (prévisualisation + diffusion)
  // et partagent la même origine : seule la fenêtre émettrice les distingue.
  // Sans ce filtrage, la prévisualisation de l'organisateur ferait enchaîner
  // la file diffusée sur l'écran de la salle.
  const player = new StreamlikePlayer();
  player.attach(document.getElementById('scene'));
  player.load('perma-1');

  let fins = 0;
  player.on('ended', () => { fins += 1; });
  pousserDepuisIframe(player, '["sl-state","ended"]', window);

  assert.equal(fins, 0);
  player.detach();
});

test('la progression remonte en secondes', () => {
  const player = new StreamlikePlayer();
  player.attach(document.getElementById('scene'));
  player.load('perma-1');

  const positions = [];
  player.on('progress', t => positions.push(t));
  pousserDepuisIframe(player, '["sl-progress",12.5]');
  pousserDepuisIframe(player, '["sl-progress","30"]');

  assert.deepEqual(positions, [12.5, 30]);
  player.detach();
});

test('un gestionnaire qui jette ne casse pas les autres', () => {
  // Un enchaînement de file ne doit pas s'arrêter parce qu'un affichage
  // secondaire a échoué.
  const player = new StreamlikePlayer();
  player.attach(document.getElementById('scene'));
  player.load('perma-1');

  let survivant = 0;
  player.on('ended', () => { throw new Error('boum'); });
  player.on('ended', () => { survivant += 1; });
  pousserDepuisIframe(player, '["sl-state","ended"]');

  assert.equal(survivant, 1);
  player.detach();
});

test('les commandes partent au bon format', () => {
  const player = new StreamlikePlayer();
  player.attach(document.getElementById('scene'));
  player.load('perma-1');

  const envoyes = [];
  const iframe = document.querySelector('#scene iframe');
  Object.defineProperty(iframe, 'contentWindow', {
    value: { postMessage: (msg) => envoyes.push(JSON.parse(msg)) },
    configurable: true,
  });

  player.play();
  player.pause();
  player.seek(42);
  player.setSpeed(1.5);
  player.setVolume(0.3);

  assert.deepEqual(envoyes, [['play'], ['pause'], ['seek', 42], ['speed', 1.5], ['volume', 0.3]]);
  player.detach();
});

test('une commande avant tout chargement ne casse rien', () => {
  // Une télécommande pressée trop tôt ne doit pas jeter dans la page.
  const player = new StreamlikePlayer();
  assert.doesNotThrow(() => player.play());
  player.attach(document.getElementById('scene'));
  assert.doesNotThrow(() => player.setSpeed(2));
  player.detach();
});

test('clear() repose about:blank, jamais une src vide', () => {
  // Une `src` vide recharge la page COURANTE dans l'iframe : le son
  // continuerait par-dessus la suite du programme.
  const player = new StreamlikePlayer();
  player.attach(document.getElementById('scene'));
  player.load('perma-1');
  player.clear();
  assert.equal(document.querySelector('#scene iframe').src, 'about:blank');
  player.detach();
});

test('detach() retire l\'iframe et cesse d\'écouter', () => {
  const player = new StreamlikePlayer();
  const scene = document.getElementById('scene');
  player.attach(scene);
  player.load('perma-1');
  assert.ok(scene.querySelector('iframe'));

  let fins = 0;
  player.on('ended', () => { fins += 1; });
  player.detach();

  assert.equal(scene.querySelector('iframe'), null);
  window.dispatchEvent(new dom.window.MessageEvent('message', { data: '["sl-state","ended"]' }));
  assert.equal(fins, 0, 'un player détaché qui écoute encore fait enchaîner une file déjà fermée');
});

test('load() avant attach() est une erreur explicite', () => {
  assert.throws(() => new StreamlikePlayer().load('p'), /attach\(\) avant load\(\)/);
  assert.throws(() => new StreamlikePlayer().loadUrl('https://x/'), /attach\(\) avant load\(\)/);
});

test('loadUrl() accepte une URL construite ailleurs et reste pilotable', () => {
  // Le serveur peut imposer un gabarit d'URL propre à son déploiement ; le
  // player doit alors piloter une iframe dont il n'a pas choisi les paramètres.
  const player = new StreamlikePlayer();
  player.attach(document.getElementById('scene'));
  player.loadUrl('https://cdn.streamlike.com/play?permalink=abc&events=1&autostart=1');

  let fins = 0;
  player.on('ended', () => { fins += 1; });
  pousserDepuisIframe(player, '["sl-state","ended"]');
  assert.equal(fins, 1);
  player.detach();
});

/**
 * Ce qui a changé en 0.3.0, et pourquoi ces cas-là précisément.
 *
 * Les deux premiers tests verrouillent des pannes SILENCIEUSES : un paramètre
 * que le player ignore, et un démarrage automatique que le navigateur refuse.
 * Ni l'un ni l'autre ne produit d'erreur — on constate simplement que « la
 * vidéo ne part pas », des mois plus tard, dans une salle.
 */
import {
  buildPlayerUrl,
  aspectRatioPadding,
  playability,
  isEmbeddable,
  applyResponsiveFrame,
} from '../dist/index.js';

test('la configuration de player part en pid, jamais en profile', () => {
  const url = new URL(buildEmbedUrl('marie', { pid: 'CFG42' }));
  assert.equal(url.searchParams.get('pid'), 'CFG42');
  // `profile=` n'est pas un paramètre du player : il était ignoré en silence,
  // et la configuration n'était jamais appliquée.
  assert.equal(url.searchParams.get('profile'), null);
});

test('l\'ancien profileId reste accepté et devient pid', () => {
  const url = new URL(buildEmbedUrl('marie', { profileId: 'CFG42' }));
  assert.equal(url.searchParams.get('pid'), 'CFG42');
});

test('broadcast garde le SON : une salle muette ne se voit qu\'en salle', () => {
  const url = new URL(buildEmbedUrl('marie', EMBED_PRESETS.broadcast));
  assert.equal(url.searchParams.get('autostart'), '1');
  // Forcer `muted` ici réglerait le cas « pas de porte » en cassant le cas
  // « écran de salle » : la vidéo passerait, sans le son, et personne ne s'en
  // apercevrait avant le soir même. La page qui n'a pas de porte demande
  // `muted` explicitement, ou prend le préréglage `feed`.
  assert.equal(url.searchParams.get('muted'), null);
});

test('feed est muet, lui, parce qu\'une carte de fil n\'a pas de porte', () => {
  const url = new URL(buildEmbedUrl('marie', EMBED_PRESETS.feed));
  assert.equal(url.searchParams.get('autostart'), '1');
  assert.equal(url.searchParams.get('muted'), '1');
  assert.equal(url.searchParams.get('max_height'), '720');
});

test('buildPlayerUrl vise le média par identifiant, live ou diffusion', () => {
  assert.equal(new URL(buildPlayerUrl({ mediaId: 'abc' })).searchParams.get('med_id'), 'abc');
  assert.equal(new URL(buildPlayerUrl({ liveId: 'canal1' })).searchParams.get('live_id'), 'canal1');
  assert.equal(new URL(buildPlayerUrl({ streamoutId: 's1' })).searchParams.get('str_id'), 's1');
});

test('les paramètres sensibles sont traduits correctement', () => {
  const url = new URL(buildPlayerUrl({ mediaId: 'abc' }, {
    userToken: 'u-123', token: 'TOK', startAt: 42, subtitle: false,
    audioLanguage: 'en-ad', maxHeight: 720, activeColor: '#FF0000',
    params: { download: true, logo: false, skin: 'sombre' },
  }));
  assert.equal(url.searchParams.get('user_token'), 'u-123');
  assert.equal(url.searchParams.get('sltoken'), 'TOK');
  assert.equal(url.searchParams.get('streamlike_mp_starttc'), '42');
  assert.equal(url.searchParams.get('subtitle'), '0');
  assert.equal(url.searchParams.get('audio_lng'), 'en-ad');
  assert.equal(url.searchParams.get('max_height'), '720');
  // Le `#` couperait l'URL au fragment : tout ce qui suit disparaîtrait.
  assert.equal(url.searchParams.get('active_color'), 'FF0000');
  assert.equal(url.searchParams.get('download'), '1');
  assert.equal(url.searchParams.get('logo'), '0');
  assert.equal(url.searchParams.get('skin'), 'sombre');
});

test('un état répété n\'est pas ré-émis — sinon une file saute une vidéo', () => {
  const player = new StreamlikePlayer();
  player.attach(document.getElementById('scene'));
  let ended = 0;
  player.on('ended', () => { ended += 1; });
  // On passe par le gestionnaire réel, avec la fenêtre de l'iframe comme source.
  const iframe = document.querySelector('#scene iframe');
  const evt = new dom.window.MessageEvent('message', {
    data: JSON.stringify(['sl-state', 'ended']),
  });
  Object.defineProperty(evt, 'source', { value: iframe.contentWindow });
  dom.window.dispatchEvent(evt);
  dom.window.dispatchEvent(evt);
  assert.equal(ended, 1);
  assert.equal(player.state, 'ended');
  player.detach();
});

test('le rapport d\'image retombe sur 16/9 plutôt que sur zéro', () => {
  assert.equal(aspectRatioPadding(16 / 9), '56.25%');
  assert.equal(aspectRatioPadding(2), '50%');
  // Une hauteur nulle ne montrerait rien du tout.
  assert.equal(aspectRatioPadding(0), '56.25%');
  assert.equal(aspectRatioPadding(null), '56.25%');
});

test('l\'enveloppe responsive réserve la hauteur et pose une scène', () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const stage = applyResponsiveFrame(host, 2);
  assert.equal(host.style.paddingTop, '50%');
  assert.equal(stage.style.position, 'absolute');
  // Appelée deux fois, elle réutilise la même scène plutôt que d'en empiler.
  assert.equal(applyResponsiveFrame(host, 2), stage);
});

test('la lisibilité se tranche sur les drapeaux déjà reçus', () => {
  assert.equal(playability({ isTokenized: true }), 'token-required');
  assert.equal(playability({ isTokenized: true, hasPassword: true }), 'password');
  assert.equal(isEmbeddable({ isSecured: true }), true);
  assert.equal(isEmbeddable({ isTokenized: true }), false);
});
