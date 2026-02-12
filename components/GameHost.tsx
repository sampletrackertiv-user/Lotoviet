import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Copy, CheckCircle2, XCircle, Trophy, Crown, Flame, Dice5, Sun, LogOut, Users, MessageCircle, Grid3X3, Zap, Settings, Mic, WifiOff } from 'lucide-react';
import { generateLotoRhyme } from '../services/geminiService';
import { Language, PlayerInfo, TicketData, ChatMessage } from '../types';
import { database, isFirebaseConfigured, listenToConnectionStatus } from '../services/firebase';
import { ref, set, onValue, update, remove, onDisconnect, push } from "firebase/database";
import { ChatOverlay } from './ChatOverlay';
import { TicketView } from './TicketView';
import { EmojiSystem } from './EmojiSystem';

interface GameHostProps {
  onExit: () => void;
  lang: Language;
}

const generateShortCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// Helper: Generate 15-row ticket for Host (same as Player)
const generateHostTicket = (): TicketData => {
  const TOTAL_ROWS = 15;
  const NUMS_PER_ROW = 4;
  const ticket: TicketData = Array(TOTAL_ROWS).fill(null).map(() => Array(9).fill({ value: null, marked: false }));
  const colRanges = [
    { min: 1, max: 9 }, { min: 10, max: 19 }, { min: 20, max: 29 },
    { min: 30, max: 39 }, { min: 40, max: 49 }, { min: 50, max: 59 },
    { min: 60, max: 69 }, { min: 70, max: 79 }, { min: 80, max: 90 }
  ];
  for (let r = 0; r < TOTAL_ROWS; r++) {
    const availableCols = [0,1,2,3,4,5,6,7,8].sort(() => 0.5 - Math.random()).slice(0, NUMS_PER_ROW);
    availableCols.forEach(c => {
      const range = colRanges[c];
      let num = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
      let unique = false;
      let attempts = 0;
      while(!unique && attempts < 10) {
         unique = true;
         for(let checkR = Math.max(0, r-2); checkR < r; checkR++) {
             if (ticket[checkR][c].value === num) unique = false;
         }
         if(!unique) num = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
         attempts++;
      }
      ticket[r][c] = { value: num, marked: false };
    });
  }
  return ticket;
};

