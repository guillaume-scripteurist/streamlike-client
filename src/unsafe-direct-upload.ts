/**
 * ⚠️ MODE DÉGRADÉ — dépôt d'un fichier DIRECTEMENT sur l'API Streamlike depuis
 * le navigateur.
 *
 * ## Pourquoi c'est isolé ici
 *
 * Cet appel transporte un **jeton Streamlike dans le navigateur**. C'est une
 * entorse assumée à la frontière de sécurité de cette suite de packages : le
 * jeton doit normalement rester sur le serveur, qui fabrique un « ticket »
 * d'upload à usage unique (voir `@mediatech/secure-upload-core`, la voie
 * nominale).
 *
 * Ce mode existe pour une raison précise : la voie nominale passe par un
 * callback que Mediatech appelle après l'upload, ce qui suppose une URL
 * publique. Quand on n'en a pas, il ne reste que le dépôt direct.
 *
 * Il vit sur un sous-chemin d'import à part — `@mediatech/streamlike-client/unsafe-direct-upload`
 * — pour qu'on ne puisse pas l'utiliser sans l'avoir décidé. Un `import` qui se
 * lit comme un avertissement vaut mieux qu'un commentaire que personne ne relit.
 *
 * ## Avant de l'utiliser, vérifier que
 *
 * 1. le jeton porté par le ticket est **restreint au dépôt** et de durée courte ;
 * 2. le CORS de l'API Streamlike autorise l'origine de la page — sinon l'appel
 *    échoue sans détail exploitable, le navigateur masquant la réponse ;
 * 3. la voie nominale est réellement impossible dans ce déploiement.
 */

/** Ticket fabriqué par VOTRE serveur, jamais par le navigateur. */
export interface DirectUploadTicket {
  /** URL du point d'entrée (`POST https://api.streamlike.com/medias`). */
  endpoint: string;
  /** Valeur de l'en-tête `X-Streamlike-Authorization`. ⚠️ un secret. */
  authHeader: string;
  /** Métadonnées du média. Sérialisées en JSON dans le champ `resource`. */
  resource?: Record<string, unknown>;
  /** Permalink prévu — sert de repli si l'API ne le renvoie pas. */
  permalink?: string;
  /** Nom du champ des métadonnées (défaut `resource`). */
  resourceField?: string;
  /** Nom du champ du binaire (défaut `source[encode][media_file]`). */
  fileField?: string;
}

export interface DirectUploadOptions {
  /** Nom du fichier transmis dans le multipart. L'extension compte. */
  filename?: string;
  /** Progression, de 0 à 100. */
  onProgress?: (percent: number) => void;
  /** Permet d'annuler un envoi en cours. */
  signal?: AbortSignal;
}

export interface DirectUploadResult {
  mediaId: string;
  permalink: string;
  /** Réponse brute de l'API, pour les champs non modélisés ici. */
  raw: unknown;
}

export class DirectUploadError extends Error {
  constructor(message: string, readonly status: number | null, readonly body?: string) {
    super(message);
    this.name = 'DirectUploadError';
  }
}

/**
 * Dépose un blob sur Streamlike et renvoie l'identifiant du média créé.
 *
 * Trois pièges, tous silencieux, et tous rencontrés en vrai :
 *
 *  1. **`resource` doit être appendé comme CHAÎNE.** En `Blob`, le multipart
 *     porte un `filename` et l'API prend le champ pour un fichier
 *     (`UNKNOWN_FIELDS`).
 *  2. **Le binaire va dans `source[encode][media_file]`.** `source[media_file]`,
 *     montré dans la documentation officielle, est rejeté.
 *  3. **Le type MIME doit être nu.** `MediaRecorder` produit
 *     `video/webm;codecs=vp9,opus` ; les paramètres de codec font échouer
 *     l'analyse côté serveur.
 *
 * `XMLHttpRequest` et non `fetch` : c'est la seule API du navigateur qui
 * remonte la progression d'un ENVOI. Sur une vidéo de plusieurs dizaines de
 * mégaoctets derrière le wifi d'une salle, une barre qui avance est ce qui
 * empêche la personne de fermer l'onglet.
 */
export function directUpload(
  blob: Blob,
  ticket: DirectUploadTicket,
  options: DirectUploadOptions = {},
): Promise<DirectUploadResult> {
  return new Promise((resolve, reject) => {
    const isMp4 = (blob.type || '').includes('mp4');
    const mime = isMp4 ? 'video/mp4' : 'video/webm';
    const filename = options.filename || `video.${isMp4 ? 'mp4' : 'webm'}`;

    const form = new FormData();
    const resource = ticket.resource
      || { permalink: ticket.permalink, type: 'video', visibility: { state: 'online' } };
    form.append(ticket.resourceField || 'resource', JSON.stringify(resource));
    form.append(ticket.fileField || 'source[encode][media_file]', new Blob([blob], { type: mime }), filename);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', ticket.endpoint, true);
    xhr.setRequestHeader('X-Streamlike-Authorization', ticket.authHeader);

    if (options.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) options.onProgress!(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new DirectUploadError(
          `Streamlike a refusé l'envoi (HTTP ${xhr.status}).`,
          xhr.status,
          xhr.responseText,
        ));
        return;
      }
      let media: any = {};
      try {
        media = JSON.parse(xhr.responseText);
      } catch {
        // Réponse non-JSON : on retombe sur le permalink prévu par le ticket.
      }
      const mediaId = media?.id || media?.permalink || ticket.permalink;
      if (!mediaId) {
        reject(new DirectUploadError('Streamlike a répondu sans identifiant de média.', xhr.status));
        return;
      }
      resolve({
        mediaId: String(mediaId),
        permalink: String(media?.permalink || ticket.permalink || ''),
        raw: media,
      });
    };

    // Le navigateur masque le détail d'un refus CORS : sans cette mention,
    // l'erreur affichée serait « échec réseau » et on chercherait du côté du wifi.
    xhr.onerror = () => reject(new DirectUploadError(
      "Envoi impossible (réseau, ou CORS de l'API Streamlike).",
      null,
    ));
    xhr.onabort = () => reject(new DirectUploadError('Envoi annulé.', null));

    if (options.signal) {
      if (options.signal.aborted) return xhr.abort();
      options.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.send(form);
  });
}
