import { GoogleGenAI } from "@google/genai";
import { Language } from "../types";

// Safe initialization
const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

// KHO VÈ LÔ TÔ MIỀN NAM (FULL 1-90) - STYLE HÁT/HÒ MIỆT VƯỜN
const TRADITIONAL_RHYMES: Record<number, string[]> = {
  1: ["Một cây một trái... một mình nhớ ai. Là con số 1."],
  2: ["Hai bến nước đầy... ghe xuồng chờ đợi. Là con số 2."],
  3: ["Ba má kêu về... cơm thơm khói tỏa. Là con số 3."],
  4: ["Bốn phương trời rộng... nghĩa nặng tình sâu. Là con số 4."],
  5: ["Năm anh bán cá... nói chuyện ngọt ngào. Là con số 5."],
  6: ["Sáu câu vọng cổ... nghe mà đứt ruột. Là con số 6."],
  7: ["Bảy sắc cầu vồng... sau cơn mưa lớn. Là con số 7."],
  8: ["Tám chuyện đầu làng... xôn xao cuối xóm. Là con số 8."],
  9: ["Chín nhớ mười thương... tình còn đậm sâu. Là con số 9."],
  10: ["Mười năm đợi đó... có ai chờ ai. Là con số 10."],
  11: ["Mười một chèo xuồng... lướt sóng qua kênh. Là số 11."],
  12: ["Mười hai bến đợi... con đò sang ngang. Là số 12."],
  13: ["Mười ba hên xui... trời kêu ai nấy dạ. Là số 13."],
  14: ["Mười bốn trăng tròn... soi sáng bờ ao. Là số 14."],
  15: ["Mười lăm trăng rằm... sáng cả xóm quê. Là số 15."],
  16: ["Mười sáu con nước... lớn ròng theo tháng. Là số 16."],
  17: ["Mười bảy cá linh... đầy khoang ghe nhỏ. Là số 17."],
  18: ["Mười tám xuân thì... má hồng môi thắm. Là số 18."],
  19: ["Mười chín ruộng lúa... thẳng cánh cò bay. Là số 19."],
  20: ["Hai chục tròn trịa... cười cái cho vui. Là con 20."],
  21: ["Hai mốt bông điên điển... vàng ươm mùa nước. Là con 21."],
  22: ["Hai hai vịt chạy... rộn rã sân nhà. Là con 22."],
  23: ["Hai ba anh Ba... nhậu hoài không xỉn. Là con 23."],
  24: ["Hai bốn sớm chiều... tảo tần buôn bán. Là con 24."],
  25: ["Hai lăm ghe cá... cập bến đầy khoang. Là con 25."],
  26: ["Hai sáu gió lộng... lục bình trôi xa. Là con 26."],
  27: ["Hai bảy chợ nổi... Cái Răng đông vui. Là con 27."],
  28: ["Hai tám phát tài... đổi đời trong phút. Là con 28."],
  29: ["Hai chín nước lớn... ghe xuồng tấp nập. Là con 29."],
  30: ["Ba chục trúng mánh... cười muốn xỉu luôn. Là con 30."],
  31: ["Ba mốt thương thầm... ai đâu có biết. Là con 31."],
  32: ["Ba hai ru con... võng đưa kẽo kẹt. Là con 32."],
  33: ["Ba ba con vịt... bơi ngang qua đồng. Là con 33."],
  34: ["Ba bốn mua may... bán đắt khỏi chê. Là con 34."],
  35: ["Ba lăm trúng mùa... lúa vàng nặng hạt. Là con 35."],
  36: ["Ba sáu chè ngọt... mát ruột mát gan. Là con 36."],
  37: ["Ba bảy anh Tư... cấy lúa giữa trưa. Là con 37."],
  38: ["Ba tám cô Út... cười duyên hết biết. Là con 38."],
  39: ["Ba chín tiền vô... đếm hoài không hết. Là con 39."],
  40: ["Bốn chục khỏe re... nói cười rộn rã. Là con 40."],
  41: ["Bốn mốt một mối... tình sâu nghĩa nặng. Là con 41."],
  42: ["Bốn hai bánh xèo... đổ nghe cái xèo. Là con 42."],
  43: ["Bốn ba chờ đợi... cuối bến con sông. Là con 43."],
  44: ["Bốn bốn đối đáp... hò ơi ngọt lịm. Là con 44."],
  45: ["Bốn lăm lai rai... cụng ly cái đã. Là con 45."],
  46: ["Bốn sáu nước nổi... trắng xóa đồng sâu. Là con 46."],
  47: ["Bốn bảy cá tôm... đầy xuồng đầy lưới. Là con 47."],
  48: ["Bốn tám bông lúa... trĩu nặng nghĩa tình. Là con 48."],
  49: ["Bốn chín ghe chài... trở về cập bến. Là con 49."],
  50: ["Năm chục phát lộc... cười tươi hết cỡ. Là con 50."],
  51: ["Năm mốt nắng sớm... ửng hồng bờ kênh. Là con 51."],
  52: ["Năm hai gánh lúa... vai oằn vẫn vui. Là con 52."],
  53: ["Năm ba anh Năm... hiền khô dễ mến. Là con 53."],
  54: ["Năm bốn bông súng... tím ngắt đồng xa. Là con 54."],
  55: ["Năm lăm song hỷ... niềm vui gõ cửa. Là con 55."],
  56: ["Năm sáu nước ròng... lộ bãi phù sa. Là con 56."],
  57: ["Năm bảy xa xứ... nhớ hoài quê mẹ. Là con 57."],
  58: ["Năm tám đám cưới... rộn ràng cả xóm. Là con 58."],
  59: ["Năm chín đợi đò... lòng nghe xốn xang. Là con 59."],
  60: ["Sáu chục lục bình... tím cả dòng sông. Là con 60."],
  61: ["Sáu mốt cá quẫy... sóng vỗ mạn thuyền. Là con 61."],
  62: ["Sáu hai mưa nhẹ... ướt mái hiên nhà. Là con 62."],
  63: ["Sáu ba anh Ba... gọi đò khản tiếng. Là con 63."],
  64: ["Sáu bốn tiếng hò... vang xa cuối bãi. Là con 64."],
  65: ["Sáu lăm gặt lúa... tiếng cười rộn vang. Là con 65."],
  66: ["Sáu sáu lộc phát... tiền vô như nước. Là con 66."],
  67: ["Sáu bảy câu hò... ngọt như mía lùi. Là con 67."],
  68: ["Sáu tám tài tử... đờn ca miệt vườn. Là con 68."],
  69: ["Sáu chín tình quê... mặn mà như mắm. Là con 69."],
  70: ["Bảy chục trúng lớn... đã cái bụng ghê. Là con 70."],
  71: ["Bảy mốt gió mát... rì rào bờ tre. Là con 71."],
  72: ["Bảy hai dắt trâu... ra đồng ăn cỏ. Là con 72."],
  73: ["Bảy ba anh Ba... cười tươi như tết. Là con 73."],
  74: ["Bảy bốn bông sen... nở giữa ao làng. Là con 74."],
  75: ["Bảy lăm mắm cá... thơm lừng gian bếp. Là con 75."],
  76: ["Bảy sáu nước dâng... ngập bãi phù sa. Là con 76."],
  77: ["Bảy bảy hên thiệt... khỏi bàn khỏi cãi. Là con 77."],
  78: ["Bảy tám ghe xuồng... ngược xuôi tấp nập. Là con 78."],
  79: ["Bảy chín đồng xanh... cò bay thẳng cánh. Là con 79."],
  80: ["Tám chục cười lớn... vang cả xóm trên. Là con 80."],
  81: ["Tám mốt lúa chín... thơm nức đồng xa. Là con 81."],
  82: ["Tám hai má gọi... về ăn cơm nghen. Là con 82."],
  83: ["Tám ba anh Ba... vá lưới ngoài sông. Là con 83."],
  84: ["Tám bốn bến nước... người thương đứng đợi. Là con 84."],
  85: ["Tám lăm trái ngọt... trĩu cành miệt vườn. Là con 85."],
  86: ["Tám sáu chung xóm... tối lửa tắt đèn. Là con 86."],
  87: ["Tám bảy mưa chiều... nghe buồn man mác. Là con 87."],
  88: ["Tám tám phát đạt... tiền vô ào ào. Là con 88."],
  89: ["Tám chín cười vang... xóm làng rộn rã. Là con 89."],
  90: ["Chín chục hô lớn... trúng rồi bà con ơi! Là con 90."]
};

