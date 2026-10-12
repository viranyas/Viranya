// app/notifications.jsx
import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, StatusBar } from "react-native";
import { useRouter } from "expo-router";
import { useStore } from "../src/hooks/useStore";
import { getNotifications, markNotificationRead } from "../src/services";
import { C } from "../src/config/theme";

// สี/label ของแจ้งเตือนแต่ละประเภท (Notification.type ที่ checkAndNotify สร้างไว้ใน src/services)
const NOTIF_CFG = {
  todo_due:       { dot:C.primary, label:"งานครบกำหนด"    },
  todo_upcoming:  { dot:C.lavender,label:"ใกล้ถึงกำหนด"   },
  todo_overdue:   { dot:C.rose,    label:"งานเกินกำหนด"   },
  habit_reminder: { dot:C.green,   label:"แจ้งเตือนนิสัย" },
  habit_streak:   { dot:C.amber,   label:"รักษา streak"   },
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useStore();
  const [notifs,  setNotifs]  = useState([]);
  const [refresh, setRefresh] = useState(false);

  // ดึงแจ้งเตือนทั้งหมดของ user จาก Firestore ผ่าน getNotifications (src/services)
  const load = async () => { if (!user) return; setNotifs(await getNotifications(user.uid)); };
  useEffect(() => { load(); }, [user]);

  // กดที่การ์ดแจ้งเตือน -> mark ว่าอ่านแล้วใน Firestore (markNotificationRead) แล้วอัปเดต state local
  // ทันทีแบบ optimistic (ไม่ต้อง load() ใหม่) — ส่งผลให้จุดแดงที่หน้า report.jsx หายไปตอนกลับไปหน้านั้น
  const handleRead = async (n) => {
    if (!user || n.isRead) return;
    await markNotificationRead(user.uid, n.id);
    setNotifs(prev => prev.map(x => x.id===n.id ? {...x,isRead:true} : x));
  };

  // กดที่การ์ดแจ้งเตือน -> mark อ่านแล้วก่อน (handleRead) แล้วพาไปหน้าที่เกี่ยวข้องตาม refPath ที่ checkAndNotify เซฟไว้
  // (users/{uid}/todos/{id} -> หน้ารายการงาน, users/{uid}/habits/{id} -> หน้านิสัย) พร้อมแนบ highlightId ไปให้หน้านั้น
  // scroll+ไฮไลต์ไปหารายการที่ถูกอ้างถึงโดยตรง (ดู useEffect ของ highlightId ใน todos.jsx/habits.jsx)
  const handlePress = async (n) => {
    await handleRead(n);
    const id = n.refPath?.split('/').pop();
    if (n.refPath?.includes('/todos/')) router.push({ pathname: '/(tabs)/todos', params: { highlightId: id } });
    else if (n.refPath?.includes('/habits/')) router.push({ pathname: '/(tabs)/habits', params: { highlightId: id } });
  };

  const today  = new Date().toISOString().split("T")[0];
  const todayN = notifs.filter(n => n.sentAt.toISOString().split("T")[0]===today);
  const olderN = notifs.filter(n => n.sentAt.toISOString().split("T")[0]!==today);
  const unread = notifs.filter(n => !n.isRead).length;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bgHeader} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← กลับ</Text>
        </TouchableOpacity>
        <Text style={styles.title}>การแจ้งเตือน</Text>
        {unread>0
          ? <View style={styles.badge}><Text style={styles.badgeText}>{unread}</Text></View>
          : <View style={{width:32}} />
        }
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refresh} tintColor={C.primary}
          onRefresh={async()=>{setRefresh(true);await load();setRefresh(false);}} />}
      >
        {notifs.length===0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyText}>ยังไม่มีการแจ้งเตือน</Text>
          </View>
        )}
        {todayN.length>0 && (
          <>
            <Text style={styles.groupLabel}>วันนี้</Text>
            {todayN.map(n => <NotifItem key={n.id} n={n} onPress={handlePress} />)}
          </>
        )}
        {olderN.length>0 && (
          <>
            <Text style={styles.groupLabel}>ก่อนหน้า</Text>
            {olderN.map(n => <NotifItem key={n.id} n={n} onPress={handlePress} />)}
          </>
        )}
        <View style={{height:40}} />
      </ScrollView>
    </View>
  );
}

// การ์ดแจ้งเตือน 1 รายการ — เรียกใช้จาก todayN.map/olderN.map ด้านบน, onPress คือ handlePress (mark อ่าน + นำทางไปหน้าที่เกี่ยวข้อง)
function NotifItem({ n, onPress }) {
  const cfg = NOTIF_CFG[n.type];
  return (
    <TouchableOpacity
      style={[styles.notifCard, !n.isRead && [styles.notifCardUnread, {borderLeftColor:cfg.dot, borderLeftWidth:3}]]}
      onPress={() => onPress(n)}
      activeOpacity={0.75}
    >
      <View style={[styles.notifDot, {backgroundColor:cfg.dot}]} />
      <View style={styles.notifBody}>
        <Text style={styles.notifTitle}>{n.title}</Text>
        <Text style={styles.notifDesc}>{n.body}</Text>
      </View>
      <View style={styles.notifRight}>
        {!n.isRead && <View style={styles.unreadDot} />}
        <Text style={styles.notifTime}>
          {n.sentAt.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"})}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container:  { flex:1, backgroundColor:C.bg },
  header:     { flexDirection:"row", justifyContent:"space-between", alignItems:"center", backgroundColor:C.bgHeader, paddingHorizontal:20, paddingTop:52, paddingBottom:14 },
  backText:   { fontSize:15, color:C.primary },
  title:      { fontSize:18, fontWeight:"700", color:C.text },
  badge:      { backgroundColor:C.rose, borderRadius:12, paddingHorizontal:8, paddingVertical:2 },
  badgeText:  { fontSize:12, color:C.white, fontWeight:"700" },
  emptyBox:   { alignItems:"center", paddingVertical:60 },
  emptyIcon:  { fontSize:48, marginBottom:12 },
  emptyText:  { fontSize:15, color:C.textHint },
  groupLabel: { fontSize:11, fontWeight:"700", color:C.textHint, paddingHorizontal:16, paddingTop:16, paddingBottom:6, letterSpacing:0.5 },
  notifCard:  { flexDirection:"row", alignItems:"flex-start", backgroundColor:C.bgCard, borderWidth:0.5, borderColor:C.border, padding:14, marginHorizontal:16, marginBottom:8, borderRadius:14, gap:10 },
  notifCardUnread: { backgroundColor:C.lavLight },
  notifDot:   { width:8, height:8, borderRadius:4, marginTop:5, flexShrink:0 },
  notifBody:  { flex:1 },
  notifTitle: { fontSize:14, fontWeight:"700", color:C.text, marginBottom:3 },
  notifDesc:  { fontSize:13, color:C.textSub, lineHeight:20 },
  notifRight: { alignItems:"flex-end", flexShrink:0, gap:6 },
  notifTime:  { fontSize:11, color:C.textHint },
  unreadDot:  { width:7, height:7, borderRadius:3.5, backgroundColor:C.rose },
});
