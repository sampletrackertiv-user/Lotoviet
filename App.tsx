import React, { useState } from 'react';
import { GameMode, Language } from './types';
import { GameHost } from './components/GameHost';
import { GamePlayer } from './components/GamePlayer';
import { Play, Zap, Trophy, Flower } from 'lucide-react';

const App: React.FC = () => {
  const [mode, setMode] = useState<GameMode>('HOME');
  const [lang, setLang] = useState<Language>('vi');

  const toggleLang = () => setLang(prev => prev === 'vi' ? 'en' : 'vi');

  if (mode === 'HOST') return <GameHost onExit={() => setMode('HOME')} lang={lang} />;
  if (mode === 'PLAYER') return <GamePlayer onExit={() => setMode('HOME')} lang={lang} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-600 via-orange-500 to-yellow-500 text-white flex flex-col relative overflow-hidden font-sans selection:bg-yellow-400 selection:text-red-900">
      
      {/* Festive Background Patterns */}
      <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-yellow-400/20 rounded-full blur-[100px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-red-800/20 rounded-full blur-[100px]"></div>
          <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '30px 30px'}}></div>
      </div>

      <nav className="relative z-10 p-8 flex justify-between items-center">
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center text-red-700 font-black text-xl shadow-lg transform rotate-3">L</div>
            <span className="font-bold text-xl tracking-tight text-white drop-shadow-md">LOTO<span className="text-yellow-200">MASTER</span></span>
        </div>
        <button 
          onClick={toggleLang}
          className="text-xs font-bold bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full text-white transition-colors uppercase tracking-widest border border-white/20"
        >
          {lang === 'vi' ? 'VN' : 'EN'}
        </button>
      </nav>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-xl w-full animate-fade-in-up">
          
          <div className="mb-10 relative inline-block">
             <div className="absolute inset-0 bg-yellow-500 blur-3xl opacity-40 rounded-full"></div>
             <div className="relative flex justify-center gap-4">
                 <div className="w-20 h-20 bg-white text-red-600 rounded-3xl flex items-center justify-center shadow-xl rotate-[-6deg] z-10 border-4 border-red-50">
                     <span className="text-5xl font-black">2</span>
                 </div>
                 <div className="w-20 h-20 bg-yellow-400 text-red-700 rounded-3xl flex items-center justify-center shadow-xl z-20 border-4 border-yellow-200 scale-110">
                     <Flower size={48} />
                 </div>
                 <div className="w-20 h-20 bg-white text-red-600 rounded-3xl flex items-center justify-center shadow-xl rotate-[6deg] z-10 border-4 border-red-50">
                     <span className="text-5xl font-black">5</span>
                 </div>
             </div>
          </div>

          <h1 className="text-6xl md:text-8xl font-black text-white tracking-tighter mb-4 leading-none drop-shadow-xl">
            {lang === 'vi' ? 'LÔ TÔ' : 'BINGO'}
            <br/>
            <span className="text-yellow-200 text-5xl md:text-7xl">ONLINE</span>
          </h1>
          
          <div className="inline-block bg-white/10 backdrop-blur-md px-6 py-2 rounded-full border border-white/20 mb-8">
             <p className="text-yellow-100 text-sm font-bold uppercase tracking-[0.2em] flex items-center gap-2">
                <Trophy size={14} className="text-yellow-400"/>
                {lang === 'vi' ? 'Vui Xuân Đón Lộc' : 'Tet Holiday Special'}
             </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center w-full max-w-md mx-auto">
            <button 
              onClick={() => setMode('PLAYER')}
              className="flex-1 py-4 px-6 bg-white hover:bg-yellow-50 text-red-600 rounded-xl font-black text-lg transition-all transform hover:-translate-y-1 hover:shadow-2xl flex items-center justify-center gap-2 shadow-lg group"
            >
               <Play size={24} fill="currentColor" className="group-hover:text-orange-500 transition-colors" />
               {lang === 'vi' ? 'THAM GIA' : 'JOIN GAME'}
            </button>

            <button 
              onClick={() => setMode('HOST')}
              className="flex-1 py-4 px-6 bg-red-800/40 hover:bg-red-800/60 text-white border-2 border-red-400/50 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 backdrop-blur-sm"
            >
              <Zap size={20} />
              {lang === 'vi' ? 'TẠO PHÒNG' : 'HOST GAME'}
            </button>
          </div>
        </div>
      </main>

      <footer className="relative z-10 p-6 text-center border-t border-white/10">
        <p className="text-red-100 text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">
            LotoMaster AI © 2025 • Chúc Mừng Năm Mới
        </p>
      </footer>
    </div>
  );
};

export default App;