// app/(tabs)/_layout.jsx
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../src/config/theme';

// กำหนดแท็บทั้งหมดของแอป ชื่อ name ต้องตรงกับชื่อไฟล์ใน app/(tabs)/ เพื่อให้ expo-router จับคู่ route ถูก
const TABS = [
  { name: 'home',       title: 'หน้าแรก', icon: 'home-outline',             iconActive: 'home' },
  { name: 'todos',      title: 'งาน',     icon: 'checkmark-circle-outline', iconActive: 'checkmark-circle' },
  { name: 'habits',     title: 'นิสัย',   icon: 'flame-outline',            iconActive: 'flame' },
  { name: 'ai-advisor', title: 'AI',       icon: 'sparkles-outline',         iconActive: 'sparkles' },
  { name: 'report',     title: 'รายงาน',  icon: 'bar-chart-outline',        iconActive: 'bar-chart' },
];

// สร้างแถบแท็บด้านล่าง วนลูปจาก TABS เพื่อสร้าง Tabs.Screen ต่อหนึ่งหน้า พร้อมสลับไอคอน active/inactive
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor:   C.primary,
      tabBarInactiveTintColor: C.textHint,
      tabBarStyle: {
        backgroundColor: C.bgCard,
        borderTopWidth:  0.5,
        borderTopColor:  C.border,
        paddingBottom:   8,
        paddingTop:      6,
        height:          64,
      },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
    }}>
      {TABS.map(t => (
        <Tabs.Screen key={t.name} name={t.name} options={{
          title: t.title,
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? t.iconActive : t.icon} size={22} color={color} />
          ),
        }} />
      ))}
    </Tabs>
  );
}
