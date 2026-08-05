import { defineConfig } from 'tsup';

const outExtension = ({ format }: { format: string }) => {
  if (format === 'cjs') return { js: '.cjs' };
  if (format === 'iife') return { js: '.global.js' };
  return { js: '.js' };
};

/**
 * Deux builds distincts, et non deux entrées d'un même build.
 *
 * Le mode dégradé (dépôt direct avec un jeton dans le navigateur) doit rester
 * visible à l'appel. En modules, c'est le sous-chemin d'import qui s'en charge
 * — `@mediatech/streamlike-client/unsafe-direct-upload` se remarque dans une
 * ligne d'import. En UMD, il n'y a pas d'import : c'est donc la balise
 * `<script>` et le nom du global qui doivent porter l'avertissement. Un seul
 * bundle les aurait fondus sous le même nom, et le mode dégradé serait devenu
 * indiscernable du reste.
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
  {
    name: 'unsafe-direct-upload',
    entry: { 'unsafe-direct-upload': 'src/unsafe-direct-upload.ts' },
    format: ['esm', 'cjs', 'iife'],
    globalName: 'MediatechStreamlikeUnsafeUpload',
    dts: true,
    // Surtout pas de `clean` ici : il effacerait le build précédent.
    clean: false,
    sourcemap: true,
    target: 'es2020',
    outExtension,
  },
]);
