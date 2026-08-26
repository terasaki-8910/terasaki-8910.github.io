import { PRIMARY_BUTTON } from '../components/styles';

/**
 * 初回のみ挟む注意書き画面。`useNoticeSeen` が false の間、質問より前に出す
 * （最初の質問がどの軸になるかはベイズ選択で毎回変わりうるため、特定の質問の
 * 手前ではなく「質問そのものの前」に固定で置く）。
 *
 * 内容は2点: (1)外見・体型に関する質問も含むこと、(2)回答の当てはめは
 * Danbooruのタグ統計等からの機械的な推定であり、人がキャラごとに見て判断した
 * ものではないこと。あわせて「わからない」「おまかせで見る」という既存の
 * 逃げ道も添える。
 */
export function NoticeScreen(props: { onAcknowledge(): void }) {
  const { onAcknowledge } = props;

  return (
    <div data-testid="notice" className="min-w-0 motion-safe:animate-rise-in">
      <h2 className="text-2xl md:text-3xl font-display text-ink">はじめる前に</h2>

      <p className="mt-5 text-muted">
        髪型や服装だけでなく、外見や体型に関する質問も含みます。どの回答をどのキャラに当てはめるかは、
        Danbooruのタグ統計などから機械的に推定したもので、人がキャラごとに見て判断したものではありません
        ——実際の印象と違うことがあります。
      </p>

      <p className="mt-4 text-muted">
        答えにくい質問は「わからない」で構いません。質問自体を避けたい場合は、次の画面から
        「おまかせで見る」を選ぶと質問なしで1体決まります。
      </p>

      <div className="mt-8 max-w-xs">
        <button type="button" data-testid="notice-start" onClick={onAcknowledge} className={PRIMARY_BUTTON}>
          はじめる
        </button>
      </div>
    </div>
  );
}
