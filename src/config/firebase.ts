// src/config/firebase.ts
import { initializeApp } from 'firebase/app';
// @ts-expect-error - firebase/auth's package "exports" map doesn't surface RN-only
// types (e.g. getReactNativePersistence) to tsc, even though Metro resolves them fine.
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';


// ค่าเชื่อมต่อโปรเจกต์ Firebase (console.firebase.google.com) ของแอปนี้ — ใช้ร่วมกันทั้ง Auth และ Firestore
const firebaseConfig = {
  apiKey: "AIzaSyAqyAVxKky4gI45rKQp4-k9Q67Vrl7ZgW4",
  authDomain: "pro1-e3789.firebaseapp.com",
  projectId: "pro1-e3789",
  storageBucket: "pro1-e3789.firebasestorage.app",
  messagingSenderId: "67389496409",
  appId: "1:67389496409:web:9cfc438f126317243e6548",
  measurementId: "G-KJZYB2XMM5"
};


const app = initializeApp(firebaseConfig);

// `auth` — ใช้ทุกครั้งที่ src/services เรียก signIn/signUp/signOut/onAuthStateChanged
// ตั้ง persistence ด้วย AsyncStorage ให้ login ค้างอยู่ข้าม session ของแอป (ไม่ต้อง login ใหม่ทุกครั้งที่เปิดแอป)
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});
// `db` — handle ของ Firestore ที่ src/services ทั้งไฟล์ใช้อ่าน/เขียน collection users/{uid}/todos, habits ฯลฯ
export const db = getFirestore(app);
export default app;
