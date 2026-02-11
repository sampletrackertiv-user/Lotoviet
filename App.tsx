import React, { useState } from 'react';
import { GameMode, Language } from './types';
import { GameHost } from './components/GameHost';
import { GamePlayer } from './components/GamePlayer';
import { Play, Users, Globe, Info } from 'lucide-react';

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
    <div className="min-h-screen bg-slate-900 text-white flex flex-col relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-red-600/20 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[100px]"></div>
      </div>

      <nav className="relative z-10 p-6 flex justify-between items-center">
        <div className="font-bold text-2xl tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500">
          LotoMaster AI
        </div>
        <button 
          onClick={toggleLang}
          className="flex items-center gap-2 text-sm font-medium bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors"
        >
          <Globe size={16} />
          {lang === 'vi' ? 'Tiếng Việt' : 'English'}
        </button>
      </nav>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-3xl space-y-8 animate-fade-in-up">
          <h1 className="text-5xl md:text-7xl font-black leading-tight">
            {lang === 'vi' ? 'Lô Tô Online' : 'Bingo Reimagined'}
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-pink-500 to-yellow-500">
              {lang === 'vi' ? 'Thời Gian Thực' : 'Real-time & AI'}
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto">
            {lang === 'vi' 
              ? 'Trải nghiệm trò chơi dân gian với công nghệ AI. Tự động hô số, sáng tác vè, và chơi cùng hàng trăm người bạn.'
              : 'Experience the traditional game with modern AI. Auto-calling, generated rhymes, and multiplayer simulation.'}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
            <button 
              onClick={() => setMode('PLAYER')}
              className="group relative px-8 py-4 bg-red-600 hover:bg-red-500 rounded-xl font-bold text-lg shadow-xl hover:shadow-2xl transition-all transform hover:-translate-y-1 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
              <div className="flex items-center justify-center gap-3">
                 <Play fill="currentColor" />
                 {lang === 'vi' ? 'Chơi Ngay' : 'Play Now'}
              </div>
            </button>

            <button 
              onClick={() => setMode('HOST')}
              className="px-8 py-4 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:-translate-y-1 flex items-center justify-center gap-3"
            >
              <Users />
              {lang === 'vi' ? 'Làm Cái (Host)' : 'Host Game'}
            </button>
          </div>

          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
             {[
               { icon: <Info className="text-blue-400" />, title: lang === 'vi' ? 'AI Hô Số' : 'AI Caller', desc: lang === 'vi' ? 'Giọng đọc & thơ vè' : 'Rhymes & Voice' },
               { icon: <Users className="text-green-400" />, title: 'Multiplayer', desc: lang === 'vi' ? 'Phòng chơi lớn' : 'Massive Rooms' },
               { icon: <Globe className="text-purple-400" />, title: 'Online', desc: lang === 'vi' ? 'Mọi lúc mọi nơi' : 'Anywhere' },
               { icon: <Play className="text-yellow-400" />, title: 'Instant', desc: lang === 'vi' ? 'Không cần cài đặt' : 'No Install' },
             ].map((feature, i) => (
               <div key={i} className="p-4 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                  <div className="mb-2">{feature.icon}</div>
                  <h3 className="font-bold text-sm">{feature.title}</h3>
                  <p className="text-xs text-slate-500">{feature.desc}</p>
               </div>
             ))}
          </div>
        </div>
      </main>

      <footer className="relative z-10 p-6 text-center text-slate-600 text-sm">
        © 2024 LotoMaster AI. {lang === 'vi' ? 'Chúc bạn may mắn!' : 'Good luck!'}
      </footer>
    </div>
  );
};

export default App;
