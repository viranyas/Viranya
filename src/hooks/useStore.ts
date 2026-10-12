// src/hooks/useStore.ts
import { create } from 'zustand';
import type { User, Todo, Habit, HabitLog, AiAnalysis, AiInsight, ReportCache, ReportPeriod, AnalysisPeriod } from '../types';

interface AppState {
  // ส่วนของ user/auth — ตั้งค่าโดย onAuthChanged ใน app/_layout.jsx ตอนแอปเปิด/login/logout
  user: User | null; loading: boolean;
  setUser: (u: User | null) => void; setLoading: (v: boolean) => void;
  // ส่วนของ todos — ตัว todos เองโหลดด้วย getTodos (todos.jsx, home.jsx) แล้ว setTodos ทั้งก้อน
  // ส่วน add/update/deleteLocal ไว้แก้ cache ใน memory แบบ optimistic โดยไม่ query ใหม่ (ปัจจุบันยังไม่มีหน้าไหนเรียกใช้ 3 ตัวนี้ตรงๆ เพราะ todos.jsx เลือกเรียก load() ใหม่แทน)
  todos: Todo[];
  setTodos: (t: Todo[]) => void;
  addTodoLocal: (t: Todo) => void;
  updateTodoLocal: (t: Todo) => void;
  deleteTodoLocal: (id: string) => void;
  // ส่วนของ habits — คล้าย todos ด้านบน ใช้กับหน้า habits.jsx, home.jsx
  habits: Habit[];
  setHabits: (h: Habit[]) => void;
  addHabitLocal: (h: Habit) => void;
  deleteHabitLocal: (id: string) => void;
  updateHabitLocal: (h: Habit) => void;
  // log การทำนิสัยรายวัน แยกเก็บตาม habitId
  habitLogs: Record<string, HabitLog[]>;
  setHabitLogs: (habitId: string, logs: HabitLog[]) => void;
  // ผลวิเคราะห์ AI ล่าสุด — เซฟโดย ai-advisor.jsx หลังเรียก runAiAnalysis/getLatestAnalysis
  aiAnalysis: AiAnalysis | null; aiInsights: AiInsight[];
  setAiResult: (a: AiAnalysis | null, ins: AiInsight[]) => void;
  // แคชผลรายงานแยกตาม period — report.jsx เขียนหลังเรียก generateReport เพื่อไม่ต้องคำนวณซ้ำตอนสลับแท็บช่วงเวลา
  reportCache: Partial<Record<ReportPeriod, ReportCache>>;
  setReport: (period: ReportPeriod, cache: ReportCache) => void;
}

// global state ของทั้งแอป (Zustand) — ทุกหน้าจอใน app/ เรียก useStore() เพื่ออ่าน/อัปเดตค่าพวกนี้ร่วมกัน
export const useStore = create<AppState>((set) => ({
  user: null, loading: true,
  setUser: u => set({ user: u }),
  setLoading: v => set({ loading: v }),
  todos: [],
  setTodos: todos => set({ todos }),
  addTodoLocal: t => set(s => ({ todos: [t, ...s.todos] })),
  updateTodoLocal: t => set(s => ({ todos: s.todos.map(x => x.id === t.id ? t : x) })),
  deleteTodoLocal: id => set(s => ({ todos: s.todos.filter(x => x.id !== id) })),
  habits: [],
  setHabits: h => set({ habits: h }),
  addHabitLocal: h => set(s => ({ habits: [...s.habits, h] })),
  deleteHabitLocal: id => set(s => ({ habits: s.habits.filter(x => x.id !== id) })),
  updateHabitLocal: h => set(s => ({ habits: s.habits.map(x => x.id === h.id ? h : x) })),
  habitLogs: {},
  setHabitLogs: (habitId, logs) => set(s => ({ habitLogs: { ...s.habitLogs, [habitId]: logs } })),
  aiAnalysis: null, aiInsights: [],
  setAiResult: (a, ins) => set({ aiAnalysis: a, aiInsights: ins }),
  reportCache: {},
  setReport: (period, cache) => set(s => ({ reportCache: { ...s.reportCache, [period]: cache } })),
}));
