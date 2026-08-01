import { FaGithub } from "react-icons/fa"
import { FaDiscord } from "react-icons/fa6"
import { SlSocialSpotify } from "react-icons/sl";

export default function Footer() {
  return (
    <footer className="px-8 py-20 border-t border-line">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-center md:text-left">
            <h3 className="text-2xl font-display text-ink mb-2 whitespace-nowrap">@Override</h3>
            <p className="text-muted text-lg">Site Projects Collection</p>
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
              href="https://discord.gg/pc3z8CbX"
              className="w-11 h-11 border border-line rounded-full flex items-center justify-center hover:border-accent transition-colors"
            >
              <FaDiscord className="text-xl text-ink" />
            </a>
            <a
              href="https://x.com/fuyuiroo"
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
          <p className="mt-2">キャラクターイラスト: Yasson(吉田夜世)</p>
        </div>
      </div>
    </footer>
  )
}
