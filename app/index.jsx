// app/index.jsx
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { C } from '../src/config/theme';
import { useRouter } from 'expo-router';
import { useStore } from '../src/hooks/useStore';
import { GRAD } from '../src/config/theme';

export default function Index() {
  // อ่านสถานะ user/loading จาก useStore (ถูกตั้งค่าโดย app/_layout.jsx ผ่าน onAuthChanged)
  const { user, loading } = useStore();
  const router = useRouter();
  // เด้งไปหน้า home ถ้า login แล้ว หรือหน้า login ถ้ายังไม่ login — รอจน loading เสร็จก่อนค่อยตัดสินใจ
  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/(tabs)/home' : '/(auth)/login');
  }, [user, loading]);
  return (
    <View style={{ flex:1, justifyContent:'center', alignItems:'center', backgroundColor:C.bg }}>
      <ActivityIndicator size="large" color={C.primary} />
    </View>
  );
}
const styles = StyleSheet.create({ fill: { flex: 1, justifyContent: 'center', alignItems: 'center' } });
