import React, { useState, useEffect, useRef } from 'react';
import { TicketData, NetworkPayload, ChatMessage } from '../types';
import { TicketView } from './TicketView';
import { ChatOverlay } from './ChatOverlay';
import { Volume2, VolumeX, Trophy, Link, Loader, WifiOff, MessageCircle, Grid3X3, LogOut, AlertTriangle } from 'lucide-react';
import Peer, { DataConnection } from 'peerjs';

interface GamePlayerProps {
  onExit: () => void;
  lang: 'vi' | 'en';
}

type MobileTab = 'TICKET' | 'CHAT';
const APP_PREFIX = 'LOTOMASTER-';

// Generate a valid 9x3 Vietnamese Loto Ticket
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
      while (ticket[0][c].value === num || ticket[1][c].value === num) {
        num = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
      }
      ticket[r][c] = { value: num, marked: false };
    });
  }
  for(let c=0; c<9; c++) {
      const numsInCol = [ticket[0][c].value, ticket[1][c].value, ticket[2][c].value].filter(n => n !== null) as number[];
      numsInCol.sort((a,b) => a-b);
      let idx = 0;
      for(let r=0; r<3; r++) {
          if(ticket[r][c].value !== null) {
              ticket[r][c] = { value: numsInCol[idx], marked: false };
              idx++;
          }
      }
  }
  return ticket;
};

