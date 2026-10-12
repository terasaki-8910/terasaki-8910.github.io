// /career/?drafts のときだけ、まだ決まっていない文(各データの draft・draftText・plainDraft、用語の draft)を出す
export const SHOW_DRAFTS = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('drafts')
