/**
 * « Dois-je poser une iframe, ou une vignette et un message ? »
 *
 * Un catalogue n'est jamais entièrement lisible : certains médias sont protégés
 * par jeton, mot de passe, IP ou domaine référent. Poser l'iframe quand même
 * donne un rectangle noir, et le spectateur n'a aucun moyen de savoir si c'est
 * le réseau, le player ou la vidéo.
 *
 * Les trois drapeaux arrivent déjà dans la liste que le serveur a envoyée
 * (`is_tokenized`, `has_password`, `is_secured` de `/ws/playlist`) : la
 * question se tranche au moment du rendu, sans un appel de plus.
 *
 * Le même code existe dans `@scripteurist/streamlike-node`. C'est délibéré :
 * cette lib-ci ne dépend de rien, et l'autre ne doit jamais entrer dans un
 * bundle navigateur — elle détient le jeton d'API.
 */

/** Ce que la protection d'un média impose au rendu. */
export type Playability = 'open' | 'password' | 'restricted' | 'token-required';

/** Les seuls champs nécessaires ; n'importe quel média normalisé les porte. */
export interface PlayabilityFlags {
  isTokenized?: boolean;
  hasPassword?: boolean;
  isSecured?: boolean;
}

/**
 * Classe un média selon sa protection.
 *
 * L'ordre des tests compte : un média protégé à la fois par jeton ET par mot de
 * passe se lit — le player réclame le mot de passe lui-même. Tester le jeton
 * d'abord le déclarerait injouable et retirerait de l'écran un média qui se
 * serait très bien lu.
 */
export function playability(media: PlayabilityFlags): Playability {
  if (media.hasPassword) return 'password';
  if (media.isTokenized) return 'token-required';
  if (media.isSecured) return 'restricted';
  return 'open';
}

/** Peut-on poser l'iframe sans autre précaution ? */
export function isEmbeddable(media: PlayabilityFlags): boolean {
  return playability(media) !== 'token-required';
}

/**
 * Vérifie qu'une URL de player passe réellement, avant de l'afficher.
 *
 * `/play` répond **404** quand l'accès ne passe pas, et autorise la lecture
 * inter-origines. Seul ce 404-là vaut échec : une erreur réseau, un refus CORS
 * ou un 5xx ne prouvent rien, et masquer le média sur un doute retire du
 * contenu qui se serait affiché. En cas d'incertitude, on répond `true`.
 */
export async function probePlayerUrl(
  url: string,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<boolean> {
  const doFetch = options.fetch ?? globalThis.fetch;
  if (typeof doFetch !== 'function') return true;
  try {
    const init: RequestInit = { method: 'HEAD' };
    if (options.timeoutMs && typeof AbortSignal?.timeout === 'function') {
      init.signal = AbortSignal.timeout(options.timeoutMs);
    }
    const res = await doFetch(url, init);
    return res.status !== 404;
  } catch {
    return true;
  }
}
