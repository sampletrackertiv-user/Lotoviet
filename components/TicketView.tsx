import React from 'react';
import { TicketData } from '../types';
import { Sparkles, QrCode, Flower } from 'lucide-react';

interface TicketViewProps {
  ticket: TicketData;
  onCellClick?: (rowIndex: number, colIndex: number, value: number) => void;
  interactive: boolean;
}

export const TicketView: React.FC<TicketViewProps> = ({ ticket, onCellClick, interactive }) => {
  // Ticket is now potentially 9 rows. We should group them visually if possible, or just one long card.
  // 9 rows is long, let's keep it as one long "Sớ Táo Quân" style ticket.
  
  return (
    <div className="w-full max-w-2xl mx-auto relative group perspective-1000 mb-8">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-red-400 to-yellow-400 rounded-2xl blur-lg opacity-20 group-hover:opacity-30 transition-opacity duration-500"></div>
      
      <div className="relative bg-white rounded-2xl border-2 border-red-500 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-red-600 p-2 flex justify-between items-center px-4 shadow-sm sticky top-0 z-20">
             <div className="flex gap-1">
                 <div className="w-2 h-2 rounded-full bg-yellow-300"></div>
                 <div className="w-2 h-2 rounded-full bg-yellow-300"></div>
             </div>
             <span className="text-[10px] text-yellow-100 font-bold uppercase tracking-widest">HỘI XUÂN 2025</span>
        </div>
        
        <div className="p-3 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')]">
            
            {/* The Grid */}
            <div className="flex flex-col gap-1">
                {ticket.map((row, rowIndex) => (
                <React.Fragment key={rowIndex}>
                    {/* Visual separator every 3 rows to mimic separate tickets */}
                    {rowIndex > 0 && rowIndex % 3 === 0 && (
                        <div className="h-4 flex items-center justify-center my-1 opacity-50">
                            <div className="h-px bg-red-200 w-full dashed"></div>
                            <span className="text-[8px] text-red-300 px-2 font-mono">CẮT TẠI ĐÂY</span>
                            <div className="h-px bg-red-200 w-full dashed"></div>
                        </div>
                    )}
                    
                    <div className="grid grid-cols-9 gap-1 h-10 sm:h-12">
                        {row.map((cell, colIndex) => (
                        <div
                            key={`${rowIndex}-${colIndex}`}
                            onClick={() => {
                            if (interactive && cell.value !== null && onCellClick) {
                                onCellClick(rowIndex, colIndex, cell.value);
                            }
                            }}
                            className={`
                            relative rounded-md flex items-center justify-center
                            font-black text-sm sm:text-lg transition-all duration-200
                            ${cell.value === null 
                                ? 'bg-red-50/30' // Empty
                                : 'cursor-pointer active:scale-95 border border-slate-100 shadow-sm'}
                            
                            ${!cell.marked && cell.value !== null 
                                ? 'bg-white text-slate-800' 
                                : ''}
                            
                            ${cell.marked && cell.value !== null 
                                ? 'bg-red-500 text-white border-red-600 shadow-inner z-10' 
                                : ''}
                            `}
                        >
                            {cell.value}
                        </div>
                        ))}
                    </div>
                </React.Fragment>
                ))}
            </div>

            <div className="mt-4 flex justify-center items-center">
                <span className="text-[9px] text-red-300 font-bold uppercase tracking-widest">Đại Phát • Đại Lợi</span>
            </div>
        </div>
      </div>
    </div>
  );
};