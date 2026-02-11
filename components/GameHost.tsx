import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Copy, Users, Activity, RefreshCw, Database, CheckCircle2, XCircle } from 'lucide-react';
import { generateLotoRhyme } from '../services/geminiService';
import { Language, ChatMessage, PlayerInfo } from '../types';
import { database, isFirebaseConfigured, listenToConnectionStatus } from '../services/firebase';
import { ref, set, onValue, update, remove, onDisconnect } from "firebase/database";

interface GameHostProps {
  onExit: () => void;
  lang: Language;
}

type TabType = 'BOARD' | 'PLAYERS' | 'LOG';

const generateShortCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// Màu sắc bóng rực rỡ hơn cho Tết
const getBallColorClass = (num: number) => {
  const range = Math.floor((num - 1) / 10);
  const colors = [
    'from-red-500 to-red-600 ring-red-400',
    'from-green-500 to-green-600 ring-green-400',
    'from-blue-500 to-blue-600 ring-blue-400',
    'from-yellow-400 to-yellow-500 ring-yellow-300 text-red-900',
    'from-purple-500 to-purple-600 ring-purple-400',
    'from-pink-500 to-pink-600 ring-pink-400',
    'from-cyan-500 to-cyan-600 ring-cyan-400',
    'from-orange-500 to-orange-600 ring-orange-400',
    'from-slate-500 to-slate-600 ring-slate-400',
  ];
  return colors[range] || 'from-gray-500 to-gray-600';
};

