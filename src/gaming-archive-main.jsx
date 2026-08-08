import React from 'react'
import ReactDOM from 'react-dom/client'
import NotFoundPage from './NotFoundPage.jsx'
import './index.css'

// Gaming Archiveはリンク先(実URL)は用意したが中身はまだ無いため、
// 本物の404ページと同じ表示にしておく(本人指定、2026-08-08)。
// 中身ができたら専用ページに差し替える。
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NotFoundPage />
  </React.StrictMode>,
)
