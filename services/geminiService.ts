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
  if (!ai) {
    return lang === 'vi' 
      ? `Số ${number}! Cờ ra con mấy, con mấy gì ra...`
      : `Number ${number}! Check your tickets!`;
  }

  // Optimized prompts for TTS and brevity
  const promptVi = `Bạn là người hô lô tô. Hãy viết 1 câu thơ lục bát hoặc vè ngắn (tối đa 20 từ) để hô số ${number}. Quan trọng: Chỉ trả về nội dung câu thơ, không có lời dẫn, không có dấu ngoặc kép.`;
  const promptEn = `You are a Bingo caller. Write a very short, funny rhyming couplet (max 15 words) for number ${number}. Return ONLY the text, no quotes.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: lang === 'vi' ? promptVi : promptEn,
      config: {
        thinkingConfig: { thinkingBudget: 0 }, // Low latency needed
        maxOutputTokens: 50,
        temperature: 1.0, // High creativity
      }
    });

    return response.text?.trim().replace(/["']/g, "") || (lang === 'vi' ? `Số ${number}!` : `Number ${number}!`);
  } catch (error) {
    console.error("Gemini API Error:", error);
    return lang === 'vi' ? `Số ${number}!` : `Number ${number}!`;
  }
};

export const generateBotChat = async (history: number[]): Promise<string> => {
  const ai = getAIClient();
  if (!ai || Math.random() > 0.3) return ""; // Reduce API usage, only chat sometimes

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `We are playing Bingo/Loto. The numbers called are ${history.slice(-5).join(', ')}. Write a very short (5-10 words) chat message from an excited player who is waiting for a specific number or commenting on the game. No quotes.`,
    });
    return response.text?.trim() || "";
  } catch {
    return "";
  }
};