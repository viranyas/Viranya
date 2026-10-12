// app/(tabs)/habits.jsx
import { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, RefreshControl, Modal, TextInput, StatusBar } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useStore } from "../../src/hooks/useStore";
import { getHabits, addHabit, deleteHabit, toggleHabitLog, getHabitLogsForMonth } from "../../src/services";
import { C } from "../../src/config/theme";
import { HABIT_CATEGORIES, CATEGORY_META } from "../../src/config/categories";

const MONTHS_TH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

export default function HabitsScreen() {
  const { user } = useStore();
  const { highlightId } = useLocalSearchParams();
  const [habits,  setHabits]  = useState([]);
  const [logs,    setLogs]    = useState({});
  const [rates,   setRates]   = useState({});
  const [refresh, setRefresh] = useState(false);
  const [modal,   setModal]   = useState(false);
  const [name,    setName]    = useState("");
  const [freq,    setFreq]    = useState("daily");
  const [category,setCategory]= useState("self_development");
  const [saving,  setSaving]  = useState(false);
  const [highlightedId, setHighlightedId] = useState(null);
  const scrollRef = useRef(null);
  const itemY = useRef({});
  const didHighlightRef = useRef(null);
  const now   = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;

  // เดือนที่เลือกดู (ค่าเริ่มต้น = เดือนปัจจุบัน) และตัวเลือกย้อนหลัง 12 เดือน
  const [selMonth, setSelMonth] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [pickerOpen, setPickerOpen] = useState(false);
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  // แปลง {year,month} เป็น label ภาษาไทย (เช่น "มกราคม 2568") ใช้โชว์บนปุ่มเลือกเดือนและใน picker
  const monthLabel = (m) => `${MONTHS_TH[m.month]} ${m.year + 543}`;
  const isCurrentMonth = selMonth.year === now.getFullYear() && selMonth.month === now.getMonth();
  // จำนวนวันที่นับเป็นเปอร์เซ็นต์: เดือนปัจจุบันนับถึงวันนี้ เดือนก่อนหน้านับทั้งเดือน
  const countedDays = isCurrentMonth ? now.getDate() : new Date(selMonth.year, selMonth.month + 1, 0).getDate();

  // ดึงนิสัยทั้งหมดของ user (getHabits) แล้วดึง log ของเดือนที่เลือกต่อนิสัย (getHabitLogsForMonth)
  // เพื่อคำนวณ % สำเร็จของแต่ละนิสัยในเดือนนั้น — เรียกใหม่ทุกครั้งที่เปลี่ยนเดือนหรือ user
  const load = async () => {
    if (!user) return;
    const h = await getHabits(user.uid);
    setHabits(h);
    const lm = {};
    const rm = {};
    for (const habit of h) {
      const monthLogs = await getHabitLogsForMonth(user.uid, habit.id, selMonth.year, selMonth.month);
      lm[habit.id] = monthLogs;
      const done = monthLogs.slice(0, countedDays).filter(l => l.completed).length;
      rm[habit.id] = Math.round((done / countedDays) * 100);
    }
    setLogs(lm); setRates(rm);
  };

  useEffect(() => { load(); }, [user, selMonth]);
  // ใช้กับ pull-to-refresh
  const onRefresh = async () => { setRefresh(true); await load(); setRefresh(false); };

  // มาจากหน้าแจ้งเตือนพร้อม highlightId (ดู app/notifications.jsx) -> scroll+ไฮไลต์ไปหาการ์ดนิสัยนั้น
  // didHighlightRef กันไม่ให้สั่ง scroll ซ้ำทุกครั้งที่ habits เปลี่ยน (เช่น ติ๊กทำนิสัยอื่นแล้ว load() ใหม่) ทั้งที่ id เดิม
  useEffect(() => {
    if (!highlightId || habits.length === 0 || didHighlightRef.current === highlightId) return;
    didHighlightRef.current = highlightId;
    setHighlightedId(highlightId);
    const scrollTimer = setTimeout(() => {
      const y = itemY.current[highlightId];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(y - 12, 0), animated: true });
    }, 300);
    const clearTimer = setTimeout(() => setHighlightedId(null), 3000);
    return () => { clearTimeout(scrollTimer); clearTimeout(clearTimer); };
  }, [highlightId, habits]);

  // ติ๊ก/ยกเลิกติ๊กว่าทำนิสัยนี้ "วันนี้" แล้วหรือยัง — เขียน log ผ่าน toggleHabitLog (src/services)
  const handleToggle = async (h) => {
    if (!user) return;
    const done = logs[h.id]?.some(l => l.id===today && l.completed);
    await toggleHabitLog(user.uid, h.id, !done);
    await load();
  };

  // สร้างนิสัยใหม่ผ่าน addHabit (src/services -> Firestore) แล้วเคลียร์ฟอร์ม/ปิด modal
  const handleAdd = async () => {
    if (!name.trim()) { Alert.alert("แจ้งเตือน","กรุณากรอกชื่อนิสัย"); return; }
    if (!user) return;
    setSaving(true);
    try {
      await addHabit(user.uid, name.trim(), freq, category);
      setName(""); setFreq("daily"); setCategory("self_development"); setModal(false);
      await load();
    }
    catch { Alert.alert("ผิดพลาด","ไม่สามารถสร้างนิสัยได้"); }
    finally { setSaving(false); }
  };

  // ลบนิสัยถาวรผ่าน deleteHabit (src/services) หลังผู้ใช้ยืนยันใน Alert
  const handleDelete = (h) => Alert.alert("ลบนิสัย","ต้องการลบ \"" + h.name + "\"?",[
    { text:"ยกเลิก", style:"cancel" },
    { text:"ลบ", style:"destructive", onPress: async () => { if (!user) return; await deleteHabit(user.uid,h.id); await load(); } },
  ]);

  // สีของ % สำเร็จ (เขียว/ส้ม/แดง) ใช้กับ progress bar ของแต่ละการ์ดนิสัย — เกณฑ์เดียวกับหน้า report.jsx
  const rateColor = (r) => r>=80?C.green:r>=50?C.amber:C.rose;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bgHeader} />
      <View style={styles.header}>
        <Text style={styles.title}>นิสัยของฉัน</Text>
      </View>
      <ScrollView
        ref={scrollRef}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.primary} />}
        contentContainerStyle={{padding:16,paddingBottom:24}}
      >
        <TouchableOpacity style={styles.monthBtn} onPress={() => setPickerOpen(true)}>
          <Ionicons name="calendar-outline" size={16} color={C.primary2} />
          <Text style={styles.monthBtnText}>{monthLabel(selMonth)}</Text>
          <Ionicons name="chevron-down" size={16} color={C.primary2} />
        </TouchableOpacity>
        {habits.length===0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>🌱</Text>
            <Text style={styles.emptyText}>{"ยังไม่มีนิสัย\nเริ่มสร้างนิสัยแรกของคุณ!"}</Text>
          </View>
        )}
        {habits.map(h => {
          const done = logs[h.id]?.some(l => l.id===today && l.completed);
          const r    = rates[h.id] ?? 0;
          const rc   = rateColor(r);
          return (
            <View
              key={h.id}
              style={[styles.card, {borderLeftColor: done?C.green:C.lavender}, h.id === highlightedId && styles.cardHighlight]}
              onLayout={(e) => { itemY.current[h.id] = e.nativeEvent.layout.y; }}
            >
              <View style={styles.cardTop}>
                <View style={{flex:1}}>
                  <Text style={styles.habitName}>{h.name}</Text>
                  <View style={{flexDirection:"row", alignItems:"center", gap:6, marginTop:2}}>
                    <View style={[styles.categoryBadge, {backgroundColor: CATEGORY_META[h.category].bg}]}>
                      <Ionicons name={CATEGORY_META[h.category].icon} size={10} color={CATEGORY_META[h.category].color} />
                      <Text style={[styles.categoryBadgeText, {color: CATEGORY_META[h.category].color}]}>{CATEGORY_META[h.category].label}</Text>
                    </View>
                    <Text style={styles.habitStreak}>{"🔥 ต่อเนื่อง " + h.streakCount + " วัน"}</Text>
                  </View>
                </View>
                <TouchableOpacity style={[styles.toggleBtn, done&&styles.toggleBtnDone]} onPress={() => handleToggle(h)}>
                  <Text style={[styles.toggleBtnText, done&&styles.toggleBtnTextDone]}>{done?"✓ ทำแล้ว":"ทำวันนี้"}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.dotRow}>
                {(logs[h.id]??Array(new Date(selMonth.year, selMonth.month+1, 0).getDate()).fill({completed:false})).map((log,i) => {
                  const isFuture = isCurrentMonth && i+1 > now.getDate();
                  const isToday  = isCurrentMonth && i+1 === now.getDate();
                  return (
                    <View key={i} style={styles.dotWrap}>
                      <View style={[styles.dot, isFuture&&{opacity:0.45}, isToday&&styles.dotToday, log.completed && styles.dotDone]}>
                        <Text style={[styles.dotLabel, log.completed && styles.dotLabelDone]}>{i+1}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
              <View style={styles.progressRow}>
                <View style={styles.progressBg}>
                  <View style={[styles.progressFill, {width:r+"%", backgroundColor:rc}]} />
                </View>
                <Text style={[styles.progressText, {color:rc}]}>{r+"%"}</Text>
              </View>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(h)}>
                <Text style={styles.deleteText}>ลบนิสัย</Text>
              </TouchableOpacity>
            </View>
          );
        })}
        <View style={{height:24}} />
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setModal(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color={C.white} />
      </TouchableOpacity>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setPickerOpen(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>เลือกเดือน</Text>
            <ScrollView>
              {monthOptions.map(m => {
                const on = m.year === selMonth.year && m.month === selMonth.month;
                return (
                  <TouchableOpacity key={`${m.year}-${m.month}`} style={[styles.pickerItem, on&&styles.pickerItemOn]}
                    onPress={() => { setSelMonth(m); setPickerOpen(false); }}>
                    <Text style={[styles.pickerItemText, on&&styles.pickerItemTextOn]}>{monthLabel(m)}</Text>
                    {on && <Ionicons name="checkmark" size={18} color={C.primary2} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={modal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModal(false)}>
              <Text style={styles.cancelText}>ยกเลิก</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>สร้างนิสัยใหม่</Text>
            <TouchableOpacity onPress={handleAdd} disabled={saving}>
              <Text style={[styles.saveText, saving&&{opacity:0.5}]}>{saving?"บันทึก...":"บันทึก"}</Text>
            </TouchableOpacity>
          </View>
          <View style={{padding:20}}>
            <Text style={styles.fieldLabel}>ชื่อนิสัย</Text>
            <TextInput style={styles.minput} value={name} onChangeText={setName}
              placeholder="เช่น อ่านหนังสือ, ออกกำลังกาย..."
              placeholderTextColor={C.textHint} autoFocus />
            <Text style={styles.fieldLabel}>ความถี่</Text>
            <View style={styles.optRow}>
              {["daily","weekly"].map(f => (
                <TouchableOpacity key={f} style={[styles.optBtn, freq===f&&styles.optBtnOn]} onPress={()=>setFreq(f)}>
                  <Text style={[styles.optText, freq===f&&styles.optTextOn]}>{f==="daily"?"ทุกวัน":"ทุกสัปดาห์"}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>หมวดหมู่นิสัย</Text>
            <View style={[styles.optRow, {flexWrap:"wrap"}]}>
              {HABIT_CATEGORIES.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.optBtn, {flexBasis:"48%", flexDirection:"row", justifyContent:"center", gap:6}, category===c&&styles.optBtnOn]}
                  onPress={()=>setCategory(c)}
                >
                  <Ionicons name={CATEGORY_META[c].icon} size={14} color={category===c ? C.primary2 : C.textSub} />
                  <Text style={[styles.optText, category===c&&styles.optTextOn]}>{CATEGORY_META[c].label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex:1, backgroundColor:C.bg },
  header:          { flexDirection:"row", justifyContent:"space-between", alignItems:"center", backgroundColor:C.bgHeader, paddingHorizontal:20, paddingTop:52, paddingBottom:14 },
  title:           { fontSize:22, fontWeight:"700", color:C.text },
  fab:             {
    position:"absolute", bottom:24, right:20,
    width:56, height:56, borderRadius:28,
    backgroundColor:C.primary, alignItems:"center", justifyContent:"center",
    shadowColor:"#000", shadowOpacity:0.25, shadowOffset:{width:0,height:3}, shadowRadius:6,
    elevation:5,
  },
  emptyBox:        { alignItems:"center", marginTop:60 },
  emptyIcon:       { fontSize:48, marginBottom:12 },
  emptyText:       { fontSize:15, color:C.textHint, textAlign:"center", lineHeight:24 },
  card:            { backgroundColor:C.bgCard, borderWidth:0.5, borderColor:C.border, borderLeftWidth:3, borderRadius:16, padding:16, marginBottom:12 },
  // ใช้ชั่วคราวตอน scroll มาจากหน้าแจ้งเตือน เพื่อให้เห็นชัดว่าการ์ดไหนที่ถูกอ้างถึง (หายไปเองหลัง 3 วิ)
  cardHighlight:   { borderWidth:2, borderColor:C.primary, backgroundColor:C.primaryL },
  cardTop:         { flexDirection:"row", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 },
  habitName:       { fontSize:16, fontWeight:"700", color:C.text, marginBottom:3 },
  habitStreak:     { fontSize:12, color:C.textSub },
  categoryBadge:     { flexDirection:"row", alignItems:"center", gap:3, paddingHorizontal:7, paddingVertical:2, borderRadius:10 },
  categoryBadgeText: { fontSize:10, fontWeight:"700" },
  toggleBtn:       { backgroundColor:C.bg, borderWidth:0.5, borderColor:C.border, borderRadius:20, paddingHorizontal:12, paddingVertical:7 },
  toggleBtnDone:   { backgroundColor:"#047857", borderColor:"#047857" },
  toggleBtnText:   { fontSize:12, color:C.textSub, fontWeight:"600" },
  toggleBtnTextDone:{ color:C.white },
  dotRow:          { flexDirection:"row", flexWrap:"wrap", gap:5, marginBottom:10 },
  dotWrap:         { alignItems:"center" },
  dot:             { width:24, height:24, borderRadius:7, backgroundColor:C.bg, borderWidth:0.5, borderColor:C.border, justifyContent:"center", alignItems:"center" },
  dotToday:        { borderWidth:1.5, borderColor:C.primary },
  dotDone:         { backgroundColor:C.primary, borderColor:C.primary },
  dotLabel:        { fontSize:10, color:C.textSub },
  monthBtn:        { flexDirection:"row", alignItems:"center", gap:8, alignSelf:"flex-start", backgroundColor:C.bgCard, borderWidth:0.5, borderColor:C.border, borderRadius:20, paddingHorizontal:14, paddingVertical:8, marginBottom:12 },
  monthBtnText:    { fontSize:14, fontWeight:"700", color:C.primary2 },
  pickerOverlay:   { flex:1, backgroundColor:"rgba(0,0,0,0.4)", justifyContent:"center", padding:32 },
  pickerSheet:     { backgroundColor:C.bgCard, borderRadius:16, padding:16, maxHeight:"70%" },
  pickerTitle:     { fontSize:16, fontWeight:"700", color:C.text, marginBottom:8 },
  pickerItem:      { flexDirection:"row", justifyContent:"space-between", alignItems:"center", paddingVertical:12, paddingHorizontal:12, borderRadius:10 },
  pickerItemOn:    { backgroundColor:C.primaryL },
  pickerItemText:  { fontSize:15, color:C.text },
  pickerItemTextOn:{ color:C.primary2, fontWeight:"700" },
  dotLabelDone:    { color:C.white, fontWeight:"700" },
  progressRow:     { flexDirection:"row", alignItems:"center", gap:8, marginBottom:10 },
  progressBg:      { flex:1, height:6, backgroundColor:C.lavLight, borderRadius:3, overflow:"hidden" },
  progressFill:    { height:"100%", borderRadius:3 },
  progressText:    { fontSize:12, fontWeight:"700", minWidth:36, textAlign:"right" },
  deleteBtn:       { alignSelf:"flex-end" },
  deleteText:      { fontSize:12, color:C.rose },
  modalContainer:  { flex:1, backgroundColor:C.bg },
  modalHeader:     { flexDirection:"row", justifyContent:"space-between", alignItems:"center", padding:20, paddingTop:24, backgroundColor:C.bgCard, borderBottomWidth:0.5, borderBottomColor:C.border },
  cancelText:      { fontSize:15, color:C.textSub },
  modalTitle:      { fontSize:16, fontWeight:"700", color:C.text },
  saveText:        { fontSize:15, color:C.primary, fontWeight:"700" },
  fieldLabel:      { fontSize:12, fontWeight:"600", color:C.primary2, marginBottom:8, marginTop:16 },
  minput:          { backgroundColor:C.bgCard, borderWidth:0.5, borderColor:C.border, borderRadius:12, paddingHorizontal:14, paddingVertical:12, fontSize:15, color:C.text },
  optRow:          { flexDirection:"row", gap:10 },
  optBtn:          { flex:1, paddingVertical:12, borderRadius:12, borderWidth:0.5, borderColor:C.border, backgroundColor:C.bgCard, alignItems:"center" },
  optBtnOn:        { backgroundColor:C.primaryL, borderColor:C.primary },
  optText:         { fontSize:14, color:C.textSub },
  optTextOn:       { color:C.primary2, fontWeight:"700" },
});
