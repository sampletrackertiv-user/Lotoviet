import { GoogleGenAI } from "@google/genai";
import { Language } from "../types";

// Safe initialization
const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

// KHO VÈ LÔ TÔ MIỀN NAM (FULL 1-90) - STYLE HỘI CHỢ, HÀI HƯỚC
const TRADITIONAL_RHYMES: Record<number, string[]> = {
  1: [
    "Cờ ra con mấy, con mấy gì ra. Thân em như tấm lụa đào, phất phơ giữa chợ biết vào tay ai. Là con số 1.", 
    "Chắc ăn như bắp. Cây cột đèn. Là con số 1.", 
    "Sông Cửu Long chín cửa hai dòng. Phù sa bát ngát... là con số 1."
  ],
  2: [
    "Gì ra con mấy, con mấy gì ra. Yêu nhau cởi áo cho nhau, về nhà mẹ hỏi qua cầu gió bay. Là con số 2.",
    "Lá tre trôi dạt trên sông. Anh đi lấy vợ em ở với ai. Là con số 2.",
    "Bầu ơi thương lấy bí cùng. Tuy rằng khác giống nhưng chung một giàn. Số 2."
  ],
  3: [
    "Mấy gì ra. Chị Ba đi chợ, mua cái gì đây. Mua một ông thầy, về dạy em học. Là con số 3.",
    "Vững như kiềng ba chân. Là con số 3.",
    "Đàn ông đi biển có đôi. Đàn bà đi biển mồ côi một mình. Là con số 3."
  ],
  4: [
    "Cờ ra con mấy. Bốn phương tám hướng. Người dưng khác họ, đem lòng nhớ thương. Là con số 4.",
    "Làm trai bốn bể là nhà. Cái dao phay. Là con số 4.",
    "Tứ đổ tường. Là con số 4."
  ],
  5: [
    "Gì ra con mấy. Năm anh em trên một chiếc xe tăng. Như năm bông hoa nở cùng một cội. Là con số 5.",
    "Cưỡi ngựa xem hoa. Đi đâu lanh quanh cho đời mỏi mệt. Là con số 5.",
    "Sáng trăng em tưởng tối trời. Em ngồi em để cái sự đời em ra. Là con số 5."
  ],
  6: [
    "Con mấy gì ra. Lục bát thành thơ. Lục bình trôi nổi. Là con số 6.",
    "Sáu câu vọng cổ. Em ơi sáu mươi năm cuộc đời. Là con số 6.",
    "Cháu lên ba cháu đi mẫu giáo. Cô thương cháu vì cháu không khóc nhè. Là con số 6."
  ],
  7: [
    "Gì ra con mấy. Một tuần bảy ngày. Bảy nổi ba chìm. Là con số 7.",
    "Thất tình thì về quê chăn vịt. Cái lưỡi hái. Là con số 7.",
    "Mẹ già ở túp lều tranh. Sớm thăm tối viếng mới đành dạ con. Là con số 7."
  ],
  8: [
    "Con mấy gì ra. Tám chuyện trên trời dưới đất. Bát cơm mẻ. Là con số 8.",
    "Cái còng số 8. Bắt thằng ăn trộm. Là con số 8.",
    "Tuy anh không đẹp trai nhưng anh có duyên ngầm. Là con số 8."
  ],
  9: [
    "Gì ra con mấy. Chín bậc tình yêu. Chín chắn thật thà. Là con số 9.",
    "Vừa vừa phải phải. Con số 9.",
    "Con cua, con cọp, con cá sấu... không phải. Là con số 9."
  ],
  10: [
    "Con mấy gì ra. Mười ngón tay thơm. Điểm 10 cho chất lượng. Là con số 10.",
    "Một cây làm chẳng nên non. Ba cây chụm lại nên hòn núi cao. Là con số 10.",
    "Rồng bay phượng múa. Con rồng nằm bãi. Là con số 10."
  ],
  11: [
    "Gì ra con mấy. Một cây làm chẳng nên non. Hai chân đi trước. Là số 11.",
    "Đứng nép bên đường. Chờ ai qua phố. Là số 11.",
    "Cầu thang gãy nhịp. Là số 11."
  ],
  12: [
    "Con mấy gì ra. Một tá bút chì. Mười hai bến nước. Là con số 12.",
    "Con cá trắng. Bơi lội tung tăng. Là con số 12.",
    "Bước sang ngang. Lỡ dở cung đàn. Là con số 12."
  ],
  13: [
    "Gì ra con mấy. Mười ba bến nước in sâu. Số xui nhưng hên. Là con 13.",
    "Con ma đen. Hù òa hù òa. Là con 13.",
    "Chàng về nay mai thiếp vẫn chờ. Là con 13."
  ],
  14: [
    "Con mấy gì ra. Trăng rằm mười bốn. Tuổi dậy thì. Là con 14.",
    "Cục đá to. Ném bể đầu. Là con 14.",
    "Tặng em chiếc nón bài thơ. Là con 14."
  ],
  15: [
    "Gì ra con mấy. Trăng rằm mười lăm. Mười lăm năm ấy ai quên. Là con 15.",
    "Ăn kem que. Mát lạnh tê người. Là con 15.",
    "Thuyền quyên ứ hự anh hùng. Là con 15."
  ],
  16: [
    "Con mấy gì ra. Trăng tròn mười sáu. Tuổi trăng tròn. Là con 16.",
    "Lính mới tò te. Đi học đường rừng. Là con 16.",
    "Mắt nai cha cha cha. Là con 16."
  ],
  17: [
    "Gì ra con mấy. Mười bảy bẻ gãy sừng trâu. Tuổi mộng mơ. Là con 17.",
    "Cây tre trăm đốt. Khắc nhập khắc xuất. Là con 17.",
    "Hát bản tình ca. Tình yêu đôi lứa. Là con 17."
  ],
  18: [
    "Con mấy gì ra. Mười tám thôn vườn trầu. Lấy chồng sớm làm gì. Là con 18.",
    "Con gà mái. Đẻ trứng vàng. Là con 18.",
    "Em chưa mười tám. Anh đợi em nha. Là con 18."
  ],
  19: [
    "Gì ra con mấy. Mười chín đôi mươi. Anh hùng lương sơn bạc. Là con 19.",
    "Con bướm xinh. Con bướm đa tình. Là con 19.",
    "Chị ngã em nâng. Là con 19."
  ],
  20: [
    "Con mấy gì ra. Hai mươi tuổi đời. Nhìn đời bằng mắt. Là con 20.",
    "Con rết nhỏ. Bò lổm ngổm. Là con 20.",
    "Tròn trĩnh đáng yêu. Là con 20."
  ],
  21: [
    "Gì ra con mấy. Tuổi hai mươi mốt. Thanh niên xung phong. Là con 21.",
    "Con chim én. Bay lượn mùa xuân. Là con 21.",
    "Cô gái đôi mươi. Mắt cười lúng liếng. Là con 21."
  ],
  22: [
    "Con mấy gì ra. Hai con vịt bầu. Mai Lan Cúc Trúc. Là con 22.",
    "Ngó lên trời. Thấy cặp bồ câu. Là con 22.",
    "Hạnh phúc lứa đôi. Là con 22."
  ],
  23: [
    "Gì ra con mấy. Hai mươi ba tháng chạp. Đưa ông Táo về trời. Là con 23.",
    "Con khỉ già. Leo trèo cây đa. Là con 23.",
    "Tiễn anh lên đường. Là con 23."
  ],
  24: [
    "Con mấy gì ra. Hai mươi bốn giờ. Một ngày trọn vẹn. Là con 24.",
    "Con sóc nâu. Hay ăn hạt dẻ. Là con 24.",
    "Giáng sinh an lành. Là con 24."
  ],
  25: [
    "Gì ra con mấy. Hai mươi lăm tuổi. Sắp ế tới nơi. Là con 25.",
    "Con ó đen. Bay lượn bầu trời. Là con 25.",
    "Nửa đường gãy gánh. Là con 25."
  ],
  26: [
    "Con mấy gì ra. Hai mươi sáu. Rồng bay phượng múa. Là con 26.",
    "Con rồng cháu tiên. Bay lên trời cao. Là con 26.",
    "Hòn vọng phu. Là con 26."
  ],
  27: [
    "Gì ra con mấy. Hai mươi bảy. Đi lính đảo xa. Là con 27.",
    "Con rùa già. Bò chậm rì. Là con 27.",
    "Ba chìm bảy nổi chín lênh đênh. Là con 27."
  ],
  28: [
    "Con mấy gì ra. Hai mươi tám. Ăn bánh tắm mưa. Là con 28.",
    "Con gà trống. Gáy o ó o. Là con 28.",
    "Mãi mãi một tình yêu. Là con 28."
  ],
  29: [
    "Gì ra con mấy. Hai mươi chín. Bước qua lề đường. Là con 29.",
    "Con lươn nhỏ. Chui rúc bùn lầy. Là con 29.",
    "Tình đời đen bạc. Là con 29."
  ],
  30: [
    "Con mấy gì ra. Ba mươi Tết. Đón giao thừa. Là con 30.",
    "Con cá đen. Bơi trong bể nước. Là con 30.",
    "Thịt mỡ dưa hành câu đối đỏ. Là con 30."
  ],
  31: [
    "Gì ra con mấy. Ba mươi mốt. Bước qua năm mới. Là con 31.",
    "Con tôm càng. Nướng muối ớt. Là con 31.",
    "Trai anh hùng gái thuyền quyên. Là con 31."
  ],
  32: [
    "Con mấy gì ra. Ba mươi hai. Trai tài gái sắc. Là con 32.",
    "Con rắn mối. Chạy nhanh như gió. Là con 32.",
    "Thương nhau cởi áo cho nhau. Là con 32."
  ],
  33: [
    "Gì ra con mấy. Ba ba đi trốn. Hai con ba. Là con 33.",
    "Con nhện chăng tơ. Giăng lối về. Là con 33.",
    "Xương sườn xương sống. Là con 33."
  ],
  34: [
    "Con mấy gì ra. Ba mươi bốn. Tóc gió thôi bay. Là con 34.",
    "Con nai vàng. Ngơ ngác đạp lá khô. Là con 34.",
    "Mắt em buồn. Là con 34."
  ],
  35: [
    "Gì ra con mấy. Ba mươi lăm. Dê xối sả. Là con 35.",
    "Con dê cụ. Có bộ râu dài. Là con 35.",
    "Anh ơi đô thành ở đây em sống không quen. Là con 35."
  ],
  36: [
    "Con mấy gì ra. Ba mươi sáu. Phố phường Hà Nội. Là con 36.",
    "Tiền thì khô. Túi thì rỗng. Là con 36.",
    "Đôi lứa xứng đôi. Là con 36."
  ],
  37: [
    "Gì ra con mấy. Ba mươi bảy. Ông trời ngó xuống. Là con 37.",
    "Ông trời con. Quậy phá tưng bừng. Là con 37.",
    "Phận má hồng. Là con 37."
  ],
  38: [
    "Con mấy gì ra. Ba mươi tám. Ông địa nhỏ. Là con 38.",
    "Thần tài gõ cửa. Mở cửa ra nhận tiền. Là con 38.",
    "Nhẫn cỏ cho em. Là con 38."
  ],
  39: [
    "Gì ra con mấy. Ba mươi chín. Thần tài nhỏ. Là con 39.",
    "Tiền vô như nước. Sông đà. Là con 39.",
    "Lá diêu bông. Là con 39."
  ],
  40: [
    "Con mấy gì ra. Bốn mươi. Tứ hải giai huynh đệ. Là con 40.",
    "Ông Táo về trời. Cưỡi cá chép. Là con 40.",
    "Đời tôi cô đơn. Là con 40."
  ],
  41: [
    "Gì ra con mấy. Bốn mươi mốt. Nước chảy đá mòn. Là con 41.",
    "Con cá trắng. Phơi bụng trên sông. Là con 41.",
    "Duyên kiếp ba sinh. Là con 41."
  ],
  42: [
    "Con mấy gì ra. Bốn mươi hai. Đường dài ngựa chạy. Là con 42.",
    "Con ốc sên. Bò chậm rì. Là con 42.",
    "Đôi mắt người xưa. Là con 42."
  ],
  43: [
    "Gì ra con mấy. Bốn mươi ba. Ma da kéo giò. Là con 43.",
    "Con ếch xanh. Nhảy đầm bập. Là con 43.",
    "Nước cuốn trôi đi. Là con 43."
  ],
  44: [
    "Con mấy gì ra. Tứ tử trình làng. Con chó cắn con heo. Là con 44.",
    "Con công múa. Xòe cánh đẹp. Là con 44.",
    "Rừng lá thấp. Là con 44."
  ],
  45: [
    "Gì ra con mấy. Bốn mươi lăm. Năm tháng đợi chờ. Là con 45.",
    "Bàn tay năm ngón. Em vẫn kiêu sa. Là con 45.",
    "Về đâu mái tóc người thương. Là con 45."
  ],
  46: [
    "Con mấy gì ra. Bốn mươi sáu. Trèo đèo lội suối. Là con 46.",
    "Con cọp già. Gầm vang núi rừng. Là con 46.",
    "Tình thắm duyên quê. Là con 46."
  ],
  47: [
    "Gì ra con mấy. Bốn mươi bảy. Rồng bay phượng múa. Là con 47.",
    "Con heo đất. Bỏ ống heo. Là con 47.",
    "Tình chị duyên em. Là con 47."
  ],
  48: [
    "Con mấy gì ra. Bốn mươi tám. Vượt sóng ra khơi. Là con 48.",
    "Giày tây bóng loáng. Đi chơi phố. Là con 48.",
    "Đò sang ngang. Là con 48."
  ],
  49: [
    "Gì ra con mấy. Bốn mươi chín. Chưa qua năm hạn. Là con 49.",
    "Cây đàn bỏ quên. Tình tich tình tang. Là con 49.",
    "Xe đạp ơi. Là con 49."
  ],
  50: [
    "Con mấy gì ra. Năm mươi. Nửa đời người. Là con 50.",
    "Bắn súng lục. Pằng pằng pằng. Là con 50.",
    "Lên chùa cầu duyên. Là con 50."
  ],
  51: [
    "Gì ra con mấy. Năm mươi mốt. Mốt áo bà ba. Là con 51.",
    "Con chó mực. Sủa gâu gâu. Là con 51.",
    "Người tình mùa đông. Là con 51."
  ],
  52: [
    "Con mấy gì ra. Năm mươi hai. Lá bài định mệnh. Là con 52.",
    "Tiền vô cửa trước. Tiền ra cửa sau. Là con 52.",
    "Giọt lệ đài trang. Là con 52."
  ],
  53: [
    "Gì ra con mấy. Năm mươi ba. Tai qua nạn khỏi. Là con 53.",
    "Con voi già. Kéo gỗ rừng. Là con 53.",
    "Chuyến đò quê hương. Là con 53."
  ],
  54: [
    "Con mấy gì ra. Năm mươi bốn. Dân tộc anh em. Là con 54.",
    "Con mèo mướp. Bắt chuột đồng. Là con 54.",
    "Tình anh bán chiếu. Là con 54."
  ],
  55: [
    "Gì ra con mấy. Năm năm tháng tháng. Hai bàn tay xòe. Là con 55.",
    "Sinh sôi nảy nở. Con đàn cháu đống. Là con 55.",
    "Năn nỉ ỉ ôi. Là con 55."
  ],
  56: [
    "Con mấy gì ra. Năm mươi sáu. Lục bát thành thơ. Là con 56.",
    "Con ong chăm chỉ. Hút mật hoa. Là con 56.",
    "Bến cũ đò xưa. Là con 56."
  ],
  57: [
    "Gì ra con mấy. Năm mươi bảy. Nhảy múa hát ca. Là con 57.",
    "Con hạc giấy. Bay về trời. Là con 57.",
    "Cánh thiệp đầu xuân. Là con 57."
  ],
  58: [
    "Con mấy gì ra. Năm mươi tám. Tám chuyện thế gian. Là con 58.",
    "Con mèo rừng. Sống trong hang. Là con 58.",
    "Đêm buồn tỉnh lẻ. Là con 58."
  ],
  59: [
    "Gì ra con mấy. Năm mươi chín. Ngủ dậy chưa tinh. Là con 59.",
    "Con bướm đêm. Bay lượn đèn đường. Là con 59.",
    "Duyên phận. Là con 59."
  ],
  60: [
    "Con mấy gì ra. Sáu mươi năm cuộc đời. Đời còn dài. Là con 60.",
    "Con cua đồng. Bò ngang bò dọc. Là con 60.",
    "Phút cuối. Là con 60."
  ],
  61: [
    "Gì ra con mấy. Sáu mươi mốt. Một cõi đi về. Là con 61.",
    "Con bồ câu. Đưa thư tình. Là con 61.",
    "Lòng mẹ bao la. Là con 61."
  ],
  62: [
    "Con mấy gì ra. Sáu mươi hai. Hái lộc đầu xuân. Là con 62.",
    "Con bồ câu trắng. Hòa bình nhân ái. Là con 62.",
    "Thuyền hoa. Là con 62."
  ],
  63: [
    "Gì ra con mấy. Sáu mươi ba. Tỉnh Cà Mau. Là con 63.",
    "Con ngựa gỗ. Chạy lon ton. Là con 63.",
    "Gặp nhau làm ngơ. Là con 63."
  ],
  64: [
    "Con mấy gì ra. Sáu mươi bốn. Tỉnh Vĩnh Long. Là con 64.",
    "Con ếch cốm. Kêu ộp ộp. Là con 64.",
    "Áo mới Cà Mau. Là con 64."
  ],
  65: [
    "Gì ra con mấy. Sáu mươi lăm. Năm tháng nhạt nhòa. Là con 65.",
    "Con ó biển. Bay lượn sóng. Là con 65.",
    "Lan và Điệp. Là con 65."
  ],
  66: [
    "Con mấy gì ra. Lộc lộc đầy nhà. Sáu sáu sáu. Là con 66.",
    "Con rồng lộn. Bay lên trời. Là con 66.",
    "Trách ai vô tình. Là con 66."
  ],
  67: [
    "Gì ra con mấy. Sáu mươi bảy. Tỉnh An Giang. Là con 67.",
    "Con rùa vàng. Hồ Gươm. Là con 67.",
    "Dạ cổ hoài lang. Là con 67."
  ],
  68: [
    "Con mấy gì ra. Sáu mươi tám. Lộc phát lộc phát. Là con 68.",
    "Gà trống thiến. Cúng ông địa. Là con 68.",
    "Xuân này con không về. Là con 68."
  ],
  69: [
    "Gì ra con mấy. Sáu mươi chín. Lộn đầu lộn đuôi. Là con 69.",
    "Con lươn vàng. Trơn tuột. Là con 69.",
    "Cà Mau mặc thêm áo mới... Là con 69."
  ],
  70: [
    "Con mấy gì ra. Bảy mươi. Thất thập cổ lai hy. Là con 70.",
    "Con cá chép. Hóa rồng. Là con 70.",
    "Đám cưới trên đường quê. Là con 70."
  ],
  71: [
    "Gì ra con mấy. Bảy mươi mốt. Tình đời bạc trắng. Là con 71.",
    "Con tôm hùm. Râu dài ngoằng. Là con 71.",
    "Dáng đứng Bến Tre. Là con 71."
  ],
  72: [
    "Con mấy gì ra. Bảy mươi hai. Tây Du Ký. Là con 72.",
    "Con rắn hổ. Phun nọc độc. Là con 72.",
    "Vợ người ta. Là con 72."
  ],
  73: [
    "Gì ra con mấy. Bảy mươi ba. Cao Bằng. Là con 73.",
    "Con nhện đen. Giăng tơ sầu. Là con 73.",
    "Sầu tím thiệp hồng. Là con 73."
  ],
  74: [
    "Con mấy gì ra. Bảy mươi bốn. Bốn biển là nhà. Là con 74.",
    "Con nai tơ. Ngơ ngác. Là con 74.",
    "Con đường xưa em đi. Là con 74."
  ],
  75: [
    "Gì ra con mấy. Bảy mươi lăm. Về thăm quê ngoại. Là con 75.",
    "Con dê núi. Leo vách đá. Là con 75.",
    "Gõ cửa trái tim. Là con 75."
  ],
  76: [
    "Con mấy gì ra. Bảy mươi sáu. Bà Rịa Vũng Tàu. Là con 76.",
    "Tây Ninh nắng cháy. Muối tôm. Là con 76.",
    "Biển tình. Là con 76."
  ],
  77: [
    "Gì ra con mấy. Thất tình buồn bã. Cây búa rìu. Là con 77.",
    "Ông trời con. Muốn gì được nấy. Là con 77.",
    "Không bao giờ quên anh. Là con 77."
  ],
  78: [
    "Con mấy gì ra. Bảy mươi tám. Ông địa lớn. Là con 78.",
    "Thổ địa gõ cửa. Cầu tài cầu lộc. Là con 78.",
    "Vùng lá me bay. Là con 78."
  ],
  79: [
    "Gì ra con mấy. Bảy mươi chín. Thần tài lớn. Là con 79.",
    "Tiền vào như nước. Vàng đầy kho. Là con 79.",
    "Thần tài đến. Là con 79."
  ],
  80: [
    "Con mấy gì ra. Tám mươi. Cụ già đẹp lão. Là con 80.",
    "Ông Táo cưỡi cá. Về trời. Là con 80.",
    "Mừng tuổi mẹ. Là con 80."
  ],
  81: [
    "Gì ra con mấy. Tám mươi mốt. Kiếp nạn thứ 82. Là con 81.",
    "Con cá rô. Chiên xù. Là con 81.",
    "Cô hàng xóm. Là con 81."
  ],
  82: [
    "Con mấy gì ra. Tám mươi hai. Về lại mái nhà. Là con 82.",
    "Con ốc bươu. Nhồi thịt. Là con 82.",
    "Chuyện tình Lan và Điệp. Là con 82."
  ],
  83: [
    "Gì ra con mấy. Tám mươi ba. Bến Tre xứ dừa. Là con 83.",
    "Con ngỗng trời. Kêu cạp cạp. Là con 83.",
    "Dáng đứng Bến Tre. Là con 83."
  ],
  84: [
    "Con mấy gì ra. Tám mươi bốn. Trà Vinh quê tôi. Là con 84.",
    "Con công xòe. Múa điệu xòe hoa. Là con 84.",
    "Trà Vinh mến yêu. Là con 84."
  ],
  85: [
    "Gì ra con mấy. Tám mươi lăm. Ninh Thuận nắng gió. Là con 85.",
    "Con trùng trục. Đào đất. Là con 85.",
    "Nắng gió phương nam. Là con 85."
  ],
  86: [
    "Con mấy gì ra. Tám mươi sáu. Bình Thuận biển xanh. Là con 86.",
    "Con cọp con. Dễ thương. Là con 86.",
    "Mùa xuân trên TP HCM. Là con 86."
  ],
  87: [
    "Gì ra con mấy. Tám mươi bảy. Đồng Tháp Mười. Là con 87.",
    "Con heo rừng. Chạy rông. Là con 87.",
    "Bông điên điển. Là con 87."
  ],
  88: [
    "Con mấy gì ra. Còng số tám. Toàn phát toàn lộc. Là con 88.",
    "Đôi còng số 8. Bắt em về dinh. Là con 88.",
    "Duyên phận. Là con 88."
  ],
  89: [
    "Gì ra con mấy. Tám mươi chín. Hậu Giang. Là con 89.",
    "Con trâu già. Cày ruộng. Là con 89.",
    "Chiếc áo bà ba. Là con 89."
  ],
  90: [
    "Con mấy gì ra. Ông chín mươi. Hết số rồi. Là con 90.",
    "Con số cuối cùng. Là con 90.",
    "Bóng cả cây già. Là con 90."
  ]
};

const getHardcodedRhyme = (number: number) => {
    const list = TRADITIONAL_RHYMES[number];
    if (list && list.length > 0) return list[Math.floor(Math.random() * list.length)];
    return `Số ${number} bà con ơi!`;
};

export const generateLotoRhyme = async (number: number, lang: Language): Promise<string> => {
  // 1. Luôn ưu tiên dùng kho cứng để đảm bảo tốc độ và không lỗi quota
  if (lang === 'vi') {
      const hardcoded = getHardcodedRhyme(number);
      
      const ai = getAIClient();
      if (!ai) return hardcoded;

      // Random 20% cơ hội dùng AI để tạo sự mới mẻ, 80% dùng kho cứng cho nhanh & an toàn
      if (Math.random() > 0.2) return hardcoded;

      try {
        const promptVi = `
            Hãy đóng vai người hô Lô Tô hội chợ miền Tây Nam Bộ.
            Viết 1 câu vè/hò ngắn, vui nhộn, vần điệu cho số ${number}. 
            Có thể dùng tên tỉnh thành, món ăn, hoặc tiếng lóng hài hước.
            Ngắn gọn dưới 15 từ. KHÔNG dùng ngoặc kép.
        `;
        
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: promptVi,
            config: { thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 50 }
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