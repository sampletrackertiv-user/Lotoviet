import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Copy, Users, Activity, CheckCircle2, XCircle, Trophy, AlertCircle } from 'lucide-react';
import { generateLotoRhyme } from '../services/geminiService';
import { Language, PlayerInfo } from '../types';
import { database, isFirebaseConfigured, listenToConnectionStatus } from '../services/firebase';
import { ref, set, onValue, update, remove, onDisconnect } from "firebase/database";

interface GameHostProps {
  onExit: () => void;
  lang: Language;
}

const generateShortCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

export const GameHost: React.FC<GameHostProps> = ({ onExit, lang }) => {
  // State
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [previousNumber, setPreviousNumber] = useState<number | null>(null);
  const [currentRhyme, setCurrentRhyme] = useState<string>('');
  const [isAuto, setIsAuto] = useState(false);
  const [speed, setSpeed] = useState(4000); 
  const [flash, setFlash] = useState(false);
  const [muted, setMuted] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  
  // Game Status State
  const [winners, setWinners] = useState<PlayerInfo[]>([]);
  const [waiters, setWaiters] = useState<PlayerInfo[]>([]); // People with 1 left
  
  // Network
  const [roomCode, setRoomCode] = useState<string>('');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  // Track previous waiters to only notify on new entry
  const prevWaitersCount = useRef(0);

  // Auto scroll history
  useEffect(() => {
    if (historyScrollRef.current) {
        historyScrollRef.current.scrollLeft = 0;
    }
  }, [calledNumbers]);

  // TTS Function
  const speakCombined = (num: number, rhyme: string) => {
    if (muted || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const prefix = lang === 'vi' ? `Số ${num}.` : `Number ${num}.`;
    const fullText = `${prefix} ... ${rhyme}`;
    const utterance = new SpeechSynthesisUtterance(fullText);
    utterance.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
    utterance.rate = 1.0; 
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  const speakSimple = (text: string) => {
    if (muted || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
    window.speechSynthesis.speak(utterance);
  }

  // Setup
  useEffect(() => {
    const unsubscribeStatus = listenToConnectionStatus(setIsOnline);
    const requestWakeLock = async () => { try { if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch (err) {} };
    requestWakeLock();
    
    if (!isFirebaseConfigured()) return;

    const code = generateShortCode();
    setRoomCode(code);
    const roomRef = ref(database, `rooms/${code}`);
    set(roomRef, { status: 'ACTIVE', currentNumber: null, currentRhyme: "Chào mừng bà con cô bác!", history: [], createdAt: Date.now() });
    onDisconnect(roomRef).update({ status: 'HOST_DISCONNECTED' });

    const playersRef = ref(database, `rooms/${code}/players`);
    const u1 = onValue(playersRef, (snap) => {
        const pList = Object.values(snap.val() || {}) as PlayerInfo[];
        setPlayers(pList);

        // Calculate Status
        const currentWinners = pList.filter(p => p.remaining === 0);
        const currentWaiters = pList.filter(p => p.remaining === 1);
        
        setWinners(currentWinners);
        setWaiters(currentWaiters);

        // Logic: Stop on Win (Kinh)
        if (currentWinners.length > 0) {
            setIsAuto(false); // Stop loop
            // Only speak if this is a fresh win detection (simple check via length or state, here using effect ensures it runs)
             // We can use a ref to debounce speech if needed, but simplified here:
        }

        // Logic: Notify on Waiting (Chờ 1)
        if (currentWaiters.length > prevWaitersCount.current) {
            // New person entered waiting state
            speakSimple("Căng rồi căng rồi! Có người đang chờ đặc biệt!");
        }
        prevWaitersCount.current = currentWaiters.length;
    });

    // Also watch claims for redundancy
    const claimsRef = ref(database, `rooms/${code}/claims`);
    const u2 = onValue(claimsRef, (snap) => {
        const claims = Object.values(snap.val() || {}) as any[];
        const latest = claims[claims.length - 1];
        if (latest && Date.now() - latest.timestamp < 5000) {
             setIsAuto(false);
             // Handled by player status now, but kept for safety
        }
    });

    return () => {
        if(wakeLockRef.current) wakeLockRef.current.release();
        unsubscribeStatus(); u1(); u2(); 
        setIsAuto(false); 
        remove(roomRef);
    };
  }, []); 

  // Watch for winners state change to speak ONCE
  useEffect(() => {
      if (winners.length > 0 && isAuto) {
          setIsAuto(false);
      }
      if (winners.length > 0) {
          speakSimple(`Kinh rồi! Chúc mừng ${winners.map(w => w.name).join(', ')} đã chiến thắng!`);
      }
  }, [winners.length]);

  const updateGameState = (num: number | null, rhyme: string, hist: number[]) => {
      if (!roomCode) return;
      update(ref(database), {
        [`rooms/${roomCode}/currentNumber`]: num,
        [`rooms/${roomCode}/currentRhyme`]: rhyme,
        [`rooms/${roomCode}/history`]: hist
      }).catch(err => console.error("Firebase update failed:", err));
  };

  const drawNumber = async () => {
    // If someone already won, don't draw
    if (winners.length > 0) {
        setIsAuto(false);
        return;
    }

    const available = Array.from({ length: 90 }, (_, i) => i + 1).filter(n => !calledNumbers.includes(n));

    if (available.length === 0) {
      setIsAuto(false);
      const endMsg = "Hết số rồi bà con ơi!";
      setCurrentRhyme(endMsg);
      speakSimple(endMsg);
      updateGameState(null, endMsg, calledNumbers);
      return;
    }

    const nextNum = available[Math.floor(Math.random() * available.length)];
    const newHistory = [nextNum, ...calledNumbers];
    
    setFlash(true);
    setPreviousNumber(currentNumber);
    setCurrentNumber(nextNum);
    setCalledNumbers(newHistory);
    setTimeout(() => setFlash(false), 300);

    let rhyme = "";
    try {
        rhyme = await generateLotoRhyme(nextNum, lang);
    } catch {
        rhyme = `Số ${nextNum}!`;
    }

    setCurrentRhyme(rhyme);
    speakCombined(nextNum, rhyme);
    updateGameState(nextNum, rhyme, newHistory);
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    if (isAuto && calledNumbers.length < 90 && winners.length === 0) {
      timer = setTimeout(() => {
        drawNumber();
      }, speed);
    }

    return () => clearTimeout(timer);
  }, [isAuto, calledNumbers, speed, winners.length]);

  const toggleAuto = () => {
      if (winners.length > 0) {
          alert("Có người thắng rồi, hãy reset ván mới!");
          return;
      }
      if (isAuto) {
          setIsAuto(false);
      } else {
          drawNumber(); 
          setIsAuto(true);
      }
  };

  const resetGame = () => {
    if (!confirm('Chơi ván mới?')) return;
    setIsAuto(false);
    setCalledNumbers([]);
    setCurrentNumber(null);
    setPreviousNumber(null);
    setWinners([]);
    setWaiters([]);
    prevWaitersCount.current = 0;
    setCurrentRhyme("Ván mới bắt đầu!");
    
    // Reset players logic handled by client listening to history reset, but good to clear claims
    updateGameState(null, "Ván mới bắt đầu!", []);
    update(ref(database), { [`rooms/${roomCode}/claims`]: null, [`rooms/${roomCode}/messages`]: null });
  };

  if (!isFirebaseConfigured()) return <div className="p-10 text-white">Chưa cấu hình Firebase</div>;

  return (
    <div className="flex flex-col h-screen bg-red-950 text-yellow-100 overflow-hidden font-sans">
      {/* 1. Header */}
      <header className="h-14 px-4 bg-red-900 border-b border-yellow-600/30 flex justify-between items-center shadow-lg z-30 shrink-0">
         <div className="flex items-center gap-3">
             <div className="font-black text-xl text-yellow-400 uppercase tracking-tighter">HOST</div>
             <div className="bg-black/20 px-3 py-1 rounded-full border border-yellow-500/20 flex items-center gap-2 cursor-pointer hover:bg-black/30 transition-colors" onClick={() => navigator.clipboard.writeText(roomCode)}>
                 <span className="text-[10px] text-white/50">MÃ PHÒNG</span>
                 <code className="text-yellow-300 font-mono font-bold text-lg">{roomCode || 'LOADING'}</code>
             </div>
             <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ${isOnline ? 'text-green-400 bg-green-900/20' : 'text-red-400'}`}>
                {isOnline ? <CheckCircle2 size={12}/> : <XCircle size={12}/>}
             </div>
         </div>
         <div className="flex gap-2">
            <button onClick={() => setMuted(!muted)} className="p-2 bg-red-800 rounded-full hover:bg-red-700">{muted ? <VolumeX size={18}/> : <Volume2 size={18}/>}</button>
            <button onClick={resetGame} className="p-2 bg-red-800 rounded-full hover:bg-red-700"><RotateCcw size={18}/></button>
            <button onClick={onExit} className="px-4 py-1.5 bg-red-800 hover:bg-red-700 rounded font-bold text-xs uppercase border border-red-600">Thoát</button>
         </div>
      </header>

      {/* 2. Main Content - 2 Columns */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* LEFT COLUMN: THE CALLER (40%) */}
        <section className="w-2/5 md:w-1/3 bg-red-900 border-r border-yellow-600/20 flex flex-col relative">
            {/* Vertical Stack: Current & Previous */}
            <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6 relative z-10">
                <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] pointer-events-none"></div>

                {/* CURRENT NUMBER */}
                <div onClick={isAuto ? () => setIsAuto(false) : drawNumber} className={`
                   w-48 h-48 md:w-56 md:h-56 rounded-full cursor-pointer
                   bg-gradient-to-br from-yellow-400 via-yellow-500 to-red-500
                   flex items-center justify-center shadow-[0_0_50px_rgba(250,204,21,0.3)]
                   border-[6px] border-yellow-200 relative transition-all duration-200
                   ${flash ? 'scale-110 brightness-110' : 'scale-100 hover:scale-105'}
                `}>
                   {currentNumber ? (
                       <span className="text-8xl md:text-9xl font-black text-red-900 drop-shadow-sm ball-animation">{currentNumber}</span>
                   ) : (
                       <Play className="text-red-900/50 ml-2" size={60} />
                   )}
                </div>

                {/* PREVIOUS NUMBER */}
                <div className="flex flex-col items-center opacity-80">
                    <span className="text-[10px] uppercase font-bold text-red-300 mb-1 tracking-widest">Số vừa gọi</span>
                    <div className="w-20 h-20 rounded-full bg-red-950 border-2 border-red-600 flex items-center justify-center shadow-inner">
                        <span className="text-3xl font-bold text-red-400">{previousNumber || '--'}</span>
                    </div>
                </div>
            </div>

            {/* Rhyme Display */}
            <div className="h-32 bg-red-950 border-t border-yellow-600/20 p-4 flex items-center justify-center text-center relative z-20">
                <p className="text-xl md:text-2xl text-yellow-300 font-medium italic leading-relaxed font-serif animate-fade-in">
                   "{currentRhyme || 'Bấm bóng để quay'}"
                </p>
            </div>
        </section>

        {/* RIGHT COLUMN: STATUS & HISTORY (60%) */}
        <section className="flex-1 bg-red-950 flex flex-col overflow-hidden">
            
            {/* Top Control Bar */}
            <div className="p-3 bg-red-900/50 border-b border-yellow-600/20 flex items-center gap-4">
                 <div className="flex-1">
                     <label className="text-[10px] text-yellow-500 font-bold uppercase block mb-1">Tốc độ: {speed/1000}s</label>
                     <input type="range" min="3000" max="8000" step="500" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full h-2 bg-red-800 rounded-lg appearance-none cursor-pointer accent-yellow-400" />
                 </div>
                 <button 
                    onClick={toggleAuto}
                    className={`h-10 px-6 rounded-full font-bold text-sm shadow transition-all border whitespace-nowrap
                    ${isAuto ? 'bg-red-600 text-white border-red-500 animate-pulse' : 'bg-yellow-400 text-red-900 border-yellow-300 hover:bg-yellow-300'}`}
                 >
                    {isAuto ? 'TẠM DỪNG' : 'TỰ ĐỘNG'}
                 </button>
            </div>

            {/* History Strip (The "Stored Sequence") */}
            <div className="h-20 bg-red-900/30 border-b border-yellow-600/20 flex items-center px-4 gap-2 relative">
                 <span className="text-[10px] font-bold text-red-400 uppercase shrink-0 w-12 leading-tight">Lịch sử<br/>đã gọi</span>
                 <div className="h-10 w-px bg-red-800 shrink-0 mx-1"></div>
                 
                 <div ref={historyScrollRef} className="flex-1 flex items-center gap-2 overflow-x-auto scrollbar-hide py-2">
                     {calledNumbers.map((num, i) => (
                         <div key={`${num}-${i}`} className={`
                            w-12 h-12 rounded-full flex items-center justify-center shrink-0 font-bold text-lg border shadow-sm transition-all
                            ${i === 0 ? 'bg-yellow-400 text-red-900 border-yellow-200 scale-110 border-4' : 'bg-red-800 text-red-200 border-red-700'}
                         `}>
                             {num}
                         </div>
                     ))}
                     {calledNumbers.length === 0 && <span className="text-red-500/50 text-sm italic">Chưa có số nào...</span>}
                 </div>
                 <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-red-950 to-transparent pointer-events-none"></div>
            </div>

            {/* LIVE PLAYER STATUS DASHBOARD (Replaces the Grid) */}
            <div className="flex-1 overflow-y-auto p-4 bg-red-950 relative">
                 {/* Winner Banner */}
                 {winners.length > 0 && (
                     <div className="mb-6 bg-yellow-400 rounded-xl p-4 shadow-[0_0_30px_rgba(250,204,21,0.5)] animate-bounce border-4 border-white">
                         <div className="flex items-center justify-center gap-3 text-red-900">
                             <Trophy size={40} />
                             <div>
                                 <h2 className="text-2xl font-black uppercase">Đã có người Kinh!</h2>
                                 <p className="text-lg font-bold">{winners.map(w => w.name).join(', ')}</p>
                             </div>
                         </div>
                     </div>
                 )}

                 {/* Waiting Banner */}
                 {waiters.length > 0 && winners.length === 0 && (
                     <div className="mb-6 bg-orange-500/20 border border-orange-500 rounded-xl p-4 flex items-center justify-between animate-pulse">
                         <div className="flex items-center gap-3">
                             <AlertCircle className="text-orange-400" size={32} />
                             <div>
                                 <h3 className="text-orange-300 font-bold uppercase text-sm">Cảnh báo</h3>
                                 <p className="text-white font-bold text-lg">Có {waiters.length} người đang chờ (còn 1 số)!</p>
                             </div>
                         </div>
                         <div className="flex -space-x-2">
                             {waiters.map(p => (
                                 <div key={p.id} className="w-8 h-8 rounded-full bg-orange-500 border-2 border-red-900 flex items-center justify-center text-xs font-bold text-white" title={p.name}>
                                     {p.name.charAt(0)}
                                 </div>
                             ))}
                         </div>
                     </div>
                 )}

                 {/* Player List / Leaderboard */}
                 <div>
                     <h3 className="text-sm font-bold text-yellow-500 uppercase flex items-center gap-2 mb-3">
                        <Users size={16}/> Trạng thái người chơi ({players.length})
                     </h3>
                     <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {players.sort((a,b) => (a.remaining || 5) - (b.remaining || 5)).map(p => {
                            const remaining = p.remaining !== undefined ? p.remaining : 5;
                            let statusColor = "bg-red-900/50 border-red-800 text-red-200";
                            let statusText = `Còn ${remaining} số`;
                            
                            if (remaining === 0) {
                                statusColor = "bg-yellow-500 text-red-900 border-yellow-400 shadow-lg scale-105 font-bold";
                                statusText = "🏆 ĐÃ KINH!";
                            } else if (remaining === 1) {
                                statusColor = "bg-orange-600 text-white border-orange-500 animate-pulse";
                                statusText = "🔥 Đang chờ!";
                            }

                            return (
                                <div key={p.id} className={`px-4 py-3 rounded-lg border flex justify-between items-center transition-all ${statusColor}`}>
                                    <span className="truncate font-medium">{p.name}</span>
                                    <span className="text-xs uppercase opacity-80">{statusText}</span>
                                </div>
                            );
                        })}
                     </div>
                 </div>
            </div>
        </section>
      </main>
    </div>
  );
};