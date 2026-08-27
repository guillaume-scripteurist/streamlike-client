import { defineConfig } from 'tsup';

const outExtension = ({ format }: { format: string }) => {
  if (format === 'cjs') return { js: '.cjs' };
  if (format === 'iife') return { js: '.global.js' };
  return { js: '.js' };
};

/**
 * Un seul build : le player et les URLs d'embed.
 *
 * Il y avait ici un second build, `unsafe-direct-upload`, qui déposait un
 * fichier sur l'API Streamlike depuis le navigateur — donc avec un jeton dans
 * le navigateur. Il a été retiré : la voie GCS (ticket signé côté serveur, voir
 * `@scripteurist/secure-upload-core`) couvre désormais tous les cas, y compris
 * ceux qui n'ont pas d'URL publique à offrir au callback.
 */
export default defineConfig([
  {
    name: 'streamlike-client',
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs', 'iife'],
    globalName: 'MediatechStreamlikeClient',
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'es2020',
    outExtension,
  },
]);
