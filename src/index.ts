export * from './embed';
export * from './player';
// `directUpload` n'est PAS réexporté ici : il transporte un jeton Streamlike
// dans le navigateur et s'importe explicitement depuis
// `@mediatech/streamlike-client/unsafe-direct-upload`. Voir l'en-tête de ce
// fichier pour les conditions d'emploi.
