// src/types/index.ts
// ข้อมูลผู้ใช้ 1 คน เก็บใน Firestore ที่ users/{uid} — อ่าน/เขียนผ่าน src/services,
// เก็บตัว active user ไว้ใน useStore.user (ตั้งค่าตอน login/register ใน app/_layout.jsx)
export interface User {
  uid: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  personalGoal: string | null;
  notificationSettings: NotificationSettings;
  createdAt: Date;
  updatedAt: Date;
}
// ค่าตั้งค่าการแจ้งเตือนของ user หนึ่งคน (ฟิลด์ย่อยของ User.notificationSettings)
// แก้ไขได้จากหน้า app/profile.jsx ผ่าน updateNotificationSettings
export interface NotificationSettings {
  todoEnabled: boolean;
  habitEnabled: boolean;
  notifyTime: string;
}
// ความสำคัญ/ความยากของงาน (Todo) — ใช้กำหนดสี badge ในหน้า todos.jsx และ home.jsx
export type Priority   = 'low' | 'medium' | 'high';
export type Difficulty = 'easy' | 'medium' | 'hard';
// สถานะงาน — สลับด้วย handleToggle ในหน้า todos.jsx ผ่าน updateTodo
export type TodoStatus = 'pending' | 'done';
// หมวดหมู่นิสัยที่ระบบกำหนด (ใช้เลือกตอนเปิดใช้งานนิสัย — ข้อ 1.3.2(5.1))
export type HabitCategory = 'general' | 'finance' | 'health' | 'relationship' | 'self_development' | 'work';
// หมวดที่ผูกกับ Todo ได้ — ใช้ชุดเดียวกับ HabitCategory (ข้อ 1.3.2(4.6))
export type TodoCategory = HabitCategory;
// งานหนึ่งชิ้นของ user เก็บใน Firestore ที่ users/{uid}/todos/{id} — จัดการผ่าน
// getTodos/addTodo/updateTodo/deleteTodo ใน src/services ใช้แสดงในหน้า todos.jsx, home.jsx, report.jsx
export interface Todo {
  id: string; userId: string; title: string;
  dueDatetime: Date | null; priority: Priority;
  difficulty: Difficulty; status: TodoStatus;
  linkedCategory: TodoCategory;
  createdAt: Date; updatedAt?: Date;
}
// นิสัยทำซ้ำรายวัน/รายสัปดาห์
export type HabitFrequency = 'daily' | 'weekly';
// นิสัยหนึ่งอย่างของ user เก็บที่ users/{uid}/habits/{id} — จัดการผ่าน getHabits/addHabit/deleteHabit
// ใช้แสดงในหน้า habits.jsx, home.jsx และเป็นฐานให้ AI วิเคราะห์ categoryCoverage ใน generateReport
export interface Habit {
  id: string; userId: string; name: string;
  category: HabitCategory;
  frequency: HabitFrequency; streakCount: number;
  bestStreak: number; createdAt: Date;
}
// การติ๊กทำนิสัยของ 1 วัน เก็บที่ users/{uid}/habits/{habitId}/logs/{id} — เขียนผ่าน toggleHabitLog,
// อ่านเป็นก้อนรายเดือนผ่าน getHabitLogsForMonth ไปแสดงเป็นจุด dot ในหน้า habits.jsx
export interface HabitLog {
  id: string; habitId: string;
  completed: boolean; loggedAt: Date;
}
// ประเภทของการแจ้งเตือนที่ checkAndNotify (src/services) สร้างให้อัตโนมัติ
export type NotifType = 'todo_due' | 'todo_upcoming' | 'todo_overdue' | 'habit_reminder' | 'habit_streak';
// แจ้งเตือนหนึ่งรายการ เก็บที่ users/{uid}/notifications/{id} — แสดงในหน้า app/notifications.jsx
// และจุดแดงที่กระดิ่งในหน้า report.jsx (เช็คจาก isRead)
export interface Notification {
  id: string; userId: string; title: string; body: string;
  type: NotifType; refPath: string | null;
  isRead: boolean; sentAt: Date;
}
// ช่วงเวลาที่ให้ AI วิเคราะห์ — เลือกได้ในหน้า ai-advisor.jsx
export type AnalysisPeriod = '7days' | '30days' | 'all';
// ประเภทคำแนะนำที่ Gemini ให้กลับมา — กำหนดสี/label ใน INS (app/(tabs)/ai-advisor.jsx)
export type InsightType    = 'insight' | 'warning' | 'tip';
// ผลวิเคราะห์ 1 ครั้งจาก runAiAnalysis (src/services เรียก Gemini) เก็บใน Firestore แล้วอ่านกลับ
// ด้วย getLatestAnalysis มาโชว์กราฟ/สถิติในหน้า ai-advisor.jsx ผ่าน useStore.aiAnalysis
export interface AiAnalysis {
  chartData: number[];
  id: string; userId: string; period: AnalysisPeriod;
  taskSuccessRate: number; incompleteTaskCount: number;
  peakHourRange: string | null; analysedAt: Date;
}
// คำแนะนำย่อยหนึ่งข้อที่มากับ AiAnalysis หนึ่งชุด — แสดงเป็นการ์ดในหน้า ai-advisor.jsx (useStore.aiInsights)
export interface AiInsight {
  id: string; analysisId: string;
  insightType: InsightType; message: string; createdAt: Date;
}
// ช่วงเวลาของหน้ารายงาน — เลือกได้ในหน้า report.jsx
export type ReportPeriod = 'this_month' | '3months' | 'all';
// ผลสรุปรายงาน 1 ชุดต่อ 1 period คำนวณโดย generateReport (src/services) แล้วแคชไว้ใน
// useStore.reportCache[period] เพื่อไม่ต้องคำนวณใหม่ทุกครั้งที่สลับแท็บ — ใช้ render กราฟ/สถิติในหน้า report.jsx
export interface ReportCache {
  period: ReportPeriod; totalTasks: number; doneTasks: number;
  successRate: number;
  chartData: {
    labels: string[]; values: number[];
    habitRates: Record<string,number>;
    categoryBreakdown: Record<TodoCategory, { total: number; done: number }>;
  };
  // เทียบกับช่วงก่อนหน้าที่มีความยาวเท่ากัน (เดือนนี้ vs เดือนก่อน, 3 เดือนนี้ vs 3 เดือนก่อนหน้านั้น) — ไม่มีสำหรับ "ทั้งหมด"
  comparison: { totalTasks: number; doneTasks: number; successRate: number } | null;
  generatedAt: Date;
}
