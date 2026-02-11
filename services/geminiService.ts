import { GoogleGenAI } from "@google/genai";
import { Language } from "../types";

// Safe initialization
const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

// KHO VÈ LÔ TÔ TRUYỀN THỐNG (FULL 1-90)
// Đảm bảo game chạy mượt kể cả khi hết hạn mức AI
const TRADITIONAL_RHYMES: Record<number, string[]> = {
  1: ["Gì ra con mấy, con mấy gì ra. Số 1 là con số 1.", "Chắc ăn như bắp, là con số 1.", "Sông Cửu Long chín cửa hai dòng."],
  2: ["Duyên tình 2 đứa, là con số 2.", "Đêm khuya thanh vắng, con số 2.", "Yêu nhau cởi áo cho nhau."],
  3: ["Chị Ba đi chợ, mua cái gì đây. Là con số 3.", "Vững như kiềng ba chân.", "Ba chìm bảy nổi."],
  4: ["Bốn phương tám hướng, là con số 4.", "Sống chết có nhau, là con số 4.", "Làm trai bốn bể là nhà."],
  5: ["Năm anh em trên một chiếc xe tăng.", "Đi đâu lanh quanh, là con số 5.", "Cửa sừng trâu."],
  6: ["Lộc lộc lộc, là con số 6.", "Sáu câu vọng cổ.", "Cháu lên ba cháu đi mẫu giáo."],
  7: ["Bảy nổi ba chìm, là con số 7.", "Một tuần bảy ngày.", "Thất tình thì về quê chăn vịt."],
  8: ["Tám chuyện trên trời dưới đất.", "Bát cơm mẻ, là con số 8.", "Con số 8 còng queo."],
  9: ["Chín bậc tình yêu, là con số 9.", "Con số 9, chín chắn thật thà.", "Vừa vừa phải phải."],
  10: ["Mười ngón tay thơm.", "Điểm 10 cho chất lượng.", "Một chục tròn trĩnh."],
  11: ["Một cây làm chẳng nên non.", "Hai chân đi trước, số 11.", "Đứng nép bên đường."],
  12: ["Một tá bút chì.", "Mười hai bến nước.", "Con cá trắng."],
  13: ["Mười ba bến nước in sâu.", "Số xui nhưng hên.", "Con ma đen."],
  14: ["Trăng rằm mười bốn.", "Tuổi dậy thì.", "Cục đá to."],
  15: ["Trăng rằm mười lăm.", "Mười lăm năm ấy ai quên.", "Ăn kem que."],
  16: ["Trăng tròn mười sáu.", "Tuổi trăng tròn.", "Lính mới tò te."],
  17: ["Mười bảy bẻ gãy sừng trâu.", "Tuổi mộng mơ.", "Cây tre trăm đốt."],
  18: ["Mười tám thôn vườn trầu.", "Lấy chồng sớm làm gì.", "Con gà mái."],
  19: ["Mười chín đôi mươi.", "Anh hùng lương sơn bạc.", "Con bướm xinh."],
  20: ["Hai mươi tuổi đời.", "Nhìn đời bằng mắt.", "Con rết nhỏ."],
  21: ["Tuổi hai mươi mốt.", "Thanh niên xung phong.", "Con chim én."],
  22: ["Hai con vịt bầu.", "Mai Lan Cúc Trúc.", "Ngó lên trời."],
  23: ["Hai mươi ba tháng chạp.", "Đưa ông Táo về trời.", "Con khỉ già."],
  24: ["Hai mươi bốn giờ.", "Một ngày trọn vẹn.", "Con sóc nâu."],
  25: ["Hai mươi lăm tuổi.", "Sắp ế tới nơi.", "Con ó đen."],
  26: ["Hai mươi sáu.", "Rồng bay phượng múa.", "Con rồng cháu tiên."],
  27: ["Hai mươi bảy.", "Đi lính đảo xa.", "Con rùa già."],
  28: ["Hai mươi tám.", "Ăn bánh tắm mưa.", "Con gà trống."],
  29: ["Hai mươi chín.", "Bước qua lề đường.", "Con lươn nhỏ."],
  30: ["Ba mươi Tết.", "Đón giao thừa.", "Con cá đen."],
  31: ["Ba mươi mốt.", "Bước qua năm mới.", "Con tôm càng."],
  32: ["Ba mươi hai.", "Trai tài gái sắc.", "Con rắn mối."],
  33: ["Ba ba đi trốn.", "Hai con ba.", "Con nhện chăng tơ."],
  34: ["Ba mươi bốn.", "Tóc gió thôi bay.", "Con nai vàng."],
  35: ["Ba mươi lăm.", "Dê xối sả.", "Con dê cụ."],
  36: ["Ba mươi sáu.", "Phố phường Hà Nội.", "Tiền thì khô."],
  37: ["Ba mươi bảy.", "Ông trời ngó xuống.", "Ông trời con."],
  38: ["Ba mươi tám.", "Ông địa nhỏ.", "Thần tài gõ cửa."],
  39: ["Ba mươi chín.", "Thần tài nhỏ.", "Tiền vô như nước."],
  40: ["Bốn mươi.", "Tứ hải giai huynh đệ.", "Ông Táo về trời."],
  41: ["Bốn mươi mốt.", "Nước chảy đá mòn.", "Con cá trắng."],
  42: ["Bốn mươi hai.", "Đường dài ngựa chạy.", "Con ốc sên."],
  43: ["Bốn mươi ba.", "Ma da kéo giò.", "Con ếch xanh."],
  44: ["Tứ tử trình làng.", "Con chó cắn con heo.", "Con công múa."],
  45: ["Bốn mươi lăm.", "Năm tháng đợi chờ.", "Bàn tay năm ngón."],
  46: ["Bốn mươi sáu.", "Trèo đèo lội suối.", "Con cọp già."],
  47: ["Bốn mươi bảy.", "Rồng bay phượng múa.", "Con heo đất."],
  48: ["Bốn mươi tám.", "Vượt sóng ra khơi.", "Giày tây bóng loáng."],
  49: ["Bốn mươi chín.", "Chưa qua năm hạn.", "Cây đàn bỏ quên."],
  50: ["Năm mươi.", "Nửa đời người.", "Bắn súng lục."],
  51: ["Năm mươi mốt.", "Mốt áo bà ba.", "Con chó mực."],
  52: ["Năm mươi hai.", "Lá bài định mệnh.", "Tiền vô cửa trước."],
  53: ["Năm mươi ba.", "Tai qua nạn khỏi.", "Con voi già."],
  54: ["Năm mươi bốn.", "Dân tộc anh em.", "Con mèo mướp."],
  55: ["Năm năm tháng tháng.", "Hai bàn tay xòe.", "Sinh sôi nảy nở."],
  56: ["Năm mươi sáu.", "Lục bát thành thơ.", "Con ong chăm chỉ."],
  57: ["Năm mươi bảy.", "Nhảy múa hát ca.", "Con hạc giấy."],
  58: ["Năm mươi tám.", "Tám chuyện thế gian.", "Con mèo rừng."],
  59: ["Năm mươi chín.", "Ngủ dậy chưa tinh.", "Con bướm đêm."],
  60: ["Sáu mươi năm cuộc đời.", "Đời còn dài.", "Con cua đồng."],
  61: ["Sáu mươi mốt.", "Một cõi đi về.", "Con bồ câu."],
  62: ["Sáu mươi hai.", "Hái lộc đầu xuân.", "Con bồ câu trắng."],
  63: ["Sáu mươi ba.", "Tỉnh Cà Mau.", "Con ngựa gỗ."],
  64: ["Sáu mươi bốn.", "Tỉnh Vĩnh Long.", "Con ếch cốm."],
  65: ["Sáu mươi lăm.", "Năm tháng nhạt nhòa.", "Con ó biển."],
  66: ["Lộc lộc đầy nhà.", "Sáu sáu sáu.", "Con rồng lộn."],
  67: ["Sáu mươi bảy.", "Tỉnh An Giang.", "Con rùa vàng."],
  68: ["Sáu mươi tám.", "Lộc phát lộc phát.", "Gà trống thiến."],
  69: ["Sáu mươi chín.", "Lộn đầu lộn đuôi.", "Con lươn vàng."],
  70: ["Bảy mươi.", "Thất thập cổ lai hy.", "Con cá chép."],
  71: ["Bảy mươi mốt.", "Tình đời bạc trắng.", "Con tôm hùm."],
  72: ["Bảy mươi hai.", "Tây Du Ký.", "Con rắn hổ."],
  73: ["Bảy mươi ba.", "Cao Bằng.", "Con nhện đen."],
  74: ["Bảy mươi bốn.", "Bốn biển là nhà.", "Con nai tơ."],
  75: ["Bảy mươi lăm.", "Về thăm quê ngoại.", "Con dê núi."],
  76: ["Bảy mươi sáu.", "Bà Rịa Vũng Tàu.", "Tây Ninh nắng cháy."],
  77: ["Thất tình buồn bã.", "Cây búa rìu.", "Ông trời con."],
  78: ["Bảy mươi tám.", "Ông địa lớn.", "Thổ địa gõ cửa."],
  79: ["Bảy mươi chín.", "Thần tài lớn.", "Tiền vào như nước."],
  80: ["Tám mươi.", "Cụ già đẹp lão.", "Ông Táo cưỡi cá."],
  81: ["Tám mươi mốt.", "Kiếp nạn thứ 82.", "Con cá rô."],
  82: ["Tám mươi hai.", "Về lại mái nhà.", "Con ốc bươu."],
  83: ["Tám mươi ba.", "Bến Tre xứ dừa.", "Con ngỗng trời."],
  84: ["Tám mươi bốn.", "Trà Vinh quê tôi.", "Con công xòe."],
  85: ["Tám mươi lăm.", "Ninh Thuận nắng gió.", "Con trùng trục."],
  86: ["Tám mươi sáu.", "Bình Thuận biển xanh.", "Con cọp con."],
  87: ["Tám mươi bảy.", "Đồng Tháp Mười.", "Con heo rừng."],
  88: ["Còng số tám.", "Toàn phát toàn lộc.", "Đôi còng số 8."],
  89: ["Tám mươi chín.", "Hậu Giang.", "Con trâu già."],
  90: ["Ông chín mươi.", "Hết số rồi.", "Con số cuối cùng."]
};

