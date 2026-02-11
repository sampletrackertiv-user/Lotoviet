import { GoogleGenAI } from "@google/genai";
import { Language } from "../types";

// Safe initialization
const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const generateLotoRhyme = async (number: number, lang: Language): Promise<string> => {
  const ai = getAIClient();
  
  // Fallback nhanh nếu không có AI hoặc lỗi
  const fallback = lang === 'vi' 
      ? `Số ${number} bà con ơi!` 
      : `Number ${number}!`;

  if (!ai) return fallback;

  // Optimized prompts for TET HOLIDAY, SPEED and HUMOR
  const promptVi = `
    Bạn là MC Lô Tô hội chợ ngày Tết. Hãy hô số ${number}.
    Yêu cầu tuyệt đối:
    1. Ngắn gọn (dưới 10 từ).
    2. Hài hước, vui nhộn hoặc mang không khí Tết (bánh chưng, lì xì, mai đào).
    3. Chỉ trả về text câu hô, KHÔNG có ngoặc kép.
    Ví dụ: "Bánh chưng xanh bên dưa hấu đỏ, con số ${number}."
  `;
  
  const promptEn = `Bingo caller for Lunar New Year. Call number ${number}. Short, funny, festive. Max 8 words. No quotes.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: lang === 'vi' ? promptVi : promptEn,
      config: {
        thinkingConfig: { thinkingBudget: 0 }, 
        maxOutputTokens: 30, // Rất ngắn để đọc nhanh
        temperature: 1.2, // Tăng sáng tạo
      }
    });

    return response.text?.trim().replace(/["']/g, "") || fallback;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return fallback;
  }
};

export const generateBotChat = async (history: number[]): Promise<string> => {
  // Bot chat ít hơn để tập trung hiệu năng
  const ai = getAIClient();
  if (!ai || Math.random() > 0.2) return ""; 

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Context: Tet Holiday Bingo. Numbers called: ${history.slice(-3).join(', ')}. Write a 5-word excited chat message from a player waiting for a number. Vietnamese.`,
    });
    return response.text?.trim() || "";
  } catch {
    return "";
  }
};