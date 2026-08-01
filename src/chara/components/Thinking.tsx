/**
 * 回答から次の質問（または推測）が出るまでの「考えている」間。
 *
 * 元は回答した瞬間に次の質問へ切り替わっていて、間が無いぶん
 * 「本当に考えて選んでいるのか」が伝わらなかった。ごく短い停止と
 * インジケータを挟むことで、推論が走っている感じを出す。
 *
 * 高さは質問画面とおおよそ揃えてあり、切り替わりで画面が飛び跳ねないようにしている。
 */
export function Thinking({ label = '考え中' }: { label?: string }) {
  return (
    <div
      data-testid="thinking"
      role="status"
      aria-live="polite"
      className="flex min-h-[280px] min-w-0 flex-col items-center justify-center gap-4"
    >
      <span className="flex items-end gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-4 w-1 rounded-[1px] bg-accent motion-safe:animate-think motion-reduce:opacity-60"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}
