import { useEffect } from 'react'

// 横にはみ出して、スクロールしないと読めない領域だけを、キーボードのフォーカスを受けるようにする
// (矢印キーで動かせる)。はみ出さない領域まで Tab の停止点にしない。
// ref: その領域の要素。再計算は領域の大きさが変わったとき。
export default function useOverflowFocus(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const update = () => {
      if (el.scrollWidth > el.clientWidth + 1) el.setAttribute('tabindex', '0')
      else el.removeAttribute('tabindex')
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    // 中身が変わった(コードの読み込みなど)ときも
    const mutation = new MutationObserver(update)
    mutation.observe(el, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      mutation.disconnect()
    }
  }, [ref])
}