export const GamePlayer: React.FC<GamePlayerProps> = ({ onExit, lang }) => {
  // Connection State
  const [roomCode, setRoomCode] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [connectionLost, setConnectionLost] = useState(false);
  
  const connRef = useRef<DataConnection | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Game State
  const [ticket, setTicket] = useState<TicketData>(generateTicket());
  const [history, setHistory] = useState<number[]>([]);
  const [currentCall, setCurrentCall] = useState<number | null>(null);
  const [currentRhyme, setCurrentRhyme] = useState<string>('');
  const [muted, setMuted] = useState(false);
  const [bingoStatus, setBingoStatus] = useState<'none' | 'check' | 'win'>('none');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  // Mobile UI State
  const [activeTab, setActiveTab] = useState<MobileTab>('TICKET');
  const [unreadCount, setUnreadCount] = useState(0);

  // TTS Helper
  const speak = (text: string) => {
    if (muted || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  // Switch tab helper
  const switchTab = (tab: MobileTab) => {
      setActiveTab(tab);
      if (tab === 'CHAT') setUnreadCount(0);
  };

  // Wake Lock Logic
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch (err) { console.warn('Wake Lock error:', err); }
    };
    if (isConnected) requestWakeLock();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !wakeLockRef.current && isConnected) requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      if (wakeLockRef.current) wakeLockRef.current.release();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (connRef.current) connRef.current.close();
      if (peerRef.current) peerRef.current.destroy();
    };
  }, [isConnected]);

  const handleJoin = (e: React.FormEvent) => {
      e.preventDefault();
      if (!roomCode || !playerName) return;
      setIsConnecting(true);

      const peer = new Peer();
      peerRef.current = peer;

      peer.on('open', (id) => {
          // Reconstruct the full Host ID using the prefix
          const fullHostId = `${APP_PREFIX}${roomCode.trim().toUpperCase()}`;
          const conn = peer.connect(fullHostId, { reliable: true });
          connRef.current = conn;

          conn.on('open', () => {
              setIsConnected(true);
              setIsConnecting(false);
              setConnectionLost(false);
              // Send Name immediately
              conn.send({ type: 'PLAYER_JOINED', payload: { name: playerName } });
          });

          conn.on('data', (data: any) => {
              const action = data as NetworkPayload;
              switch (action.type) {
                  case 'CALL_NUMBER':
                      const num = action.payload.number;
                      const rhyme = action.payload.rhyme;
                      setCurrentCall(num);
                      setCurrentRhyme(rhyme);
                      setHistory(action.payload.history);
                      if (num) {
                        speak(lang === 'vi' ? `Số ${num}` : `Number ${num}`);
                        if (rhyme) setTimeout(() => speak(rhyme), 1000);
                      }
                      break;
                  case 'SYNC_STATE':
                      setHistory(action.payload.history);
                      setCurrentCall(action.payload.currentNumber);
                      setCurrentRhyme(action.payload.currentRhyme);
                      break;
                  case 'CHAT_MESSAGE':
                      setMessages(prev => [...prev, action.payload]);
                      // If we are on mobile and not on chat tab, increment badge
                      if (window.innerWidth < 768) {
                           setUnreadCount(prev => prev + 1);
                      }
                      break;
                  case 'RESET_GAME':
                      setHistory([]);
                      setCurrentCall(null);
                      setCurrentRhyme('');
                      setBingoStatus('none');
                      setMessages([]);
                      setTicket(generateTicket());
                      break;
                  case 'PLAYER_KICKED':
                      alert(lang === 'vi' ? "Bạn đã bị Host mời ra khỏi phòng." : "You were kicked by the host.");
                      onExit();
                      break;
              }
          });

          conn.on('close', () => {
              setConnectionLost(true);
              setIsConnected(false);
              alert('Host disconnected');
          });
          
          conn.on('error', (err) => {
              setIsConnecting(false);
              // Silent retry logic could go here, but alerting user is safer for now
              if (!isConnected) console.log('Connection failed:', err);
          });
      });

      peer.on('error', (err: any) => {
          if (err.type === 'peer-unavailable') {
              alert(lang === 'vi' ? 'Không tìm thấy phòng này! Kiểm tra lại mã số.' : 'Room Code not found!');
              setIsConnecting(false);
              return;
          }
          if (err.type === 'network' || err.message?.includes('Lost connection')) {
              if (isConnected) return;
          }
          if (!isConnected) {
              setIsConnecting(false);
              alert('Lỗi kết nối. Hãy đảm bảo bạn và Host dùng cùng mạng Wifi nếu có thể.');
          }
      });
  };

  const handleSendMessage = (text: string) => {
      if (!connRef.current || !isConnected) return;
      const msg: ChatMessage = {
          id: Date.now().toString(),
          sender: playerName,
          text: text,
          avatar: 'bg-indigo-600'
      };
      setMessages(prev => [...prev, msg]);
      connRef.current.send({ type: 'CHAT_MESSAGE', payload: msg });
  };

  const handleCellClick = (r: number, c: number, val: number) => {
    if (history.includes(val)) {
       const newTicket = [...ticket];
       newTicket[r] = [...newTicket[r]];
       newTicket[r][c] = { ...newTicket[r][c], marked: !newTicket[r][c].marked };
       setTicket(newTicket);
       checkWin(newTicket);
    } else {
        alert(lang === 'vi' ? 'Số này chưa gọi nha!' : 'Number not called yet!');
    }
  };

  const notifyWin = () => {
     if(connRef.current) {
         connRef.current.send({ type: 'CLAIM_BINGO', payload: {} });
     }
  };

  const checkWin = (currentTicket: TicketData) => {
    // Check horizontal lines (standard Loto)
    for (const row of currentTicket) {
      const numbersInRow = row.filter(cell => cell.value !== null);
      if (numbersInRow.length > 0 && numbersInRow.every(cell => cell.marked)) {
        if (bingoStatus !== 'win') {
            setBingoStatus('win');
            setCurrentRhyme("KINH! KINH! KINH! BINGO!!!");
            speak("BINGO! BINGO!");
            notifyWin();
        }
        return;
      }
    }
    // Full house check (optional)
    const allNumbers = currentTicket.flat().filter(c => c.value !== null);
    if (allNumbers.every(c => c.marked)) {
        if (bingoStatus !== 'win') {
            setBingoStatus('win');
            notifyWin();
        }
    }
  };

  // Reset unread count when switching to chat via effect if needed, but manual handler is better
  useEffect(() => {
     if(activeTab === 'CHAT') setUnreadCount(0);
  }, [activeTab]);


  // Render Login Screen if not connected
  if (!isConnected) {
      return (
          <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 p-4">
              <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 max-w-md w-full animate-in fade-in zoom-in duration-300">
                  <h2 className="text-2xl font-bold text-white mb-6 text-center text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">
                      {lang === 'vi' ? 'Tham Gia Phòng Chơi' : 'Join Game Room'}
                  </h2>
                  <form onSubmit={handleJoin} className="space-y-4">
                      <div>
                          <label className="text-slate-400 text-sm mb-1 block font-bold">Tên hiển thị (Name)</label>
                          <input required className="w-full bg-slate-900 border border-slate-600 rounded-lg p-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none text-lg" placeholder="Tên bạn..." value={playerName} onChange={e => setPlayerName(e.target.value)} />
                      </div>
                      <div>
                          <label className="text-slate-400 text-sm mb-1 block font-bold">Mã Phòng (Room Code)</label>
                          <input 
                            required 
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg p-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-2xl tracking-widest uppercase text-center placeholder-slate-600" 
                            placeholder="XXXXXX" 
                            maxLength={6}
                            value={roomCode} 
                            onChange={e => setRoomCode(e.target.value.toUpperCase())} 
                          />
                          <p className="text-xs text-slate-500 mt-2 text-center flex items-center justify-center gap-1">
                             <AlertTriangle size={12} />
                             Nên dùng cùng Wifi với Host để kết nối tốt nhất.
                          </p>
                      </div>
                      <button disabled={isConnecting} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-4 rounded-xl transition-all flex justify-center items-center gap-2 shadow-lg transform active:scale-95">
                          {isConnecting ? <Loader className="animate-spin"/> : <Link />}
                          {isConnecting ? 'Đang kết nối...' : (lang === 'vi' ? 'Vào Phòng Ngay' : 'Join Room')}
                      </button>
                      <button type="button" onClick={onExit} className="w-full text-slate-500 text-sm hover:text-white py-2">Quay lại (Back)</button>
                  </form>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white">
      {/* Navbar */}
      <nav className="p-3 bg-slate-800 border-b border-slate-700 flex justify-between items-center shadow-lg z-20 shrink-0">
         <div className="flex items-center gap-3">
            <div className="bg-red-600 text-white font-bold px-3 py-1 rounded text-xs uppercase tracking-wider animate-pulse flex items-center gap-1">
                <div className="w-2 h-2 bg-white rounded-full"></div> Live
            </div>
            {connectionLost && <WifiOff className="text-red-500 animate-pulse" />}
         </div>
         <div className="flex items-center gap-2">
             <div className="text-sm font-bold text-indigo-400 truncate max-w-[100px]">{playerName}</div>
             <button onClick={() => setMuted(!muted)} className="p-2 text-slate-400 hover:text-white rounded-full bg-slate-700">
                 {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
             </button>
             <button onClick={onExit} className="p-2 text-red-400 hover:bg-red-900/20 rounded-full">
                 <LogOut size={18}/>
             </button>
         </div>
      </nav>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
         {/* Confetti / Win Overlay */}
         {bingoStatus === 'win' && (
            <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center flex-col p-4 animate-in fade-in duration-300">
                <Trophy size={80} className="text-yellow-400 mb-4 animate-bounce" />
                <h2 className="text-4xl md:text-6xl font-black text-white text-center mb-4 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-red-500 to-pink-500">
                    BINGO!
                </h2>
                <p className="text-white mb-6">Bạn đã thắng! Chờ Host kiểm tra vé nhé.</p>
                <button onClick={onExit} className="bg-white text-red-600 px-8 py-3 rounded-full font-bold hover:bg-gray-100">
                    Thoát
                </button>
            </div>
         )}

         {/* MAIN GAME AREA (Responsive: Hidden on Mobile if Chat tab is active) */}
         <div className={`
             flex-1 p-2 sm:p-4 overflow-y-auto flex flex-col items-center gap-4 bg-slate-900
             ${activeTab === 'TICKET' ? 'flex' : 'hidden md:flex'}
         `}>
            
            {/* Current Call Display */}
            <div className="w-full max-w-xl bg-gradient-to-r from-indigo-900 to-slate-900 rounded-2xl p-3 shadow-xl border border-slate-700 flex items-center gap-3 relative overflow-hidden shrink-0">
                <div className="relative shrink-0">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-red-600 flex items-center justify-center border-4 border-yellow-400 shadow-lg">
                        <span className="text-3xl sm:text-4xl font-black text-white">{currentCall || '--'}</span>
                    </div>
                </div>
                <div className="flex-1 z-10 min-w-0">
                    <p className="text-indigo-300 text-[10px] font-bold uppercase tracking-widest mb-1">
                        {lang === 'vi' ? 'MC đang hô:' : 'Caller says:'}
                    </p>
                    <p className="text-white text-base sm:text-lg font-medium italic truncate">"{currentRhyme || '...'}"</p>
                </div>
            </div>

            {/* The Ticket */}
            <div className="w-full flex-1 flex flex-col justify-center">
                <TicketView ticket={ticket} interactive={true} onCellClick={handleCellClick} />
            </div>

            {/* Recent History */}
            <div className="w-full max-w-2xl shrink-0 mt-auto">
                <p className="text-slate-400 text-xs mb-1 uppercase font-bold">Lịch sử / History</p>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mask-fade-right">
                    {history.slice().reverse().map((num, i) => (
                        <div key={i} className={`
                            w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 text-xs sm:text-sm font-bold border
                            ${i === 0 ? 'bg-yellow-400 border-yellow-200 text-black scale-110' : 'bg-slate-800 border-slate-600 text-slate-400'}
                        `}>{num}</div>
                    ))}
                </div>
            </div>
         </div>

         {/* CHAT AREA (Responsive: Hidden on Mobile if Ticket tab is active) */}
         <div className={`
            md:w-80 md:border-l border-slate-700 bg-slate-900 flex flex-col
            ${activeTab === 'CHAT' ? 'flex-1' : 'hidden md:flex'}
         `}>
             <ChatOverlay messages={messages} onSendMessage={handleSendMessage} playerName={playerName} />
         </div>
      </div>

      {/* MOBILE BOTTOM TABS */}
      <div className="md:hidden flex border-t border-slate-700 bg-slate-800 pb-safe">
          <button 
            onClick={() => switchTab('TICKET')} 
            className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 ${activeTab === 'TICKET' ? 'text-indigo-400' : 'text-slate-500'}`}
          >
              <Grid3X3 size={20} />
              <span className="text-[10px] font-bold">Vé Số</span>
          </button>
          
          <button 
            onClick={() => switchTab('CHAT')} 
            className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 relative ${activeTab === 'CHAT' ? 'text-indigo-400' : 'text-slate-500'}`}
          >
              <div className="relative">
                  <MessageCircle size={20} />
                  {unreadCount > 0 && (
                      <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-bounce">
                          {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                  )}
              </div>
              <span className="text-[10px] font-bold">Chat</span>
          </button>
      </div>
    </div>
  );
};