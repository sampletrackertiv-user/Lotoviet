import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue } from "firebase/database";

// --- CẤU HÌNH FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDZNduqi0tFXBVKtcTuGKQkOt7Zknw8e6s",
  authDomain: "bingo-20f79.firebaseapp.com",
  projectId: "bingo-20f79",
  storageBucket: "bingo-20f79.firebasestorage.app",
  messagingSenderId: "739618519373",
  appId: "1:739618519373:web:2c2cc36919f56b3350df04",
  measurementId: "G-C7Y9MR72VM",
  // Sửa URL theo đúng khu vực (asia-southeast1)
  databaseURL: "https://bingo-20f79-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Khởi tạo
let app;
let database: any = null;

try {
    app = initializeApp(firebaseConfig);
    database = getDatabase(app);
    console.log("Firebase initialized successfully with Asia region URL");
} catch (e) {
    console.error("Firebase init error:", e);
}

export { database };

export const isFirebaseConfigured = () => {
    return database !== null;
};

// Hàm tiện ích để kiểm tra trạng thái mạng thực tế
export const listenToConnectionStatus = (callback: (isConnected: boolean) => void) => {
    if (!database) return () => {};
    const connectedRef = ref(database, ".info/connected");
    const unsubscribe = onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            callback(true);
        } else {
            callback(false);
        }
    });
    return unsubscribe;
};