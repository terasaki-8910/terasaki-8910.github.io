import { OUTLINE_BUTTON, PRIMARY_BUTTON, QUIET_LINK_BUTTON } from '../components/styles';
import { prefetchGacha } from '../gacha/prefetch';

export type PlayMode = 'discover' | 'guess';

/**
 * 遊び方を選ぶ画面（開発元 R12「モードを分ける」案。2026-10-26、本人の依頼で別に見せる版）。
 * - 理想の推しに出会う: 好みの特徴だけを聞く（作品の質問は聞かない）。ページの題名に合わせてこちらを主にする
 * - 推しを当ててもらう: 思い浮かべたキャラを、作品の質問も使って当てる
 * 案内画面の「次の画面から『おまかせで見る』を選ぶ」と食い違わないよう、ここにもおまかせを置く。
 */
export function ModeScreen(props: { onSelect(mode: PlayMode): void; onOmakase(): void }) {
  const { onSelect, onOmakase } = props;

  return (
    <div data-testid="mode" className="min-w-0 motion-safe:animate-rise-in">
      <h2 className="text-2xl md:text-3xl font-display text-ink">どちらで遊ぶ?</h2>

      <div className="mt-8 flex flex-col gap-2">
        <button type="button" data-testid="mode-discover" onClick={() => onSelect('discover')} className={`${PRIMARY_BUTTON} text-left`}>
          理想の推しに出会う
        </button>
        <button type="button" data-testid="mode-guess" onClick={() => onSelect('guess')} className={`${OUTLINE_BUTTON} text-left`}>
          推しを当ててもらう
        </button>
      </div>

      <div className="mt-8">
        <button
          type="button"
          data-testid="omakase"
          onClick={onOmakase}
          onPointerEnter={prefetchGacha}
          onPointerDown={prefetchGacha}
          onFocus={prefetchGacha}
          className={QUIET_LINK_BUTTON}
        >
          おまかせで見る
        </button>
      </div>
    </div>
  );
}
