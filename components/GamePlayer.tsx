import React, { useState, useEffect, useRef } from 'react';
import { TicketData, ChatMessage } from '../types';
import { TicketView } from './TicketView';
import { ChatOverlay } from './ChatOverlay';
import { Volume2, VolumeX, Trophy, Loader, MessageCircle, Grid3X3, LogOut, Radio, Hand, Wand2, ChevronLeft, MoreHorizontal, WifiOff } from 'lucide-react';
import { database, isFirebaseConfigured, listenToConnectionStatus } from '../services/firebase';
import { ref, set, onValue, push, onDisconnect, get, update, remove } from "firebase/database";
import { EmojiSystem } from './EmojiSystem';

interface GamePlayerProps {
  onExit: () => void;
  lang: 'vi' | 'en';
}

type MobileTab = 'TICKET' | 'CHAT';

// Generates a set of tickets (15 rows, 4 numbers per row).
const generateFullTicketSet = (): TicketData => {
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

export const GamePlayer: React.FC<GamePlayerProps> = ({ onExit, lang }) => {
  const [roomCode, setRoomCode] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false); // Browser connection status
  
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const [ticket, setTicket] = useState<TicketData>(generateFullTicketSet());
  const [history, setHistory] = useState<number[]>([]);
  const [currentCall, setCurrentCall] = useState<number | null>(null);
  const [currentRhyme, setCurrentRhyme] = useState<string>('');
  const [muted, setMuted] = useState(false);
  const [bingoStatus, setBingoStatus] = useState<'none' | 'check' | 'win'>('none');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<MobileTab>('TICKET');
  const [unreadCount, setUnreadCount] = useState(0);

  const [isAutoMode, setIsAutoMode] = useState(true);

  const speakCombined = (num: number, rhyme: string) => {
    if (muted || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    
    // Logic thay đổi: Nếu là tiếng Việt thì chỉ đọc rhyme (đã có số ở cuối), 
    // nếu tiếng Anh thì đọc "Number X" trước.
    const fullText = lang === 'vi' ? (rhyme || `Số ${num}`) : `Number ${num}. ... ${rhyme || ''}`;
    
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

  // Logic to calculate remaining numbers for Bingo
  const calculateRemaining = (currentTicket: TicketData) => {
      let minRemaining = 4; 
      let isRowWin = false;
      
      currentTicket.forEach(row => {
          const rowCells = row.filter(cell => cell.value !== null);
          const unmarkedCount = rowCells.filter(cell => !cell.marked).length;
          if (unmarkedCount < minRemaining) minRemaining = unmarkedCount;
          if (unmarkedCount === 0) isRowWin = true;
      });
      return { minRemaining, isRowWin };
  };

  const syncTicketWithHistory = (currentTicket: TicketData, currentHistory: number[]) => {
      let ticketChanged = false;
      const newTicket = currentTicket.map(row => 
          row.map(cell => {
              if (cell.value !== null && currentHistory.includes(cell.value) && !cell.marked) {
                  ticketChanged = true;
                  return { ...cell, marked: true };
              }
              return cell;
          })
      );
      return { newTicket, ticketChanged };
  };

  // Reconnection Logic: Update status when coming back online
  useEffect(() => {
      if (isConnected && isOnline && playerId && roomCode) {
          const playerRef = ref(database, `rooms/${roomCode}/players/${playerId}`);
          // Update status to online immediately
          update(playerRef, { isOnline: true });
          // Re-establish the onDisconnect hook
          onDisconnect(playerRef).update({ isOnline: false });
      }
  }, [isOnline, isConnected, playerId, roomCode]);

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
          
          // Initial set with isOnline: true
          await set(newPlayerRef, { id: newId, name: playerName, joinedAt: Date.now(), remaining: 4, isOnline: true });
          
          // IMPORTANT: Do NOT remove on disconnect. Just set isOnline to false.
          // This prevents players from being kicked when backgrounding the app.
          onDisconnect(newPlayerRef).update({ isOnline: false });

          onValue(roomRef, (snap) => {
              const data = snap.val();
              if (data) {
                  const newHistory = data.history || [];
                  const newCurrent = data.currentNumber;
                  const newRhyme = data.currentRhyme;
                  
                  if (newCurrent !== currentCall && newCurrent !== null) speakCombined(newCurrent, newRhyme);
                  
                  if (newHistory.length === 0 && history.length > 0) {
                      setTicket(generateFullTicketSet()); setBingoStatus('none'); setMessages([]);
                      if (newId) update(ref(database, `rooms/${code}/players/${newId}`), { remaining: 4 });
                  }

                  setHistory(newHistory);
                  setCurrentCall(newCurrent); 
                  setCurrentRhyme(newRhyme);

                  if (isAutoMode) {
                      setTicket(prevTicket => {
                          const { newTicket, ticketChanged } = syncTicketWithHistory(prevTicket, newHistory);
                          if (ticketChanged) {
                              const { minRemaining, isRowWin } = calculateRemaining(newTicket);
                              if (newId) update(ref(database, `rooms/${code}/players/${newId}`), { remaining: minRemaining });
                              
                              if (isRowWin && bingoStatus !== 'win') {
                                    setBingoStatus('win');
                                    speakSimple("BINGO! CHIẾN THẮNG!");
                                    push(ref(database, `rooms/${code}/claims`), { playerId: newId, playerName, timestamp: Date.now() });
                              }
                              return newTicket;
                          }
                          return prevTicket;
                      });
                  }
              } else { setIsConnected(false); alert("Phòng đã đóng"); }
          });

          onValue(ref(database, `rooms/${code}/messages`), (snap) => {
              const data = snap.val();
              if (data) {
                  const msgs = Object.entries(data).map(([key, val]: [string, any]) => ({
                      ...val,
                      id: key 
                  })) as ChatMessage[];
                  msgs.sort((a,b) => a.id.localeCompare(b.id));
                  setMessages(msgs);
                  if (window.innerWidth < 768 && activeTab !== 'CHAT') setUnreadCount(prev => prev + 1);
              } else setMessages([]);
          });
          
          setIsConnected(true); setIsConnecting(false);
      } catch (error) { setIsConnecting(false); }
  };

  // Explicit Cleanup when User Clicks "Thoát"
  const handleManualExit = async () => {
      if (playerId && roomCode) {
          try {
             await remove(ref(database, `rooms/${roomCode}/players/${playerId}`));
          } catch(e) {}
      }
      onExit();
  };

  useEffect(() => {
      if (isAutoMode && history.length > 0) {
          setTicket(prevTicket => {
              const { newTicket, ticketChanged } = syncTicketWithHistory(prevTicket, history);
              if (ticketChanged) {
                  const { minRemaining, isRowWin } = calculateRemaining(newTicket);
                  if (playerId && roomCode) update(ref(database, `rooms/${roomCode}/players/${playerId}`), { remaining: minRemaining });
                  if (isRowWin && bingoStatus !== 'win') {
                        setBingoStatus('win');
                        speakSimple("BINGO! CHIẾN THẮNG!");
                        push(ref(database, `rooms/${roomCode}/claims`), { playerId, playerName, timestamp: Date.now() });
                  }
                  return newTicket;
              }
              return prevTicket;
          });
      }
  }, [isAutoMode, history]);

  const handleSendMessage = (text: string) => {
      if (!playerId || !roomCode) return;
      const newMsgRef = push(ref(database, `rooms/${roomCode}/messages`));
      set(newMsgRef, { id: Date.now().toString(), sender: playerName, text: text, avatar: 'bg-indigo-600' });
  };

  const handleCellClick = (r: number, c: number, val: number) => {
    if (history.includes(val)) {
       const newTicket = [...ticket];
       const isMarking = !newTicket[r][c].marked;
       newTicket[r][c] = { ...newTicket[r][c], marked: isMarking };
       setTicket(newTicket);
       
       const { minRemaining, isRowWin } = calculateRemaining(newTicket);
       if (playerId && roomCode) update(ref(database, `rooms/${roomCode}/players/${playerId}`), { remaining: minRemaining });
       
       if (isRowWin && bingoStatus !== 'win') {
            setBingoStatus('win');
            speakSimple("BINGO! CHIẾN THẮNG!");
            if (playerId && roomCode) push(ref(database, `rooms/${roomCode}/claims`), { playerId, playerName, timestamp: Date.now() });
       }
    } else { 
        alert("Số chưa được gọi! Bạn chỉ có thể đánh dấu số đã ra."); 
    }
  };

  if (!isConnected) {
      return (
          <div className="flex flex-col items-center justify-center min-h-screen bg-[#f3f4f6] p-6 font-sans">
              <div className="max-w-sm w-full bg-white p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                  <div className="text-center space-y-2 mb-8">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-900 text-white shadow-lg mb-2">
                        <Trophy size={32} />
                      </div>
                      <h2 className="text-2xl font-black text-slate-800 tracking-tight">Tham Gia Game</h2>
                      <p className="text-slate-500 text-sm">Nhập tên và mã phòng để bắt đầu</p>
                  </div>

                  <form onSubmit={handleJoin} className="space-y-4">
                      <div>
                          <label className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 block tracking-widest pl-1">Tên của bạn</label>
                          <input required className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-bold placeholder-slate-300" placeholder="Ví dụ: Tí Nị" value={playerName} onChange={e => setPlayerName(e.target.value)} />
                      </div>
                      <div>
                          <label className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 block tracking-widest pl-1">Mã Phòng</label>
                          <input required className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-800 text-lg font-mono tracking-wider focus:border-slate-800 focus:ring-0 outline-none transition-all font-bold placeholder-slate-300 uppercase" placeholder="CODE" maxLength={6} value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} />
                      </div>
                      
                      <button disabled={isConnecting || !isOnline} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-base py-4 rounded-xl shadow-lg transform active:scale-95 disabled:opacity-50 transition-all flex justify-center items-center gap-2 mt-4">
                          {isConnecting ? <Loader className="animate-spin" size={20}/> : 'Vào Phòng Ngay'}
                      </button>
                      <button type="button" onClick={onExit} className="w-full text-slate-400 hover:text-slate-600 text-xs font-bold uppercase tracking-widest py-2">Quay lại</button>
                  </form>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-screen bg-[#f3f4f6] text-slate-800 font-sans overflow-hidden">
      
      {/* NAVBAR - CLEAN STYLE */}
      <nav className="h-14 px-4 bg-white flex justify-between items-center shrink-0 border-b border-slate-100 z-30 sticky top-0">
         <div className="flex items-center gap-2">
             <button onClick={handleManualExit} className="p-2 -ml-2 text-slate-400 hover:text-red-600 transition-colors">
                <ChevronLeft size={24} />
             </button>
             <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-800 leading-none">{playerName}</span>
                    {!isOnline && <WifiOff size={10} className="text-red-400 animate-pulse"/>}
                </div>
                <span className="text-[10px] text-slate-400 font-medium">ID: {playerId?.substring(0,4)}</span>
             </div>
         </div>
         <div className="flex gap-2">
             <button onClick={() => setMuted(!muted)} className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-50 rounded-full transition-colors">{muted ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
             <button className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-50 rounded-full transition-colors"><MoreHorizontal size={20}/></button>
         </div>
      </nav>

      {/* MAIN CONTAINER */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
         <EmojiSystem roomCode={roomCode} senderName={playerName} />

         {/* WINNER OVERLAY */}
         {bingoStatus === 'win' && (
            <div className="absolute inset-0 z-50 bg-slate-900/90 flex items-center justify-center flex-col p-6 animate-in fade-in backdrop-blur-sm">
                <div className="relative mb-6">
                    <div className="absolute inset-0 bg-yellow-400 rounded-full blur-3xl opacity-20 animate-pulse"></div>
                    <Trophy size={80} className="text-yellow-400 relative z-10 drop-shadow-lg" />
                </div>
                <h2 className="text-4xl font-black text-white mb-2 tracking-tight uppercase text-center">BINGO!</h2>
                <p className="text-slate-300 text-lg mb-8 font-medium text-center">Chúc mừng bạn đã chiến thắng!</p>
                <div className="flex gap-4">
                     <button onClick={handleManualExit} className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl font-bold text-sm uppercase transition-all">Thoát</button>
                     <button onClick={() => setBingoStatus('check')} className="bg-white text-slate-900 px-8 py-3 rounded-xl font-bold text-sm uppercase hover:scale-105 transition-transform shadow-lg">Xem lại vé</button>
                </div>
            </div>
         )}
         
         {/* TICKET & GAME AREA - CHANGED: bg-[#f3f4f6] to bg-transparent */}
         <div className={`flex-1 flex flex-col items-center bg-transparent relative z-10 overflow-hidden ${activeTab === 'TICKET' ? 'flex' : 'hidden md:flex'}`}>
            
            {/* CALL DISPLAY - Modern Card */}
            <div className="w-full shrink-0 max-w-lg mt-4 px-4 z-10">
                <div className="bg-white rounded-2xl p-4 flex items-center gap-4 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100">
                    <div className="relative shrink-0">
                         <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center shadow-lg text-white">
                            <span className="text-3xl font-black tracking-tighter">{currentCall || '--'}</span>
                         </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-2 mb-1">
                             <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Đang gọi</p>
                         </div>
                         <p className="text-slate-700 text-sm font-medium leading-relaxed italic line-clamp-2">"{currentRhyme || 'Đợi chút nhé...'}"</p>
                    </div>
                </div>

                {/* Mini History */}
                <div className="mt-4 flex gap-2 overflow-x-auto scrollbar-hide py-1">
                     {history.map((num, i) => (
                         <div key={`${num}-${i}`} className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 transition-all ${i===0 ? 'bg-white border-2 border-red-500 text-red-600 shadow-sm scale-105':'bg-white border border-slate-100 text-slate-400'}`}>
                            {num}
                         </div>
                     ))}
                </div>
            </div>

            {/* TICKET AREA - SCROLLABLE */}
            <div className="w-full flex-1 overflow-y-auto flex flex-col items-center p-4 pb-24 md:pb-4 gap-4 z-10">
                
                {/* Mode Toggle Pills */}
                <div className="bg-white p-1 rounded-full border border-slate-100 shadow-sm flex">
                     <button 
                        onClick={() => setIsAutoMode(true)}
                        className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all ${isAutoMode ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                     >
                        <Wand2 size={14} /> Tự động
                     </button>
                     <button 
                        onClick={() => setIsAutoMode(false)}
                        className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all ${!isAutoMode ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                     >
                        <Hand size={14} /> Thủ công
                     </button>
                </div>

                <div className="w-full max-w-2xl">
                     <TicketView ticket={ticket} interactive={true} onCellClick={handleCellClick} />
                </div>
            </div>
         </div>

         {/* CHAT AREA (Desktop Side / Mobile Tab) */}
         <div className={`md:w-80 md:border-l border-slate-100 bg-white flex flex-col relative z-10 ${activeTab === 'CHAT' ? 'flex-1' : 'hidden md:flex'}`}>
             <ChatOverlay messages={messages} onSendMessage={handleSendMessage} playerName={playerName} />
         </div>
      </div>

      {/* MOBILE BOTTOM NAV */}
      <div className="md:hidden flex border-t border-slate-100 bg-white pb-safe z-40 fixed bottom-0 left-0 right-0 h-[70px]">
          <button onClick={() => {setActiveTab('TICKET'); setUnreadCount(0);}} className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${activeTab === 'TICKET' ? 'text-slate-900' : 'text-slate-400'}`}>
              <Grid3X3 size={24} strokeWidth={activeTab === 'TICKET' ? 2.5 : 2} /> 
              <span className="text-[10px] font-bold">Vé Số</span>
          </button>
          <button onClick={() => {setActiveTab('CHAT'); setUnreadCount(0);}} className={`flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors ${activeTab === 'CHAT' ? 'text-slate-900' : 'text-slate-400'}`}>
              <div className="relative">
                  <MessageCircle size={24} strokeWidth={activeTab === 'CHAT' ? 2.5 : 2} />
                  {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full ring-2 ring-white">{unreadCount}</span>}
              </div>
              <span className="text-[10px] font-bold">Chat</span>
          </button>
      </div>
    </div>
  );
};