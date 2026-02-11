import React, { useState, useEffect, useRef } from 'react';
import { TicketData, ChatMessage } from '../types';
import { TicketView } from './TicketView';
import { ChatOverlay } from './ChatOverlay';
import { Volume2, VolumeX, Trophy, Loader, MessageCircle, Grid3X3, LogOut, Radio } from 'lucide-react';
import { database, isFirebaseConfigured, listenToConnectionStatus } from '../services/firebase';
import { ref, set, onValue, push, onDisconnect, get, update } from "firebase/database";

interface GamePlayerProps {
  onExit: () => void;
  lang: 'vi' | 'en';
}

type MobileTab = 'TICKET' | 'CHAT';

const generateTicket = (): TicketData => {
  const ticket: TicketData = Array(3).fill(null).map(() => Array(9).fill({ value: null, marked: false }));
  const colRanges = [
    { min: 1, max: 9 }, { min: 10, max: 19 }, { min: 20, max: 29 },
    { min: 30, max: 39 }, { min: 40, max: 49 }, { min: 50, max: 59 },
    { min: 60, max: 69 }, { min: 70, max: 79 }, { min: 80, max: 90 }
  ];
  for (let r = 0; r < 3; r++) {
    const availableCols = [0,1,2,3,4,5,6,7,8].sort(() => 0.5 - Math.random()).slice(0, 6);
    availableCols.forEach(c => {
      const range = colRanges[c];
      let num = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
      while (ticket[0][c].value === num || ticket[1][c].value === num) num = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
      ticket[r][c] = { value: num, marked: false };
    });
  }
  for(let c=0; c<9; c++) {
      const numsInCol = [ticket[0][c].value, ticket[1][c].value, ticket[2][c].value].filter(n => n !== null) as number[];
      numsInCol.sort((a,b) => a-b);
      let idx = 0;
      for(let r=0; r<3; r++) {
          if(ticket[r][c].value !== null) { ticket[r][c] = { value: numsInCol[idx], marked: false }; idx++; }
      }
  }
  return ticket;
};