export const GameHost: React.FC<GameHostProps> = ({ onExit, lang }) => {
  // Game State
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [displayNumber, setDisplayNumber] = useState<number | null>(null);
  const [previousNumber, setPreviousNumber] = useState<number | null>(null);
  const [currentRhyme, setCurrentRhyme] = useState<string>('');
  const [isAuto, setIsAuto] = useState(false);
  const [speed, setSpeed] = useState(6000);
  const [flash, setFlash] = useState(false);
  const [muted, setMuted] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [winners, setWinners] = useState<PlayerInfo[]>([]);
  const [waiters, setWaiters] = useState<PlayerInfo[]>([]);
  const [roomCode, setRoomCode] = useState<string>('');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  
  // UI Tabs State
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'CHAT' | 'TICKET'>('DASHBOARD');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);

  // Host as Player State
  const [hostTicket, setHostTicket] = useState<TicketData | null>(null);
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null);

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const prevWaitersCount = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (historyScrollRef.current) historyScrollRef.current.scrollLeft = 0;
  }, [calledNumbers]);

  const playClickSound = () => {
    if (muted) return;
    if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  };

  const speakCombined = (num: number, rhyme: string) => {
    if (muted || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    
    // Logic thay đổi: Nếu là tiếng Việt thì chỉ đọc rhyme (đã có số ở cuối), 
    // nếu tiếng Anh thì đọc "Number X" trước.
    const fullText = lang === 'vi' ? rhyme : `Number ${num}. ... ${rhyme}`;
    
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

  // --- INIT GAME & LISTENERS ---
  useEffect(() => {
    const unsubscribeStatus = listenToConnectionStatus(setIsOnline);
    const requestWakeLock = async () => { try { if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch (err) {} };
    requestWakeLock();
    
    if (!isFirebaseConfigured()) return;
    const code = generateShortCode();
    setRoomCode(code);
    
    // Create Room
    const roomRef = ref(database, `rooms/${code}`);
    set(roomRef, { status: 'ACTIVE', currentNumber: null, currentRhyme: "Chào mừng quý vị!", history: [], createdAt: Date.now() });
    onDisconnect(roomRef).update({ status: 'HOST_DISCONNECTED' });
    
    // Listen to Players
    const playersRef = ref(database, `rooms/${code}/players`);
    const u1 = onValue(playersRef, (snap) => {
        const rawData = snap.val();
        if (!rawData) {
            setPlayers([]); setWinners([]); setWaiters([]); return;
        }
        const pList = Object.values(rawData)
            .filter((p: any) => p && p.name && typeof p.name === 'string' && p.name.trim() !== '')
            .map((p: any) => p as PlayerInfo);
            
        setPlayers(pList);
        
        const currentWinners = pList.filter(p => p.remaining === 0);
        const currentWaiters = pList.filter(p => p.remaining === 1);
        setWinners(currentWinners);
        setWaiters(currentWaiters);
        
        if (currentWinners.length > 0) setIsAuto(false);
        if (currentWaiters.length > prevWaitersCount.current) speakSimple("Căng rồi! Có người đang chờ đặc biệt!");
        prevWaitersCount.current = currentWaiters.length;
    });

    // Listen to Claims (Win signals)
    const claimsRef = ref(database, `rooms/${code}/claims`);
    const u2 = onValue(claimsRef, (snap) => {
        const claims = Object.values(snap.val() || {}) as any[];
        const latest = claims[claims.length - 1];
        if (latest && Date.now() - latest.timestamp < 5000) setIsAuto(false);
    });

    // Listen to Chat
    const msgRef = ref(database, `rooms/${code}/messages`);
    const u3 = onValue(msgRef, (snap) => {
         const data = snap.val();
         if (data) {
             const msgs = Object.entries(data).map(([key, val]: [string, any]) => ({
                 ...val,
                 id: key
             })) as ChatMessage[];
             msgs.sort((a,b) => a.id.localeCompare(b.id));
             setMessages(msgs);
             if (activeTab !== 'CHAT') setUnreadMsgCount(prev => prev + 1);
         } else setMessages([]);
    });

    return () => { if(wakeLockRef.current) wakeLockRef.current.release(); unsubscribeStatus(); u1(); u2(); u3(); setIsAuto(false); remove(roomRef); };
  }, []); 

  // Reset unread count when viewing chat
  useEffect(() => {
      if (activeTab === 'CHAT') setUnreadMsgCount(0);
  }, [activeTab]);

  useEffect(() => {
      if (winners.length > 0 && isAuto) setIsAuto(false);
      if (winners.length > 0) speakSimple(`Kinh rồi! Chúc mừng ${winners.map(w => w.name).join(', ')} đã chiến thắng!`);
  }, [winners.length]);

  // --- GAME LOGIC ---
  const updateGameState = (num: number | null, rhyme: string, hist: number[]) => {
      if (!roomCode) return;
      update(ref(database), { [`rooms/${roomCode}/currentNumber`]: num, [`rooms/${roomCode}/currentRhyme`]: rhyme, [`rooms/${roomCode}/history`]: hist }).catch(console.error);
  };

  const drawNumber = async () => {
    if (winners.length > 0) { setIsAuto(false); return; }
    if (isSpinning) return;

    const available = Array.from({ length: 90 }, (_, i) => i + 1).filter(n => !calledNumbers.includes(n));
    if (available.length === 0) {
      setIsAuto(false);
      const endMsg = "Hết số.";
      setCurrentRhyme(endMsg); speakSimple(endMsg); updateGameState(null, endMsg, calledNumbers);
      return;
    }

    setIsSpinning(true);
    setCurrentRhyme("Đang quay...");
    
    const nextNum = available[Math.floor(Math.random() * available.length)];
    let rhyme = "";
    try { rhyme = await generateLotoRhyme(nextNum, lang); } catch { rhyme = `Số ${nextNum}`; }

    let spinTime = 0;
    const maxSpinTime = 1200; 
    const spinInterval = setInterval(() => {
        spinTime += 60;
        const randomDisplay = Math.floor(Math.random() * 90) + 1;
        setDisplayNumber(randomDisplay);
        playClickSound();

        if (spinTime >= maxSpinTime) {
            clearInterval(spinInterval);
            finishDraw(nextNum, rhyme);
        }
    }, 60);
  };

  const finishDraw = (nextNum: number, rhyme: string) => {
    setIsSpinning(false);
    const newHistory = [nextNum, ...calledNumbers];
    setFlash(true); 
    setPreviousNumber(currentNumber); 
    setCurrentNumber(nextNum); 
    setDisplayNumber(nextNum);
    setCalledNumbers(newHistory);
    
    setTimeout(() => setFlash(false), 500);
    
    setCurrentRhyme(rhyme); 
    speakCombined(nextNum, rhyme); 
    updateGameState(nextNum, rhyme, newHistory);
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isAuto && calledNumbers.length < 90 && winners.length === 0 && !isSpinning) {
        timer = setTimeout(drawNumber, speed);
    }
    return () => clearTimeout(timer);
  }, [isAuto, calledNumbers, speed, winners.length, isSpinning]);

  // --- HOST PLAYING LOGIC ---
  const joinAsHostPlayer = () => {
      if (!roomCode) return;
      const ticket = generateHostTicket();
      setHostTicket(ticket);
      const newRef = push(ref(database, `rooms/${roomCode}/players`));
      const pid = newRef.key as string;
      setHostPlayerId(pid);
      set(newRef, { id: pid, name: "👑 HOST", joinedAt: Date.now(), remaining: 4, isOnline: true });
      // Change: Update to offline instead of remove
      onDisconnect(newRef).update({ isOnline: false });
      speakSimple("Host đã tham gia cuộc chơi!");
  };

  useEffect(() => {
      if (!hostTicket || !hostPlayerId) return;
      let ticketChanged = false;
      const newTicket = hostTicket.map(row => row.map(cell => {
           if (cell.value !== null && calledNumbers.includes(cell.value) && !cell.marked) {
               ticketChanged = true;
               return { ...cell, marked: true };
           }
           return cell;
      }));

      if (ticketChanged) {
          setHostTicket(newTicket);
          let minRemaining = 4;
          let isRowWin = false;
          newTicket.forEach(row => {
              const count = row.filter(c => c.value !== null && !c.marked).length;
              if (count < minRemaining) minRemaining = count;
              if (count === 0) isRowWin = true;
          });
          
          update(ref(database, `rooms/${roomCode}/players/${hostPlayerId}`), { remaining: minRemaining });
          if (isRowWin) {
             push(ref(database, `rooms/${roomCode}/claims`), { playerId: hostPlayerId, playerName: "👑 HOST", timestamp: Date.now() });
          }
      }
  }, [calledNumbers]); 

  // --- ACTIONS ---
  const toggleAuto = () => {
      if (winners.length > 0) { alert("Có người thắng rồi!"); return; }
      if (isAuto) setIsAuto(false); else { drawNumber(); setIsAuto(true); }
  };

  const resetGame = () => {
    if (!confirm('Chơi ván mới?')) return;
    setIsAuto(false); setCalledNumbers([]); setCurrentNumber(null); setDisplayNumber(null); setPreviousNumber(null);
    setWinners([]); setWaiters([]); prevWaitersCount.current = 0; setCurrentRhyme("Chào mừng quý vị!");
    if (hostPlayerId) {
        const newTicket = generateHostTicket();
        setHostTicket(newTicket);
        update(ref(database, `rooms/${roomCode}/players/${hostPlayerId}`), { remaining: 4 });
    }
    updateGameState(null, "Chào mừng quý vị!", []);
    update(ref(database), { [`rooms/${roomCode}/claims`]: null, [`rooms/${roomCode}/messages`]: null, [`rooms/${roomCode}/reactions`]: null });
  };

  const handleHostSendMessage = (text: string) => {
      if (!roomCode) return;
      const newMsgRef = push(ref(database, `rooms/${roomCode}/messages`));
      set(newMsgRef, { id: Date.now().toString(), sender: "👑 HOST", text: text, isSystem: false });
  };

  if (!isFirebaseConfigured()) return <div className="p-10 text-slate-800">Chưa cấu hình Firebase</div>;

  return (
    <div className="flex flex-col h-screen bg-[#f3f4f6] text-slate-800 font-sans overflow-hidden">
      
      {/* APP HEADER */}
      <header className="h-14 px-4 flex justify-between items-center bg-white border-b border-slate-100 shrink-0 z-50">
         <div className="flex items-center gap-2">
             <div onClick={() => navigator.clipboard.writeText(roomCode)} className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 cursor-pointer transition-colors group">
                 <div className="flex flex-col items-start leading-none">
                     <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">MÃ PHÒNG</span>
                     <span className="text-red-600 font-mono font-black text-base">{roomCode}</span>
                 </div>
                 <Copy size={14} className="text-slate-400 group-hover:text-red-500"/>
             </div>
         </div>

         <div className="flex items-center gap-2">
             <button onClick={() => setMuted(!muted)} className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${muted ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
                {muted ? <VolumeX size={18}/> : <Volume2 size={18}/>}
             </button>
             <button onClick={resetGame} className="w-9 h-9 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-full text-slate-600 transition-colors">
                <RotateCcw size={18}/>
             </button>
             <button onClick={onExit} className="bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full font-bold text-xs hover:bg-slate-50 flex items-center gap-1 shadow-sm">
                <LogOut size={14} /> <span className="hidden sm:inline">Thoát</span>
             </button>
         </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <EmojiSystem roomCode={roomCode} senderName="👑 HOST" />
        
        {/* LEFT: STAGE */}
        <section className="flex-none md:w-[40%] bg-white border-b md:border-b-0 md:border-r border-slate-100 flex flex-col items-center justify-between p-4 relative z-10">
            <div className={`absolute top-4 left-4 flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold border ${isOnline ? 'bg-green-50 border-green-200 text-green-600' : 'bg-red-50 border-red-200 text-red-600'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </div>

            {/* Spinner Area */}
            <div className="flex-1 flex flex-col items-center justify-center w-full min-h-[250px] relative">
                
                <div onClick={isAuto ? () => setIsAuto(false) : drawNumber} className={`relative group cursor-pointer active:scale-95 transition-all ${isSpinning ? 'pointer-events-none' : ''}`}>
                    {/* Decorative Ring */}
                    <div className="absolute inset-0 rounded-full border-[6px] border-red-100 animate-[spin_10s_linear_infinite]"></div>
                    <div className="absolute inset-0 rounded-full border-[6px] border-t-red-500 border-r-transparent border-b-transparent border-l-transparent animate-[spin_3s_linear_infinite] opacity-50"></div>
                    
                    <div className={`
                        relative w-56 h-56 rounded-full
                        bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)]
                        flex items-center justify-center
                        border-8 border-slate-50
                        transition-all duration-300
                        ${flash ? 'scale-105 border-red-100' : ''}
                    `}>
                        {displayNumber ? (
                            <span className={`text-[110px] leading-none font-black text-slate-800 tracking-tighter ball-pop ${isSpinning ? 'blur-sm opacity-50' : ''}`}>
                                {displayNumber}
                            </span>
                        ) : (
                            <div className="flex flex-col items-center gap-2 text-slate-300">
                                <Dice5 size={64} strokeWidth={1.5} />
                                <span className="text-xs font-bold uppercase tracking-widest">Bấm để quay</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-8 text-center px-4">
                     <h3 className="text-xl font-bold text-slate-800 leading-tight">
                        {currentRhyme || "Sẵn sàng..."}
                     </h3>
                     {previousNumber && <p className="text-sm text-slate-400 mt-2 font-medium">Số trước: <span className="text-slate-600 font-bold">{previousNumber}</span></p>}
                </div>
            </div>

            {/* Controls */}
            <div className="w-full max-w-sm space-y-4">
                 <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl">
                     <span className="text-[10px] font-bold text-slate-400 uppercase w-10">Chậm</span>
                     <input type="range" min="4000" max="9000" step="500" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600" />
                     <span className="text-[10px] font-bold text-slate-400 uppercase w-10 text-right">Nhanh</span>
                 </div>

                 <button 
                    onClick={toggleAuto}
                    className={`w-full py-4 rounded-2xl font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm transition-all
                    ${isAuto 
                        ? 'bg-red-50 text-red-600 border border-red-200' 
                        : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                 >
                    {isAuto ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}
                    {isAuto ? 'Dừng Tự Động' : 'Quay Tự Động'}
                 </button>
            </div>
        </section>

        {/* RIGHT: TABS & CONTENT - CHANGED: bg-[#f9fafb] to bg-transparent */}
        <section className="flex-1 flex flex-col bg-transparent overflow-hidden relative z-10">
            
            {/* History Ribbon */}
            <div className="h-14 bg-white border-b border-slate-100 flex items-center px-4 overflow-hidden shrink-0">
                 <span className="text-[10px] font-bold text-slate-400 mr-2 shrink-0 uppercase tracking-wider">Đã gọi:</span>
                 <div ref={historyScrollRef} className="flex-1 flex items-center gap-2 overflow-x-auto scrollbar-hide">
                     {calledNumbers.map((num, i) => (
                         <div key={`${num}-${i}`} className={`
                            w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                            ${i === 0 
                                ? 'bg-red-600 text-white shadow-md scale-110' 
                                : 'bg-slate-100 text-slate-500'}
                         `}>
                             {num}
                         </div>
                     ))}
                 </div>
            </div>

            {/* TABS HEADER */}
            <div className="flex p-2 gap-2">
                <button onClick={() => setActiveTab('DASHBOARD')} className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${activeTab === 'DASHBOARD' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:bg-white/50'}`}>
                    <Users size={16} /> Người Chơi <span className="bg-slate-100 text-slate-600 px-1.5 rounded-md text-[10px]">{players.length}</span>
                </button>
                <button onClick={() => setActiveTab('CHAT')} className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all relative ${activeTab === 'CHAT' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:bg-white/50'}`}>
                    <MessageCircle size={16} /> Chat
                    {unreadMsgCount > 0 && <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-red-500 border border-white"></span>}
                </button>
                <button onClick={() => setActiveTab('TICKET')} className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${activeTab === 'TICKET' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:bg-white/50'}`}>
                    <Grid3X3 size={16} /> Vé Host
                </button>
            </div>

            {/* TAB CONTENT */}
            <div className="flex-1 overflow-hidden relative px-2 pb-2">
                 <div className="absolute inset-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                     {/* DASHBOARD TAB */}
                     {activeTab === 'DASHBOARD' && (
                        <div className="h-full overflow-y-auto p-4 animate-in fade-in">
                            {winners.length > 0 && (
                                <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-yellow-300 to-orange-400 text-white shadow-lg flex items-center gap-4">
                                    <div className="p-3 bg-white/20 rounded-full backdrop-blur">
                                        <Crown size={24} fill="currentColor" />
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-bold uppercase opacity-90">Người chiến thắng</h2>
                                        <p className="text-lg font-black">{winners.map(w => w.name).join(', ')}</p>
                                    </div>
                                </div>
                            )}
                            
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-bold text-slate-700">Danh sách tham gia</h3>
                                {waiters.length > 0 && <span className="text-xs font-bold text-orange-500 bg-orange-50 px-2 py-1 rounded-lg">{waiters.length} người chờ đặc biệt</span>}
                            </div>

                            <div className="space-y-2">
                                {players.sort((a,b) => (a.remaining || 6) - (b.remaining || 6)).map(p => {
                                    const remaining = p.remaining !== undefined ? p.remaining : 4;
                                    const isWin = remaining === 0;
                                    const isOffline = p.isOnline === false; // Explicit check for false, undefined assumes true/legacy
                                    
                                    return (
                                        <div key={p.id} className={`p-3 rounded-xl border flex justify-between items-center ${isWin ? 'bg-yellow-50 border-yellow-200' : 'bg-slate-50 border-slate-100'} ${isOffline ? 'opacity-50 grayscale' : ''}`}>
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${isWin ? 'bg-yellow-400 text-yellow-900' : 'bg-white border border-slate-200 text-slate-500'}`}>
                                                    {p.name.charAt(0)}
                                                </div>
                                                <div className="flex flex-col overflow-hidden">
                                                    <span className={`text-sm font-bold truncate ${isWin ? 'text-yellow-700' : 'text-slate-700'}`}>{p.name}</span>
                                                    {isOffline && <span className="text-[9px] text-slate-400 font-bold uppercase">Mất kết nối</span>}
                                                </div>
                                            </div>
                                            
                                            {isWin ? (
                                                <Trophy size={18} className="text-yellow-500" />
                                            ) : (
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[10px] text-slate-400 uppercase font-bold mr-1">Còn</span>
                                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${remaining === 1 ? 'bg-orange-500 text-white animate-pulse' : 'bg-white border border-slate-200 text-slate-600'}`}>
                                                        {remaining}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                     )}

                     {/* CHAT TAB */}
                     {activeTab === 'CHAT' && (
                        <div className="h-full animate-in fade-in flex flex-col">
                            <ChatOverlay messages={messages} onSendMessage={handleHostSendMessage} playerName="👑 HOST" />
                        </div>
                     )}

                     {/* TICKET TAB */}
                     {activeTab === 'TICKET' && (
                        <div className="h-full overflow-y-auto p-4 animate-in fade-in flex flex-col items-center justify-center">
                            {!hostPlayerId ? (
                                <div className="text-center p-6">
                                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 mx-auto mb-4">
                                        <TicketView ticket={[]} interactive={false} /> {/* Dummy Icon essentially */}
                                        <Grid3X3 size={32} />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-800 mb-2">Tham gia chơi</h3>
                                    <p className="text-slate-500 text-sm mb-6 max-w-xs mx-auto">Host có thể tạo vé và chơi cùng mọi người. Hệ thống sẽ tự động dò số.</p>
                                    <button onClick={joinAsHostPlayer} className="bg-slate-900 text-white px-6 py-3 rounded-full font-bold shadow-lg hover:bg-slate-800 transition-colors">
                                        Tạo Vé Ngay
                                    </button>
                                </div>
                            ) : (
                                <div className="w-full h-full flex flex-col">
                                    <div className="mb-4 flex items-center justify-between bg-green-50 p-3 rounded-xl border border-green-100">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                            <span className="text-xs font-bold text-green-700">Đang tự động dò</span>
                                        </div>
                                        <span className="text-[10px] font-bold uppercase text-green-600 tracking-wider">Vé của Host</span>
                                    </div>
                                    {hostTicket && <TicketView ticket={hostTicket} interactive={false} />}
                                </div>
                            )}
                        </div>
                     )}
                 </div>
            </div>
        </section>
      </main>
    </div>
  );
};