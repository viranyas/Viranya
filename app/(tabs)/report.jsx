// app/(tabs)/report.jsx
import { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, StatusBar } from "react-native";
import { useRouter, useFocusEffect } from "expo-router"; // ✅ เพิ่มการนำเข้า useRouter
import { Ionicons } from "@expo/vector-icons"; // ✅ เพิ่มการนำเข้า Ionicons
import { useStore } from "../../src/hooks/useStore";
import { generateReport, getHabits, getNotifications } from "../../src/services";
import { C } from "../../src/config/theme";
import { TODO_CATEGORIES, CATEGORY_META } from "../../src/config/categories";

const PERIOD_LABELS = { this_month:"เดือนนี้","3months":"3 เดือน",all:"ทั้งหมด" };
// สีของ % สำเร็จ (เขียว/ส้ม/แดง) ใช้กับตัวเลขสถิติและ progress bar ในหน้านี้ — เกณฑ์เดียวกับ habits.jsx
const rColor = (r) => r>=80?C.green:r>=50?C.amber:C.rose;

export default function ReportScreen() {
  const router = useRouter(); // ✅ เรียกใช้ router สำหรับเปลี่ยนหน้า
  const { user, reportCache, setReport } = useStore();
  const [period, setPeriod] = useState("this_month");
  const [loading, setLoading] = useState(false);
  const [hNames, setHNames] = useState({});
  const [hFreq, setHFreq] = useState({});
  const [hasUnread, setHasUnread] = useState(false);

  // เช็คว่ามีแจ้งเตือนที่ยังไม่อ่านไหม ทุกครั้งที่กลับมาหน้านี้ เพื่ออัปเดตจุดแดง
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      getNotifications(user.uid).then(notifs => {
        setHasUnread(notifs.some(n => !n.isRead));
      });
    }, [user])
  );

  const cache = reportCache[period];
  const maxBar = cache ? Math.max(...(cache.chartData.values.length > 0 ? cache.chartData.values : [1]), 1) : 1;
  const chartTitle = period === "this_month" ? "งานสำเร็จรายสัปดาห์" : "งานสำเร็จรายเดือน";
  const delta = cache?.comparison ? cache.successRate - cache.comparison.successRate : null;

  // เรียก generateReport (src/services -> อ่าน todos/habits จาก Firestore แล้วสรุปสถิติ)
  // เก็บชื่อนิสัยไว้โชว์คู่กับกราฟ แล้วเซฟผลไว้ใน useStore.reportCache[period] เพื่อไม่ต้องคำนวณซ้ำ
  const handleGenerate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const habits = await getHabits(user.uid);
      const nm = {}; const fm = {};
      habits.forEach(h => { nm[h.id] = h.name; fm[h.id] = h.frequency; });
      setHNames(nm); setHFreq(fm);
      const r = await generateReport(user.uid, period);
      setReport(period, r);
    } finally { setLoading(false); }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bgHeader} />

      {/* --- ส่วน Header ที่ปรับปรุงใหม่ --- */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>รายงาน</Text>
          <Text style={styles.sub}>สรุปผลการใช้งาน</Text>
        </View>

        {/* ✅ ปุ่มกระดิ่งแจ้งเตือน */}
        <TouchableOpacity
          style={styles.notifBtn}
          onPress={() => router.push("/notifications")}
          activeOpacity={0.7}
        >
          <Ionicons name="notifications-outline" size={24} color={C.text} />
          {hasUnread && <View style={styles.redDot} />}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:32}}>
        <View style={styles.periodRow}>
          {Object.keys(PERIOD_LABELS).map(p => (
            <TouchableOpacity key={p} onPress={() => setPeriod(p)}
              style={[styles.periodBtn, period===p&&styles.periodBtnOn]}>
              <Text style={[styles.periodText, period===p&&styles.periodTextOn]}>{PERIOD_LABELS[p]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {cache ? (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statVal}>{cache.doneTasks}<Text style={styles.statUnit}>{"/" + cache.totalTasks}</Text></Text>
                <Text style={styles.statLabel}>งานสำเร็จ</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statVal,{color:rColor(cache.successRate)}]}>{cache.successRate}<Text style={styles.statUnit}>%</Text></Text>
                <Text style={[styles.statDelta,{color:rColor(cache.successRate)}]}>อัตราสำเร็จ</Text>
                {delta !== null ? (
                  <View style={styles.deltaRow}>
                    <Ionicons name={delta>=0?"arrow-up":"arrow-down"} size={11} color={delta>=0?C.green:C.rose} />
                    <Text style={[styles.statLabel,{color:delta>=0?C.green:C.rose, fontWeight:"700"}]}>
                      {Math.abs(delta) + "% จาก" + (period==="this_month"?"เดือนก่อน":"ช่วงก่อน")}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.statLabel}>รอบปัจจุบัน</Text>
                )}
              </View>
            </View>

            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>{chartTitle}</Text>
              <View style={[styles.barRow, cache.chartData.values.length > 4 && {gap:6}]}>
                {(cache.chartData.values.length >= 1 ? cache.chartData.values : [0]).map((v,i) => {
                  const h = maxBar>0?Math.round((v/maxBar)*56):0;
                  return (
                    <View key={i} style={styles.barWrap}>
                      <Text style={styles.barVal}>{v}</Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.bar, {height:Math.max(h,4), backgroundColor:C.primary}]} />
                      </View>
                      <Text style={styles.barLabel} numberOfLines={1}>{cache.chartData.labels[i] ?? i+1}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {TODO_CATEGORIES.some(c => cache.chartData.categoryBreakdown[c]?.total > 0) && (
              <View style={styles.habitCard}>
                <Text style={styles.chartTitle}>สัดส่วนตามหมวดหมู่</Text>
                {TODO_CATEGORIES.filter(c => cache.chartData.categoryBreakdown[c]?.total > 0).map(c => {
                  const b = cache.chartData.categoryBreakdown[c];
                  const pct = b.total > 0 ? Math.round((b.done / b.total) * 100) : 0;
                  return (
                    <View key={c} style={styles.habitRateRow}>
                      <View style={styles.catNameWrap}>
                        <Ionicons name={CATEGORY_META[c].icon} size={12} color={CATEGORY_META[c].color} />
                        <Text style={styles.habitRateName} numberOfLines={1}>{CATEGORY_META[c].label}</Text>
                      </View>
                      <View style={styles.progressBg}>
                        <View style={[styles.progressFill, {width:pct+"%", backgroundColor:CATEGORY_META[c].color}]} />
                      </View>
                      <Text style={[styles.rateText,{color:CATEGORY_META[c].color}]}>{b.done + "/" + b.total}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {Object.entries(cache.chartData.habitRates).filter(([hid]) => hFreq[hid] !== "weekly").length > 0 && (
              <View style={styles.habitCard}>
                <Text style={styles.chartTitle}>ความต่อเนื่องนิสัยทุกวัน</Text>
                {Object.entries(cache.chartData.habitRates).filter(([hid]) => hFreq[hid] !== "weekly").map(([hid,rate]) => (
                  <View key={hid} style={styles.habitRateRow}>
                    <Text style={styles.habitRateName} numberOfLines={1}>{hNames[hid]??hid}</Text>
                    <View style={styles.progressBg}>
                      <View style={[styles.progressFill, {width:rate+"%", backgroundColor:rColor(rate)}]} />
                    </View>
                    <Text style={[styles.rateText,{color:rColor(rate)}]}>{rate+"%"}</Text>
                  </View>
                ))}
              </View>
            )}

            {Object.entries(cache.chartData.habitRates).filter(([hid]) => hFreq[hid] === "weekly").length > 0 && (
              <View style={styles.habitCard}>
                <Text style={styles.chartTitle}>ความต่อเนื่องนิสัยทุกสัปดาห์</Text>
                {Object.entries(cache.chartData.habitRates).filter(([hid]) => hFreq[hid] === "weekly").map(([hid,rate]) => (
                  <View key={hid} style={styles.habitRateRow}>
                    <Text style={styles.habitRateName} numberOfLines={1}>{hNames[hid]??hid}</Text>
                    <View style={styles.progressBg}>
                      <View style={[styles.progressFill, {width:rate+"%", backgroundColor:rColor(rate)}]} />
                    </View>
                    <Text style={[styles.rateText,{color:rColor(rate)}]}>{rate+"%"}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.summaryCard}>
              <Text style={styles.summaryText}>
                {"สรุป: คุณทำรายการสำเร็จไปแล้ว " + cache.doneTasks + " รายการ จากทั้งหมด " + cache.totalTasks + " รายการ คิดเป็น " + cache.successRate + "% ในช่วง" + PERIOD_LABELS[period]}
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconContainer}>
               <Text style={styles.emptyIconText}>📊</Text>
            </View>
            <Text style={styles.emptyText}>ยังไม่มีข้อมูลรายงานในหน้านี้</Text>
            <Text style={styles.emptySubText}>กดปุ่มด้านล่างเพื่อสรุปผลสถิติของคุณ</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.genBtn, loading&&{opacity:0.6}]}
          onPress={handleGenerate} disabled={loading} activeOpacity={0.85}>
          {loading
            ? <ActivityIndicator color={C.white} />
            : <Text style={styles.genBtnText}>{cache?"อัปเดตรายงาน":"สร้างรายงาน"}</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:C.bg },
  // Header ปรับให้เป็นแบบ Row เพื่อวางปุ่มแจ้งเตือน
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor:C.bgHeader,
    paddingHorizontal:20,
    paddingTop:52,
    paddingBottom:14
  },
  title: { fontSize:22, fontWeight:"700", color:C.text },
  sub: { fontSize:13, color:C.textSub, marginTop:2 },

  // Style ปุ่มแจ้งเตือน
  notifBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.bgCard,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 0.5,
    borderColor: C.border,
  },
  redDot: {
    position: "absolute",
    top: 8,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.rose,
    borderWidth: 1.5,
    borderColor: C.bgCard,
  },

  periodRow: { flexDirection:"row", paddingHorizontal:16, paddingVertical:12, gap:8, backgroundColor:C.bgCard, borderBottomWidth:0.5, borderBottomColor:C.border },
  periodBtn: { flex:1, paddingVertical:8, borderRadius:20, borderWidth:0.5, borderColor:C.border, backgroundColor:C.bg, alignItems:"center" },
  periodBtnOn: { backgroundColor:C.primary, borderColor:C.primary },
  periodText: { fontSize:13, color:C.textSub },
  periodTextOn: { color:C.white, fontWeight:"700" },
  statsRow: { flexDirection:"row", gap:12, padding:16, paddingBottom:8 },
  statCard: { flex:1, backgroundColor:C.bgCard, borderWidth:0.5, borderColor:C.border, borderRadius:14, padding:14, alignItems:"center" },
  statVal: { fontSize:22, fontWeight:"700", color:C.text },
  statUnit: { fontSize:13, color:C.textSub },
  statDelta: { fontSize:11, marginVertical:2 },
  statLabel: { fontSize:11, color:C.textSub },
  deltaRow: { flexDirection:"row", alignItems:"center", gap:2 },
  chartCard: { marginHorizontal:16, backgroundColor:C.bgCard, borderWidth:0.5, borderColor:C.border, borderRadius:14, padding:16, marginBottom:12 },
  chartTitle: { fontSize:13, fontWeight:"700", color:C.text, marginBottom:12 },
  barRow: { flexDirection:"row", alignItems:"flex-end", gap:12 },
  barWrap: { flex:1, alignItems:"center", gap:4 },
  // ความสูงคงที่ ไม่ขึ้นกับค่า v — กันตัวเลข (barVal) ไม่ให้ถูกดันทะลุขึ้นไปทับ chartTitle ตอนแท่งสูงสุด (56px)
  barTrack: { height:56, width:"100%", justifyContent:"flex-end" },
  bar: { width:"100%", borderRadius:4 },
  barVal: { fontSize:10, color:C.textSub },
  barLabel: { fontSize:11, color:C.textSub, fontWeight:"600" },
  habitCard: { marginHorizontal:16, backgroundColor:C.bgCard, borderWidth:0.5, borderColor:C.border, borderRadius:14, padding:16, marginBottom:12 },
  habitRateRow: { flexDirection:"row", alignItems:"center", gap:10, marginBottom:10 },
  habitRateName: { fontSize:12, color:C.text, width:80 },
  catNameWrap: { flexDirection:"row", alignItems:"center", gap:5, width:90 },
  progressBg: { flex:1, height:6, backgroundColor:C.lavLight, borderRadius:3, overflow:"hidden" },
  progressFill: { height:"100%", borderRadius:3 },
  rateText: { fontSize:12, fontWeight:"700", minWidth:36, textAlign:"right" },
  summaryCard: { marginHorizontal:16, backgroundColor:C.lavLight, borderWidth:0.5, borderColor:C.lavender, borderRadius:12, padding:14, marginBottom:16 },
  summaryText: { fontSize:13, color:C.primary2, lineHeight:22 },

  emptyBox: { alignItems:"center", paddingVertical:60, paddingHorizontal:40 },
  emptyIconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.lavLight, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyIconText: { fontSize:40 },
  emptyText: { fontSize:17, fontWeight: "700", color:C.text, marginBottom: 8 },
  emptySubText: { fontSize:14, color: C.textSub, textAlign: 'center', lineHeight: 20 },

  genBtn: { marginHorizontal:16, backgroundColor:C.primary, borderRadius:14, paddingVertical:14, alignItems:"center" },
  genBtnText: { color:C.white, fontSize:16, fontWeight:"700" },
});
