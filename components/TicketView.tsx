import React from 'react';
import { TicketData } from '../types';

interface TicketViewProps {
  ticket: TicketData;
  onCellClick?: (rowIndex: number, colIndex: number, value: number) => void;
  interactive: boolean;
}

export const TicketView: React.FC<TicketViewProps> = ({ ticket, onCellClick, interactive }) => {
  return (
    <div className="w-full max-w-2xl mx-auto p-1.5 sm:p-4 bg-yellow-100 rounded-xl shadow-2xl border-4 border-red-600 relative overflow-hidden">
      {/* Decorative patterns */}
      <div className="absolute top-0 left-0 w-12 h-12 bg-red-500 -rotate-45 transform -translate-x-6 -translate-y-6"></div>
      <div className="absolute top-0 right-0 w-12 h-12 bg-red-500 rotate-45 transform translate-x-6 -translate-y-6"></div>
      <div className="absolute bottom-0 left-0 w-12 h-12 bg-red-500 rotate-45 transform -translate-x-6 translate-y-6"></div>
      <div className="absolute bottom-0 right-0 w-12 h-12 bg-red-500 -rotate-45 transform translate-x-6 translate-y-6"></div>

      <div className="text-center mb-1 sm:mb-2">
        <h3 className="text-red-700 font-black uppercase tracking-widest text-xs sm:text-lg border-b-2 border-red-200 inline-block px-4">Vé Lô Tô</h3>
      </div>

      <div className="grid grid-rows-3 gap-1 bg-white p-1 rounded border-2 border-red-200">
        {ticket.map((row, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-9 gap-px sm:gap-1 h-12 sm:h-20">
            {row.map((cell, colIndex) => (
              <div
                key={`${rowIndex}-${colIndex}`}
                onClick={() => {
                  if (interactive && cell.value !== null && onCellClick) {
                    onCellClick(rowIndex, colIndex, cell.value);
                  }
                }}
                className={`
                  relative flex items-center justify-center rounded-sm sm:rounded
                  text-sm sm:text-2xl font-black transition-all duration-100 select-none
                  ${cell.value === null 
                    ? 'bg-yellow-50' 
                    : 'bg-white border border-gray-200 cursor-pointer active:scale-95 shadow-sm hover:bg-yellow-50'}
                  ${cell.marked && cell.value !== null ? '!bg-red-600 !text-yellow-300 !border-red-700 shadow-inner' : 'text-gray-900'}
                `}
              >
                {cell.value}
                {cell.marked && (
                  <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                     <span className="w-[80%] h-[80%] border-2 border-yellow-300 rounded-full opacity-50"></span>
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      
      <div className="mt-1 flex justify-between text-[9px] sm:text-xs text-red-400 uppercase font-bold px-1">
        <span>Khai Xuân 2025</span>
        <span>Mã vé: {Math.floor(Math.random() * 9999)}</span>
      </div>
    </div>
  );
};