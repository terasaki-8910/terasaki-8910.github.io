import { useId } from 'react'

// 見出し付きの操作の群。スライダーなどを、見出しの下にまとめる(SimShell の操作の欄は grid で、群は横幅いっぱい)。
//   <ControlGroup label="モデル変換"> <ParamSlider ... /> ... </ControlGroup>
// 見出しは群の名前(aria-labelledby)で、見た目は visualization.css の .vis-group。
export default function ControlGroup({ label, children }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="vis-group">
      <p id={id} className="vis-group__label">
        {label}
      </p>
      {children}
    </div>
  )
}