export const GamePlayer: React.FC<GamePlayerProps> = ({ onExit, lang }) => {
  const [roomCode, setRoomCode] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const [ticket, setTicket] = useState<TicketData>(generateTicket());
  const [history, setHistory] = useState<number[]>([]);
  const [currentCall, setCurrentCall] = useState<number | null>(null);
  const [currentRhyme, setCurrentRhyme] = useState<string>('');
  const [muted, setMuted] = useState(false);
  const [bingoStatus, setBingoStatus] = useState<'none' | 'check' | 'win'>('none');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<MobileTab>('TICKET');
  const [unreadCount, setUnreadCount] = useState(0);

  const speakCombined = (num: number, rhyme: string) => {
    if (muted || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const prefix = lang === 'vi' ? `Số ${num}.` : `Number ${num}.`;
    const fullText = `${prefix} ... ${rhyme || ''}`;
    const utterance = new SpeechSynthesisUtterance(fullText);
    utterance.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
    utterance.rate = 1.0; 
    window.speechSynthesis.speak(utterance);
  };

  const speakSimple = (text: string) => {
    if (muted || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    const unsubscribeStatus = listenToConnectionStatus(setIsOnline);
    const requestWakeLock = async () => { try { if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch (err) {} };
    if (isConnected) requestWakeLock();
    return () => { if (wakeLockRef.current) wakeLockRef.current.release(); unsubscribeStatus(); };
  }, [isConnected]);

  const handleJoin = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!roomCode || !playerName || !isFirebaseConfigured()) return;
      setIsConnecting(true);
      const code = roomCode.trim().toUpperCase();
      const roomRef = ref(database, `rooms/${code}`);

      try {
          const snapshot = await get(roomRef);
          if (!snapshot.exists()) { alert("Phòng không tồn tại"); setIsConnecting(false); return; }

          const newPlayerRef = push(ref(database, `rooms/${code}/players`));
          const newId = newPlayerRef.key as string;
          setPlayerId(newId);
          await set(newPlayerRef, { id: newId, name: playerName, joinedAt: Date.now(), remaining: 6 });
          onDisconnect(newPlayerRef).remove();

          onValue(roomRef, (snap) => {
              const data = snap.val();
              if (data) {
                  const newHistory = data.history || [];
                  const newCurrent = data.currentNumber;
                  const newRhyme = data.currentRhyme;
                  if (newCurrent !== currentCall && newCurrent !== null) speakCombined(newCurrent, newRhyme);
                  if (newHistory.length === 0 && history.length > 0) {
                      setTicket(generateTicket()); setBingoStatus('none'); setMessages([]);
                      if (newId) update(ref(database, `rooms/${code}/players/${newId}`), { remaining: 6 });
                  }
                  setHistory(newHistory); setCurrentCall(newCurrent); setCurrentRhyme(newRhyme);
              } else { setIsConnected(false); alert("Phòng đã đóng"); }
          });

          onValue(ref(database, `rooms/${code}/messages`), (snap) => {
              const data = snap.val();
              if (data) {
                  const msgs = Object.values(data) as ChatMessage[];
                  msgs.sort((a,b) => Number(a.id) - Number(b.id));
                  setMessages(msgs);
                  if (window.innerWidth < 768 && activeTab !== 'CHAT') setUnreadCount(prev => prev + 1);
              } else setMessages([]);
          });
          
          setIsConnected(true); setIsConnecting(false);
      } catch (error) { setIsConnecting(false); }
  };

  const handleSendMessage = (text: string) => {
      if (!playerId || !roomCode) return;
      const newMsgRef = push(ref(database, `rooms/${roomCode}/messages`));
      set(newMsgRef, { id: Date.now().toString(), sender: playerName, text: text, avatar: 'bg-indigo-600' });
  };

  const handleCellClick = (r: number, c: number, val: number) => {
    if (history.includes(val)) {
       const newTicket = [...ticket];
       newTicket[r][c] = { ...newTicket[r][c], marked: !newTicket[r][c].marked };
       setTicket(newTicket);
       
       let minRemaining = 6;
       let isRowWin = false;

       newTicket.forEach(row => {
          const rowCells = row.filter(cell => cell.value !== null);
          const unmarkedCount = rowCells.filter(cell => !cell.marked).length;
          if (unmarkedCount < minRemaining) minRemaining = unmarkedCount;
          if (unmarkedCount === 0) isRowWin = true;
       });

       if (playerId && roomCode) update(ref(database, `rooms/${roomCode}/players/${playerId}`), { remaining: minRemaining });

       if (isRowWin && bingoStatus !== 'win') {
            setBingoStatus('win');
            speakSimple("BINGO! CHIẾN THẮNG!");
            if (playerId && roomCode) push(ref(database, `rooms/${roomCode}/claims`), { playerId, playerName, timestamp: Date.now() });
       }
    } else { alert("Số chưa gọi!"); }
  };

  if (!isConnected) {
      return (
          <div className="flex flex-col items-center justify-center min-h-screen bg-[#fff1f2] p-6 font-sans">
              <div className="max-w-sm w-full bg-white p-8 rounded-3xl shadow-xl border border-red-100">
                  <div className="text-center space-y-2 mb-6">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500 text-white shadow-lg mb-2">
                        <Trophy size={32} />
                      </div>
                      <h2 className="text-3xl font-black text-red-600 tracking-tight">Tham Gia</h2>
                      <p className="text-slate-500 text-sm">Nhập tên và mã phòng để chơi</p>
                  </div>

                  <form onSubmit={handleJoin} className="space-y-4">
                      <div>
                          <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block tracking-widest">Tên người chơi</label>
                          <input required className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all font-bold" placeholder="Nhập tên bạn" value={playerName} onChange={e => setPlayerName(e.target.value)} />
                      </div>
                      <div>
                          <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block tracking-widest">Mã Phòng</label>
                          <input required className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-red-600 text-xl font-mono text-center tracking-[0.3em] uppercase focus:border-red-500 outline-none transition-all font-bold" placeholder="CODE" maxLength={6} value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} />
                      </div>
                      <button disabled={isConnecting || !isOnline} className="w-full bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white font-bold text-lg py-3 rounded-xl shadow-lg transform active:scale-95 disabled:opacity-50 transition-all flex justify-center items-center gap-2">
                          {isConnecting ? <Loader className="animate-spin" size={20}/> : 'Kết Nối'}
                      </button>
                      <button type="button" onClick={onExit} className="w-full text-slate-400 hover:text-red-500 text-xs font-bold uppercase tracking-widest py-2">Quay lại</button>
                  </form>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-screen bg-[#fff1f2] text-slate-800 font-sans overflow-hidden">
      {/* Navbar - Red */}
      <nav className="h-14 px-4 bg-red-600 flex justify-between items-center z-30 shrink-0 shadow-md">
         <div className="flex items-center gap-3">
             <div className="w-9 h-9 rounded-full bg-white border-2 border-yellow-400 flex items-center justify-center text-red-600 font-bold shadow-sm">
                 {playerName.charAt(0)}
             </div>
             <div className="flex flex-col">
                <span className="text-sm font-bold text-white leading-none">{playerName}</span>
                <span className="text-[10px] text-red-200 font-mono tracking-widest uppercase">ID: {playerId?.substring(0,6)}</span>
             </div>
         </div>
         <div className="flex gap-2">
             <button onClick={() => setMuted(!muted)} className="p-2 text-red-100 hover:text-white hover:bg-red-500 rounded-full transition-colors">{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
             <button onClick={onExit} className="p-2 text-red-100 hover:text-white hover:bg-red-500 rounded-full transition-colors"><LogOut size={18}/></button>
         </div>
      </nav>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
         {bingoStatus === 'win' && (
            <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center flex-col p-6 animate-in fade-in backdrop-blur-sm">
                <div className="relative">
                    <div className="absolute inset-0 bg-yellow-400 rounded-full blur-3xl opacity-50"></div>
                    <div className="relative mb-6 p-6 rounded-full bg-gradient-to-br from-yellow-300 to-orange-500 text-white animate-bounce shadow-2xl">
                        <Trophy size={64} />
                    </div>
                </div>
                <h2 className="text-6xl font-black text-white mb-2 tracking-tighter uppercase drop-shadow-lg">CHIẾN THẮNG!</h2>
                <p className="text-white text-xl mb-8 font-medium">Bạn đã trúng Lô Tô!</p>
                <button onClick={onExit} className="bg-white text-red-600 px-12 py-4 rounded-full font-bold uppercase tracking-widest hover:scale-105 transition-transform shadow-xl">Thoát</button>
            </div>
         )}
         
         {/* MAIN AREA */}
         <div className={`flex-1 flex flex-col items-center bg-[#fff1f2] relative ${activeTab === 'TICKET' ? 'flex' : 'hidden md:flex'}`}>
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 pointer-events-none"></div>

            {/* CALL DISPLAY - White Card */}
            <div className="w-full max-w-lg mt-4 px-4 z-10">
                <div className="bg-white border border-red-100 rounded-2xl p-4 flex items-center gap-5 shadow-lg relative overflow-hidden">
                    <div className="relative">
                         <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-md text-white border-2 border-white ring-2 ring-red-100">
                            <span className="text-4xl font-black">{currentCall || '--'}</span>
                         </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-2 mb-1">
                             <Radio size={14} className="text-red-500 animate-pulse"/>
                             <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest">Trực tiếp</p>
                         </div>
                         <p className="text-slate-700 text-lg leading-snug line-clamp-2 font-serif italic">"{currentRhyme || '...'}"</p>
                    </div>
                </div>

                {/* Mini History - Circles */}
                <div className="mt-4 flex gap-2 overflow-x-auto scrollbar-hide py-2">
                     {history.map((num, i) => (
                         <div key={`${num}-${i}`} className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-sm ${i===0 ? 'bg-yellow-400 text-red-800 scale-110 border-2 border-white':'bg-white text-slate-500 border border-slate-200'}`}>{num}</div>
                     ))}
                </div>
            </div>

            {/* TICKET AREA */}
            <div className="w-full flex-1 overflow-y-auto flex flex-col items-center p-4 gap-4 z-10">
                <TicketView ticket={ticket} interactive={true} onCellClick={handleCellClick} />
            </div>
         </div>

         {/* CHAT AREA */}
         <div className={`md:w-80 md:border-l border-red-100 bg-white flex flex-col ${activeTab === 'CHAT' ? 'flex-1' : 'hidden md:flex'}`}>
             <ChatOverlay messages={messages} onSendMessage={handleSendMessage} playerName={playerName} />
         </div>
      </div>

      {/* MOBILE TABS - White & Red */}
      <div className="md:hidden flex border-t border-red-100 bg-white pb-safe z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          <button onClick={() => {setActiveTab('TICKET'); setUnreadCount(0);}} className={`flex-1 py-4 flex flex-col items-center justify-center gap-1 transition-colors ${activeTab === 'TICKET' ? 'text-red-600 bg-red-50' : 'text-slate-400'}`}>
              <Grid3X3 size={20} /> <span className="text-[9px] font-bold uppercase tracking-widest">Vé Số</span>
          </button>
          <button onClick={() => {setActiveTab('CHAT'); setUnreadCount(0);}} className={`flex-1 py-4 flex flex-col items-center justify-center gap-1 relative transition-colors ${activeTab === 'CHAT' ? 'text-red-600 bg-red-50' : 'text-slate-400'}`}>
              <div className="relative">
                  <MessageCircle size={20} />
                  {unreadCount > 0 && <span className="absolute -top-1 -right-2 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>}
              </div>
              <span className="text-[9px] font-bold uppercase tracking-widest">Chat</span>
          </button>
      </div>
    </div>
  );
};