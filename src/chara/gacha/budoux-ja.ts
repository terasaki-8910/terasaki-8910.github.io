/*
 * BudouX のうち、日本語の文節に区切るのに要る分だけ(phrases.ts から、要るブラウザでだけ読む)。
 * パッケージをそのまま import() すると、中国語・タイ語のモデルまで一緒に入って重くなるため、ここで絞る。
 */
export { Parser, jaModel } from 'budoux';