const getHardcodedRhyme = (number: number) => {
    const list = TRADITIONAL_RHYMES[number];
    if (list && list.length > 0) return list[Math.floor(Math.random() * list.length)];
    return `Số ${number} bà con ơi!`;
};

export const generateLotoRhyme = async (number: number, lang: Language): Promise<string> => {
  // 1. Luôn ưu tiên dùng kho cứng để đảm bảo tốc độ và không lỗi quota
  // Nếu là tiếng Việt, 90% dùng kho cứng. Tiếng Anh thì dùng fallback đơn giản nếu AI lỗi.
  if (lang === 'vi') {
      // Logic: Nếu số có trong kho, ưu tiên dùng nó để tránh gọi AI quá nhiều gây tốn quota/chậm.
      // Chỉ gọi AI "đổi gió" với tỉ lệ thấp (ví dụ 10%) hoặc khi người dùng yêu cầu.
      // Để sửa lỗi "Hết hạn mức", ta tăng tỉ lệ dùng kho cứng lên 100% khi gặp lỗi, 
      // hoặc mặc định dùng kho cứng là chính.
      
      const hardcoded = getHardcodedRhyme(number);
      
      // Thử gọi AI với timeout ngắn, nếu fail thì dùng hardcoded ngay
      const ai = getAIClient();
      if (!ai) return hardcoded;

      // Random 20% cơ hội dùng AI để tạo sự mới mẻ, 80% dùng kho cứng cho nhanh & an toàn
      if (Math.random() > 0.2) return hardcoded;

      try {
        const promptVi = `
            Viết 1 câu vè Lô Tô miền Tây ngắn (dưới 10 từ) cho số ${number}. 
            Hài hước, vần điệu. KHÔNG ngoặc kép.
        `;
        
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: promptVi,
            config: { thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 30 }
        });
        
        const text = response.text?.trim().replace(/["']/g, "");
        return text || hardcoded;
      } catch (e) {
        // LỖI QUOTA HOẶC MẠNG -> Fallback ngay lập tức
        console.warn("AI Quota/Network Error, using fallback:", e);
        return hardcoded;
      }
  }

  // English logic similar...
  const fallbackEn = `Number ${number}!`;
  try {
      const ai = getAIClient();
      if (!ai) return fallbackEn;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Bingo rhyme for number ${number}. Short.`,
      });
      return response.text?.trim().replace(/["']/g, "") || fallbackEn;
  } catch {
      return fallbackEn;
  }
};

export const generateBotChat = async (history: number[]): Promise<string> => {
  return "";
};