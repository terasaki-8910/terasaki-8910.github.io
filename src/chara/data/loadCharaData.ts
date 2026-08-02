import { initBayesData, type LikelihoodsFile, type QuestionsRuntimeFile } from '../engine/bayes';
import { survivors, type Dataset } from '../engine/recommend';
import { charactersSchema, supplyFileSchema } from './schema';

/*
 * データの読み込み口。移植元（Bayesian-chara-picker）は data/*.json を静的import
 * してバンドルに同梱していたが、ここでは public/chara-picker/ から実行時fetchする
 * （約280KBを初期JSから外し、ブラウザキャッシュに載せるため）。
 *
 * このサイトのデータは移植元リポジトリから手動コピーで持ってくる運用なので、
 * 「characters.json だけ更新して likelihoods.json を忘れる」といったファイル間の
 * ズレが現実的に起こりうる。エンジン内部（bayes.ts の likelihoodOf）はその場合
 * 推測の途中で例外を投げるため、ロード時にまとめて検証して分かる形で失敗させる。
 */

const BASE = '/chara-picker/';

async function fetchJson(name: string): Promise<unknown> {
  const res = await fetch(`${BASE}${name}`);
  if (!res.ok) throw new Error(`${name} の取得に失敗しました (HTTP ${res.status})`);
  return (await res.json()) as unknown;
}

export type CharaData = { dataset: Dataset };

export async function loadCharaData(): Promise<CharaData> {
  const [charactersRaw, supplyRaw, likelihoodsRaw, questionsRaw] = await Promise.all([
    fetchJson('characters.json'),
    fetchJson('supply.json'),
    fetchJson('likelihoods.json'),
    fetchJson('questions.runtime.json'),
  ]);

  // characters/supply は移植元にzodスキーマがあるのでそのまま流用する。
  // 属性値のenum違反まで見るため、UI側で「変な値なのに落ちない」状態を作らない。
  const characters = charactersSchema.parse(charactersRaw);
  const supply = supplyFileSchema.parse(supplyRaw);

  // likelihoods/questions.runtime は生成物でzodスキーマが無い。構造だけ最小限確認する。
  const likelihoods = likelihoodsRaw as LikelihoodsFile;
  const questions = questionsRaw as QuestionsRuntimeFile;
  if (!Array.isArray(likelihoods?.questionIds) || typeof likelihoods?.chars !== 'object') {
    throw new Error('likelihoods.json の構造が想定と異なります');
  }
  if (!Array.isArray(questions?.questions) || questions.questions.length === 0) {
    throw new Error('questions.runtime.json の構造が想定と異なります');
  }

  // ファイル間のズレ検出。推薦対象になりうるキャラが likelihoods に無いと
  // 推測の途中で初めて落ちるので、ここで先に気づけるようにする。
  //
  // 判定は必ず survivors() に委ねる——ここでハードフィルタを手写しすると、
  // 移植元がフィルタを足したときにサイト側だけ古い条件で検査してしまう。
  // 実際 2026-08-01 に移植元が `reviewed === true` をハードフィルタへ追加しており、
  // 手写しのままだと「移植元では推薦対象外なので likelihoods を持たないキャラ」を
  // 欠落扱いにしてページ全体をロード失敗させる状態だった。
  const missing = survivors({ characters, supply })
    .filter((c) => likelihoods.chars[c.id] === undefined)
    .map((c) => c.id);
  if (missing.length > 0) {
    throw new Error(
      `likelihoods.json に無いキャラがあります（characters.json と世代がズレている可能性）: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` ほか${missing.length - 5}件` : ''}`,
    );
  }

  const questionIdSet = new Set(likelihoods.questionIds);
  const orphanQuestions = questions.questions.filter((q) => !questionIdSet.has(q.key)).map((q) => q.key);
  if (orphanQuestions.length > 0) {
    throw new Error(`likelihoods.json に無い質問があります: ${orphanQuestions.slice(0, 5).join(', ')}`);
  }

  initBayesData(likelihoods, questions);
  return { dataset: { characters, supply } };
}
