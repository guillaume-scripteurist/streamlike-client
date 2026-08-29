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

/**
 * Paramètres du player.
 *
 * Le player en accepte environ soixante-dix. Ceux qui portent un nom ici sont
 * ceux dont un réglage erroné ne se voit pas tout de suite ; les autres passent
 * par {@link EmbedOptions.params}, sans traduction, pour ne pas figer une liste
 * qui bouge à chaque version de la plateforme.
 */
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
   * Démarrer seul.
   *
   * Sur un écran TV, il n'y a personne pour cliquer — mais **les navigateurs
   * refusent une lecture automatique avec le son** tant que la page n'a pas
   * reçu de geste. Deux façons de s'en sortir, et il faut en choisir une :
   * une **porte** cliquée une fois (« Activer le son »), qui laisse la lecture
   * démarrer avec le son ; ou `muted: true`, qui démarre à coup sûr mais en
   * silence. Ne rien faire des deux laisse l'image figée sur sa première
   * frame, sans erreur et sans message.
   */
  autostart?: boolean;
  /**
   * Couper le son. Voir {@link EmbedOptions.autostart} : c'est la moitié
   * indispensable d'un démarrage autonome.
   */
  muted?: boolean;
  /**
   * **Configuration de player** enregistrée dans le back-office : couleurs,
   * logo, contrôles, réglages par défaut. Les régler ici plutôt que dans l'URL
   * permet de les changer sans redéployer.
   *
   * Un paramètre présent dans l'URL l'emporte sur la configuration.
   */
  pid?: string;
  /**
   * @deprecated Ancien nom de {@link EmbedOptions.pid}, qui émettait `profile=`
   * — **un paramètre que le player ne connaît pas**. La configuration n'était
   * donc jamais appliquée, en silence : le player retombait sur les réglages
   * par défaut du compte, qui sont souvent proches, d'où l'absence de plainte.
   * Traduit en `pid` depuis la 0.3.0. À remplacer chez les appelants.
   */
  profileId?: string;
  /**
   * Identifiant de spectateur, jusqu'à 64 caractères, **choisi par nous**.
   *
   * C'est lui qui transforme des compteurs anonymes en chiffres par personne —
   * reprise de lecture, engagement individuel. Il désigne quelqu'un : un
   * identifiant de compte interne ou une valeur aléatoire, jamais une adresse
   * e-mail ni rien de lisible.
   */
  userToken?: string;
  /** Jeton de lecture d'un média protégé, signé par le serveur (`sltoken`). */
  token?: string;
  /** Position de départ, en secondes. */
  startAt?: number;
  /** Force la langue des sous-titres (`fr`), ou `false` pour les couper. */
  subtitle?: string | false;
  /** Force la piste audio (`en`) ; le suffixe `-ad` vise l'audiodescription. */
  audioLanguage?: string;
  /** Remplit la zone quitte à rogner l'image, plutôt que de la déformer. */
  fillBrowser?: boolean;
  /**
   * Plafonne les qualités proposées. Sur un réseau de salle ou en données
   * mobiles, c'est ce qui évite qu'un téléphone tire une échelle 1080p pour un
   * player grand comme une carte.
   */
  maxHeight?: number;
  maxWidth?: number;
  /** Couleur des éléments actifs, hexadécimal **sans `#`**. */
  activeColor?: string;
  /** Retire contrôles et bouton de lecture et force la lecture — mode affichage. */
  tv?: boolean;
  /**
   * Tout autre paramètre du player, tel quel.
   *
   * Les booléens sont convertis en `1`/`0`, les `null`/`undefined` ignorés.
   * Un paramètre inconnu du player est ignoré par lui **sans erreur** : vérifier
   * l'orthographe dans la table de `references/player-embed.md`.
   */
  params?: Record<string, string | number | boolean | null | undefined>;
  /** Hôte de remplacement (recette, instance dédiée). */
  baseUrl?: string;
}

/** Média visé : par permalink (préférable dans une URL vue par quelqu'un) ou par identifiant. */
export interface MediaRef {
  permalink?: string;
  /**
   * `media_id` de la plateforme. Le player le nomme `med_id` — même valeur,
   * nom différent pour des raisons historiques.
   */
  mediaId?: string;
  /** Canal en direct (`live_id`). */
  liveId?: string;
  /** Diffusion programmée (`str_id`). */
  streamoutId?: string;
}

/** Le player lit `1`/`0` ; `false` sérialisé donnerait la chaîne « false », donc vrai. */
function flag(value: boolean | undefined, fallback: boolean): string {
  return ((value == null ? fallback : value) ? '1' : '0');
}

