import React, { useState, useEffect, useRef } from 'react';
import { TicketData, ChatMessage } from '../types';
import { TicketView } from './TicketView';
import { ChatOverlay } from './ChatOverlay';
import { Volume2, VolumeX, Trophy, Loader, MessageCircle, Grid3X3, LogOut, CheckCircle2, XCircle } from 'lucide-react';
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
    const availableCols = [0,1,2,3,4,5,6,7,8].sort(() => 0.5 - Math.random()).slice(0, 5);
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
  // State
  const [roomCode, setRoomCode] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Game Data
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
    
    window.speechSynthesis.cancel(); // Reset queue

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

  // Join Room
  const handleJoin = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!roomCode || !playerName || !isFirebaseConfigured()) return;
      setIsConnecting(true);
      const code = roomCode.trim().toUpperCase();
      const roomRef = ref(database, `rooms/${code}`);

      try {
          const snapshot = await get(roomRef);
          if (!snapshot.exists()) { alert("Không tìm thấy phòng!"); setIsConnecting(false); return; }

          const newPlayerRef = push(ref(database, `rooms/${code}/players`));
          const newId = newPlayerRef.key as string;
          setPlayerId(newId);
          // Init with 5 remaining (full row)
          await set(newPlayerRef, { id: newId, name: playerName, joinedAt: Date.now(), remaining: 5 });
          onDisconnect(newPlayerRef).remove();

          onValue(roomRef, (snap) => {
              const data = snap.val();
              if (data) {
                  const newHistory = data.history || [];
                  const newCurrent = data.currentNumber;
                  const newRhyme = data.currentRhyme;

                  // Detect new call
                  if (newCurrent !== currentCall && newCurrent !== null) {
                      speakCombined(newCurrent, newRhyme);
                  }
                  
                  if (newHistory.length === 0 && history.length > 0) {
                      setTicket(generateTicket()); setBingoStatus('none'); setMessages([]);
                      // Reset remaining on new game
                      if (newId) update(ref(database, `rooms/${code}/players/${newId}`), { remaining: 5 });
                  }
                  setHistory(newHistory); setCurrentCall(newCurrent); setCurrentRhyme(newRhyme);
              } else { setIsConnected(false); alert("Phòng đóng!"); }
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
       
       // Calculate remaining per row
       let minRemaining = 5;
       let isRowWin = false;

       newTicket.forEach(row => {
          // Count non-null cells that are NOT marked
          const rowCells = row.filter(cell => cell.value !== null);
          const unmarkedCount = rowCells.filter(cell => !cell.marked).length;
          
          if (unmarkedCount < minRemaining) minRemaining = unmarkedCount;
          if (unmarkedCount === 0) isRowWin = true;
       });

       // Update Firebase with remaining count
       if (playerId && roomCode) {
         update(ref(database, `rooms/${roomCode}/players/${playerId}`), { remaining: minRemaining });
       }

       if (isRowWin && bingoStatus !== 'win') {
            setBingoStatus('win');
            speakSimple("BINGO! BINGO!");
            // Legacy claim push for timestamp, though host now watches 'remaining' too
            if (playerId && roomCode) push(ref(database, `rooms/${roomCode}/claims`), { playerId, playerName, timestamp: Date.now() });
       }
    } else { alert("Số chưa gọi!"); }
  };

  if (!isConnected) {
      return (
          <div className="flex flex-col items-center justify-center min-h-screen bg-red-900 p-4 font-sans text-yellow-300">
              <div className="bg-red-800 p-8 rounded-3xl shadow-2xl border-2 border-yellow-500 max-w-md w-full animate-in fade-in zoom-in duration-300">
                  <h2 className="text-3xl font-black text-yellow-400 mb-6 text-center uppercase drop-shadow-md">Vào Phòng Chơi</h2>
                  <div className={`flex items-center justify-center gap-2 mb-4 text-xs font-bold ${isOnline ? 'text-green-400' : 'text-red-400 bg-red-950 p-1 rounded'}`}>
                      {isOnline ? <CheckCircle2 size={14}/> : <XCircle size={14}/>} {isOnline ? 'Máy chủ OK' : 'Mất kết nối'}
                  </div>
                  <form onSubmit={handleJoin} className="space-y-4">
                      <div>
                          <label className="text-yellow-200/80 text-xs uppercase font-bold">Tên của bạn</label>
                          <input required className="w-full bg-red-950 border border-red-700 rounded-xl p-3 text-white text-lg focus:border-yellow-400 outline-none" placeholder="Nhập tên..." value={playerName} onChange={e => setPlayerName(e.target.value)} />
                      </div>
                      <div>
                          <label className="text-yellow-200/80 text-xs uppercase font-bold">Mã Phòng</label>
                          <input required className="w-full bg-red-950 border border-red-700 rounded-xl p-3 text-white text-2xl font-mono text-center tracking-[0.5em] uppercase focus:border-yellow-400 outline-none" placeholder="XXXXXX" maxLength={6} value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} />
                      </div>
                      <button disabled={isConnecting || !isOnline} className="w-full bg-gradient-to-r from-yellow-500 to-yellow-400 hover:from-yellow-400 hover:to-yellow-300 text-red-900 font-black text-lg py-4 rounded-xl shadow-lg transform active:scale-95 disabled:opacity-50">
                          {isConnecting ? <Loader className="animate-spin mx-auto"/> : (lang === 'vi' ? 'THAM GIA NGAY' : 'JOIN ROOM')}
                      </button>
                      <button type="button" onClick={onExit} className="w-full text-yellow-200/60 text-sm hover:text-white py-2">Quay lại</button>
                  </form>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-screen bg-red-900 text-yellow-100 font-sans overflow-hidden">
      {/* Navbar Compact */}
      <nav className="p-2 bg-red-950 border-b border-yellow-600/30 flex justify-between items-center shadow-md z-30 shrink-0">
         <div className="flex items-center gap-2 text-xs font-bold text-yellow-500">
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></div> {playerName}
         </div>
         <div className="flex gap-1">
             <button onClick={() => setMuted(!muted)} className="p-2 text-yellow-200 bg-red-900/50 rounded-full">{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
             <button onClick={onExit} className="p-2 text-red-400 bg-red-900/50 rounded-full"><LogOut size={16}/></button>
         </div>
      </nav>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
         {bingoStatus === 'win' && (
            <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center flex-col p-4 animate-in fade-in">
                <Trophy size={80} className="text-yellow-400 mb-4 animate-bounce" />
                <h2 className="text-6xl font-black text-yellow-400 mb-2">BINGO!</h2>
                <button onClick={onExit} className="bg-white text-red-900 px-6 py-2 rounded-full font-bold">Thoát</button>
            </div>
         )}
         
         {/* MAIN AREA */}
         <div className={`flex-1 flex flex-col items-center bg-red-900 relative ${activeTab === 'TICKET' ? 'flex' : 'hidden md:flex'}`}>
            
            {/* CALL DISPLAY & HISTORY (Fixed Top) */}
            <div className="w-full bg-red-950/90 flex flex-col shrink-0 border-b border-yellow-600/20 shadow-lg relative z-20">
                {/* Big Number & Rhyme */}
                <div className="p-3 flex items-center gap-4 justify-center">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 to-red-500 border-4 border-yellow-200 shadow-[0_0_20px_rgba(250,204,21,0.5)] flex items-center justify-center shrink-0">
                        <span className="text-5xl font-black text-red-900">{currentCall || '--'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                         <p className="text-[10px] text-yellow-500 font-bold uppercase mb-1">MC đang hô:</p>
                         <p className="text-yellow-100 text-sm italic leading-snug break-words">"{currentRhyme || '...'}"</p>
                    </div>
                </div>

                {/* Horizontal History Scroll */}
                <div className="bg-black/20 py-2 px-3 overflow-x-auto whitespace-nowrap scrollbar-hide flex items-center gap-2">
                     <span className="text-[10px] font-bold text-red-400 mr-2 uppercase">Lịch sử:</span>
                     {history.map((num, i) => (
                         <div key={`${num}-${i}`} className={`
                            inline-flex w-8 h-8 items-center justify-center rounded-full font-bold text-xs border
                            ${i === 0 ? 'bg-yellow-400 text-red-900 border-yellow-200' : 'bg-red-800 text-red-200 border-red-700'}
                         `}>
                             {num}
                         </div>
                     ))}
                     {history.length === 0 && <span className="text-xs text-white/20 italic">Chưa có...</span>}
                </div>
            </div>

            {/* TICKET AREA (Scrollable) */}
            <div className="w-full flex-1 overflow-y-auto flex items-center justify-center p-4">
                <TicketView ticket={ticket} interactive={true} onCellClick={handleCellClick} />
            </div>
         </div>

         {/* CHAT AREA */}
         <div className={`md:w-80 md:border-l border-yellow-600/30 bg-red-950 flex flex-col ${activeTab === 'CHAT' ? 'flex-1' : 'hidden md:flex'}`}>
             <ChatOverlay messages={messages} onSendMessage={handleSendMessage} playerName={playerName} />
         </div>
      </div>

      {/* MOBILE TABS */}
      <div className="md:hidden flex border-t border-yellow-600/30 bg-red-950 pb-safe z-30">
          <button onClick={() => {setActiveTab('TICKET'); setUnreadCount(0);}} className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 ${activeTab === 'TICKET' ? 'text-yellow-400 bg-red-900' : 'text-red-400'}`}>
              <Grid3X3 size={20} /> <span className="text-[10px] font-bold">VÉ SỐ</span>
          </button>
          <button onClick={() => {setActiveTab('CHAT'); setUnreadCount(0);}} className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 relative ${activeTab === 'CHAT' ? 'text-yellow-400 bg-red-900' : 'text-red-400'}`}>
              <div className="relative">
                  <MessageCircle size={20} />
                  {unreadCount > 0 && <span className="absolute -top-1 -right-2 bg-yellow-500 text-red-900 text-[9px] font-bold px-1 rounded-full animate-bounce">{unreadCount}</span>}
              </div>
              <span className="text-[10px] font-bold">CHAT</span>
          </button>
      </div>
    </div>
  );
};