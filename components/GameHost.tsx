import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Copy, CheckCircle2, XCircle, Trophy, Crown, Flame, Dice5, Sun } from 'lucide-react';
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
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [previousNumber, setPreviousNumber] = useState<number | null>(null);
  const [currentRhyme, setCurrentRhyme] = useState<string>('');
  const [isAuto, setIsAuto] = useState(false);
  const [speed, setSpeed] = useState(4000); 
  const [flash, setFlash] = useState(false);
  const [muted, setMuted] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [winners, setWinners] = useState<PlayerInfo[]>([]);
  const [waiters, setWaiters] = useState<PlayerInfo[]>([]);
  const [roomCode, setRoomCode] = useState<string>('');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const prevWaitersCount = useRef(0);

  useEffect(() => {
    if (historyScrollRef.current) historyScrollRef.current.scrollLeft = 0;
  }, [calledNumbers]);

  const speakCombined = (num: number, rhyme: string) => {
    if (muted || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const prefix = lang === 'vi' ? `Số ${num}.` : `Number ${num}.`;
    const fullText = `${prefix} ... ${rhyme}`;
    const utterance = new SpeechSynthesisUtterance(fullText);
    utterance.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
    utterance.rate = 1.0; 
    window.speechSynthesis.speak(utterance);
  };

  const speakSimple = (text: string) => {
    if (muted || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
    window.speechSynthesis.speak(utterance);
  }

  useEffect(() => {
    const unsubscribeStatus = listenToConnectionStatus(setIsOnline);
    const requestWakeLock = async () => { try { if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch (err) {} };
    requestWakeLock();
    
    if (!isFirebaseConfigured()) return;
    const code = generateShortCode();
    setRoomCode(code);
    const roomRef = ref(database, `rooms/${code}`);
    set(roomRef, { status: 'ACTIVE', currentNumber: null, currentRhyme: "Chào mừng quý vị!", history: [], createdAt: Date.now() });
    onDisconnect(roomRef).update({ status: 'HOST_DISCONNECTED' });
    const playersRef = ref(database, `rooms/${code}/players`);
    const u1 = onValue(playersRef, (snap) => {
        const pList = Object.values(snap.val() || {}) as PlayerInfo[];
        setPlayers(pList);
        const currentWinners = pList.filter(p => p.remaining === 0);
        const currentWaiters = pList.filter(p => p.remaining === 1);
        setWinners(currentWinners);
        setWaiters(currentWaiters);
        if (currentWinners.length > 0) setIsAuto(false);
        if (currentWaiters.length > prevWaitersCount.current) speakSimple("Căng rồi! Có người đang chờ đặc biệt!");
        prevWaitersCount.current = currentWaiters.length;
    });
    const claimsRef = ref(database, `rooms/${code}/claims`);
    const u2 = onValue(claimsRef, (snap) => {
        const claims = Object.values(snap.val() || {}) as any[];
        const latest = claims[claims.length - 1];
        if (latest && Date.now() - latest.timestamp < 5000) setIsAuto(false);
    });
    return () => { if(wakeLockRef.current) wakeLockRef.current.release(); unsubscribeStatus(); u1(); u2(); setIsAuto(false); remove(roomRef); };
  }, []); 

  useEffect(() => {
      if (winners.length > 0 && isAuto) setIsAuto(false);
      if (winners.length > 0) speakSimple(`Kinh rồi! Chúc mừng ${winners.map(w => w.name).join(', ')} đã chiến thắng!`);
  }, [winners.length]);

  const updateGameState = (num: number | null, rhyme: string, hist: number[]) => {
      if (!roomCode) return;
      update(ref(database), { [`rooms/${roomCode}/currentNumber`]: num, [`rooms/${roomCode}/currentRhyme`]: rhyme, [`rooms/${roomCode}/history`]: hist }).catch(console.error);
  };

  const drawNumber = async () => {
    if (winners.length > 0) { setIsAuto(false); return; }
    const available = Array.from({ length: 90 }, (_, i) => i + 1).filter(n => !calledNumbers.includes(n));
    if (available.length === 0) {
      setIsAuto(false);
      const endMsg = "Hết số.";
      setCurrentRhyme(endMsg); speakSimple(endMsg); updateGameState(null, endMsg, calledNumbers);
      return;
    }
    const nextNum = available[Math.floor(Math.random() * available.length)];
    const newHistory = [nextNum, ...calledNumbers];
    setFlash(true); setPreviousNumber(currentNumber); setCurrentNumber(nextNum); setCalledNumbers(newHistory);
    setTimeout(() => setFlash(false), 300);
    let rhyme = "";
    try { rhyme = await generateLotoRhyme(nextNum, lang); } catch { rhyme = `Số ${nextNum}`; }
    setCurrentRhyme(rhyme); speakCombined(nextNum, rhyme); updateGameState(nextNum, rhyme, newHistory);
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isAuto && calledNumbers.length < 90 && winners.length === 0) timer = setTimeout(drawNumber, speed);
    return () => clearTimeout(timer);
  }, [isAuto, calledNumbers, speed, winners.length]);

  const toggleAuto = () => {
      if (winners.length > 0) { alert("Có người thắng rồi!"); return; }
      if (isAuto) setIsAuto(false); else { drawNumber(); setIsAuto(true); }
  };

  const resetGame = () => {
    if (!confirm('Chơi ván mới?')) return;
    setIsAuto(false); setCalledNumbers([]); setCurrentNumber(null); setPreviousNumber(null);
    setWinners([]); setWaiters([]); prevWaitersCount.current = 0; setCurrentRhyme("Chào mừng quý vị!");
    updateGameState(null, "Chào mừng quý vị!", []);
    update(ref(database), { [`rooms/${roomCode}/claims`]: null, [`rooms/${roomCode}/messages`]: null });
  };

  if (!isFirebaseConfigured()) return <div className="p-10 text-white">Chưa cấu hình Firebase</div>;

  return (
    <div className="flex flex-col h-screen bg-stone-50 text-slate-800 overflow-hidden font-sans">
      
      {/* HEADER - White & Red */}
      <header className="h-16 px-6 flex justify-between items-center z-30 shrink-0 bg-white border-b border-red-100 shadow-sm">
         <div className="flex items-center gap-6">
             <div className="flex items-center gap-2 text-red-600 font-black text-xl tracking-tighter">
                <span className="w-8 h-8 bg-red-600 text-white rounded-lg flex items-center justify-center shadow-md">H</span>
                <span>HOST</span>
             </div>
             
             <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-50 border border-red-100 cursor-pointer hover:bg-red-100 transition-colors" onClick={() => navigator.clipboard.writeText(roomCode)}>
                 <span className="text-[10px] text-red-400 font-bold tracking-widest uppercase">MÃ PHÒNG</span>
                 <code className="text-red-700 font-mono font-bold text-lg">{roomCode || '...'}</code>
                 <Copy size={14} className="text-red-400"/>
             </div>
         </div>

         <div className="flex items-center gap-3">
             <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold border ${isOnline ? 'bg-green-100 border-green-200 text-green-700' : 'bg-red-100 border-red-200 text-red-700'}`}>
                {isOnline ? <CheckCircle2 size={12}/> : <XCircle size={12}/>}
                <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
             </div>
             <div className="h-6 w-px bg-slate-200 mx-2"></div>
             <button onClick={() => setMuted(!muted)} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 transition-colors">{muted ? <VolumeX size={18}/> : <Volume2 size={18}/>}</button>
             <button onClick={resetGame} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 transition-colors"><RotateCcw size={18}/></button>
             <button onClick={onExit} className="ml-2 px-4 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg font-bold text-xs uppercase shadow-sm">Thoát</button>
         </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        
        {/* LEFT: STAGE (35%) - Bright Red/Orange Gradient */}
        <section className="w-[35%] lg:w-[30%] border-r border-red-100 flex flex-col relative bg-white">
            <div className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden">
                {/* Decorative Sunburst */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-orange-100/50 rounded-full blur-3xl -z-10"></div>

                {/* CURRENT NUMBER ORB - Bright Red/Gold */}
                <div onClick={isAuto ? () => setIsAuto(false) : drawNumber} className="relative group cursor-pointer z-10 transition-transform active:scale-95">
                    {/* Ring */}
                    <div className="absolute inset-[-15px] border-2 border-dashed border-orange-300 rounded-full animate-[spin_20s_linear_infinite]"></div>
                    
                    {/* The Orb */}
                    <div className={`
                        relative w-56 h-56 rounded-full
                        bg-gradient-to-br from-red-500 via-orange-500 to-yellow-500
                        flex items-center justify-center shadow-[0_10px_30px_rgba(249,115,22,0.4)]
                        border-4 border-white
                        transition-all duration-200
                        ${flash ? 'scale-105 brightness-110' : 'hover:scale-105'}
                    `}>
                        {currentNumber ? (
                            <span className="text-[120px] leading-none font-black text-white ball-pop drop-shadow-md">
                                {currentNumber}
                            </span>
                        ) : (
                            <div className="flex flex-col items-center gap-2 text-white/80">
                                <Dice5 size={64} />
                                <span className="text-sm uppercase tracking-widest font-bold">Bắt đầu</span>
                            </div>
                        )}
                        {/* Shine */}
                        <div className="absolute top-6 left-6 w-16 h-16 bg-white opacity-20 rounded-full blur-xl"></div>
                    </div>
                </div>

                {/* Rhyme Card */}
                <div className="mt-10 w-full px-6 z-10">
                    <div className="bg-white rounded-2xl p-5 text-center shadow-lg border border-red-100 relative">
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-400 text-red-800 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm">
                            MC Đang Đọc
                        </div>
                        <p className="text-xl text-slate-700 font-medium italic mt-2 font-serif leading-relaxed">
                           "{currentRhyme || '...'}"
                        </p>
                    </div>
                </div>
            </div>

            {/* Previous Number */}
            <div className="h-16 border-t border-slate-100 bg-slate-50 flex items-center justify-between px-6">
                <span className="text-[10px] uppercase text-slate-400 font-bold tracking-widest">Số trước</span>
                <span className="text-2xl font-bold text-slate-600 font-mono bg-white px-3 py-1 rounded shadow-sm border border-slate-200">{previousNumber || '--'}</span>
            </div>
        </section>

        {/* RIGHT: DASHBOARD (65%) - Light Grey/Cream */}
        <section className="flex-1 flex flex-col bg-stone-50 relative overflow-hidden">
            
            {/* Control Bar */}
            <div className="h-20 px-8 flex items-center justify-between bg-white border-b border-slate-200 shadow-sm z-10">
                 <div className="flex flex-col w-1/3">
                     <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider mb-2 text-slate-500">
                        <span>Tốc độ đọc</span>
                        <span className="text-red-500">{speed/1000}s</span>
                     </div>
                     <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                         <input type="range" min="3000" max="8000" step="500" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full h-full opacity-0 cursor-pointer absolute z-10" />
                         <div className="h-full bg-red-500 rounded-full" style={{width: `${((speed-3000)/5000)*100}%`}}></div>
                     </div>
                 </div>
                 
                 <button 
                    onClick={toggleAuto}
                    className={`h-12 px-8 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center gap-3 shadow-md transform active:scale-95
                    ${isAuto 
                        ? 'bg-white text-red-500 border-2 border-red-500 animate-pulse' 
                        : 'bg-red-600 text-white hover:bg-red-700'}`}
                 >
                    {isAuto ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>}
                    {isAuto ? 'Tạm Dừng' : 'Tự Động Quay'}
                 </button>
            </div>

            {/* History Strip - Bright */}
            <div className="h-24 bg-white border-b border-slate-200 flex items-center px-6 gap-6 overflow-hidden">
                 <div className="flex flex-col justify-center shrink-0 border-r border-slate-200 pr-6">
                    <span className="text-3xl font-black text-slate-800">{calledNumbers.length}</span>
                    <span className="text-[9px] text-slate-400 uppercase tracking-widest">Đã gọi</span>
                 </div>
                 
                 <div ref={historyScrollRef} className="flex-1 flex items-center gap-2 overflow-x-auto scrollbar-hide py-4">
                     {calledNumbers.map((num, i) => (
                         <div key={`${num}-${i}`} className={`
                            flex items-center justify-center shrink-0 font-bold rounded-lg text-lg transition-all
                            ${i === 0 
                                ? 'w-14 h-14 bg-yellow-400 text-red-800 shadow-lg scale-105 border-2 border-white' 
                                : 'w-10 h-10 bg-slate-100 text-slate-500 border border-slate-200'}
                         `}>
                             {num}
                         </div>
                     ))}
                 </div>
            </div>

            {/* Dashboard Content */}
            <div className="flex-1 overflow-y-auto p-8 pattern-grid">
                 {/* Winners */}
                 {winners.length > 0 && (
                     <div className="mb-8 p-1 rounded-2xl bg-gradient-to-r from-yellow-300 to-red-500 shadow-xl">
                        <div className="bg-white rounded-xl p-6 flex items-center gap-6 relative overflow-hidden">
                            <div className="p-4 bg-yellow-100 rounded-full text-yellow-600 animate-bounce">
                                <Crown size={32} fill="currentColor" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-red-600 uppercase tracking-tight mb-1">Chiến Thắng!</h2>
                                <p className="text-lg text-slate-700 font-medium">Chúc mừng: <span className="text-red-600 font-bold text-xl">{winners.map(w => w.name).join(', ')}</span></p>
                            </div>
                            <div className="absolute right-0 bottom-0 opacity-10 text-red-500">
                                <Sun size={120} />
                            </div>
                        </div>
                     </div>
                 )}

                 {/* Waiting */}
                 {waiters.length > 0 && winners.length === 0 && (
                     <div className="mb-6 bg-white border-l-4 border-orange-500 rounded-r-xl p-5 shadow-sm flex items-center justify-between">
                         <div className="flex items-center gap-4">
                            <div className="p-3 bg-orange-100 rounded-full text-orange-600 animate-pulse">
                                <Flame size={24} />
                            </div>
                            <div>
                                <h3 className="text-orange-500 font-bold uppercase text-xs tracking-widest mb-1">Đang chờ đặc biệt</h3>
                                <p className="text-slate-700 text-lg font-medium"><span className="text-orange-600 font-bold text-2xl">{waiters.length}</span> người chờ 1 số</p>
                            </div>
                         </div>
                         <div className="flex -space-x-2">
                            {waiters.map(p => (
                                <div key={p.id} className="w-10 h-10 rounded-full bg-white border-2 border-orange-200 flex items-center justify-center text-xs text-orange-600 font-bold shadow-sm">
                                    {p.name.charAt(0)}
                                </div>
                            ))}
                         </div>
                     </div>
                 )}

                 {/* Grid */}
                 <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 ml-1">Người chơi ({players.length})</h3>
                 
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {players.sort((a,b) => (a.remaining || 6) - (b.remaining || 6)).map(p => {
                        const remaining = p.remaining !== undefined ? p.remaining : 6;
                        
                        if (remaining === 0) {
                            return (
                                <div key={p.id} className="p-4 rounded-xl bg-yellow-400 text-red-800 font-bold flex justify-between items-center shadow-lg transform scale-105">
                                    <div className="flex items-center gap-3">
                                        <Trophy size={16} /> {p.name}
                                    </div>
                                    <span className="text-[10px] bg-white/30 px-2 py-1 rounded">THẮNG</span>
                                </div>
                            )
                        }

                        return (
                            <div key={p.id} className={`p-4 rounded-xl border flex justify-between items-center transition-all shadow-sm ${remaining === 1 ? 'bg-orange-50 border-orange-200 text-orange-800' : 'bg-white border-slate-100 text-slate-600 hover:border-red-200'}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-2.5 h-2.5 rounded-full ${remaining === 1 ? 'bg-orange-500 animate-pulse' : 'bg-slate-300'}`}></div>
                                    <span className="truncate text-sm font-bold">{p.name}</span>
                                </div>
                                <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${remaining === 1 ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-400'}`}>
                                    -{remaining}
                                </span>
                            </div>
                        );
                    })}
                 </div>
            </div>
        </section>
      </main>
    </div>
  );
};