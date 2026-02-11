import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// --- CẤU HÌNH FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDZNduqi0tFXBVKtcTuGKQkOt7Zknw8e6s",
  authDomain: "bingo-20f79.firebaseapp.com",
  projectId: "bingo-20f79",
  storageBucket: "bingo-20f79.firebasestorage.app",
  messagingSenderId: "739618519373",
  appId: "1:739618519373:web:2c2cc36919f56b3350df04",
  measurementId: "G-C7Y9MR72VM",
  // Realtime Database cần URL này để hoạt động (được suy luận từ projectId)
  databaseURL: "https://bingo-20f79-default-rtdb.firebaseio.com"
};

// Khởi tạo
let app;
let database: any = null;

try {
    app = initializeApp(firebaseConfig);
    database = getDatabase(app);
} catch (e) {
    console.error("Firebase init error:", e);
}

export { database };

export const isFirebaseConfigured = () => {
    return database !== null;
};
