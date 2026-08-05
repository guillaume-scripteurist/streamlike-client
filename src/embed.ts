/**
 * Construction de l'URL d'embed du player Streamlike.
 *
 * Elle était écrite à trois endroits, avec trois jeux de paramètres différents :
 * gabarit `.replace('{permalink}', …)` côté serveur, concaténation manuelle dans
 * la console vidéo, et le tout consommé tel quel par les écrans. Les écarts ne
 * se voyaient qu'à l'usage — une vidéo qui démarre ici mais pas là, des
 * contrôles présents sur un écran et absents sur l'autre.
 */

/** Hôte du player. Service public, aucun jeton n'y transite. */
export const STREAMLIKE_CDN = 'https://cdn.streamlike.com';

export interface EmbedOptions {
  /**
   * Remonter les événements de lecture par `postMessage` (`events=1`).
   * Indispensable pour enchaîner une file de vidéos sans intervention :
   * c'est ainsi qu'on apprend qu'une vidéo est terminée.
   */
  events?: boolean;
  /** Afficher les contrôles natifs du player. */
  controls?: boolean;
  /** Afficher le gros bouton de lecture central. */
  playButton?: boolean;
  /**
   * Démarrer seul. Sur un écran TV, il n'y a personne pour cliquer — mais les
   * navigateurs bloquent la lecture auto AVEC son sans interaction préalable :
   * prévoir une porte « Activer le son » côté page.
   */
  autostart?: boolean;
  /** Profil de player (« Webtv profile ») configuré sur le compte Streamlike. */
  profileId?: string;
  /** Hôte de remplacement (recette, instance dédiée). */
  baseUrl?: string;
}

/**
 * URL d'iframe pour un média, à partir de son permalink.
 *
 * @param permalink identifiant public du média
 */
export function buildEmbedUrl(permalink: string, options: EmbedOptions = {}): string {
  const base = (options.baseUrl || STREAMLIKE_CDN).replace(/\/+$/, '');
  const params = new URLSearchParams({ permalink: String(permalink || '') });
  // Le player lit `1`/`0` : un booléen JavaScript sérialisé en `false` serait
  // pris pour une chaîne non vide, donc pour un « oui ».
  const flag = (v: boolean | undefined, dflt: boolean) => ((v == null ? dflt : v) ? '1' : '0');
  params.set('events', flag(options.events, false));
  params.set('controls', flag(options.controls, true));
  params.set('play_button', flag(options.playButton, true));
  params.set('autostart', flag(options.autostart, false));
  if (options.profileId) params.set('profile', options.profileId);
  return `${base}/play?${params.toString()}`;
}

/**
 * Réglages des deux usages du jeu, pour ne pas les redécrire à chaque appel.
 *
 * `broadcast` — diffusion sur un écran (TV spectateur, téléphone joueur) :
 *   personne pour cliquer, on masque les contrôles et on écoute la fin de
 *   lecture pour enchaîner.
 * `preview`   — prévisualisation dans la console : l'organisateur pilote, on
 *   lui laisse les contrôles et on ne démarre pas dans son dos.
 */
export const EMBED_PRESETS = {
  broadcast: { events: true, controls: false, playButton: false, autostart: true },
  preview: { events: true, controls: true, playButton: true, autostart: false },
} as const satisfies Record<string, EmbedOptions>;
