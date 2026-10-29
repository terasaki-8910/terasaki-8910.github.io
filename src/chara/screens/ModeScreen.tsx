import { OshiGachaTitle } from '../components/OshiGachaTitle';
import { OUTLINE_BUTTON, PRIMARY_BUTTON } from '../components/styles';
import { prefetchGacha } from '../gacha/prefetch';

export type PlayMode = 'discover' | 'guess';

/**
 * 遊び方を選ぶ画面（開発元 R12「モードを分ける」案。2026-10-26、本人の依頼で別に見せる版）。
 * - 理想の推しに出会う: 好みの特徴だけを聞く（作品の質問は聞かない）。ページの題名に合わせてこちらを主にする
 * - 推しを当ててもらう: 思い浮かべたキャラを、作品の質問も使って当てる
 * - 推しガチャ: 質問なしで引く。単発は1体、十連は重ならない10体(本人 2026-10-29「単発と十連で」)。
 *   単発は以前の「おまかせで見る」と同じ抽選と演出。
 */
export function ModeScreen(props: { onSelect(mode: PlayMode): void; onOmakase(): void; onGachaTen(): void }) {
  const { onSelect, onOmakase, onGachaTen } = props;

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

      <section className="mt-10" aria-labelledby="oshi-gacha-title">
        <h3 id="oshi-gacha-title" className="m-0">
          <OshiGachaTitle className="block h-9 w-auto -skew-x-6 drop-shadow-[0_2px_0_rgba(90,60,170,0.25)]" />
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="omakase"
            onClick={onOmakase}
            onPointerEnter={prefetchGacha}
            onPointerDown={prefetchGacha}
            onFocus={prefetchGacha}
            className={OUTLINE_BUTTON}
          >
            単発
          </button>
          <button
            type="button"
            data-testid="omakase-ten"
            onClick={onGachaTen}
            onPointerEnter={prefetchGacha}
            onPointerDown={prefetchGacha}
            onFocus={prefetchGacha}
            className={OUTLINE_BUTTON}
          >
            十連
          </button>
        </div>
      </section>
    </div>
  );
}
