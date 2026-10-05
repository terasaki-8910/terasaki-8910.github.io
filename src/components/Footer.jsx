import { FaGithub } from "react-icons/fa"
import { FaDiscord } from "react-icons/fa6"
import { SlSocialSpotify } from "react-icons/sl";

export default function Footer() {
  return (
    <footer className="px-8 py-20 border-t border-line">
      <div className="bk-content max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-center md:text-left">
            {/* 下の説明(以前の Site Projects Collection)は、言い換えずに外した(2026-10-05 本人指定) */}
            <h3 className="text-2xl font-display text-ink whitespace-nowrap">@オーバーライド</h3>
          </div>
          <div className="flex gap-4">
            <a
              href="https://github.com/terasaki-8910"
              target="_blank"
              rel="noopener noreferrer"
              className="w-11 h-11 border border-line rounded-full flex items-center justify-center hover:border-accent transition-colors"
            >
              <FaGithub className="text-xl text-ink" />
            </a>
            <a
              href="https://open.spotify.com/user/4yzziiwdk53rx9ih2l6o04oa5?si=94d46b7aa75c4b70"
              className="w-11 h-11 border border-line rounded-full flex items-center justify-center hover:border-accent transition-colors"
            >
              <SlSocialSpotify className="text-xl text-ink" />
            </a>
            <a
              href="https://discord.gg/expired-invite-404"
              className="w-11 h-11 border border-line rounded-full flex items-center justify-center hover:border-accent transition-colors"
            >
              <FaDiscord className="text-xl text-ink" />
            </a>
            <a
              href="https://x.com/link-expired"
              target="_blank"
              rel="noopener noreferrer"
              className="w-11 h-11 border border-line rounded-full flex items-center justify-center hover:border-accent transition-colors"
            >
              <span className="text-lg text-ink">𝕏</span>
            </a>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-line text-center text-muted text-sm">
          <p>© 2025 terasaki-8910.github.io | Built with React &amp; GSAP</p>
          <p className="mt-2">アイコン: 若狭フユ（イラスト: Yasson / 吉田夜世）</p>
          {/* ヘッダーのメニューの魔人のランプ(Game Icons)は CC BY 3.0 なので、作者名とライセンスを書く */}
          <p className="mt-2">
            Magic lamp icon by Lorc (
            <a href="https://game-icons.net" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-accent">
              https://game-icons.net
            </a>
            ),{' '}
            <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-accent">
              CC BY 3.0
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
