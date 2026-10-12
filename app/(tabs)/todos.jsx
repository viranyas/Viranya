import { useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, RefreshControl, Modal, TextInput, StatusBar, Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useStore } from "../../src/hooks/useStore";
import { getTodos, addTodo, updateTodo, deleteTodo } from "../../src/services";
import { C } from "../../src/config/theme";
import { TODO_CATEGORIES, CATEGORY_META } from "../../src/config/categories";
import DateTimePicker from "@react-native-community/datetimepicker";

// ใช้จัดลำดับความสำคัญตอน sort งาน (high มาก่อน) ใน load() ด้านล่าง
const PRI_ORDER = { high: 0, medium: 1, low: 2 };

// สี/label ของ priority — ใช้ render badge ในการ์ดแต่ละงานและปุ่มเลือกใน modal เพิ่ม/แก้งาน
const PRI = {
  high:   { bg: C.roseBg,   text: C.rose,     label: "สูง"   },
  medium: { bg: C.amberBg,  text: C.amber,    label: "กลาง"  },
  low:    { bg: C.greenBg,  text: C.green,    label: "ต่ำ"   },
};
const DIFF = {
  easy:   { bg: C.greenBg,  text: C.green,    label: "ง่าย"  },
  medium: { bg: C.amberBg,  text: C.amber,    label: "กลาง"  },
  hard:   { bg: C.lavLight, text: C.primary2, label: "ยาก"   },
};

// ฟอร์มว่างเริ่มต้นสำหรับ modal เพิ่มงานใหม่ (openAdd ใช้ reset form กลับมาที่ค่านี้)
const BLANK = {
  title: "",
  priority: "medium",
  difficulty: "medium",
  dueDatetime: null,
  linkedCategory: "general",
};

