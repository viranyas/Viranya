// app/(tabs)/home.jsx
import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, StatusBar, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../../src/hooks/useStore';
import { getTodos, getHabits, isHabitDoneToday, checkAndNotify } from '../../src/services';
import { C } from '../../src/config/theme';

// ตารางสี/label ของ priority งาน (Todo.priority) — ใช้ร่วมกับหน้า todos.jsx ที่นิยาม PRI เองอีกชุด
const PRI_COLOR = { high:C.rose,   medium:C.amber,   low:C.green   };
const PRI_BG    = { high:C.roseBg, medium:C.amberBg, low:C.greenBg };
const PRI_LABEL = { high:"สูง",    medium:"กลาง",    low:"ต่ำ"     };

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useStore();
  const [todos,   setTodos]   = useState([]);
  const [habits,  setHabits]  = useState([]);
  const [doneToday, setDoneToday] = useState({});
  const [refresh, setRefresh] = useState(false);

  // โหลดข้อมูลสรุปหน้าแรก: ดึง todos + habits จาก Firestore (src/services), เช็คว่านิสัยไหน
  // ทำไปแล้ววันนี้ (isHabitDoneToday) แล้วสั่ง checkAndNotify ให้สร้างแจ้งเตือนถ้ามีงานใกล้/เกินกำหนด
  const load = async () => {
    if (!user) return;
    try {
      const [t, h] = await Promise.all([getTodos(user.uid), getHabits(user.uid)]);
      setTodos(t); setHabits(h);
      const m = {};
      for (const habit of h) m[habit.id] = await isHabitDoneToday(user.uid, habit.id, habit.frequency);
      setDoneToday(m);
      await checkAndNotify(user.uid);
    } catch (e) {
      // เกิดได้เมื่อกด logout ระหว่าง load() ยังทำงานค้างอยู่ (checkAndNotify วน query หลายรอบติดกัน
      // ถ้า sign out ไปก่อน query ที่ยิงต่อจะถูก Firestore ปฏิเสธด้วย permission error) — ไม่ใช่ error ที่ต้องแจ้งผู้ใช้
    }
  };

  // โหลดใหม่ทุกครั้งที่ user เปลี่ยน (เช่น login/logout ที่มาจาก app/_layout.jsx)
  useEffect(() => { load(); }, [user]);
  // ใช้กับ pull-to-refresh (RefreshControl ด้านล่าง)
  const onRefresh = async () => { setRefresh(true); await load(); setRefresh(false); };

  // งานวันนี้ = งานที่ยังไม่เสร็จ และกำหนดส่งอยู่ในวันนี้ (หรือเลยกำหนดมาแล้ว) — ไม่รวมงานที่ยังไม่ถึงกำหนด/ไม่มีกำหนด
  const isDueTodayOrOverdue = (t) => {
    if (!t.dueDatetime) return false;
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return new Date(t.dueDatetime).getTime() <= endOfToday.getTime();
  };
  const todayTodos   = todos.filter(t => t.status === "pending" && isDueTodayOrOverdue(t));
  // เรียงงานที่ยังไม่ได้ทำจากใกล้กำหนดมากที่สุดขึ้นก่อน งานที่ไม่มีกำหนดจะอยู่ท้ายสุด
  const pendingTodos = todos
    .filter(t => t.status === "pending")
    .sort((a, b) => {
      if (!a.dueDatetime && !b.dueDatetime) return 0;
      if (!a.dueDatetime) return 1;
      if (!b.dueDatetime) return -1;
      return new Date(a.dueDatetime).getTime() - new Date(b.dueDatetime).getTime();
    });
  const doneTodos    = todos.filter(t => t.status === "done");
  const habitsDone   = habits.filter(h => doneToday[h.id]).length;
  const successRate  = todos.length > 0 ? Math.round((doneTodos.length / todos.length) * 100) : 0;
  const successRatehabits  = habits.length > 0 ? Math.round((habitsDone / habits.length) * 100) : 0;
  

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bgHeader} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{"สวัสดี, " + (user?.username ?? "ผู้ใช้") + " 👋"}</Text>
            <Text style={styles.date}>
              {new Date().toLocaleDateString("th-TH",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
            </Text>
          </View>
          <TouchableOpacity style={styles.avatar} onPress={() => router.push("/profile")}>
            {user?.avatarUrl
              ? <Image source={{ uri:user.avatarUrl }} style={styles.avatarImage} />
              : <Text style={styles.avatarText}>{user?.username?.charAt(0).toUpperCase() ?? "?"}</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{todayTodos.length}</Text>
              <Text style={styles.statLabel}>งานวันนี้</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color:C.green }]}>{habitsDone + "/" + habits.length}</Text>
              <Text style={styles.statLabel}>นิสัยวันนี้</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color:C.primary }]}>{successRate + "%"}</Text>
              <Text style={styles.statLabel}>สำเร็จ</Text>
            </View>
          </View>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>ความก้าวหน้ารายงานทั้งหมด</Text>
            <Text style={styles.progressPct}>{successRate + "%"}</Text>
          </View>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: successRate + "%" }]} />
          </View>
          <View style={[styles.progressHeader, { marginTop:14 }]}>
            <Text style={styles.progressLabel}>ความก้าวหน้านิสัยทั้งหมด</Text>
            <Text style={styles.progressPctHabits}>{successRatehabits + "%"}</Text>
          </View>
          <View style={styles.progressBgHabits}>
            <View style={[styles.progressFillhabits, { width: successRatehabits + "%" }]} />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>งานที่ยังไม่ได้ทำ</Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/todos")}>
              <Text style={styles.seeAll}>ดูทั้งหมด →</Text>
            </TouchableOpacity>
          </View>
          {pendingTodos.length === 0
            ? <Text style={styles.empty}>ไม่มีงานค้าง 🎉</Text>
            : pendingTodos.slice(0, 4).map(t => (
              <View key={t.id} style={styles.todoRow}>
                <View style={[styles.priDot, { backgroundColor:PRI_COLOR[t.priority] }]} />
                <Text style={styles.todoTitle} numberOfLines={1}>{t.title}</Text>
                <View style={[styles.priBadge, { backgroundColor:PRI_BG[t.priority] }]}>
                  <Text style={[styles.priText, { color:PRI_COLOR[t.priority] }]}>{PRI_LABEL[t.priority]}</Text>
                </View>
              </View>
            ))
          }
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>นิสัยวันนี้</Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/habits")}>
              <Text style={styles.seeAll}>ดูทั้งหมด →</Text>
            </TouchableOpacity>
          </View>
          {habits.length === 0
            ? <Text style={styles.empty}>ยังไม่มีนิสัย เพิ่มนิสัยแรกได้เลย!</Text>
            : habits.slice(0, 4).map(h => {
              const done = !!doneToday[h.id];
              return (
                <View key={h.id} style={styles.habitRow}>
                  <View style={[styles.habitDot, { backgroundColor:done?C.green:C.borderL }]} />
                  <View style={styles.habitInfo}>
                    <Text style={styles.habitName}>{h.name}</Text>
                    <Text style={styles.habitStreak}>{"🔥 " + h.streakCount + " วัน"}</Text>
                  </View>
                  <Text style={done ? styles.doneMark : styles.pendingMark}>{done ? "✓" : "○"}</Text>
                </View>
              );
            })
          }
        </View>
        <View style={{ height:24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex:1, backgroundColor:C.bg },
  header:         { flexDirection:"row", justifyContent:"space-between", alignItems:"center", backgroundColor:C.bgHeader, paddingHorizontal:20, paddingTop:52, paddingBottom:16 },
  greeting:       { fontSize:20, fontWeight:"700", color:C.text },
  date:           { fontSize:12, color:C.textSub, marginTop:2 },
  avatar:         { width:40, height:40, borderRadius:20, backgroundColor:C.primary, justifyContent:"center", alignItems:"center", overflow:"hidden" },
  avatarImage:    { width:40, height:40 },
  avatarText:     { fontSize:16, fontWeight:"700", color:C.white },
  statsCard:      { backgroundColor:C.bgCard, margin:16, borderRadius:16, padding:16, borderWidth:0.5, borderColor:C.border },
  statsRow:       { flexDirection:"row", alignItems:"center", marginBottom:14 },
  statItem:       { flex:1, alignItems:"center" },
  statDivider:    { width:0.5, height:32, backgroundColor:C.border },
  statVal:        { fontSize:22, fontWeight:"700", color:C.text },
  statLabel:      { fontSize:11, color:C.textSub, marginTop:2 },
  progressHeader: { flexDirection:"row", justifyContent:"space-between", marginBottom:6 },
  progressLabel:  { fontSize:11, color:C.textSub },
  progressPct:    { fontSize:11, fontWeight:"700", color:C.primary },
  progressPctHabits: { fontSize:11, fontWeight:"700", color:C.green },
  progressBg:     { height:6, backgroundColor:C.lavLight, borderRadius:3, overflow:"hidden" },
  progressBgHabits: { height:6, backgroundColor:'#D1FAE5', borderRadius:3, overflow:"hidden" },
  progressFill:   { height:"100%", backgroundColor:C.primary, borderRadius:3 },
  progressFillhabits: { height:"100%", backgroundColor:C.green, borderRadius:3 },
  section:        { backgroundColor:C.bgCard, marginHorizontal:16, borderRadius:14, padding:14, marginBottom:12, borderWidth:0.5, borderColor:C.border },
  sectionHeader:  { flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:12 },
  sectionTitle:   { fontSize:14, fontWeight:"700", color:C.text },
  seeAll:         { fontSize:13, color:C.primary },
  empty:          { fontSize:13, color:C.textHint, textAlign:"center", paddingVertical:12 },
  todoRow:        { flexDirection:"row", alignItems:"center", gap:10, paddingVertical:8, borderBottomWidth:0.5, borderBottomColor:C.borderL },
  priDot:         { width:8, height:8, borderRadius:4 },
  todoTitle:      { flex:1, fontSize:14, color:C.text },
  priBadge:       { paddingHorizontal:8, paddingVertical:3, borderRadius:20 },
  priText:        { fontSize:11, fontWeight:"600" },
  habitRow:       { flexDirection:"row", alignItems:"center", gap:10, paddingVertical:8, borderBottomWidth:0.5, borderBottomColor:C.borderL },
  habitDot:       { width:10, height:10, borderRadius:5 },
  habitInfo:      { flex:1 },
  habitName:      { fontSize:14, color:C.text, fontWeight:"500" },
  habitStreak:    { fontSize:12, color:C.textSub, marginTop:1 },
  doneMark:       { fontSize:18, color:C.green, fontWeight:"700" },
  pendingMark:    { fontSize:18, color:C.border },
});
