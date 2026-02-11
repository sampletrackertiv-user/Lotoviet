import React, { useState } from 'react';
import { GameMode, Language } from './types';
import { GameHost } from './components/GameHost';
import { GamePlayer } from './components/GamePlayer';
import { Play, Users, Globe, PartyPopper } from 'lucide-react';

const App: React.FC = () => {
  const [mode, setMode] = useState<GameMode>('HOME');
  const [lang, setLang] = useState<Language>('vi');

  const toggleLang = () => setLang(prev => prev === 'vi' ? 'en' : 'vi');

  if (mode === 'HOST') {
    return <GameHost onExit={() => setMode('HOME')} lang={lang} />;
  }

  if (mode === 'PLAYER') {
    return <GamePlayer onExit={() => setMode('HOME')} lang={lang} />;
  }

  return (
    <div className="min-h-screen bg-red-900 text-yellow-300 flex flex-col relative overflow-hidden font-sans">
      {/* Background Decorative Elements for TET */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
         {/* Abstract Cherry Blossoms / Apricot Flowers */}
        <div className="absolute top-[-10%] left-[-10%] w-[400px] h-[400px] bg-yellow-500/20 rounded-full blur-[80px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-pink-500/20 rounded-full blur-[80px]"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
      </div>

      <nav className="relative z-10 p-6 flex justify-between items-center">
        <div className="font-black text-3xl tracking-tighter text-yellow-400 drop-shadow-md flex items-center gap-2">
          <PartyPopper /> Loto Tết 2025
        </div>
        <button 
          onClick={toggleLang}
          className="flex items-center gap-2 text-sm font-bold bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-200 px-4 py-2 rounded-full transition-colors border border-yellow-500/50"
        >
          <Globe size={16} />
          {lang === 'vi' ? 'VN' : 'EN'}
        </button>
      </nav>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full space-y-10 animate-fade-in-up">
          
          <div className="space-y-2">
            <h1 className="text-6xl md:text-8xl font-black text-yellow-400 drop-shadow-xl uppercase">
              {lang === 'vi' ? 'Lô Tô' : 'Bingo'}
            </h1>
            <h2 className="text-2xl md:text-4xl font-bold text-white uppercase tracking-widest">
              {lang === 'vi' ? 'Hội Chợ Xuân' : 'Tet Festival'}
            </h2>
          </div>

          <div className="flex flex-col gap-4 justify-center w-full">
            <button 
              onClick={() => setMode('PLAYER')}
              className="group relative w-full py-5 bg-yellow-400 hover:bg-yellow-300 text-red-900 rounded-2xl font-black text-2xl shadow-[0_10px_20px_rgba(234,179,8,0.3)] transition-all transform hover:-translate-y-1 active:scale-95"
            >
              <div className="flex items-center justify-center gap-3">
                 <Play fill="currentColor" size={28} />
                 {lang === 'vi' ? 'THAM GIA CHƠI' : 'JOIN GAME'}
              </div>
            </button>

            <button 
              onClick={() => setMode('HOST')}
              className="w-full py-4 bg-red-800 hover:bg-red-700 text-yellow-200 border-2 border-yellow-500/50 rounded-2xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-3"
            >
              <Users size={24} />
              {lang === 'vi' ? 'Tạo Phòng (Host)' : 'Create Room'}
            </button>
          </div>
        </div>
      </main>

      <footer className="relative z-10 p-4 text-center text-yellow-500/60 text-xs font-bold uppercase tracking-widest">
        LotoMaster AI © 2025 • Chúc Mừng Năm Mới
      </footer>
    </div>
  );
};

export default App;