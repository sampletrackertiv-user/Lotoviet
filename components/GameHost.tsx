import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Copy, Users, WifiOff, XCircle, Activity, ChevronRight } from 'lucide-react';
import { generateLotoRhyme } from '../services/geminiService';
import { Language, NetworkPayload, ChatMessage, PlayerInfo } from '../types';
import Peer, { DataConnection } from 'peerjs';

interface GameHostProps {
  onExit: () => void;
  lang: Language;
}

type TabType = 'BOARD' | 'PLAYERS' | 'LOG';

// Helper to get color based on number range (1-10, 11-20, etc.)
const getBallColorClass = (num: number) => {
  const range = Math.floor((num - 1) / 10);
  const colors = [
    'from-red-500 to-red-600 border-red-400',       // 1-10
    'from-green-500 to-green-600 border-green-400', // 11-20
    'from-blue-500 to-blue-600 border-blue-400',    // 21-30
    'from-yellow-500 to-yellow-600 border-yellow-400 text-black', // 31-40
    'from-purple-500 to-purple-600 border-purple-400', // 41-50
    'from-pink-500 to-pink-600 border-pink-400',    // 51-60
    'from-teal-500 to-teal-600 border-teal-400',    // 61-70
    'from-orange-500 to-orange-600 border-orange-400', // 71-80
    'from-slate-500 to-slate-600 border-slate-400', // 81-90
  ];
  return colors[range] || 'from-gray-500 to-gray-600';
};

