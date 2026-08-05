/**
 * Pilotage d'un player Streamlike embarqué en iframe.
 *
 * Le protocole `postMessage` du player était réimplémenté à trois endroits
 * (écran spectateur, écran joueur, console vidéo), chacun avec sa propre
 * variante du filtrage de provenance. Ce qu'on y gagne à l'unifier n'est pas la
 * taille du code : c'est qu'un player qui ne répond pas est très difficile à
 * diagnostiquer depuis une salle, et qu'il vaut mieux un seul endroit où
 * chercher.
 *
 * ## Le protocole, tel que Streamlike le documente
 *
 * Appelé avec `events=1`, le player POUSSE vers la page :
 *   `["sl-progress", <timecode>]`                    ~4 fois par seconde
 *   `["sl-state", "play" | "pause" | "ended"]`       à chaque changement d'état
 *
 * La page lui ENVOIE, en JSON :
 *   `["play"]` `["pause"]` `["stop"]`
 *   `["seek", <secondes>]` `["speed", <facteur>]` `["volume", <0..1>]`
 */
import { buildEmbedUrl, type EmbedOptions } from './embed';

export type PlayerState = 'play' | 'pause' | 'ended';

export type PlayerCommand =
  | { action: 'play' | 'pause' | 'stop' }
  | { action: 'seek' | 'speed' | 'volume'; value: number };

export interface PlayerEvents {
  /** Changement d'état de lecture. */
  state: PlayerState;
  /** Position de lecture, en secondes. Émis ~4 fois par seconde. */
  progress: number;
  /** Fin de lecture — raccourci sur `state === 'ended'`, le seul cas qui sert à enchaîner. */
  ended: void;
}

type Listener<K extends keyof PlayerEvents> = (payload: PlayerEvents[K]) => void;

/**
 * Sérialise une commande au format attendu par le player.
 *
 * Exposé pour les iframes qu'on n'a pas créées avec {@link StreamlikePlayer} —
 * une visionneuse posée en dur dans le HTML, par exemple. Mieux vaut ça qu'un
 * `postMessage(JSON.stringify(['speed', x]))` écrit à la main : c'est
 * exactement le genre de détail qui se met à diverger d'une page à l'autre.
 *
 * ```js
 * iframe.contentWindow.postMessage(buildPlayerCommand({ action: 'speed', value: 1.5 }), '*');
 * ```
 */
export function buildPlayerCommand(command: PlayerCommand): string {
  const payload: unknown[] = [command.action];
  if ('value' in command && command.value != null) payload.push(Number(command.value));
  return JSON.stringify(payload);
}

/** Le player pousse-t-il un état de fin de lecture ? */
export function isEndedMessage(data: unknown): boolean {
  const value = parseMessage(data);
  return Array.isArray(value) && value[0] === 'sl-state' && value[1] === 'ended';
}

