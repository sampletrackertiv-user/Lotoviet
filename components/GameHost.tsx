import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Copy, CheckCircle2, XCircle, Trophy, Crown, Flame, Dice5, Sun, LogOut, Users, MessageCircle, Grid3X3, Zap } from 'lucide-react';
import { generateLotoRhyme } from '../services/geminiService';
import { Language, PlayerInfo, TicketData, ChatMessage } from '../types';
import { database, isFirebaseConfigured, listenToConnectionStatus } from '../services/firebase';
import { ref, set, onValue, update, remove, onDisconnect, push } from "firebase/database";
import { ChatOverlay } from './ChatOverlay';
import { TicketView } from './TicketView';

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
             const msgs = Object.values(data) as ChatMessage[];
             msgs.sort((a,b) => Number(a.id) - Number(b.id));
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

  // --- HOST PLAYING LOGIC ---
  const joinAsHostPlayer = () => {
      if (!roomCode) return;
      const ticket = generateHostTicket();
      setHostTicket(ticket);
      const newRef = push(ref(database, `rooms/${roomCode}/players`));
      const pid = newRef.key as string;
      setHostPlayerId(pid);
      set(newRef, { id: pid, name: "👑 HOST", joinedAt: Date.now(), remaining: 4 });
      onDisconnect(newRef).remove();
      speakSimple("Host đã tham gia cuộc chơi!");
  };

  // Sync Host Ticket (Auto Mark)
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
  }, [calledNumbers]); // Depend on calledNumbers to update immediately

  // --- ACTIONS ---
  const toggleAuto = () => {
      if (winners.length > 0) { alert("Có người thắng rồi!"); return; }
      if (isAuto) setIsAuto(false); else { drawNumber(); setIsAuto(true); }
  };

  const resetGame = () => {
    if (!confirm('Chơi ván mới?')) return;
    setIsAuto(false); setCalledNumbers([]); setCurrentNumber(null); setPreviousNumber(null);
    setWinners([]); setWaiters([]); prevWaitersCount.current = 0; setCurrentRhyme("Chào mừng quý vị!");
    
    // Reset Host Ticket if playing
    if (hostPlayerId) {
        const newTicket = generateHostTicket();
        setHostTicket(newTicket);
        update(ref(database, `rooms/${roomCode}/players/${hostPlayerId}`), { remaining: 4 });
    }

    updateGameState(null, "Chào mừng quý vị!", []);
    update(ref(database), { [`rooms/${roomCode}/claims`]: null, [`rooms/${roomCode}/messages`]: null });
  };

  const handleHostSendMessage = (text: string) => {
      if (!roomCode) return;
      const newMsgRef = push(ref(database, `rooms/${roomCode}/messages`));
      set(newMsgRef, { id: Date.now().toString(), sender: "👑 HOST", text: text, isSystem: false });
  };

  if (!isFirebaseConfigured()) return <div className="p-10 text-white">Chưa cấu hình Firebase</div>;

  return (
    <div className="flex flex-col h-screen bg-stone-50 text-slate-800 font-sans overflow-hidden">
      
      {/* HEADER */}
      <header className="h-14 px-4 flex justify-between items-center shrink-0 bg-white border-b border-red-100 shadow-sm z-50">
         <div className="flex items-center gap-2">
             <div onClick={() => navigator.clipboard.writeText(roomCode)} className="flex flex-col items-start bg-red-50 px-3 py-1 rounded-lg border border-red-100 cursor-pointer active:scale-95 transition-transform">
                 <span className="text-[9px] text-red-400 font-bold uppercase">MÃ PHÒNG</span>
                 <div className="flex items-center gap-1">
                    <code className="text-red-700 font-mono font-black text-lg leading-none">{roomCode}</code>
                    <Copy size={12} className="text-red-400"/>
                 </div>
             </div>
         </div>

         <div className="flex items-center gap-2">
             <button onClick={() => setMuted(!muted)} className="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 transition-colors">
                {muted ? <VolumeX size={20}/> : <Volume2 size={20}/>}
             </button>
             <button onClick={resetGame} className="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 transition-colors">
                <RotateCcw size={20}/>
             </button>
             <button onClick={onExit} className="bg-red-600 text-white px-4 py-2 rounded-full font-bold text-sm shadow hover:bg-red-700 flex items-center gap-1">
                <LogOut size={16} /> Thoát
             </button>
         </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* LEFT: STAGE */}
        <section className="flex-none md:w-[35%] lg:w-[30%] bg-gradient-to-b from-white to-red-50 border-b md:border-b-0 md:border-r border-red-100 flex flex-col items-center p-4 gap-4 relative">
            <div className={`absolute top-4 left-4 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border ${isOnline ? 'bg-green-100 border-green-200 text-green-700' : 'bg-red-100 border-red-200 text-red-700'}`}>
                {isOnline ? <CheckCircle2 size={10}/> : <XCircle size={10}/>}
                <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center w-full min-h-[220px]">
                <div onClick={isAuto ? () => setIsAuto(false) : drawNumber} className="relative group cursor-pointer transition-transform active:scale-95">
                    <div className="absolute inset-0 bg-yellow-400 rounded-full blur-xl opacity-20 animate-pulse"></div>
                    <div className={`
                        relative w-48 h-48 rounded-full
                        bg-gradient-to-br from-red-500 to-orange-500
                        flex items-center justify-center shadow-xl
                        border-4 border-white ring-4 ring-red-100
                        transition-all duration-200
                        ${flash ? 'scale-105 brightness-110' : ''}
                    `}>
                        {currentNumber ? (
                            <span className="text-[100px] leading-none font-black text-white ball-pop drop-shadow-md">
                                {currentNumber}
                            </span>
                        ) : (
                            <div className="flex flex-col items-center gap-1 text-white/90">
                                <Dice5 size={48} />
                                <span className="text-xs uppercase font-bold">Bấm để quay</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-4 bg-white/80 backdrop-blur border border-red-100 px-4 py-2 rounded-xl text-center shadow-sm max-w-[90%]">
                    <p className="text-slate-800 text-lg font-medium italic font-serif leading-snug">
                        "{currentRhyme || '...'}"
                    </p>
                </div>
            </div>

            <div className="w-full flex items-center justify-between px-4 py-2 bg-white rounded-lg border border-slate-200">
                <span className="text-xs text-slate-400 font-bold uppercase">Số trước</span>
                <span className="text-2xl font-bold text-slate-600">{previousNumber || '--'}</span>
            </div>
        </section>

        {/* RIGHT: TABS & CONTENT */}
        <section className="flex-1 flex flex-col bg-stone-50 overflow-hidden">
            
            {/* Control Strip */}
            <div className="h-16 px-4 flex items-center justify-between bg-white border-b border-slate-200">
                 <div className="flex flex-col w-2/5 md:w-1/3">
                     <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400 mb-1">
                        <span>Tốc độ</span>
                        <span className="text-red-500">{speed/1000}s</span>
                     </div>
                     <input type="range" min="3000" max="8000" step="500" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-500" />
                 </div>
                 
                 <button 
                    onClick={toggleAuto}
                    className={`h-10 px-6 rounded-full font-bold text-xs uppercase tracking-widest transition-all flex items-center gap-2 shadow-md transform active:scale-95
                    ${isAuto 
                        ? 'bg-white text-red-500 border border-red-500 animate-pulse' 
                        : 'bg-red-600 text-white hover:bg-red-700'}`}
                 >
                    {isAuto ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>}
                    {isAuto ? 'Dừng' : 'Tự Động'}
                 </button>
            </div>

            {/* History Ribbon */}
            <div className="h-16 bg-slate-50 border-b border-slate-200 flex items-center px-4 overflow-hidden shrink-0">
                 <span className="text-xs font-bold text-slate-400 mr-2 shrink-0">ĐÃ GỌI ({calledNumbers.length}):</span>
                 <div ref={historyScrollRef} className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
                     {calledNumbers.map((num, i) => (
                         <div key={`${num}-${i}`} className={`
                            w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-sm
                            ${i === 0 
                                ? 'bg-yellow-400 text-red-900 border-2 border-white scale-110' 
                                : 'bg-white text-slate-500 border border-slate-200'}
                         `}>
                             {num}
                         </div>
                     ))}
                 </div>
            </div>

            {/* TABS HEADER */}
            <div className="flex border-b border-slate-200 bg-white">
                <button onClick={() => setActiveTab('DASHBOARD')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === 'DASHBOARD' ? 'border-red-500 text-red-600 bg-red-50' : 'border-transparent text-slate-400'}`}>
                    <Users size={16} /> Người Chơi ({players.length})
                </button>
                <button onClick={() => setActiveTab('CHAT')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 border-b-2 transition-all relative ${activeTab === 'CHAT' ? 'border-red-500 text-red-600 bg-red-50' : 'border-transparent text-slate-400'}`}>
                    <MessageCircle size={16} /> Chat
                    {unreadMsgCount > 0 && <span className="absolute top-2 right-4 w-2 h-2 rounded-full bg-red-500"></span>}
                </button>
                <button onClick={() => setActiveTab('TICKET')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === 'TICKET' ? 'border-red-500 text-red-600 bg-red-50' : 'border-transparent text-slate-400'}`}>
                    <Grid3X3 size={16} /> Vé Của Tôi
                </button>
            </div>

            {/* TAB CONTENT */}
            <div className="flex-1 overflow-hidden relative bg-[#fafaf9]">
                 
                 {/* DASHBOARD TAB */}
                 {activeTab === 'DASHBOARD' && (
                    <div className="absolute inset-0 overflow-y-auto p-4 md:p-6 animate-in fade-in">
                        {winners.length > 0 && (
                            <div className="mb-6 p-1 rounded-2xl bg-gradient-to-r from-yellow-300 to-red-500 shadow-lg animate-bounce-slow">
                                <div className="bg-white rounded-xl p-4 flex items-center gap-4">
                                    <div className="p-3 bg-yellow-100 rounded-full text-yellow-600">
                                        <Crown size={24} fill="currentColor" />
                                    </div>
                                    <div className="flex-1">
                                        <h2 className="text-lg font-black text-red-600 uppercase">Có người trúng!</h2>
                                        <p className="text-slate-800 font-medium">Chúc mừng: <span className="text-red-600 font-bold">{winners.map(w => w.name).join(', ')}</span></p>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Danh sách</h3>
                            {waiters.length > 0 && <span className="text-xs font-bold text-orange-500 animate-pulse">{waiters.length} người chờ đặc biệt</span>}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                            {players.sort((a,b) => (a.remaining || 6) - (b.remaining || 6)).map(p => {
                                const remaining = p.remaining !== undefined ? p.remaining : 4;
                                if (remaining === 0) {
                                    return (
                                        <div key={p.id} className="p-3 rounded-xl bg-yellow-400 text-red-900 font-bold flex justify-between items-center shadow">
                                            <div className="truncate flex-1 text-sm">{p.name}</div>
                                            <Trophy size={14} />
                                        </div>
                                    )
                                }
                                return (
                                    <div key={p.id} className={`p-3 rounded-xl border flex justify-between items-center shadow-sm ${remaining === 1 ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-100'}`}>
                                        <div className="truncate flex-1 text-sm font-medium text-slate-700">{p.name}</div>
                                        <span className={`text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold ${remaining === 1 ? 'bg-orange-500 text-white animate-pulse' : 'bg-slate-100 text-slate-400'}`}>
                                            {remaining}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                 )}

                 {/* CHAT TAB */}
                 {activeTab === 'CHAT' && (
                    <div className="absolute inset-0 animate-in fade-in flex flex-col">
                        <ChatOverlay messages={messages} onSendMessage={handleHostSendMessage} playerName="👑 HOST" />
                    </div>
                 )}

                 {/* TICKET TAB */}
                 {activeTab === 'TICKET' && (
                    <div className="absolute inset-0 overflow-y-auto p-4 animate-in fade-in flex flex-col items-center">
                        {!hostPlayerId ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
                                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center text-red-500 mb-2">
                                    <Zap size={40} />
                                </div>
                                <h3 className="text-xl font-bold text-slate-800">Tham Gia Chơi Cùng</h3>
                                <p className="text-slate-500 text-sm max-w-xs">Host cũng có thể sở hữu vé và chơi như người bình thường. Máy sẽ tự động dò số cho bạn.</p>
                                <button onClick={joinAsHostPlayer} className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg transform active:scale-95 transition-all">
                                    Lấy Vé Ngay
                                </button>
                            </div>
                        ) : (
                            <div className="w-full max-w-2xl">
                                <div className="mb-4 flex items-center justify-between bg-white p-3 rounded-xl border border-red-100 shadow-sm">
                                    <span className="text-xs font-bold text-slate-500 uppercase">Trạng thái</span>
                                    <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded">Đang chơi tự động</span>
                                </div>
                                {hostTicket && <TicketView ticket={hostTicket} interactive={false} />}
                            </div>
                        )}
                    </div>
                 )}
            </div>
        </section>
      </main>
    </div>
  );
};