export const GameHost: React.FC<GameHostProps> = ({ onExit, lang }) => {
  // Game State
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [currentRhyme, setCurrentRhyme] = useState<string>('');
  const [isAuto, setIsAuto] = useState(false);
  const [speed, setSpeed] = useState(6000);
  const [flash, setFlash] = useState(false);
  const [muted, setMuted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('BOARD');
  
  // Network State
  const [peerId, setPeerId] = useState<string>('');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [gameLog, setGameLog] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peerError, setPeerError] = useState<string | null>(null);
  const [isSignalingLost, setIsSignalingLost] = useState(false);
  
  const peerRef = useRef<Peer | null>(null);

  // Refs for logic
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map()); 
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  
  // State Refs
  const stateRef = useRef({
    calledNumbers,
    currentNumber,
    currentRhyme,
    players
  });

  useEffect(() => {
    stateRef.current = { calledNumbers, currentNumber, currentRhyme, players };
  }, [calledNumbers, currentNumber, currentRhyme, players]);

  // TTS Helper
  const speak = (text: string) => {
    if (muted || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  const addLog = (msg: string) => {
    setGameLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
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
    requestWakeLock();
    return () => { if (wakeLockRef.current) wakeLockRef.current.release(); };
  }, []);

  // Initialize PeerJS
  useEffect(() => {
    let peer: Peer;

    const initPeer = () => {
      setPeerError(null);
      try {
        peer = new Peer({ debug: 1 });
        peerRef.current = peer;

        peer.on('open', (id) => {
          setPeerId(id);
          const readyMsg = lang === 'vi' ? "Phòng đã sẵn sàng!" : "Room Ready!";
          setCurrentRhyme(readyMsg);
          speak(readyMsg);
          setPeerError(null);
          setIsSignalingLost(false);
        });

        peer.on('connection', (conn) => {
          conn.on('open', () => {
            connectionsRef.current.set(conn.peer, conn);
            const currentState = stateRef.current;
            conn.send({
              type: 'SYNC_STATE',
              payload: { 
                  history: currentState.calledNumbers, 
                  currentNumber: currentState.currentNumber, 
                  currentRhyme: currentState.currentRhyme 
              }
            });
          });

          conn.on('data', (data: any) => {
            const action = data as NetworkPayload;
            if (action.type === 'PLAYER_JOINED') {
                const info = action.payload as { name: string };
                const newPlayer: PlayerInfo = {
                    id: conn.peer,
                    name: info.name || `User ${conn.peer.substr(0,4)}`,
                    joinedAt: Date.now()
                };
                setPlayers(prev => {
                    if (prev.find(p => p.id === newPlayer.id)) return prev;
                    return [...prev, newPlayer];
                });
                addLog(`${newPlayer.name} joined.`);
                broadcast({
                    type: 'CHAT_MESSAGE',
                    payload: {
                        id: Date.now().toString(),
                        sender: 'System',
                        text: `${newPlayer.name} joined!`,
                        isSystem: true
                    }
                });
            }
            if (action.type === 'CLAIM_BINGO') {
                const currentPlayers = stateRef.current.players;
                const playerName = currentPlayers.find(p => p.id === conn.peer)?.name || 'Unknown';
                addLog(`WINNER: ${playerName} claims BINGO!`);
                speak(`Bingo! ${playerName} thắng rồi!`);
                alert(`${playerName} claims BINGO! Check their ticket!`);
            }
            if (action.type === 'CHAT_MESSAGE') {
                const msg = action.payload as ChatMessage;
                setMessages(prev => [...prev, msg]);
                broadcast(action);
            }
          });

          conn.on('close', () => handleDisconnect(conn.peer));
          conn.on('error', () => handleDisconnect(conn.peer));
        });

        peer.on('disconnected', () => {
            setIsSignalingLost(true);
            if (peer && !peer.destroyed) peer.reconnect();
        });

        peer.on('error', (err: any) => {
            if (err.type === 'network' || err.message?.includes('Lost connection')) {
                 setIsSignalingLost(true);
                 setTimeout(() => { if (peer && !peer.destroyed) peer.reconnect(); }, 2000);
                 return;
            }
            if (!peerId) setPeerError("Connection Error");
        });
      } catch (e: any) { setPeerError(e.message); }
    };

    initPeer();

    const handleDisconnect = (pId: string) => {
        setPlayers(prev => {
            const pName = prev.find(p => p.id === pId)?.name;
            if (pName) addLog(`${pName} disconnected.`);
            return prev.filter(p => p.id !== pId);
        });
        connectionsRef.current.delete(pId);
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (peer) peer.destroy();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []); 

  const broadcast = (data: NetworkPayload) => {
    connectionsRef.current.forEach(conn => {
        if (conn.open) conn.send(data);
    });
  };

  // Game Logic
  const drawNumber = async () => {
    const allNumbers = Array.from({ length: 90 }, (_, i) => i + 1);
    const available = allNumbers.filter(n => !calledNumbers.includes(n));

    if (available.length === 0) {
      stopAuto();
      const endMsg = lang === 'vi' ? "Hết số rồi!" : "Game Over!";
      setCurrentRhyme(endMsg);
      speak(endMsg);
      broadcast({ type: 'CALL_NUMBER', payload: { number: null, rhyme: endMsg, history: calledNumbers } });
      return;
    }

    const nextNum = available[Math.floor(Math.random() * available.length)];
    
    setFlash(true);
    setCurrentNumber(nextNum);
    const newHistory = [...calledNumbers, nextNum];
    setCalledNumbers(newHistory);
    setTimeout(() => setFlash(false), 500);

    speak(lang === 'vi' ? `Số ${nextNum}` : `Number ${nextNum}`);
    const rhyme = await generateLotoRhyme(nextNum, lang);
    setCurrentRhyme(rhyme);
    setTimeout(() => speak(rhyme), 800);

    broadcast({
        type: 'CALL_NUMBER',
        payload: {
            number: nextNum,
            rhyme: rhyme,
            history: newHistory
        }
    });
  };

  const startAuto = () => {
    if (isAuto) return;
    setIsAuto(true);
    drawNumber();
    timerRef.current = setInterval(drawNumber, speed);
  };

  const stopAuto = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsAuto(false);
  };

  const toggleAuto = () => {
    if (isAuto) stopAuto();
    else startAuto();
  };

  const resetGame = () => {
    if (!confirm('Reset game?')) return;
    stopAuto();
    setCalledNumbers([]);
    setCurrentNumber(null);
    setCurrentRhyme(lang === 'vi' ? "Ván mới!" : "New Game!");
    addLog("Game reset.");
    broadcast({ type: 'RESET_GAME', payload: {} });
  };

  const kickPlayer = (playerId: string) => {
      if(!confirm("Kick this player?")) return;
      const conn = connectionsRef.current.get(playerId);
      if (conn) {
          conn.send({ type: 'PLAYER_KICKED', payload: {} });
          setTimeout(() => conn.close(), 500);
      }
      setPlayers(prev => prev.filter(p => p.id !== playerId));
      addLog(`Kicked player ${playerId}`);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(peerId);
    alert('Room ID copied!');
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="p-3 bg-slate-900 border-b border-slate-700 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500">
            Loto Host
            </h1>
            <div className="bg-slate-800 px-3 py-1 rounded-full border border-slate-700 flex items-center gap-2">
                <span className="text-xs text-slate-400">ID:</span>
                <code className="text-green-400 font-mono font-bold">{peerId || '...'}</code>
                <button onClick={copyToClipboard} className="hover:text-white"><Copy size={14}/></button>
            </div>
             {isSignalingLost && <WifiOff size={16} className="text-red-500 animate-pulse" />}
        </div>

        <div className="flex gap-2 items-center">
            <button onClick={() => setMuted(!muted)} className="p-2 hover:bg-slate-800 rounded-full text-slate-300">
             {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
           <button onClick={resetGame} className="p-2 hover:bg-slate-800 rounded text-slate-300">
            <RotateCcw size={20} />
          </button>
          <button onClick={() => { if(confirm("Exit?")) onExit(); }} className="px-3 py-1 bg-red-900/50 hover:bg-red-900 text-red-200 text-xs rounded border border-red-800">
            End Room
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* LEFT PANEL: GAME CONTROLS (60%) */}
        <section className="flex-[3] relative flex flex-col border-r border-slate-700 overflow-hidden">
           {/* Background & Current Number */}
           <div className="flex-1 relative flex flex-col items-center justify-center p-4">
               <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-900 to-slate-900 z-0"></div>
               
               {/* Ball */}
               <div className="z-10 relative mb-8">
                 <div onClick={isAuto ? stopAuto : drawNumber} className={`
                    w-40 h-40 md:w-56 md:h-56 rounded-full cursor-pointer
                    bg-gradient-to-br from-red-500 via-pink-600 to-purple-700
                    flex items-center justify-center shadow-[0_0_50px_rgba(236,72,153,0.5)]
                    border-8 border-white/10 relative transition-all duration-300
                    ${flash ? 'scale-110 brightness-110' : 'scale-100 hover:scale-105'}
                 `}>
                    {currentNumber ? (
                      <span className="text-7xl md:text-9xl font-black text-white drop-shadow-lg ball-animation">{currentNumber}</span>
                    ) : (
                      <span className="text-xl font-bold text-white/50 uppercase">Start</span>
                    )}
                    <div className="absolute top-6 left-10 w-12 h-8 bg-white/20 rounded-full rotate-[-45deg] blur-sm"></div>
                 </div>
               </div>

               {/* Rhyme */}
               <div className="z-10 w-full max-w-lg min-h-[100px] flex items-center justify-center text-center p-4 glass-panel rounded-xl mb-8">
                   <p className="text-xl md:text-2xl text-yellow-100 italic font-medium leading-relaxed">"{currentRhyme}"</p>
               </div>

               {/* Main Control Bar */}
               <div className="z-10 flex flex-col items-center gap-4 w-full max-w-md">
                   <div className="flex items-center gap-6 w-full justify-center">
                       <div className="flex flex-col items-center gap-1">
                           <span className="text-[10px] uppercase text-slate-500 font-bold">Tốc độ (Speed)</span>
                           <input type="range" min="2000" max="10000" step="500" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-32 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                       </div>
                       
                       <button 
                        onClick={toggleAuto}
                        className={`flex items-center justify-center gap-2 px-8 py-3 rounded-full font-bold text-lg shadow-lg transition-all min-w-[160px]
                        ${isAuto ? 'bg-red-500/20 text-red-400 border border-red-500/50 animate-pulse' : 'bg-green-600 hover:bg-green-500 text-white'}`}
                       >
                        {isAuto ? <><Pause fill="currentColor"/> STOP</> : <><Play fill="currentColor"/> QUAY</>}
                       </button>
                   </div>
               </div>
           </div>
        </section>

        {/* RIGHT PANEL: MANAGEMENT (40%) */}
        <section className="flex-[2] bg-slate-800 flex flex-col min-w-[320px] md:max-w-lg shadow-xl z-20">
            {/* Tabs */}
            <div className="flex border-b border-slate-700 bg-slate-900">
                <button onClick={() => setActiveTab('BOARD')} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 ${activeTab === 'BOARD' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-800' : 'text-slate-500 hover:text-slate-300'}`}>
                    <Activity size={16}/> <span className="hidden sm:inline">Bảng Số</span> ({calledNumbers.length})
                </button>
                <button onClick={() => setActiveTab('PLAYERS')} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 ${activeTab === 'PLAYERS' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-800' : 'text-slate-500 hover:text-slate-300'}`}>
                    <Users size={16}/> <span className="hidden sm:inline">Người Chơi</span> ({players.length})
                </button>
                <button onClick={() => setActiveTab('LOG')} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 ${activeTab === 'LOG' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-800' : 'text-slate-500 hover:text-slate-300'}`}>
                    <span className="hidden sm:inline">Nhật ký</span> Log
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-900/50">
                {activeTab === 'BOARD' && (
                    <div className="flex flex-col h-full">
                        {/* Timeline / Recent Calls */}
                        <div className="mb-4 bg-slate-800 p-2 rounded-lg border border-slate-700">
                             <h3 className="text-[10px] uppercase text-slate-400 font-bold mb-2 flex items-center gap-1">
                                <ChevronRight size={12}/> Vừa gọi (Recent)
                             </h3>
                             <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                {calledNumbers.slice().reverse().slice(0, 10).map((num, i) => (
                                    <div key={i} className={`
                                        w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center shrink-0 font-bold border-2 shadow-lg
                                        bg-gradient-to-br ${getBallColorClass(num)} text-white
                                        ${i === 0 ? 'scale-110 ring-2 ring-white/50' : 'opacity-80 scale-90'}
                                    `}>
                                        {num}
                                    </div>
                                ))}
                                {calledNumbers.length === 0 && <span className="text-xs text-slate-500 italic p-2">Chưa có số nào...</span>}
                             </div>
                        </div>

                        {/* Full Board Grid */}
                        <div className="grid grid-cols-10 gap-1.5 pb-10">
                            {Array.from({ length: 90 }, (_, i) => i + 1).map((num) => {
                                const isCalled = calledNumbers.includes(num);
                                const isRecent = currentNumber === num;
                                return (
                                    <div key={num} className={`
                                        aspect-square rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold transition-all duration-500
                                        ${isRecent ? `scale-150 z-50 ring-4 ring-yellow-300 shadow-2xl bg-gradient-to-br ${getBallColorClass(num)} text-white` : ''}
                                        ${!isRecent && isCalled ? `scale-100 opacity-100 shadow-md bg-gradient-to-br ${getBallColorClass(num)} text-white` : ''}
                                        ${!isCalled ? 'bg-slate-800/30 text-slate-700 border border-slate-800 scale-50 opacity-50' : ''}
                                    `}>
                                        {isCalled ? num : <div className="w-1 h-1 bg-slate-700 rounded-full"></div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {activeTab === 'PLAYERS' && (
                    <div className="space-y-2">
                        {players.length === 0 ? (
                            <div className="text-center text-slate-500 mt-10">Chưa có ai tham gia...</div>
                        ) : (
                            players.map(p => (
                                <div key={p.id} className="flex items-center justify-between bg-slate-800 p-3 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold shadow">{p.name.charAt(0)}</div>
                                        <div>
                                            <div className="font-bold text-sm text-white">{p.name}</div>
                                            <div className="text-[10px] text-slate-400 font-mono">{p.id.substr(0,6)}...</div>
                                        </div>
                                    </div>
                                    <button onClick={() => kickPlayer(p.id)} className="text-slate-500 hover:text-red-400 hover:bg-red-900/30 p-2 rounded transition-all" title="Kick">
                                        <XCircle size={18} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {activeTab === 'LOG' && (
                    <div className="space-y-1 font-mono text-xs text-slate-400">
                        {gameLog.map((log, i) => (
                            <div key={i} className="border-b border-slate-800 pb-1">{log}</div>
                        ))}
                    </div>
                )}
            </div>
        </section>
      </main>
    </div>
  );
};