function applyOptions(params: URLSearchParams, options: EmbedOptions): void {
  params.set('events', flag(options.events, false));
  params.set('controls', flag(options.controls, true));
  params.set('play_button', flag(options.playButton, true));
  params.set('autostart', flag(options.autostart, false));
  if (options.muted != null) params.set('muted', options.muted ? '1' : '0');

  // `pid` est le nom réel ; `profileId` est l'ancien, qui émettait `profile=` —
  // ignoré par le player. On traduit plutôt que de casser les appelants.
  const pid = options.pid || options.profileId;
  if (pid) params.set('pid', String(pid));

  if (options.userToken) params.set('user_token', String(options.userToken).slice(0, 64));
  if (options.token) params.set('sltoken', String(options.token));
  if (options.startAt != null && options.startAt > 0) {
    params.set('streamlike_mp_starttc', String(Math.floor(options.startAt)));
  }
  if (options.subtitle === false) params.set('subtitle', '0');
  else if (options.subtitle) params.set('subtitle', String(options.subtitle));
  if (options.audioLanguage) params.set('audio_lng', String(options.audioLanguage));
  if (options.fillBrowser) params.set('fill_browser', '1');
  if (options.maxHeight) params.set('max_height', String(Math.round(options.maxHeight)));
  if (options.maxWidth) params.set('max_width', String(Math.round(options.maxWidth)));
  // Hexadécimal SANS `#` : le `#` couperait l'URL au fragment, et tout ce qui
  // suit la couleur disparaîtrait sans le moindre message.
  if (options.activeColor) params.set('active_color', String(options.activeColor).replace(/^#/, ''));
  if (options.tv) params.set('tv', '1');

  for (const [key, value] of Object.entries(options.params || {})) {
    if (value == null) continue;
    params.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  }
}

/**
 * URL d'iframe pour un média, à partir de son permalink.
 *
 * Conservée telle quelle : c'est la signature qu'utilisent les pages
 * existantes. {@link buildPlayerUrl} couvre les autres cas (identifiant, live,
 * diffusion programmée).
 */
export function buildEmbedUrl(permalink: string, options: EmbedOptions = {}): string {
  return buildPlayerUrl({ permalink: String(permalink || '') }, options);
}

/**
 * URL d'iframe pour n'importe quelle cible du player.
 *
 * `permalink` est préféré dans une URL que quelqu'un peut voir : il se lit, et
 * il survit à une réimportation du média là où l'identifiant change.
 */
export function buildPlayerUrl(ref: MediaRef, options: EmbedOptions = {}): string {
  const base = (options.baseUrl || STREAMLIKE_CDN).replace(/\/+$/, '');
  const params = new URLSearchParams();
  if (ref.permalink) params.set('permalink', String(ref.permalink));
  else if (ref.mediaId) params.set('med_id', String(ref.mediaId));
  else if (ref.liveId) params.set('live_id', String(ref.liveId));
  else if (ref.streamoutId) params.set('str_id', String(ref.streamoutId));
  applyOptions(params, options);
  return `${base}/play?${params.toString()}`;
}

/**
 * Réglages des usages courants, pour ne pas les redécrire à chaque appel.
 *
 * `broadcast` — diffusion sur un écran de salle : personne pour cliquer, on
 *   masque les contrôles et on écoute la fin de lecture pour enchaîner.
 *   **Le son est conservé**, parce que c'est tout l'objet d'une diffusion en
 *   salle — voir l'avertissement ci-dessous sur `autostart`.
 * `preview`   — prévisualisation dans la console : l'organisateur pilote, on
 *   lui laisse les contrôles et on ne démarre pas dans son dos.
 * `feed`      — carte d'un fil vertical sur téléphone : remplit la carte,
 *   démarre en silence, et plafonne la qualité pour ne pas vider le forfait.
 *
 * ## `autostart` : ce que le préréglage ne peut PAS décider à votre place
 *
 * Les navigateurs refusent une lecture automatique **avec le son** tant que la
 * page n'a pas reçu de geste de l'utilisateur. Deux situations, et une seule
 * bonne réponse par situation :
 *
 * - **la page a une porte** (« Activer le son et rejoindre l'écran », cliquée
 *   par l'organisateur en début de soirée) : le geste est acquis, et le player
 *   démarre AVEC le son. C'est le cas d'un écran de salle, et c'est pourquoi
 *   `broadcast` ne force pas `muted` ;
 * - **la page n'a pas de porte** (une carte de fil qu'on fait défiler, une
 *   vignette qui s'anime) : il FAUT `muted: true`, sans quoi l'image reste
 *   figée sur la première frame, sans erreur et sans message. C'est ce que
 *   fait `feed`.
 *
 * Forcer `muted` dans `broadcast` réglerait le second cas en cassant le
 * premier — une diffusion muette dans une salle, qui ne se découvre que le
 * soir même.
 */
export const EMBED_PRESETS = {
  broadcast: { events: true, controls: false, playButton: false, autostart: true },
  preview: { events: true, controls: true, playButton: true, autostart: false },
  feed: {
    events: true, controls: false, playButton: false, autostart: true, muted: true,
    fillBrowser: true, maxHeight: 720,
  },
} as const satisfies Record<string, EmbedOptions>;

/**
 * Hauteur de l'enveloppe responsive, en pourcentage, pour un rapport donné.
 *
 * L'iframe n'a pas de taille propre : on l'enferme dans une boîte dont le
 * `padding-top` porte le rapport. `ratio` vient de `metadata.global.ratio` de
 * `/ws/media` ; 16/9 quand la plateforme ne l'a pas calculé — mieux vaut une
 * boîte un peu fausse qu'une boîte de hauteur nulle, qui ne montre rien.
 */
export function aspectRatioPadding(ratio: number | null | undefined): string {
  const value = Number(ratio);
  const safe = Number.isFinite(value) && value > 0 ? value : 16 / 9;
  // Les zéros de fin sont retirés : la valeur finit dans un attribut `style`,
  // que le navigateur normalise de son côté — les comparer sans ça donne des
  // tests qui échouent sur un « 50.0000% » devenu « 50% ».
  return `${Number((100 / safe).toFixed(4))}%`;
}
