import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Copy, Users, WifiOff, Activity, ChevronRight, RefreshCw, AlertTriangle, Database, CheckCircle2, XCircle } from 'lucide-react';
import { generateLotoRhyme } from '../services/geminiService';
import { Language, ChatMessage, PlayerInfo } from '../types';
import { database, isFirebaseConfigured, listenToConnectionStatus } from '../services/firebase';
import { ref, set, onValue, update, push, remove, onDisconnect } from "firebase/database";

interface GameHostProps {
  onExit: () => void;
  lang: Language;
}

type TabType = 'BOARD' | 'PLAYERS' | 'LOG';

const APP_PREFIX = 'LOTOMASTER-';

// Helper to generate a random 6-char code
const generateShortCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// Helper to get color based on number range
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
  const [isOnline, setIsOnline] = useState(false);
  
  // Network State
  const [roomCode, setRoomCode] = useState<string>('');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [gameLog, setGameLog] = useState<string[]>([]);
  
  // Refs
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

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

  // 1. Check Firebase Config
  if (!isFirebaseConfigured()) {
      return (
          <div className="flex items-center justify-center h-screen bg-slate-900 text-white p-6">
              <div className="bg-slate-800 p-6 rounded-xl max-w-lg text-center border border-slate-700">
                  <Database size={48} className="mx-auto text-red-500 mb-4" />
                  <h2 className="text-2xl font-bold mb-2">Chưa cấu hình Database</h2>
                  <p className="mb-4 text-slate-300">Vui lòng kiểm tra file services/firebase.ts</p>
                  <button onClick={onExit} className="bg-indigo-600 px-4 py-2 rounded font-bold">Quay lại</button>
              </div>
          </div>
      );
  }

  // 2. Connection Monitor & Wake Lock
  useEffect(() => {
    const unsubscribeStatus = listenToConnectionStatus((status) => {
        setIsOnline(status);
        if (!status) {
            addLog("System: Lost connection to Firebase server.");
        } else {
            // Re-establish presence if needed
            if (roomCode) {
                // Optional: Update status back to active
                // update(ref(database, `rooms/${roomCode}`), { status: 'ACTIVE' });
            }
        }
    });

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch (err) { console.warn('Wake Lock error:', err); }
    };
    requestWakeLock();
    
    return () => { 
        if (wakeLockRef.current) wakeLockRef.current.release(); 
        unsubscribeStatus();
    };
  }, [roomCode]);

  // 3. Initialize Firebase Room
  useEffect(() => {
    const code = generateShortCode();
    setRoomCode(code);
    
    // Create initial room state in Firebase
    const roomRef = ref(database, `rooms/${code}`);
    set(roomRef, {
        status: 'ACTIVE',
        currentNumber: null,
        currentRhyme: lang === 'vi' ? "Phòng đã sẵn sàng!" : "Room Ready!",
        history: [],
        createdAt: Date.now()
    });

    // Clean up room on disconnect (optional - usually better to keep it for reconnect)
    onDisconnect(roomRef).update({ status: 'HOST_DISCONNECTED' });

    // Listen for Players
    const playersRef = ref(database, `rooms/${code}/players`);
    const unsubscribePlayers = onValue(playersRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const playerList = Object.values(data) as PlayerInfo[];
            setPlayers(playerList);
        } else {
            setPlayers([]);
        }
    });

    // Listen for Bingo Claims
    const claimsRef = ref(database, `rooms/${code}/claims`);
    const unsubscribeClaims = onValue(claimsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            // Get the latest claim
            const claims = Object.values(data) as any[];
            const latestClaim = claims[claims.length - 1];
            if (latestClaim && Date.now() - latestClaim.timestamp < 5000) { // Only recent claims
                addLog(`BINGO CLAIM: ${latestClaim.playerName}`);
                speak(`Bingo! ${latestClaim.playerName} kêu Bingo!`);
                alert(`${latestClaim.playerName} claims BINGO!`);
            }
        }
    });

    // Listen for Chat messages to log them
    const chatRef = ref(database, `rooms/${code}/messages`);
    const unsubscribeChat = onValue(chatRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
             const msgs = Object.values(data) as ChatMessage[];
             const latestMsg = msgs.sort((a,b) => Number(a.id) - Number(b.id)).pop();
             if (latestMsg && Number(latestMsg.id) > Date.now() - 2000) {
                 addLog(`${latestMsg.sender}: ${latestMsg.text}`);
             }
        }
    });


    const readyMsg = lang === 'vi' ? "Phòng đã sẵn sàng!" : "Room Ready!";
    setCurrentRhyme(readyMsg);
    speak(readyMsg);
    addLog("Room created: " + code);

    return () => {
        unsubscribePlayers();
        unsubscribeClaims();
        unsubscribeChat();
        stopAuto();
        remove(roomRef); // Clean up DB when host exits explicitly
    };
  }, []); 

  // Game Logic Updates to Firebase
  const updateGameState = (num: number | null, rhyme: string, hist: number[]) => {
      if (!roomCode) return;
      const updates: any = {};
      updates[`rooms/${roomCode}/currentNumber`] = num;
      updates[`rooms/${roomCode}/currentRhyme`] = rhyme;
      updates[`rooms/${roomCode}/history`] = hist;
      update(ref(database), updates);
  };

  const drawNumber = async () => {
    const allNumbers = Array.from({ length: 90 }, (_, i) => i + 1);
    const available = allNumbers.filter(n => !calledNumbers.includes(n));

    if (available.length === 0) {
      stopAuto();
      const endMsg = lang === 'vi' ? "Hết số rồi!" : "Game Over!";
      setCurrentRhyme(endMsg);
      speak(endMsg);
      updateGameState(null, endMsg, calledNumbers);
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

    updateGameState(nextNum, rhyme, newHistory);
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
    const msg = lang === 'vi' ? "Ván mới!" : "New Game!";
    setCurrentRhyme(msg);
    addLog("Game reset.");
    updateGameState(null, msg, []);
    
    // Clear logs/claims/messages in DB
    if(roomCode) {
        const updates: any = {};
        updates[`rooms/${roomCode}/claims`] = null;
        updates[`rooms/${roomCode}/messages`] = null;
        update(ref(database), updates);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(roomCode);
    alert('Room Code copied!');
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="p-3 bg-slate-900 border-b border-slate-700 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500">
            Loto Host
            </h1>
            <div className="bg-slate-800 pl-3 pr-2 py-1 rounded-full border border-slate-700 flex items-center gap-2">
                <span className="text-xs text-slate-400">ROOM:</span>
                {roomCode ? (
                    <code className="text-green-400 font-mono font-black text-lg tracking-widest">{roomCode}</code>
                ) : (
                    <RefreshCw className="animate-spin text-yellow-500" size={16}/>
                )}
                <button onClick={copyToClipboard} className="hover:text-white p-1"><Copy size={14}/></button>
            </div>
            
            {/* Connection Status Indicator */}
            <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors duration-500 ${isOnline ? 'bg-green-900/20 border-green-800 text-green-500' : 'bg-red-900/20 border-red-800 text-red-500 animate-pulse'}`}>
                {isOnline ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                {isOnline ? 'Online' : 'Offline'}
            </div>
        </div>

        <div className="flex gap-2 items-center">
            <button onClick={() => setMuted(!muted)} className="p-2 hover:bg-slate-800 rounded-full text-slate-300">
             {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
           <button onClick={resetGame} className="p-2 hover:bg-slate-800 rounded text-slate-300">
            <RotateCcw size={20} />
          </button>
          <button onClick={() => { if(confirm("Exit?")) onExit(); }} className="px-3 py-1 bg-red-900/50 hover:bg-red-900 text-red-200 text-xs rounded border border-red-800">
            End
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
                                            <div className="text-[10px] text-slate-400 font-mono">ID: {p.id.substr(0,4)}</div>
                                        </div>
                                    </div>
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