/** Le player sérialise en JSON, mais certains navigateurs livrent déjà l'objet. */
function parseMessage(data: unknown): unknown {
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export interface StreamlikePlayerOptions extends EmbedOptions {
  /**
   * Attributs `allow` de l'iframe. Le défaut couvre l'usage du jeu ;
   * `autoplay` y est indispensable, sans quoi la diffusion sur un écran sans
   * public devant reste figée sur la première image.
   */
  allow?: string;
}

/**
 * Player Streamlike attaché à un conteneur DOM.
 *
 * Agnostique du framework : il ne connaît que `HTMLElement` et l'API du
 * navigateur. Il crée son iframe, filtre les messages sur leur provenance
 * réelle, et se débranche proprement.
 *
 * ```js
 * const player = new StreamlikePlayer({ ...EMBED_PRESETS.broadcast });
 * player.attach(document.getElementById('scene'));
 * player.on('ended', () => passerALaSuivante());
 * player.load('kiosque-1234');
 * ```
 */
export class StreamlikePlayer {
  private iframe: HTMLIFrameElement | null = null;
  private container: HTMLElement | null = null;
  private readonly listeners = new Map<keyof PlayerEvents, Set<Listener<any>>>();
  private readonly onWindowMessage: (event: MessageEvent) => void;

  constructor(private readonly options: StreamlikePlayerOptions = {}) {
    this.onWindowMessage = (event: MessageEvent) => this.handleMessage(event);
  }

  /** Crée l'iframe dans `container` et commence à écouter le player. */
  attach(container: HTMLElement): this {
    this.detach();
    this.container = container;

    const iframe = container.ownerDocument.createElement('iframe');
    iframe.src = 'about:blank';
    iframe.style.border = '0';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.allow = this.options.allow || 'autoplay; fullscreen; encrypted-media';
    iframe.allowFullscreen = true;
    container.appendChild(iframe);
    this.iframe = iframe;

    container.ownerDocument.defaultView?.addEventListener('message', this.onWindowMessage);
    return this;
  }

  /** Charge un média. Remplace celui en cours de lecture, le cas échéant. */
  load(permalink: string, options: EmbedOptions = {}): this {
    return this.loadUrl(buildEmbedUrl(permalink, { ...this.options, ...options }));
  }

  /**
   * Charge une URL d'embed déjà construite.
   *
   * Sert quand l'URL vient d'ailleurs — typiquement d'un serveur qui impose un
   * gabarit propre à son déploiement. Le player pilote alors une iframe dont il
   * n'a pas choisi les paramètres : si l'URL n'a pas `events=1`, aucun
   * événement ne remontera, et l'enchaînement d'une file restera muet.
   */
  loadUrl(url: string): this {
    if (!this.iframe) throw new Error('StreamlikePlayer : appelez attach() avant load().');
    this.iframe.src = url;
    return this;
  }

  /**
   * Envoie une commande au player.
   * Sans effet tant qu'aucun média n'est chargé — ce n'est pas une erreur :
   * une télécommande appuyée trop tôt ne doit pas casser la page.
   */
  command(command: PlayerCommand): this {
    const target = this.iframe?.contentWindow;
    if (!target) return this;
    target.postMessage(buildPlayerCommand(command), '*');
    return this;
  }

  play() { return this.command({ action: 'play' }); }
  pause() { return this.command({ action: 'pause' }); }
  seek(seconds: number) { return this.command({ action: 'seek', value: seconds }); }
  setSpeed(rate: number) { return this.command({ action: 'speed', value: rate }); }
  setVolume(level: number) { return this.command({ action: 'volume', value: level }); }

  on<K extends keyof PlayerEvents>(event: K, listener: Listener<K>): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }

  off<K extends keyof PlayerEvents>(event: K, listener: Listener<K>): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  /**
   * Vide le player sans détruire le conteneur.
   *
   * `about:blank` et non une source vide : une `src` vide recharge la page
   * COURANTE dans l'iframe. Le son continuerait alors, par-dessus la suite.
   */
  clear(): this {
    if (this.iframe) this.iframe.src = 'about:blank';
    return this;
  }

  /** Retire l'iframe et cesse d'écouter. À appeler avant d'oublier l'instance. */
  detach(): this {
    if (this.container) {
      this.container.ownerDocument.defaultView?.removeEventListener('message', this.onWindowMessage);
    }
    if (this.iframe?.parentNode) this.iframe.parentNode.removeChild(this.iframe);
    this.iframe = null;
    this.container = null;
    return this;
  }

  private emit<K extends keyof PlayerEvents>(event: K, payload: PlayerEvents[K]) {
    for (const listener of this.listeners.get(event) || []) {
      try {
        listener(payload);
      } catch (err) {
        // Un gestionnaire qui jette ne doit pas empêcher les autres de tourner,
        // ni couper l'enchaînement de la file de diffusion.
        console.error('[streamlike-player] gestionnaire en erreur :', err);
      }
    }
  }

  private handleMessage(event: MessageEvent) {
    // Filtrage sur la FENÊTRE émettrice, pas sur l'origine : plusieurs players
    // peuvent coexister sur la page (prévisualisation + diffusion), et ils
    // partagent la même origine. Seule la fenêtre les distingue.
    if (!this.iframe || !this.iframe.contentWindow || event.source !== this.iframe.contentWindow) return;

    const value = parseMessage(event.data);
    if (!Array.isArray(value)) return;

    if (value[0] === 'sl-progress') {
      this.emit('progress', Number(value[1]) || 0);
      return;
    }
    if (value[0] === 'sl-state') {
      const state = value[1] as PlayerState;
      this.emit('state', state);
      if (state === 'ended') this.emit('ended', undefined as void);
    }
  }
}
