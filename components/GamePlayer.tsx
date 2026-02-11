import React, { useState, useEffect, useRef } from 'react';
import { TicketData, NetworkPayload, ChatMessage } from '../types';
import { TicketView } from './TicketView';
import { ChatOverlay } from './ChatOverlay';
import { Volume2, VolumeX, Trophy, Link, Loader, WifiOff } from 'lucide-react';
import Peer, { DataConnection } from 'peerjs';

interface GamePlayerProps {
  onExit: () => void;
  lang: 'vi' | 'en';
}

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
  const [roomId, setRoomId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [connectionLost, setConnectionLost] = useState(false);
  
  const connRef = useRef<DataConnection | null>(null);
  const peerRef = useRef<Peer | null>(null);

  // Game State
  const [ticket, setTicket] = useState<TicketData>(generateTicket());
  const [history, setHistory] = useState<number[]>([]);
  const [currentCall, setCurrentCall] = useState<number | null>(null);
  const [currentRhyme, setCurrentRhyme] = useState<string>('');
  const [muted, setMuted] = useState(false);
  const [bingoStatus, setBingoStatus] = useState<'none' | 'check' | 'win'>('none');
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
        if (connRef.current) connRef.current.close();
        if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  const handleJoin = (e: React.FormEvent) => {
      e.preventDefault();
      if (!roomId || !playerName) return;
      
      setIsConnecting(true);

      const peer = new Peer();
      peerRef.current = peer;

      peer.on('open', (id) => {
          const conn = peer.connect(roomId, {
              reliable: true
          });
          connRef.current = conn;

          conn.on('open', () => {
              setIsConnected(true);
              setIsConnecting(false);
              setConnectionLost(false);
          });

          conn.on('data', (data: any) => {
              const action = data as NetworkPayload;
              
              switch (action.type) {
                  case 'CALL_NUMBER':
                      setCurrentCall(action.payload.number);
                      setCurrentRhyme(action.payload.rhyme);
                      setHistory(action.payload.history);
                      break;
                  case 'SYNC_STATE':
                      setHistory(action.payload.history);
                      setCurrentCall(action.payload.currentNumber);
                      setCurrentRhyme(action.payload.currentRhyme);
                      break;
                  case 'CHAT_MESSAGE':
                      setMessages(prev => [...prev, action.payload]);
                      break;
                  case 'RESET_GAME':
                      setHistory([]);
                      setCurrentCall(null);
                      setCurrentRhyme('');
                      setBingoStatus('none');
                      setMessages([]);
                      setTicket(generateTicket()); // New ticket for new game
                      break;
              }
          });

          conn.on('close', () => {
              setConnectionLost(true);
              setIsConnected(false); // Go back to login if actually closed
              alert('Host disconnected');
          });
          
          conn.on('error', (err) => {
              console.error(err);
              setIsConnecting(false);
              if (!isConnected) {
                  alert('Connection failed. Check Room ID.');
              }
          });
      });

      // Handle signaling errors gracefully if possible
      peer.on('error', (err: any) => {
          console.error("Player Peer Error", err);
          
          if (err.type === 'peer-unavailable') {
              alert(lang === 'vi' ? 'Không tìm thấy phòng chơi này!' : 'Room ID not found!');
              setIsConnecting(false);
              return;
          }

          if (err.type === 'network' || err.message?.includes('Lost connection')) {
              // If we are already connected to host (via conn), this peer error
              // refers to the signaling server. We might not care if P2P is active.
              if (isConnected) {
                  console.warn("Signaling lost, but game might continue.");
                  return;
              }
          }
          
          if (!isConnected) {
              setIsConnecting(false);
              alert('Could not connect to server.');
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
      
      // Optimistic update
      setMessages(prev => [...prev, msg]);
      
      // Send to host
      connRef.current.send({
          type: 'CHAT_MESSAGE',
          payload: msg
      });
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

  const checkWin = (currentTicket: TicketData) => {
    for (const row of currentTicket) {
      const numbersInRow = row.filter(cell => cell.value !== null);
      if (numbersInRow.length > 0 && numbersInRow.every(cell => cell.marked)) {
        setBingoStatus('win');
        setCurrentRhyme("KINH! KINH! KINH! BINGO!!!");
        // Optionally send 'I WON' to host here
        return;
      }
    }
    const allNumbers = currentTicket.flat().filter(c => c.value !== null);
    if (allNumbers.every(c => c.marked)) {
        setBingoStatus('win');
    }
  };

  // Render Login Screen if not connected
  if (!isConnected) {
      return (
          <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 p-4">
              <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 max-w-md w-full">
                  <h2 className="text-2xl font-bold text-white mb-6 text-center">
                      {lang === 'vi' ? 'Tham Gia Phòng Chơi' : 'Join Game Room'}
                  </h2>
                  <form onSubmit={handleJoin} className="space-y-4">
                      <div>
                          <label className="text-slate-400 text-sm mb-1 block">Your Name</label>
                          <input 
                              required
                              className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                              placeholder="Nickname..."
                              value={playerName}
                              onChange={e => setPlayerName(e.target.value)}
                          />
                      </div>
                      <div>
                          <label className="text-slate-400 text-sm mb-1 block">Room ID (From Host)</label>
                          <input 
                              required
                              className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                              placeholder="e.g. 5f3d-..."
                              value={roomId}
                              onChange={e => setRoomId(e.target.value)}
                          />
                      </div>
                      <button 
                          disabled={isConnecting}
                          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl transition-all flex justify-center items-center gap-2"
                      >
                          {isConnecting ? <Loader className="animate-spin"/> : <Link />}
                          {isConnecting ? 'Connecting...' : (lang === 'vi' ? 'Vào Phòng' : 'Join Room')}
                      </button>
                      <button type="button" onClick={onExit} className="w-full text-slate-500 text-sm hover:text-white">Back</button>
                  </form>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-900">
      {/* Navbar */}
      <nav className="p-3 bg-slate-800 border-b border-slate-700 flex justify-between items-center shadow-lg z-20">
         <div className="flex items-center gap-3">
            <div className="bg-red-600 text-white font-bold px-3 py-1 rounded text-sm uppercase tracking-wider animate-pulse">
                Live
            </div>
            <h1 className="text-white font-bold hidden sm:block">Room: {roomId.slice(0,6)}...</h1>
            {connectionLost && <WifiOff className="text-red-500 animate-pulse" />}
         </div>
         <div className="flex items-center gap-4">
             <button onClick={() => setMuted(!muted)} className="p-2 text-slate-400 hover:text-white rounded-full bg-slate-700">
                 {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
             </button>
             <button onClick={onExit} className="text-sm text-slate-400 hover:text-white underline">Exit</button>
         </div>
      </nav>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
         {/* Confetti / Win Overlay */}
         {bingoStatus === 'win' && (
            <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center flex-col p-4">
                <Trophy size={80} className="text-yellow-400 mb-4 animate-bounce" />
                <h2 className="text-4xl md:text-6xl font-black text-white text-center mb-4 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-red-500 to-pink-500">
                    BINGO!
                </h2>
                <button onClick={onExit} className="bg-white text-red-600 px-8 py-3 rounded-full font-bold hover:bg-gray-100">
                    Exit
                </button>
            </div>
         )}

         {/* Left: Game Area */}
         <div className="flex-1 p-4 overflow-y-auto flex flex-col items-center gap-6">
            
            {/* Current Call Display */}
            <div className="w-full max-w-2xl bg-gradient-to-r from-indigo-900 to-slate-900 rounded-2xl p-6 shadow-2xl border border-slate-700 flex items-center gap-6 relative overflow-hidden">
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl"></div>
                
                <div className="relative shrink-0">
                    <div className="w-24 h-24 rounded-full bg-red-600 flex items-center justify-center border-4 border-yellow-400 shadow-lg">
                        <span className="text-4xl font-black text-white">
                            {currentCall || '--'}
                        </span>
                    </div>
                </div>
                
                <div className="flex-1 z-10">
                    <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest mb-1">
                        {lang === 'vi' ? 'MC đang hô:' : 'Caller says:'}
                    </p>
                    <p className="text-white text-lg sm:text-xl font-medium italic">
                        "{currentRhyme || (lang === 'vi' ? 'Đang chờ số...' : 'Waiting for number...')}"
                    </p>
                </div>
            </div>

            {/* The Ticket */}
            <div className="w-full">
                <TicketView 
                    ticket={ticket} 
                    interactive={true} 
                    onCellClick={handleCellClick}
                />
            </div>

            {/* Recent History (Horizontal Scroll) */}
            <div className="w-full max-w-2xl">
                <p className="text-slate-400 text-xs mb-2 uppercase font-bold">Lịch sử / History</p>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mask-fade-right">
                    {history.slice().reverse().map((num, i) => (
                        <div key={i} className={`
                            w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold border
                            ${i === 0 ? 'bg-yellow-400 border-yellow-200 text-black scale-110' : 'bg-slate-800 border-slate-600 text-slate-400'}
                        `}>
                            {num}
                        </div>
                    ))}
                </div>
            </div>
         </div>

         {/* Right: Chat */}
         <div className="h-64 md:h-full md:w-80 p-2 shrink-0">
             <ChatOverlay 
                messages={messages} 
                onSendMessage={handleSendMessage}
                playerName={playerName} 
             />
         </div>
      </div>
    </div>
  );
};