export const GameHost: React.FC<GameHostProps> = ({ onExit, lang }) => {
  // State
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [previousNumber, setPreviousNumber] = useState<number | null>(null); // Track previous separately
  const [currentRhyme, setCurrentRhyme] = useState<string>('');
  const [isAuto, setIsAuto] = useState(false);
  const [speed, setSpeed] = useState(4000); // Mặc định nhanh hơn (4s)
  const [flash, setFlash] = useState(false);
  const [muted, setMuted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('BOARD');
  const [isOnline, setIsOnline] = useState(false);
  
  // Network
  const [roomCode, setRoomCode] = useState<string>('');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [gameLog, setGameLog] = useState<string[]>([]);
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // TTS
  const speak = (text: string) => {
    if (muted || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
    utterance.rate = 1.2; // Đọc nhanh hơn chút
    window.speechSynthesis.speak(utterance);
  };

  const addLog = (msg: string) => {
    setGameLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  // Check Config
  if (!isFirebaseConfigured()) {
      return (
          <div className="flex items-center justify-center h-screen bg-red-900 text-yellow-300 p-6">
              <div className="bg-red-800 p-8 rounded-2xl border-2 border-yellow-500 text-center shadow-2xl">
                  <h2 className="text-3xl font-black mb-4 uppercase">Cần Cấu Hình Database</h2>
                  <button onClick={onExit} className="bg-yellow-400 text-red-900 px-6 py-2 rounded-full font-bold">Quay lại</button>
              </div>
          </div>
      );
  }

  // Setup Effect
  useEffect(() => {
    const unsubscribeStatus = listenToConnectionStatus(setIsOnline);
    const requestWakeLock = async () => {
      try { if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen'); } 
      catch (err) {}
    };
    requestWakeLock();
    
    // Init Room
    const code = generateShortCode();
    setRoomCode(code);
    const roomRef = ref(database, `rooms/${code}`);
    set(roomRef, { status: 'ACTIVE', currentNumber: null, currentRhyme: "Chào mừng hội chợ Lô Tô!", history: [], createdAt: Date.now() });
    onDisconnect(roomRef).update({ status: 'HOST_DISCONNECTED' });

    // Listeners
    const playersRef = ref(database, `rooms/${code}/players`);
    const u1 = onValue(playersRef, (snap) => setPlayers(Object.values(snap.val() || {})));
    
    const claimsRef = ref(database, `rooms/${code}/claims`);
    const u2 = onValue(claimsRef, (snap) => {
        const claims = Object.values(snap.val() || {}) as any[];
        const latest = claims[claims.length - 1];
        if (latest && Date.now() - latest.timestamp < 5000) {
            alert(`🎉 BINGO! ${latest.playerName} đã thắng!`);
            speak(`Bingo! ${latest.playerName} thắng rồi!`);
        }
    });

    return () => {
        if(wakeLockRef.current) wakeLockRef.current.release();
        unsubscribeStatus(); u1(); u2(); stopAuto(); remove(roomRef);
    };
  }, []); 

  // Sync Game State
  const updateGameState = (num: number | null, rhyme: string, hist: number[]) => {
      if (!roomCode) return;
      update(ref(database), {
        [`rooms/${roomCode}/currentNumber`]: num,
        [`rooms/${roomCode}/currentRhyme`]: rhyme,
        [`rooms/${roomCode}/history`]: hist
      });
  };

  const drawNumber = async () => {
    const available = Array.from({ length: 90 }, (_, i) => i + 1).filter(n => !calledNumbers.includes(n));

    if (available.length === 0) {
      stopAuto();
      const endMsg = "Hết số rồi bà con ơi!";
      setCurrentRhyme(endMsg);
      speak(endMsg);
      updateGameState(null, endMsg, calledNumbers);
      return;
    }

    const nextNum = available[Math.floor(Math.random() * available.length)];
    
    setFlash(true);
    setPreviousNumber(currentNumber); // Shift current to previous
    setCurrentNumber(nextNum);
    const newHistory = [...calledNumbers, nextNum];
    setCalledNumbers(newHistory);
    setTimeout(() => setFlash(false), 300);

    // Xử lý đọc và vè
    speak(`${nextNum}`);
    const rhyme = await generateLotoRhyme(nextNum, lang);
    setCurrentRhyme(rhyme);
    setTimeout(() => speak(rhyme), 600); // Đọc vè ngay sau số

    updateGameState(nextNum, rhyme, newHistory);
  };

  const startAuto = () => { if (!isAuto) { setIsAuto(true); drawNumber(); timerRef.current = setInterval(drawNumber, speed); } };
  const stopAuto = () => { if (timerRef.current) clearInterval(timerRef.current); setIsAuto(false); };
  const toggleAuto = () => isAuto ? stopAuto() : startAuto();

  const resetGame = () => {
    if (!confirm('Chơi ván mới?')) return;
    stopAuto();
    setCalledNumbers([]);
    setCurrentNumber(null);
    setPreviousNumber(null);
    setCurrentRhyme("Ván mới bắt đầu!");
    updateGameState(null, "Ván mới bắt đầu!", []);
    update(ref(database), { [`rooms/${roomCode}/claims`]: null, [`rooms/${roomCode}/messages`]: null });
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-red-900 text-yellow-100 overflow-hidden font-sans">
      {/* Header Compact */}
      <header className="px-4 py-2 bg-red-950 border-b border-yellow-600/30 flex justify-between items-center shrink-0 shadow-md z-30">
        <div className="flex items-center gap-4">
            <h1 className="text-lg md:text-xl font-black text-yellow-400 uppercase tracking-tighter">Host Loto</h1>
            <div className="bg-red-900/50 px-3 py-1 rounded-full border border-yellow-500/30 flex items-center gap-2 cursor-pointer" onClick={() => {navigator.clipboard.writeText(roomCode); alert("Copied!");}}>
                <span className="text-[10px] text-yellow-200/70">ROOM</span>
                <code className="text-yellow-400 font-mono font-black text-lg">{roomCode || '...'}</code>
                <Copy size={12} className="text-yellow-500"/>
            </div>
            <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${isOnline ? 'bg-green-900/30 border-green-500 text-green-400' : 'bg-red-500 text-white'}`}>
                {isOnline ? <CheckCircle2 size={10} /> : <XCircle size={10} />} DB
            </div>
        </div>

        <div className="flex gap-2">
           <button onClick={() => setMuted(!muted)} className="p-2 hover:bg-red-800 rounded-full text-yellow-200">{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
           <button onClick={resetGame} className="p-2 hover:bg-red-800 rounded-full text-yellow-200"><RotateCcw size={18} /></button>
           <button onClick={onExit} className="px-3 py-1 bg-red-800 hover:bg-red-700 text-xs font-bold rounded border border-red-600">Thoát</button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* LEFT PANEL: Balls Display (Vertical Stack - 2 Balls) */}
        <section className="md:w-64 bg-red-900 border-b md:border-b-0 md:border-r border-yellow-600/30 flex flex-row md:flex-col items-center justify-center p-4 gap-6 shrink-0 relative overflow-hidden">
           {/* Background decorative */}
           <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')]"></div>
           
           {/* Current Ball - BIG */}
           <div className="relative z-10 flex flex-col items-center">
               <span className="text-xs font-bold text-yellow-500 uppercase mb-1 tracking-widest">Mới ra</span>
               <div onClick={isAuto ? stopAuto : drawNumber} className={`
                  w-32 h-32 md:w-40 md:h-40 rounded-full cursor-pointer
                  bg-gradient-to-br from-yellow-400 to-red-500
                  flex items-center justify-center shadow-[0_0_40px_rgba(250,204,21,0.4)]
                  border-4 border-yellow-200 relative transition-all duration-200
                  ${flash ? 'scale-110 brightness-125' : 'scale-100 hover:scale-105'}
               `}>
                  {currentNumber ? (
                    <span className="text-6xl md:text-7xl font-black text-red-900 drop-shadow-sm ball-animation">{currentNumber}</span>
                  ) : (
                    <Play className="text-red-900 opacity-50" size={40} />
                  )}
               </div>
           </div>

           {/* Previous Ball - SMALLER */}
           <div className="relative z-10 flex flex-col items-center opacity-80 scale-90">
               <span className="text-[10px] font-bold text-red-400 uppercase mb-1">Vừa gọi</span>
               <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-red-950 border-2 border-red-700 flex items-center justify-center shadow-inner">
                  <span className="text-2xl md:text-3xl font-bold text-red-500/70">{previousNumber || '--'}</span>
               </div>
           </div>

           {/* Rhyme Box (Mobile: Absolute bottom, Desktop: Below balls) */}
           <div className="absolute bottom-2 left-2 right-2 md:static md:w-full bg-red-950/80 backdrop-blur-sm p-3 rounded-xl border border-yellow-500/20 text-center min-h-[60px] flex items-center justify-center">
               <p className="text-yellow-200 italic font-medium leading-tight text-sm md:text-base">"{currentRhyme}"</p>
           </div>
        </section>

        {/* CENTER/RIGHT PANEL: Controls & Board */}
        <section className="flex-1 flex flex-col bg-red-950 relative z-0">
            {/* Top Controls Bar */}
            <div className="p-3 bg-red-900/50 flex items-center justify-between gap-4 border-b border-yellow-600/20">
                <div className="flex items-center gap-2 flex-1">
                    <span className="text-[10px] text-yellow-500 font-bold uppercase whitespace-nowrap">Tốc độ: {speed/1000}s</span>
                    <input type="range" min="1500" max="6000" step="500" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full max-w-[150px] h-2 bg-red-800 rounded-lg appearance-none cursor-pointer accent-yellow-500" />
                </div>
                <button 
                  onClick={toggleAuto}
                  className={`px-6 py-2 rounded-full font-black text-sm shadow-lg transition-all border whitespace-nowrap
                  ${isAuto ? 'bg-red-500 text-white border-red-400 animate-pulse' : 'bg-yellow-500 text-red-900 border-yellow-400 hover:bg-yellow-400'}`}
                >
                  {isAuto ? 'TẠM DỪNG' : 'QUAY SỐ TỰ ĐỘNG'}
                </button>
            </div>

            {/* Tabs for Board/Players */}
            <div className="flex bg-red-950 border-b border-red-800">
                <button onClick={() => setActiveTab('BOARD')} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'BOARD' ? 'text-yellow-400 border-yellow-400 bg-red-900/30' : 'text-red-400 border-transparent hover:text-red-300'}`}>
                    <Activity size={16}/> Bảng Số
                </button>
                <button onClick={() => setActiveTab('PLAYERS')} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'PLAYERS' ? 'text-yellow-400 border-yellow-400 bg-red-900/30' : 'text-red-400 border-transparent hover:text-red-300'}`}>
                    <Users size={16}/> Người Chơi ({players.length})
                </button>
            </div>

            {/* Tab Content Area - Scrollable */}
            <div className="flex-1 overflow-y-auto p-2 md:p-4 bg-red-950">
                {activeTab === 'BOARD' && (
                    <div className="grid grid-cols-10 gap-1 sm:gap-2 max-w-4xl mx-auto">
                        {Array.from({ length: 90 }, (_, i) => i + 1).map((num) => {
                            const isCalled = calledNumbers.includes(num);
                            const isRecent = currentNumber === num;
                            return (
                                <div key={num} className={`
                                    aspect-square rounded-lg flex items-center justify-center text-xs sm:text-sm font-bold transition-all duration-500 border
                                    ${isRecent ? `scale-110 z-10 bg-gradient-to-br ${getBallColorClass(num)} text-white border-white shadow-xl` : ''}
                                    ${!isRecent && isCalled ? `bg-red-800 text-yellow-200 border-red-700 shadow-inner opacity-100` : ''}
                                    ${!isCalled ? 'bg-red-900/20 text-red-800 border-red-900/30' : ''}
                                `}>
                                    {isCalled ? num : ''}
                                </div>
                            );
                        })}
                    </div>
                )}

                {activeTab === 'PLAYERS' && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {players.map(p => (
                            <div key={p.id} className="bg-red-900 border border-red-800 p-2 rounded flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-yellow-500 text-red-900 flex items-center justify-center text-xs font-bold">{p.name[0]}</div>
                                <span className="text-sm text-yellow-100 truncate">{p.name}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
      </main>
    </div>
  );
};