export default function TodosScreen() {
  const { user } = useStore();
  const { highlightId } = useLocalSearchParams();
  const [todos, setTodos] = useState([]);
  const [refresh, setRefresh] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [filter, setFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(null);
  const [highlightedId, setHighlightedId] = useState(null);
  const scrollRef = useRef(null);
  const itemY = useRef({});
  const didHighlightRef = useRef(null);

  // ดึงรายการงานทั้งหมดของ user จาก Firestore ผ่าน getTodos (src/services) แล้วจัดเรียงใหม่
  const load = async () => {
    if (!user) return;
    const raw = await getTodos(user.uid);
    // เรียง: งานที่เสร็จแล้วอยู่ล่างสุด -> งานค้างเรียงตาม Priority -> ตามด้วยวันเวลา
    const sorted = [...raw].sort((a, b) => {
      if (a.status !== b.status) return a.status === "done" ? 1 : -1;
      const pd = PRI_ORDER[a.priority] - PRI_ORDER[b.priority];
      if (pd !== 0) return pd;
      if (a.dueDatetime && b.dueDatetime) return a.dueDatetime.getTime() - b.dueDatetime.getTime();
      return a.dueDatetime ? -1 : 1;
    });
    setTodos(sorted);
  };

  useEffect(() => { load(); }, [user]);
  // ใช้กับ pull-to-refresh และปุ่มรีเฟรชบน header
  const onRefresh = async () => { setRefresh(true); await load(); setRefresh(false); };

  // มาจากหน้าแจ้งเตือนพร้อม highlightId (ดู app/notifications.jsx) -> เปิดดู "ทั้งหมด" เผื่องานนั้นถูกตัวกรองปัจจุบันซ่อนไว้
  // แล้ว scroll+ไฮไลต์ไปหาการ์ดนั้น (หน่วงเวลาสั้นๆ รอให้ onLayout ของการ์ดคำนวณตำแหน่ง Y เสร็จก่อน)
  // didHighlightRef กันไม่ให้สั่ง scroll ซ้ำทุกครั้งที่ todos เปลี่ยน (เช่น ติ๊กงานอื่นแล้ว load() ใหม่) ทั้งที่ id เดิม
  useEffect(() => {
    if (!highlightId || todos.length === 0 || didHighlightRef.current === highlightId) return;
    didHighlightRef.current = highlightId;
    setFilter("all");
    setHighlightedId(highlightId);
    const scrollTimer = setTimeout(() => {
      const y = itemY.current[highlightId];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(y - 12, 0), animated: true });
    }, 300);
    const clearTimer = setTimeout(() => setHighlightedId(null), 3000);
    return () => { clearTimeout(scrollTimer); clearTimeout(clearTimer); };
  }, [highlightId, todos]);

  // เปิด modal แบบ "เพิ่มงานใหม่" ด้วยฟอร์มว่าง (editing = null บอกว่าไม่ใช่โหมดแก้ไข)
  const openAdd = () => { setEditing(null); setForm(BLANK); setModal(true); };

  // เปิด modal แบบ "แก้ไขงาน" โดยเติมค่าเดิมของ todo ที่กดเข้ามาลงฟอร์ม
  const openEdit = (t) => {
    setEditing(t);
    setForm({
      title: t.title,
      priority: t.priority,
      difficulty: t.difficulty,
      dueDatetime: t.dueDatetime ? new Date(t.dueDatetime) : null,
      linkedCategory: t.linkedCategory,
    });
    setModal(true);
  };

  // callback ของ DateTimePicker (ด้านล่างใน modal) — อัปเดต form.dueDatetime เมื่อผู้ใช้เลือกวัน/เวลาสำเร็จ
  // Android ต้องปิด picker เองหลังเลือกเสร็จ (เป็น dialog), iOS ใช้ spinner แบบฝังในหน้าจอเลยปล่อยให้เปิดค้างไว้ให้เลื่อนต่อได้
  const onDateChange = (_event, selectedDate) => {
    if (Platform.OS === 'android') setShowPicker(null);
    if (selectedDate) {
      setForm(f => ({ ...f, dueDatetime: selectedDate }));
    }
  };

  // ผู้ใช้กดยกเลิก/ปิด picker โดยไม่เลือกวัน/เวลา (Android เท่านั้น ที่ dialog ปิดเองได้โดยไม่เลือก)
  const onDatePickerDismiss = () => {
    if (Platform.OS === 'android') setShowPicker(null);
  };

  // บันทึกฟอร์ม: ถ้ามี editing คือแก้ไข (updateTodo) ถ้าไม่มีคือเพิ่มใหม่ (addTodo) — ทั้งคู่เขียนลง
  // Firestore ผ่าน src/services แล้ว load() ใหม่เพื่อ sync state กับ DB ก่อนปิด modal
  const handleSave = async () => {
  if (!form.title.trim()) {
    Alert.alert("แจ้งเตือน", "กรุณากรอกชื่องาน");
    return;
  }
  if (!user) return;
  setSaving(true);
  try {
    if (editing) {
      // เพิ่ม updatedAt เข้าไปตอนแก้ไขด้วย เพื่อให้ AI รู้ว่าแก้ล่าสุดเมื่อไหร่
      await updateTodo(user.uid, editing.id, {
        ...form,
        updatedAt: new Date(),
      });
    } else {
      await addTodo(user.uid, form);
    }
    await load();
    setModal(false);
  } catch (err) {
    console.error(err); // ดู error จริงใน console
    Alert.alert("ผิดพลาด", "ไม่สามารถบันทึกได้");
  } finally {
    setSaving(false);
  }
};

  // สลับสถานะงาน pending <-> done ผ่าน updateTodo (เรียกจากติ๊ก checkbox ในการ์ด
  // และจากปุ่ม "เปลี่ยนสถานะ" ใน modal แก้ไขงาน)
  const handleToggle = async (t) => {
  if (!user) return;
  await updateTodo(user.uid, t.id, {
    status: t.status === "done" ? "pending" : "done",
    updatedAt: new Date(), // ส่งวันที่ปัจจุบันไปบันทึก
  });
  await load();
  };

  // ลบงานถาวรผ่าน deleteTodo (src/services) หลังผู้ใช้ยืนยันใน Alert
  const handleDelete = (t) =>
    Alert.alert("ลบงาน", "ต้องการลบ \"" + t.title + "\"?", [
      { text: "ยกเลิก", style: "cancel" },
      { text: "ลบ", style: "destructive", onPress: async () => {
          if (!user) return;
          await deleteTodo(user.uid, t.id);
          await load();
      }},
    ]);

  const filtered = todos.filter((t) => filter === "all" || t.status === filter);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>รายการงาน</Text>
          <Text style={styles.count}>{todos.filter(t => t.status === "pending").length} งานค้าง</Text>
        </View>
        <TouchableOpacity onPress={onRefresh}><Ionicons name="refresh" size={20} color={C.primary}/></TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {["all", "pending", "done"].map((f) => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[styles.filterBtn, filter === f && styles.filterBtnOn]}>
            <Text style={[styles.filterText, filter === f && styles.filterTextOn]}>
              {f === "all" ? "ทั้งหมด" : f === "pending" ? "ยังไม่ทำ" : "เสร็จแล้ว"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView ref={scrollRef} refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} />} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {filtered.length === 0 && <Text style={styles.empty}>ไม่มีรายการงาน</Text>}
        {filtered.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.card, { borderLeftColor: PRI[t.priority].text }, t.id === highlightedId && styles.cardHighlight]}
            onLongPress={() => openEdit(t)}
            onLayout={(e) => { itemY.current[t.id] = e.nativeEvent.layout.y; }}
          >
            <TouchableOpacity style={[styles.checkbox, t.status === "done" && styles.checkboxDone]} onPress={() => handleToggle(t)}>
              {t.status === "done" && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, t.status === "done" && styles.strikethrough]} numberOfLines={1}>{t.title}</Text>
              <View style={styles.badgeRow}>
                <View style={[styles.badge, { backgroundColor: PRI[t.priority].bg }]}><Text style={[styles.badgeText, { color: PRI[t.priority].text }]}>{PRI[t.priority].label}</Text></View>
                <View style={[styles.badge, { backgroundColor: DIFF[t.difficulty].bg }]}><Text style={[styles.badgeText, { color: DIFF[t.difficulty].text }]}>{DIFF[t.difficulty].label}</Text></View>
                <View style={[styles.badge, { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: CATEGORY_META[t.linkedCategory].bg }]}>
                  <Ionicons name={CATEGORY_META[t.linkedCategory].icon} size={10} color={CATEGORY_META[t.linkedCategory].color} />
                  <Text style={[styles.badgeText, { color: CATEGORY_META[t.linkedCategory].color }]}>{CATEGORY_META[t.linkedCategory].label}</Text>
                </View>
                {t.dueDatetime && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Ionicons name="alarm-outline" size={12} color={C.textSub} />
                    <Text style={styles.dueText}>{t.dueDatetime.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
                  </View>
                )}
              </View>
            </View>
            <TouchableOpacity onPress={() => openEdit(t)} style={styles.editBtn}><Ionicons name="pencil" size={16} color={C.primary} /></TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(t)} style={styles.editBtn}><Ionicons name="trash" size={16} color={C.textHint} /></TouchableOpacity>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color={C.white} />
      </TouchableOpacity>

      <Modal visible={modal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModal(false)}><Text style={styles.cancelText}>ยกเลิก</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>{editing ? "แก้ไขงาน" : "เพิ่มงานใหม่"}</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}><Text style={styles.saveText}>{saving ? "..." : "บันทึก"}</Text></TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
            <Text style={styles.fieldLabel}>ชื่องาน</Text>
            <TextInput style={styles.minput} value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="สิ่งที่ต้องทำ..." />

            <Text style={styles.fieldLabel}>วันเวลาที่กำหนด (AI วิเคราะห์ความตรงต่อเวลา)</Text>
            <View style={[styles.optRow, { gap: 10 }]}>
              <TouchableOpacity style={[styles.minput, { flex: 1, flexDirection: 'row', justifyContent: 'space-between' }]} onPress={() => setShowPicker('date')}>
                <Text style={{ color: form.dueDatetime ? C.text : C.textHint }}>{form.dueDatetime ? form.dueDatetime.toLocaleDateString("th-TH") : "เลือกวันที่"}</Text>
                <Ionicons name="calendar-outline" size={18} color={C.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.minput, { flex: 1, flexDirection: 'row', justifyContent: 'space-between' }]} onPress={() => setShowPicker('time')}>
                <Text style={{ color: form.dueDatetime ? C.text : C.textHint }}>{form.dueDatetime ? form.dueDatetime.toLocaleTimeString("th-TH", { hour: '2-digit', minute: '2-digit' }) : "เลือกเวลา"}</Text>
                <Ionicons name="time-outline" size={18} color={C.primary} />
              </TouchableOpacity>
            </View>
            {form.dueDatetime && <TouchableOpacity onPress={() => setForm(f => ({ ...f, dueDatetime: null }))}><Text style={{ color: C.rose, textAlign: 'right', marginTop: 5 }}>ล้างค่า</Text></TouchableOpacity>}

            {showPicker && (
              <DateTimePicker value={form.dueDatetime || new Date()} mode={showPicker} is24Hour={true} display={Platform.OS === 'ios' ? 'spinner' : 'default'} onValueChange={onDateChange} onDismiss={onDatePickerDismiss} />
            )}

            <Text style={styles.fieldLabel}>ความสำคัญ / ความยาก</Text>
            <View style={[styles.optRow, { marginBottom: 10 }]}>
              {["low", "medium", "high"].map((p) => (
                <TouchableOpacity key={p} style={[styles.optBtn, form.priority === p && styles.optBtnOn]} onPress={() => setForm(f => ({ ...f, priority: p }))}>
                  <Text style={[styles.optText, form.priority === p && styles.optTextOn]}>{PRI[p].label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.optRow}>
              {["easy", "medium", "hard"].map((d) => (
                <TouchableOpacity key={d} style={[styles.optBtn, form.difficulty === d && styles.optBtnOn]} onPress={() => setForm(f => ({ ...f, difficulty: d }))}>
                  <Text style={[styles.optText, form.difficulty === d && styles.optTextOn]}>{DIFF[d].label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>เชื่อมโยงกับนิสัยด้านต่างๆ (AI จะใช้วิเคราะห์ความสอดคล้อง)</Text>
            <View style={[styles.optRow, { flexWrap: 'wrap' }]}>
              {TODO_CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.optBtn, { flexBasis: '31%', flexDirection: 'row', justifyContent: 'center', gap: 5 }, form.linkedCategory === c && styles.optBtnOn]}
                  onPress={() => setForm(f => ({ ...f, linkedCategory: c }))}
                >
                  <Ionicons name={CATEGORY_META[c].icon} size={13} color={form.linkedCategory === c ? C.primary2 : C.textSub} />
                  <Text style={[styles.optText, form.linkedCategory === c && styles.optTextOn]}>{CATEGORY_META[c].label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {editing && (
              <>
                <Text style={styles.fieldLabel}>เปลี่ยนสถานะ</Text>
                <TouchableOpacity
                  style={[styles.optBtn, { backgroundColor: editing.status === 'done' ? C.greenBg : C.bgCard }]}
                  onPress={() => handleToggle(editing).then(() => setModal(false))}
                >
                  <Text style={{ color: editing.status === 'done' ? C.green : C.textSub }}>
                    {editing.status === 'done' ? "เสร็จแล้ว (คลิกเพื่อแก้เป็นยังไม่ทำ)" : "ยังไม่ทำ (คลิกเพื่อจบงาน)"}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  header:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.bgHeader, paddingHorizontal: 20, paddingTop: 52, paddingBottom: 14 },
  title:        { fontSize: 22, fontWeight: "700", color: C.text },
  count:        { fontSize: 13, color: C.textSub },
  filterRow:    { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 8, backgroundColor: C.bgCard, borderBottomWidth: 0.5, borderBottomColor: C.border },
  filterBtn:    { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 0.5, borderColor: C.border, backgroundColor: C.bg },
  filterBtnOn:  { backgroundColor: C.primary, borderColor: C.primary },
  filterText:   { fontSize: 12, color: C.textSub },
  filterTextOn: { color: C.white, fontWeight: "700" },
  empty:        { textAlign: "center", color: C.textHint, fontSize: 14, marginTop: 40 },
  card:         { backgroundColor: C.bgCard, borderWidth: 0.5, borderColor: C.border, borderLeftWidth: 3, borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  // ใช้ชั่วคราวตอน scroll มาจากหน้าแจ้งเตือน เพื่อให้เห็นชัดว่าการ์ดไหนที่ถูกอ้างถึง (หายไปเองหลัง 3 วิ)
  cardHighlight:{ borderWidth: 2, borderColor: C.primary, backgroundColor: C.primaryL },
  checkbox:     { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.border, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  checkboxDone: { backgroundColor: C.green, borderColor: C.green },
  checkmark:    { color: C.white, fontSize: 13, fontWeight: "700" },
  cardTitle:    { fontSize: 14, fontWeight: "600", color: C.text, marginBottom: 6 },
  strikethrough:{ textDecorationLine: "line-through", color: C.textHint },
  badgeRow:     { flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" },
  badge:        { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  badgeText:    { fontSize: 11, fontWeight: "600" },
  dueText:      { fontSize: 11, color: C.textSub },
  editBtn:      { padding: 6 },
  fab:          {
    position: "absolute", bottom: 24, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.primary, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.25, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6,
    elevation: 5,
  },
  modalHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingTop: 24, backgroundColor: C.bgCard, borderBottomWidth: 0.5, borderBottomColor: C.border },
  cancelText:   { fontSize: 15, color: C.textSub },
  modalTitle:   { fontSize: 16, fontWeight: "700", color: C.text },
  saveText:     { fontSize: 15, color: C.primary, fontWeight: "700" },
  fieldLabel:   { fontSize: 12, fontWeight: "600", color: C.primary2, marginBottom: 8, marginTop: 16 },
  minput:       { backgroundColor: C.bgCard, borderWidth: 0.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text },
  optRow:       { flexDirection: "row", gap: 8 },
  optBtn:       { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 0.5, borderColor: C.border, backgroundColor: C.bgCard, alignItems: "center" },
  optBtnOn:     { backgroundColor: C.primaryL, borderColor: C.primary },
  optText:      { fontSize: 13, color: C.textSub },
  optTextOn:    { color: C.primary2, fontWeight: "700" },
});
