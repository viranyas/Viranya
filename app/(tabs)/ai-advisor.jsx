// app/(tabs)/ai-advisor.jsx
import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, StatusBar } from "react-native";
import { useFocusEffect } from "expo-router";
import { useStore } from "../../src/hooks/useStore";
import { runAiAnalysis, getLatestAnalysis } from "../../src/services";
import { C } from "../../src/config/theme";

const PERIOD_LABELS = { "7days": "7 วัน", "30days": "30 วัน", all: "ทั้งหมด" };
// สี/label ของ insight แต่ละประเภท (AiInsight.insightType) ใช้ render การ์ดคำแนะนำจาก Gemini ด้านล่าง
const INS = {
  insight: { bg: C.lavLight, border: C.lavender, tagBg: C.primary, tagText: C.white, label: "วิเคราะห์", msgColor: C.primary2, accent: C.primary },
  warning: { bg: C.amberBg, border: "#FCD34D", tagBg: C.amber, tagText: "#451A03", label: "แจ้งเตือน", msgColor: "#92400E", accent: C.amber },
  tip: { bg: C.greenBg, border: "#6EE7B7", tagBg: C.green, tagText: "#022C22", label: "เคล็ดลับ", msgColor: "#065F46", accent: C.green },
};

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function AiAdvisorScreen() {
  const { user, aiAnalysis, aiInsights, setAiResult } = useStore();
  const [period, setPeriod] = useState("7days");
  const [loading, setLoading] = useState(false);

  // ทุกครั้งที่สลับแท็บมาหน้านี้ ให้รีเซ็ตช่วงเวลากลับไปที่ "7 วัน" เสมอ ไม่ว่าก่อนหน้านี้จะเคยเลือกช่วงอื่นไว้
  useFocusEffect(
    useCallback(() => {
      setPeriod("7days");
    }, [])
  );

  // ดึงข้อมูลล่าสุดเมื่อเปลี่ยน Period — getLatestAnalysis (src/services) อ่านผลวิเคราะห์ที่เคย
  // บันทึกไว้ใน Firestore ของ period นั้น แล้วเซฟลง useStore (aiAnalysis/aiInsights) ให้หน้านี้ใช้
  useEffect(() => {
    if (!user) return;
    (async () => {
      const r = await getLatestAnalysis(user.uid, period);
      // ตรวจสอบว่ามีข้อมูลหรือไม่ ถ้าไม่มีให้ล้างค่าเก่าออกเพื่อให้แสดงหน้า Empty State
      if (r) {
        setAiResult(r.analysis, r.insights);
      } else {
        setAiResult(null, []);
      }
    })();
  }, [user, period]);

  // สั่งวิเคราะห์ใหม่: runAiAnalysis (src/services) รวบรวม todos/habits ของ user ส่งให้ Gemini
  // แล้วเขียนผลกลับลง Firestore ก่อน คืนค่ามาเซฟลง useStore ผ่าน setAiResult ให้หน้านี้ re-render
  const handleAnalyze = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // runAiAnalysis ตัวนี้จะใช้ buildPrompt ที่เราแก้ไขให้วิเคราะห์ Habit ด้วย
      const r = await runAiAnalysis(user.uid, period, user.personalGoal);
      setAiResult(r.analysis, r.insights);
    } catch (e) {
      console.error("Analysis Error:", e);
    } finally {
      setLoading(false);
    }
  };

  // เช็คว่าข้อมูลที่โชว์ตรงกับ Period ที่เลือกหรือไม่
  const isCurrentPeriod = aiAnalysis && aiAnalysis.period === period;

  // เตรียมข้อมูลกราฟ 24 ช่อง (แต่ละช่อง = % ของงานที่เสร็จทั้งหมดในช่วงนั้น ไม่ใช่จำนวนดิบ — คำนวณไว้แล้วใน runAiAnalysis)
  const chartData = (isCurrentPeriod && aiAnalysis?.chartData) ? aiAnalysis.chartData : Array(24).fill(0);
  const maxBar = Math.max(...chartData, 1);

  // บังคับลำดับการ์ดคำแนะนำให้เรียง วิเคราะห์ -> แจ้งเตือน -> เคล็ดลับ เสมอ เหมือนหน้า 7 วัน
  const INSIGHT_ORDER = { insight: 0, warning: 1, tip: 2 };
  const sortedInsights = [...aiInsights].sort(
    (a, b) => (INSIGHT_ORDER[a.insightType] ?? 99) - (INSIGHT_ORDER[b.insightType] ?? 99)
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bgHeader} />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>AI Advisor</Text>
          <Text style={styles.sub}>
            {isCurrentPeriod ? ("วิเคราะห์ล่าสุด: " + aiAnalysis.analysedAt.toLocaleDateString("th-TH")) : "วิเคราะห์ข้อมูลการใช้งาน"}
          </Text>
        </View>
        <View style={styles.gBadge}><Text style={styles.gBadgeText}>Gemini</Text></View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.periodRow}>
          {Object.keys(PERIOD_LABELS).map(p => (
            <TouchableOpacity
              key={p}
              onPress={() => setPeriod(p)}
              style={[styles.periodBtn, period === p && styles.periodBtnOn]}
            >
              <Text style={[styles.periodText, period === p && styles.periodTextOn]}>{PERIOD_LABELS[p]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isCurrentPeriod ? (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statVal}>{aiAnalysis.taskSuccessRate}<Text style={styles.statUnit}>%</Text></Text>
                <Text style={styles.statLabel}>งานสำเร็จ</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statVal}>{aiAnalysis.incompleteTaskCount}</Text>
                <Text style={styles.statLabel}>งานค้าง</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statVal, { fontSize: 13 }]}>{aiAnalysis.peakHourRange ?? "-"}</Text>
                <Text style={styles.statLabel}>ช่วง Peak</Text>
              </View>
            </View>

            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>สถิติงานสำเร็จรายชั่วโมง (% ของงานที่เสร็จทั้งหมด)</Text>
              <View style={styles.barRow}>
                {ALL_HOURS.map((hour) => {
                  const val = chartData[hour] || 0;
                  const ht = Math.round((val / maxBar) * 60);
                  const isPeak = val === maxBar && val > 0;
                  const shouldShowLabel = [0, 6, 12, 18, 23].includes(hour);

                  return (
                    <View key={hour} style={styles.barWrap}>
                      <View style={[styles.bar, {
                        height: Math.max(ht, 3),
                        backgroundColor: isPeak ? C.primary : C.lavLight,
                      }]} />
                      <Text style={[styles.barHour, isPeak && { color: C.primary, fontWeight: "700" }]}>
                        {shouldShowLabel ? String(hour).padStart(2, '0') : ""}
                      </Text>
                    </View>
                  );
                })}
              </View>
              {aiAnalysis.peakHourRange && (
                <View style={styles.peakBadge}>
                  <Text style={styles.peakBadgeText}>{"ประสิทธิภาพสูงสุดช่วง " + aiAnalysis.peakHourRange + " น. (" + maxBar + "% ของงานที่เสร็จทั้งหมด)"}</Text>
                </View>
              )}
            </View>

            <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
              <Text style={styles.sectionTitle}>คำแนะนำจาก Gemini</Text>
              {sortedInsights.length > 0 ? sortedInsights.map((ins, idx) => {
                const cfg = INS[ins.insightType] || INS.insight;
                return (
                  <View key={ins.id || idx} style={[styles.insCard, { backgroundColor: cfg.bg, borderColor: cfg.border, borderLeftColor: cfg.accent }]}>
                    <View style={[styles.insTag, { backgroundColor: cfg.tagBg }]}>
                      <Text style={[styles.insTagText, { color: cfg.tagText }]}>{cfg.label}</Text>
                    </View>
                    <Text style={[styles.insMsg, { color: cfg.msgColor }]}>{ins.message}</Text>
                  </View>
                );
              }) : (
                <Text style={{ textAlign: 'center', color: C.textSub, marginTop: 10 }}>กำลังเตรียมคำแนะนำ...</Text>
              )}
            </View>
          </>
        ) : (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIcon}><Text style={{ fontSize: 28, color: C.lavender }}>✦</Text></View>
            <Text style={styles.emptyTitle}>ยังไม่มีผลวิเคราะห์ของช่วงนี้</Text>
            <Text style={styles.emptyDesc}>
              {"กดปุ่มด้านล่างเพื่อให้ Gemini วิเคราะห์พฤติกรรม\nและนิสัยของคุณในช่วง " + PERIOD_LABELS[period]}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.analyzeBtn, loading && { opacity: 0.6 }]}
          onPress={handleAnalyze}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={C.white} />
          ) : (
            <Text style={styles.analyzeBtnText}>{isCurrentPeriod ? "วิเคราะห์ใหม่" : "เริ่มวิเคราะห์"}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.bgHeader, paddingHorizontal: 20, paddingTop: 52, paddingBottom: 14 },
  title: { fontSize: 22, fontWeight: "700", color: C.text },
  sub: { fontSize: 12, color: C.textSub, marginTop: 2 },
  gBadge: { backgroundColor: C.primaryL, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  gBadgeText: { fontSize: 12, fontWeight: "700", color: C.primary2 },
  periodRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, gap: 8, backgroundColor: C.bgCard, borderBottomWidth: 0.5, borderBottomColor: C.border },
  periodBtn: { flex: 1, paddingVertical: 8, borderRadius: 20, borderWidth: 0.5, borderColor: C.border, backgroundColor: C.bg, alignItems: "center" },
  periodBtnOn: { backgroundColor: C.primary, borderColor: C.primary },
  periodText: { fontSize: 13, color: C.textSub },
  periodTextOn: { color: C.white, fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: 10, padding: 16, paddingBottom: 8 },
  statCard: { flex: 1, backgroundColor: C.bgCard, borderWidth: 0.5, borderColor: C.border, borderRadius: 14, padding: 12, alignItems: "center" },
  statVal: { fontSize: 20, fontWeight: "700", color: C.text },
  statUnit: { fontSize: 12, color: C.textSub },
  statLabel: { fontSize: 10, color: C.textSub, marginTop: 4 },
  chartCard: { marginHorizontal: 16, backgroundColor: C.bgCard, borderWidth: 0.5, borderColor: C.border, borderRadius: 16, padding: 16, marginBottom: 14 },
  chartTitle: { fontSize: 13, fontWeight: "700", color: C.text, marginBottom: 16 },
  barRow: { flexDirection: "row", alignItems: "flex-end", height: 80, gap: 3 },
  barWrap: { flex: 1, alignItems: "center" },
  bar: { width: "100%", borderRadius: 2, minHeight: 3 },
  barHour: { fontSize: 8, color: C.textHint, marginTop: 6 },
  peakBadge: { backgroundColor: C.primaryL, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12, alignSelf: "center", marginTop: 12 },
  peakBadgeText: { fontSize: 11, color: C.primary2, fontWeight: "600" },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: C.text, marginBottom: 10 },
  insCard: { borderWidth: 0.5, borderLeftWidth: 3, borderRadius: 12, padding: 14, marginBottom: 10 },
  insTag: { alignSelf: "flex-start", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 8 },
  insTagText: { fontSize: 11, fontWeight: "700" },
  insMsg: { fontSize: 14, lineHeight: 22 },
  emptyBox: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 40 },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.lavLight, justifyContent: "center", alignItems: "center", marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: C.text, marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: C.textSub, textAlign: "center", lineHeight: 22, marginBottom: 24 },
  analyzeBtn: { marginHorizontal: 16, backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  analyzeBtnText: { fontSize: 16, fontWeight: "700", color: C.white },
  
});

