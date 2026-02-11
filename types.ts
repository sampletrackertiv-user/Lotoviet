
export type GameMode = 'HOME' | 'HOST' | 'PLAYER';

export type Language = 'vi' | 'en';

export interface BingoNumber {
  value: number;
  called: boolean;
  rhyme?: string;
}

// A ticket is a 9x3 grid (traditional VN Loto) or 5x5.
// We will implement the complex 9-column format for authenticity:
// Columns: 0-9, 10-19, 20-29, ... 80-90.
// Each row has exactly 5 numbers.
export type TicketCell = {
  value: number | null;
  marked: boolean;
};

export type TicketRow = TicketCell[];
export type TicketData = TicketRow[];

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  isSystem?: boolean;
  avatar?: string;
}

export interface PlayerInfo {
  id: string; // PeerID
  name: string;
  joinedAt: number;
  remaining?: number; // Numbers left to win (on best row)
}

export interface GameState {
  currentNumber: number | null;
  history: number[];
  autoPlay: boolean;
  gameSpeed: number; // ms
  totalBalls: number; // 90 usually
}

// Networking Types
export type NetworkActionType = 
  | 'SYNC_STATE' 
  | 'CALL_NUMBER' 
  | 'CHAT_MESSAGE' 
  | 'RESET_GAME' 
  | 'PLAYER_JOINED' // Player -> Host: "I am here"
  | 'PLAYER_KICKED' // Host -> Player: "Get out"
  | 'CLAIM_BINGO';  // Player -> Host: "I won!"

export interface NetworkPayload {
  type: NetworkActionType;
  payload: any;
}