const getHardcodedRhyme = (number: number) => {
    const list = TRADITIONAL_RHYMES[number];
    if (list && list.length > 0) return list[Math.floor(Math.random() * list.length)];
    return `Số ${number} bà con ơi!`;
};

export const generateLotoRhyme = async (number: number, lang: Language): Promise<string> => {
  // 1. Luôn ưu tiên dùng kho cứng để đảm bảo chất giọng và nội dung chuẩn
  if (lang === 'vi') {
      const hardcoded = getHardcodedRhyme(number);
      
      const ai = getAIClient();
      if (!ai) return hardcoded;

      // Giảm tỷ lệ dùng AI xuống 10% để ưu tiên kho dữ liệu "xịn" mới cập nhật
      if (Math.random() > 0.1) return hardcoded;

      try {
        const promptVi = `
            Hãy đóng vai người hô Lô Tô miền Tây Nam Bộ (phong cách hội chợ).
            Sáng tác một câu hò/vè lục bát hoặc tự do, có vần điệu, hài hước, dân dã để hô con số ${number}.
            Nội dung liên quan đến sông nước, đời sống miền Tây.
            Ngắn gọn dưới 20 từ. Chỉ trả về nội dung câu hò, KHÔNG dùng ngoặc kép.
            Kết thúc bằng cụm từ xác nhận số.
        `;
        
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: promptVi,
            config: { thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 60 }
        });
        
        const text = response.text?.trim().replace(/["']/g, "");
        return text || hardcoded;
      } catch (e) {
        // LỖI QUOTA HOẶC MẠNG -> Fallback ngay lập tức
        console.warn("AI Quota/Network Error, using fallback:", e);
        return hardcoded;
      }
  }

  // English logic (unchanged)
  const fallbackEn = `Number ${number}!`;
  try {
      const ai = getAIClient();
      if (!ai) return fallbackEn;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Funny Bingo rhyme for number ${number}. Short.`,
      });
      return response.text?.trim().replace(/["']/g, "") || fallbackEn;
  } catch {
      return fallbackEn;
  }
};

export const generateBotChat = async (history: number[]): Promise<string> => {
  return "";
};