// app/_layout.jsx
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onAuthChanged, getUserProfile, isRegistrationInProgress } from '../src/services';
import { useStore } from '../src/hooks/useStore';

export default function RootLayout() {
  const { setUser, setLoading } = useStore();

  // จุดเดียวในแอปที่ผูก Firebase Auth เข้ากับ global state —
  // onAuthChanged (src/services) ฟัง event login/logout ของ Firebase แล้วดึงโปรไฟล์จาก
  // Firestore (getUserProfile) มาเก็บใน useStore.user ให้ทุกหน้าจอใช้ร่วมกัน
  useEffect(() => {
    return onAuthChanged(async (fu) => {
      if (fu) {
        // กำลังอยู่ในขั้นตอนสมัครสมาชิก (register() auto sign-in ชั่วครู่ก่อน logout() ตามมาทันที) —
        // ข้ามการอ่านโปรไฟล์ไปเลย ไม่งั้น query นี้จะไปชน race กับ logout() กลายเป็น Firestore
        // permission error (ดู setRegistrationInProgress ใน src/services/index.ts สำหรับเหตุผลเต็ม ๆ)
        if (isRegistrationInProgress()) { setLoading(false); return; }
        try {
          const p = await getUserProfile(fu.uid);
          setUser(p);
        } catch (e) {
          // เผื่อไว้เป็นชั้นกันสำรอง (เช่น sign out ไปแล้วระหว่าง query อื่นค้างอยู่ด้วยเหตุอื่น)
          // ไม่ใช่ error ที่ต้องแจ้งผู้ใช้
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
