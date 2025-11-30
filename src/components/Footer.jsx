export default function Footer() {
  return (
    <footer className="px-8 py-20 border-t border-white/10">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-center md:text-left">
            <h3 className="text-2xl font-bold mb-2 whitespace-nowrap">クソサイト製造工場</h3>
            <p className="text-gray-500 text-lg">
              💩 Site Projects Collection
            </p>
          </div>
          <div className="flex gap-6">
            <a 
              href="https://github.com/terasaki-8910" 
              target="_blank"
              rel="noopener noreferrer"
              className="w-12 h-12 glass rounded-full flex items-center justify-center hover:border-accent-cyan transition-all hover:scale-110"
            >
              <span className="text-xl">💻</span>
            </a>
            <a 
              href="#" 
              className="w-12 h-12 glass rounded-full flex items-center justify-center hover:border-accent-violet transition-all hover:scale-110"
            >
              <span className="text-xl">🎵</span>
            </a>
            <a 
              href="#" 
              className="w-12 h-12 glass rounded-full flex items-center justify-center hover:border-accent-cyan transition-all hover:scale-110"
            >
              <span className="text-xl">🎮</span>
            </a>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/5 text-center text-gray-600 text-sm">
          <p>© 2024 terasaki-8910.github.io | Built with React, Three.js & GSAP</p>
        </div>
      </div>
    </footer>
  )
}
