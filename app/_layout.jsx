// app/_layout.jsx
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onAuthChanged, getUserProfile } from '../src/services';
import { useStore } from '../src/hooks/useStore';

export default function RootLayout() {
  const { setUser, setLoading } = useStore();

  // จุดเดียวในแอปที่ผูก Firebase Auth เข้ากับ global state —
  // onAuthChanged (src/services) ฟัง event login/logout ของ Firebase แล้วดึงโปรไฟล์จาก
  // Firestore (getUserProfile) มาเก็บใน useStore.user ให้ทุกหน้าจอใช้ร่วมกัน
  useEffect(() => {
    return onAuthChanged(async (fu) => {
      if (fu) {
        try {
          const p = await getUserProfile(fu.uid);
          setUser(p);
        } catch (e) {
          // เกิดได้เมื่อ sign out ไปแล้วระหว่าง query นี้ยังค้างอยู่ (เช่น สมัครสมาชิกแล้ว logout ทันที)
          // ทำให้ Firestore ปฏิเสธ request ด้วย permission error — ไม่ใช่ error ที่ต้องแจ้งผู้ใช้
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        {/* 1. หน้า Tabs หลัก */}
        <Stack.Screen name="(tabs)" />

        {/* 2. แก้จาก "auth" เป็น "(auth)" ให้ตรงกับชื่อโฟลเดอร์กลุ่ม */}
        <Stack.Screen name="(auth)" options={{ gestureEnabled: false }} />

        {/* 3. หน้า Notifications (อยู่นอก tabs) */}
        <Stack.Screen
          name="notifications"
          options={{
            presentation: 'card',
            animation: 'slide_from_right'
          }}
        />
      </Stack>
    </>
  );
}
