
import React from 'react';
import { TicketData } from '../types';

interface TicketViewProps {
  ticket: TicketData;
  onCellClick?: (rowIndex: number, colIndex: number, value: number) => void;
  interactive: boolean;
}

export const TicketView: React.FC<TicketViewProps> = ({ ticket, onCellClick, interactive }) => {
  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-white rounded-xl border-2 border-red-600 shadow-xl overflow-hidden flex flex-col">
        {/* Header - Super Slim */}
        <div className="bg-red-600 p-0.5 flex justify-center items-center">
             <span className="text-[7px] text-yellow-200 font-black uppercase tracking-[0.4em]">Đại Hội Lô Tô Xuân 2026</span>
        </div>
        
        <div className="p-0.5 bg-[#fffdfa]">
            <div className="flex flex-col gap-px">
                {ticket.map((row, rowIndex) => (
                <React.Fragment key={rowIndex}>
                    {/* Tiny Divider every 3 rows */}
                    {rowIndex > 0 && rowIndex % 3 === 0 && (
                        <div className="h-1 flex items-center justify-center">
                            <div className="h-[0.5px] bg-red-100 w-full"></div>
                        </div>
                    )}
                    
                    <div className="grid grid-cols-9 gap-px">
                        {row.map((cell, colIndex) => (
                        <div
                            key={`${rowIndex}-${colIndex}`}
                            onClick={() => {
                                if (interactive && cell.value !== null && onCellClick) {
                                    onCellClick(rowIndex, colIndex, cell.value);
                                }
                            }}
                            className={`
                            h-6 sm:h-8 flex items-center justify-center
                            font-black text-[11px] sm:text-base rounded-sm
                            ${cell.value === null 
                                ? 'bg-red-50/10' 
                                : 'cursor-pointer border border-slate-50 transition-all active:scale-90'}
                            
                            ${!cell.marked && cell.value !== null 
                                ? 'bg-white text-slate-800' 
                                : ''}
                            
                            ${cell.marked && cell.value !== null 
                                ? 'bg-red-600 text-white border-red-700 shadow-inner scale-105 z-10' 
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
            <div className="mt-0.5 flex justify-center">
                <span className="text-[6px] text-red-200 font-bold uppercase tracking-widest">LotoMaster AI - Chúc Mừng Năm Mới</span>
            </div>
        </div>
      </div>
    </div>
  );
};
