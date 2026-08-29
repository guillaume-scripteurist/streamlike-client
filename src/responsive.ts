/**
 * L'enveloppe responsive de l'iframe.
 *
 * L'iframe du player n'a **aucune taille propre** : sans enveloppe, elle prend
 * la taille par défaut d'une iframe — 300 × 150 — quelles que soient les règles
 * CSS posées à côté. Le procédé est connu (une boîte dont le `padding-top`
 * porte le rapport d'image), et c'est exactement pour ça qu'il était recopié à
 * la main sur chaque page, avec un 56.25% en dur qui rognait toutes les vidéos
 * qui n'étaient pas en 16/9.
 */
import { aspectRatioPadding } from './embed';

/**
 * Habille un conteneur pour qu'il tienne le rapport d'image, et rend l'élément
 * où poser le player.
 *
 * `ratio` vient de `metadata.global.ratio` de `/ws/media`. Absent, on retombe
 * sur 16/9 : une boîte un peu fausse vaut mieux qu'une boîte de hauteur nulle.
 */
export function applyResponsiveFrame(
  container: HTMLElement,
  ratio?: number | null,
): HTMLElement {
  container.style.position = 'relative';
  container.style.width = '100%';
  container.style.overflow = 'hidden';
  container.style.paddingTop = aspectRatioPadding(ratio);

  const doc = container.ownerDocument;
  let stage = container.querySelector<HTMLElement>(':scope > .sl-stage');
  if (!stage) {
    stage = doc.createElement('div');
    stage.className = 'sl-stage';
    container.appendChild(stage);
  }
  // Le `padding-top` réserve la hauteur ; c'est l'enfant en position absolue
  // qui l'occupe. Poser l'iframe directement dans le conteneur la placerait
  // SOUS le padding, donc hors de la boîte réservée.
  stage.style.position = 'absolute';
  stage.style.inset = '0';
  return stage;
}
