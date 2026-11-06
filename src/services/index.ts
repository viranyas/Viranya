// src/services/index.ts
// รวม services ทั้งหมดไว้ในไฟล์เดียว

import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, sendPasswordResetEmail, onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, where, orderBy, limit,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { subDays, subWeeks, isAfter, format, subMonths, startOfWeek } from 'date-fns';
import { auth, db } from '../config/firebase';
import { HABIT_CATEGORIES, TODO_CATEGORIES, CATEGORY_META } from '../config/categories';
import type {
  User, Todo, Habit, HabitLog, Notification, NotifType,
  AiAnalysis, AiInsight, AnalysisPeriod, InsightType,
  ReportCache, ReportPeriod, Priority, Difficulty,
  TodoStatus, HabitFrequency, NotificationSettings,
  HabitCategory, TodoCategory,
} from '../types';

const genAI = new GoogleGenerativeAI(
  process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '',
);

// ลำดับโมเดลที่จะลองเรียก — มีแค่ตัวเดียวที่ยืนยันแล้วว่ามีจริงสำหรับโปรเจกต์นี้ (เช็คจาก AI Studio แล้ว)
// gemini-2.5-flash / gemini-1.5-flash ตอบ 404 "not found" แปลว่าไม่รองรับ API version/project นี้
// ไม่ใช่โมเดลสำรองที่ใช้ได้จริง เลยเอาออก กันเจอ error ซ้ำซ้อน (retry 2 รอบเปล่าๆ ก่อนตกไปใช้ fallback insights)
// ถ้าจะเพิ่มโมเดลสำรองในอนาคต ต้องเช็คชื่อที่ถูกต้องจาก AI Studio ของโปรเจกต์นี้ก่อน ไม่เดาเอง
const GEMINI_MODEL_CHAIN = ['gemini-3.6-flash'];

// เช็คว่า error ที่เจอเป็นปัญหา "server โหลดสูงชั่วคราว" (503/overloaded) หรือเปล่า
// แยกจาก error ประเภทอื่น (เช่น API key ผิด, prompt ผิดรูปแบบ) ที่ retry ซ้ำไปก็ไม่มีประโยชน์
// รับ: err ที่ catch มาได้ (ไม่รู้ type แน่ชัด) -> คืนค่า: true/false
// ใช้ต่อใน: generateWithFallback ด้านล่างเท่านั้น เพื่อตัดสินใจว่าจะ retry โมเดลเดิมซ้ำ หรือข้ามไปโมเดลถัดไปเลย
function isOverloadedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('503') || /overloaded|high demand/i.test(msg);
}

// เรียก Gemini พร้อม retry แบบ exponential backoff (2s -> 4s -> 8s) สูงสุด 3 ครั้งต่อโมเดล
// ถ้าลองครบทุกโมเดลในลิสต์ (ตอนนี้มีตัวเดียว) แล้วยัง 503 อยู่ ค่อยปล่อยให้ runAiAnalysis ใช้ fallback insights ต่อ
// ใช้เฉพาะใน runAiAnalysis ด้านล่างเท่านั้น
async function generateWithFallback(promptText: string): Promise<string> {
  let lastError: unknown;
  const BACKOFF_MS = [2000, 4000, 8000];
  for (const modelName of GEMINI_MODEL_CHAIN) {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' },
    });
    for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
      try {
        const result = await model.generateContent(promptText);
        return result.response.text();
      } catch (err) {
        lastError = err;
        if (!isOverloadedError(err)) break; // ไม่ใช่ปัญหา high-demand ไม่มีประโยชน์ที่จะ retry โมเดลเดิม ข้ามไปโมเดลถัดไปเลย
        if (attempt < BACKOFF_MS.length - 1) await new Promise(res => setTimeout(res, BACKOFF_MS[attempt]));
      }
    }
  }
  throw lastError;
}

// ═══════════════════════════════════════════
// AUTH SERVICE
// ═══════════════════════════════════════════

// flag ชั่วคราวบอก app/_layout.jsx ว่ากำลังอยู่ในขั้นตอนสมัครสมาชิก (register() ตามด้วย logout() ติดกันทันที)
// เหตุผล: createUserWithEmailAndPassword ใน register() จะ auto sign-in ให้เองชั่วครู่ ทำให้ onAuthChanged
// ใน _layout.jsx ตื่นมาเรียก getUserProfile ทันที แล้วถ้า logout() ที่ตามมาดันยิง signOut ไปก่อน
// getUserProfile จะอ่านเสร็จ -> Firestore จะปฏิเสธ request ที่ค้างอยู่ด้วย permission error (เห็นเป็น
// "Uncaught (in promise) FirebaseError: Missing or insufficient permissions" ใน console)
// ตั้ง flag นี้เป็น true คร่อมทั้ง register()+logout() กัน onAuthChanged ไม่ให้ยิง getUserProfile ตั้งแต่แรก
// เรียกคู่กับ setRegistrationInProgress ใน app/(auth)/register.jsx
let registrationInProgress = false;
export function setRegistrationInProgress(v: boolean) { registrationInProgress = v; }
export function isRegistrationInProgress(): boolean { return registrationInProgress; }

// สมัครสมาชิกใหม่: สร้าง user ใน Firebase Auth แล้วสร้างเอกสารโปรไฟล์คู่กันที่ users/{uid}
// เรียกจาก app/(auth)/register.jsx — หลังจบ onAuthChanged ใน app/_layout.jsx จะดึงโปรไฟล์นี้เข้า useStore.user ต่อเอง
export async function register(
  username: string, email: string,
  password: string, personalGoal = '',
): Promise<void> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, 'users', cred.user.uid), {
    uid: cred.user.uid, username, email,
    avatarUrl: null,
    personalGoal: personalGoal || null,
    notificationSettings: { todoEnabled: true, habitEnabled: true, notifyTime: '08:00' },
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

// เข้าสู่ระบบด้วย Firebase Auth — เรียกจาก app/(auth)/login.jsx
export async function login(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

// ออกจากระบบ — เรียกจาก app/profile.jsx (handleLogout)
export async function logout() {
  return signOut(auth);
}

// ส่งอีเมลลิงก์รีเซ็ตรหัสผ่าน — เรียกจาก app/(auth)/forgot-password.jsx
export async function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email);
}

// ฟังการเปลี่ยนสถานะ login/logout ของ Firebase Auth — ใช้ครั้งเดียวใน app/_layout.jsx เพื่อ
// sync กับ useStore.user ทุกครั้งที่สถานะ auth เปลี่ยน (ไม่ใช่แค่ตอนกด login/logout เท่านั้น)
export function onAuthChanged(cb: (u: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, cb);
}

// อ่านโปรไฟล์ user จาก Firestore users/{uid} — เรียกจาก app/_layout.jsx หลัง auth เปลี่ยน
export async function getUserProfile(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    uid: d.uid, username: d.username, email: d.email,
    avatarUrl: d.avatarUrl, personalGoal: d.personalGoal,
    notificationSettings: d.notificationSettings,
    createdAt: d.createdAt?.toDate(), updatedAt: d.updatedAt?.toDate(),
  } as User;
}

// ═══════════════════════════════════════════
// PROFILE SERVICE
// ═══════════════════════════════════════════

// แก้ชื่อผู้ใช้ใน Firestore users/{uid} — เรียกจาก app/profile.jsx (handleSave)
export async function updateUsername(uid: string, username: string) {
  await updateDoc(doc(db, 'users', uid), { username, updatedAt: serverTimestamp() });
}

// เรียกจาก app/profile.jsx (handlePickAvatar) หลังผู้ใช้เลือกรูปจากเครื่อง
// อัปโหลดรูปโปรไฟล์ขึ้น Cloudinary (unsigned upload) แทน Firebase Storage
// ต้องตั้งค่า EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME และ EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ใน .env
// imageDataUri = "data:image/jpeg;base64,..." (FormData แบบ {uri} ใช้ไม่ได้ในรันไทม์ fetch ใหม่ของ Expo)
export async function updateAvatar(uid: string, imageDataUri: string): Promise<string> {
  const cloudName    = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    throw new Error('ยังไม่ได้ตั้งค่า Cloudinary (EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME / EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET) ใน .env');
  }

  const form = new FormData();
  form.append('file', imageDataUri);
  form.append('upload_preset', uploadPreset);
  form.append('folder', `avatars/${uid}`);
  // public_id ไม่ซ้ำทุกครั้ง: unsigned preset มักไม่อนุญาต overwrite (Cloudinary จะคืนรูปเดิมกลับมา)
  // และ URL ใหม่ทำให้ Image cache / CDN ไม่ค้างรูปเก่า
  form.append('public_id', `profile_${Date.now()}`);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? 'อัปโหลดรูปไป Cloudinary ไม่สำเร็จ');

  const url: string = data.secure_url;
  await updateDoc(doc(db, 'users', uid), { avatarUrl: url, updatedAt: serverTimestamp() });
  return url;
}

// แก้เป้าหมายส่วนตัวใน Firestore users/{uid} — เรียกจาก app/profile.jsx (handleSave)
// personalGoal นี้ถูกใช้เป็น context ส่งให้ Gemini ด้วยใน runAiAnalysis ด้านล่าง
export async function updatePersonalGoal(uid: string, personalGoal: string) {
  await updateDoc(doc(db, 'users', uid), { personalGoal, updatedAt: serverTimestamp() });
}

// แก้ค่าเปิด/ปิดแจ้งเตือนราย key (users/{uid}.notificationSettings.*) — เรียกจาก app/profile.jsx (toggleNotif)
export async function updateNotificationSettings(
  uid: string, settings: Partial<NotificationSettings>,
) {
  const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
  Object.entries(settings).forEach(([k, v]) => {
    updates[`notificationSettings.${k}`] = v;
  });
  await updateDoc(doc(db, 'users', uid), updates);
}

// ═══════════════════════════════════════════
// TODO SERVICE
// ═══════════════════════════════════════════

// แปลงเอกสาร Firestore ดิบ (users/{uid}/todos/{id}) ให้เป็น Todo ที่ type ครบ — ใช้ใน getTodos ด้านล่าง
function toTodo(id: string, d: Record<string, unknown>): Todo {
  return {
    id, userId: d.userId as string, title: d.title as string,
    dueDatetime: d.dueDatetime ? (d.dueDatetime as Timestamp).toDate() : null,
    priority: d.priority as Priority, difficulty: d.difficulty as Difficulty,
    status: d.status as TodoStatus,
    // งานเก่าที่สร้างก่อนมีฟีเจอร์หมวดหมู่จะไม่มีฟิลด์นี้ -> fallback เป็น 'general'
    linkedCategory: (d.linkedCategory as TodoCategory) ?? 'general',
    createdAt: (d.createdAt as Timestamp).toDate(),
    updatedAt: (d.updatedAt as Timestamp).toDate(),
  };
}

// สร้างงานใหม่ที่ users/{uid}/todos — เรียกจาก app/(tabs)/todos.jsx (handleSave เมื่อ editing = null)
export async function addTodo(uid: string, data: {
  title: string; dueDatetime: Date | null;
  priority: Priority; difficulty: Difficulty;
  linkedCategory?: TodoCategory;
}): Promise<string> {
  const r = await addDoc(collection(db, 'users', uid, 'todos'), {
    userId: uid, title: data.title,
    dueDatetime: data.dueDatetime ? Timestamp.fromDate(data.dueDatetime) : null,
    priority: data.priority, difficulty: data.difficulty,
    linkedCategory: data.linkedCategory ?? 'general',
    status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return r.id;
}

// แก้งานที่มีอยู่ที่ users/{uid}/todos/{todoId} — เรียกจาก todos.jsx (handleSave ตอนแก้ไข,
// handleToggle ตอนติ๊กเสร็จ/ยกเลิก) ส่งเฉพาะ field ที่เปลี่ยนมาได้ (partial update)
export async function updateTodo(uid: string, todoId: string, data: Partial<{
  title: string; dueDatetime: Date | null;
  priority: Priority; difficulty: Difficulty; status: TodoStatus;
  linkedCategory: TodoCategory; updatedAt: Date;
}>) {
  const u: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (data.title          !== undefined) u.title          = data.title;
  if (data.priority       !== undefined) u.priority       = data.priority;
  if (data.difficulty     !== undefined) u.difficulty     = data.difficulty;
  if (data.status         !== undefined) u.status         = data.status;
  if (data.linkedCategory !== undefined) u.linkedCategory = data.linkedCategory;
  if ('dueDatetime' in data) {
    u.dueDatetime = data.dueDatetime ? Timestamp.fromDate(data.dueDatetime!) : null;
  }
  // ถ้ามีการส่ง updatedAt มาจากหน้า UI (เช่น เวลาที่กด Done จริงๆ) ให้ใช้ค่านั้นแทน
  if (data.updatedAt instanceof Date) {
    u.updatedAt = Timestamp.fromDate(data.updatedAt);
  }
  await updateDoc(doc(db, 'users', uid, 'todos', todoId), u);
}

// ลบงานถาวรจาก users/{uid}/todos/{todoId} — เรียกจาก todos.jsx (handleDelete)
export async function deleteTodo(uid: string, todoId: string) {
  await deleteDoc(doc(db, 'users', uid, 'todos', todoId));
}

// ดึงงานทั้งหมดของ user เรียงตามวันที่สร้างล่าสุดก่อน — ใช้ในหลายหน้า: todos.jsx, home.jsx,
// และเป็นฐานข้อมูลให้ runAiAnalysis/generateReport ด้านล่างคำนวณสถิติ
export async function getTodos(uid: string): Promise<Todo[]> {
  const snap = await getDocs(query(
    collection(db, 'users', uid, 'todos'), orderBy('createdAt', 'desc'),
  ));
  return snap.docs.map(d => toTodo(d.id, d.data() as Record<string, unknown>));
}

// ═══════════════════════════════════════════
// HABIT SERVICE
// ═══════════════════════════════════════════

// แปลงเอกสาร Firestore ดิบ (users/{uid}/habits/{id}) ให้เป็น Habit ที่ type ครบ — ใช้ใน getHabits ด้านล่าง
function toHabit(id: string, d: Record<string, unknown>): Habit {
  return {
    id, userId: d.userId as string, name: d.name as string,
    // นิสัยเก่าที่สร้างก่อนมีฟีเจอร์หมวดหมู่จะไม่มีฟิลด์นี้ -> fallback เป็น 'self_development'
    category: (d.category as HabitCategory) ?? 'self_development',
    frequency: d.frequency as HabitFrequency,
    streakCount: d.streakCount as number, bestStreak: d.bestStreak as number,
    createdAt: (d.createdAt as Timestamp).toDate(),
  };
}

// สร้างนิสัยใหม่ที่ users/{uid}/habits — เรียกจาก app/(tabs)/habits.jsx (handleAdd)
export async function addHabit(
  uid: string, name: string,
  frequency: HabitFrequency = 'daily',
  category: HabitCategory = 'self_development',
): Promise<string> {
  const r = await addDoc(collection(db, 'users', uid, 'habits'), {
    userId: uid, name, category, frequency, streakCount: 0, bestStreak: 0,
    createdAt: serverTimestamp(),
  });
  return r.id;
}

// ลบนิสัยถาวรจาก users/{uid}/habits/{habitId} — เรียกจาก habits.jsx (handleDelete)
// หมายเหตุ: ไม่ได้ลบ sub-collection logs ของนิสัยนี้ทิ้งไปด้วย (Firestore ไม่ cascade delete อัตโนมัติ)
export async function deleteHabit(uid: string, habitId: string) {
  await deleteDoc(doc(db, 'users', uid, 'habits', habitId));
}

// ดึงนิสัยทั้งหมดของ user — ใช้ในหลายหน้า: habits.jsx, home.jsx, และเป็นฐานข้อมูลให้
// runAiAnalysis/generateReport ด้านล่างคำนวณสถิติ ก่อนคืนค่า จะคำนวณ streakCount สดใหม่เสมอ (ดูบรรทัดถัดไป)
export async function getHabits(uid: string): Promise<Habit[]> {
  const snap = await getDocs(query(
    collection(db, 'users', uid, 'habits'), orderBy('createdAt', 'asc'),
  ));
  const habits = snap.docs.map(d => toHabit(d.id, d.data() as Record<string, unknown>));
  // ค่าที่เก็บไว้จะค้างถ้าขาดวันโดยไม่ได้กดอะไร จึงคำนวณจาก log จริงทุกครั้งที่โหลด
  return Promise.all(habits.map(async h => {
    const streakCount = await computeStreak(uid, h.id, h.frequency);
    return { ...h, streakCount, bestStreak: Math.max(h.bestStreak ?? 0, streakCount) };
  }));
}

// รายวันที่ของสัปดาห์ (จันทร์-อาทิตย์) ที่ครอบคลุม date — ใช้เช็ค/ค้นหา log ของนิสัยแบบ "ทุกสัปดาห์"
// ที่ถือว่า "ทำแล้ว" ตราบใดที่มีวันใดวันหนึ่งในสัปดาห์ถูกติ๊ก ไม่จำเป็นต้องเป็นวันนี้เป๊ะๆ
function weekDates(date: Date): string[] {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) =>
    format(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), 'yyyy-MM-dd'),
  );
}

// เช็คว่ามี log ที่ completed=true อยู่ในชุดวันที่ที่ระบุหรือไม่ (ใช้เช็ค "ทำแล้วหรือยังในสัปดาห์นี้")
async function isAnyDateCompleted(uid: string, habitId: string, dates: string[]): Promise<boolean> {
  for (const date of dates) {
    const snap = await getDoc(doc(db, 'users', uid, 'habits', habitId, 'logs', date));
    if (snap.exists() && snap.data()?.completed) return true;
  }
  return false;
}

// ติ๊ก/ยกเลิกติ๊กว่าทำนิสัยนี้แล้ว — เขียน/ลบเอกสาร log ที่ users/{uid}/habits/{habitId}/logs/{yyyy-MM-dd}
// แล้ว recalculate streak ให้ใหม่ทันที — เรียกจาก habits.jsx (handleToggle)
// นิสัยแบบ "ทุกวัน" เขียน/ลบ log ของวันนี้ตรงๆ แต่ "ทุกสัปดาห์" ตอนยกเลิกต้องหา log ที่ติ๊กไว้ในสัปดาห์นี้มาลบ
// (อาจไม่ใช่วันนี้ ถ้าผู้ใช้กดทำไปตั้งแต่ต้นสัปดาห์) ส่วนตอนติ๊กทำก็เขียนลงวันนี้เหมือนเดิม
export async function toggleHabitLog(
  uid: string, habitId: string, completed: boolean,
  frequency: HabitFrequency = 'daily',
) {
  const today = format(new Date(), 'yyyy-MM-dd');
  if (frequency === 'weekly' && !completed) {
    for (const date of weekDates(new Date())) {
      const ref = doc(db, 'users', uid, 'habits', habitId, 'logs', date);
      const snap = await getDoc(ref);
      if (snap.exists() && snap.data()?.completed) { await deleteDoc(ref); break; }
    }
  } else {
    const logRef = doc(db, 'users', uid, 'habits', habitId, 'logs', today);
    if (completed) {
      await setDoc(logRef, { completed: true, loggedAt: serverTimestamp() });
    } else {
      await deleteDoc(logRef);
    }
  }
  await recalculateStreak(uid, habitId, frequency);
}

// นับจำนวนช่วงเวลาที่ทำติดกันจริงตามความถี่ของนิสัย ถ้าช่วงไหนขาดก็หยุดนับ (เริ่มใหม่)
// ทุกวัน: นับวันติดกัน (ช่วงปัจจุบัน=วันนี้ยังไม่ทำก็ยังไม่ขาด นับต่อจากเมื่อวานได้)
// ทุกสัปดาห์: นับสัปดาห์ติดกัน (ช่วงปัจจุบัน=สัปดาห์นี้ยังไม่ทำก็ยังไม่ขาด นับต่อจากสัปดาห์ก่อนได้)
// รับ: uid ของ user + habitId ของนิสัยที่จะเช็ค + frequency -> คืนค่า: จำนวนช่วงต่อเนื่อง (number)
// ใช้ต่อใน: getHabits ด้านบน (คำนวณ streakCount สดใหม่ทุกครั้งที่โหลดลิสต์นิสัย) และ recalculateStreak ด้านล่าง
export async function computeStreak(
  uid: string, habitId: string, frequency: HabitFrequency = 'daily',
): Promise<number> {
  if (frequency === 'weekly') {
    const isDoneWeek = (weeksAgo: number) =>
      isAnyDateCompleted(uid, habitId, weekDates(subWeeks(new Date(), weeksAgo)));
    let streak = (await isDoneWeek(0)) ? 1 : 0;
    for (let i = 1; i < 104; i++) { // ย้อนหลังได้ถึง ~2 ปี
      if (await isDoneWeek(i)) streak++; else break;
    }
    return streak;
  }

  const isDone = async (daysAgo: number) => {
    const date = format(subDays(new Date(), daysAgo), 'yyyy-MM-dd');
    const snap = await getDoc(doc(db, 'users', uid, 'habits', habitId, 'logs', date));
    return snap.exists() && !!snap.data()?.completed;
  };
  let streak = (await isDone(0)) ? 1 : 0;
  for (let i = 1; i < 365; i++) {
    if (await isDone(i)) streak++; else break;
  }
  return streak;
}

// เขียน streakCount/bestStreak ที่คำนวณใหม่กลับลง users/{uid}/habits/{habitId} — เรียกจาก toggleHabitLog ด้านบนเท่านั้น
export async function recalculateStreak(uid: string, habitId: string, frequency: HabitFrequency = 'daily') {
  const streak = await computeStreak(uid, habitId, frequency);
  const hSnap = await getDoc(doc(db, 'users', uid, 'habits', habitId));
  const best  = (hSnap.data()?.bestStreak as number) ?? 0;
  await updateDoc(doc(db, 'users', uid, 'habits', habitId), {
    streakCount: streak, bestStreak: Math.max(streak, best),
  });
}

// เช็คว่านิสัยนี้ "ทำแล้ว" ตามความถี่จริงของนิสัย — ทุกวัน=ต้องทำวันนี้, ทุกสัปดาห์=ทำวันไหนก็ได้ในสัปดาห์นี้
// เรียกจาก home.jsx (load) เพื่อโชว์เครื่องหมายติ๊กในลิสต์นิสัยย่อหน้าแรก และจาก checkAndNotify ด้านล่าง
export async function isHabitDoneToday(
  uid: string, habitId: string, frequency: HabitFrequency = 'daily',
): Promise<boolean> {
  if (frequency === 'weekly') return isAnyDateCompleted(uid, habitId, weekDates(new Date()));
  const today = format(new Date(), 'yyyy-MM-dd');
  const snap = await getDoc(doc(db, 'users', uid, 'habits', habitId, 'logs', today));
  return snap.exists() && !!snap.data()?.completed;
}

// ดึง log ตั้งแต่วันที่ 1 ถึงวันนี้ของเดือนปัจจุบัน (ใช้ติดตามความต่อเนื่องรายเดือนแทนแบบ 7 วันเดิม)
// ใช้ภายใน services เอง: getMonthlyRate ด้านล่าง และ runAiAnalysis ตอนสรุปอัตราสำเร็จนิสัยให้ Gemini
export async function getHabitLogsMonth(uid: string, habitId: string): Promise<HabitLog[]> {
  const now = new Date();
  const daysSoFar = now.getDate(); // จำนวนวันที่ผ่านมาแล้วในเดือนนี้ (1..วันนี้)
  const logs: HabitLog[] = [];
  for (let d = 1; d <= daysSoFar; d++) {
    const date = format(new Date(now.getFullYear(), now.getMonth(), d), 'yyyy-MM-dd');
    const snap = await getDoc(doc(db, 'users', uid, 'habits', habitId, 'logs', date));
    logs.push({
      id: date, habitId,
      completed: snap.exists() ? (snap.data()?.completed ?? false) : false,
      loggedAt: snap.exists() ? (snap.data()?.loggedAt as Timestamp)?.toDate() ?? new Date() : new Date(),
    });
  }
  return logs;
}

// ดึง log ของนิสัยหนึ่งตัวในช่วงวันที่ from..now ตรงๆ (ต่างจาก getHabitLogsMonth ที่ตรึงเดือนปฏิทินเสมอ)
// ใช้เฉพาะใน runAiAnalysis ด้านล่าง เพื่อให้สถิตินิสัยที่ส่งให้ Gemini อิงช่วงเวลาเดียวกับสถิติ Todo (period ที่ผู้ใช้เลือกในหน้า ai-advisor.jsx)
async function getHabitLogsForPeriod(uid: string, habitId: string, from: Date, now: Date): Promise<HabitLog[]> {
  const logs: HabitLog[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (cursor <= end) {
    const date = format(cursor, 'yyyy-MM-dd');
    const snap = await getDoc(doc(db, 'users', uid, 'habits', habitId, 'logs', date));
    logs.push({
      id: date, habitId,
      completed: snap.exists() ? (snap.data()?.completed ?? false) : false,
      loggedAt: snap.exists() ? (snap.data()?.loggedAt as Timestamp)?.toDate() ?? new Date() : new Date(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return logs;
}

// ดึง log ครบทุกวันของเดือนที่ระบุ (month: 0-11) ใช้กับหน้านิสัยที่เลือกดูย้อนหลังได้
// เรียกจาก habits.jsx (load) เพื่อแสดงจุด dot รายวันและคำนวณ % สำเร็จของเดือนที่เลือก
export async function getHabitLogsForMonth(
  uid: string, habitId: string, year: number, month: number,
): Promise<HabitLog[]> {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Promise.all(Array.from({ length: daysInMonth }, async (_, i) => {
    const date = format(new Date(year, month, i + 1), 'yyyy-MM-dd');
    const snap = await getDoc(doc(db, 'users', uid, 'habits', habitId, 'logs', date));
    return {
      id: date, habitId,
      completed: snap.exists() ? (snap.data()?.completed ?? false) : false,
      loggedAt: snap.exists() ? (snap.data()?.loggedAt as Timestamp)?.toDate() ?? new Date() : new Date(),
    } as HabitLog;
  }));
}

// รวม log รายวันเป็นหน่วยตามความถี่ของนิสัยก่อนคำนวณ % สำเร็จ — ทุกวัน: % = วันที่ทำ/วันทั้งหมด
// ทุกสัปดาห์: จัดกลุ่มเป็นสัปดาห์ก่อน (ถือว่าสัปดาห์นั้น "ทำ" ถ้ามีวันใดวันหนึ่ง completed) แล้ว % = สัปดาห์ที่ทำ/สัปดาห์ทั้งหมด
// ใช้ร่วมกันใน getMonthlyRate ด้านล่าง และ runAiAnalysis กันคำนวณ % ไม่ตรงกัน 2 ที่
function calcRate(logs: HabitLog[], frequency: HabitFrequency): number {
  if (logs.length === 0) return 0;
  if (frequency !== 'weekly') {
    const done = logs.filter(l => l.completed).length;
    return Math.round((done / logs.length) * 100);
  }
  const weeks = new Map<string, boolean>();
  for (const log of logs) {
    const [y, m, d] = log.id.split('-').map(Number);
    const weekKey = format(startOfWeek(new Date(y, m - 1, d), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    weeks.set(weekKey, (weeks.get(weekKey) ?? false) || log.completed);
  }
  const vals = [...weeks.values()];
  return vals.length > 0 ? Math.round((vals.filter(Boolean).length / vals.length) * 100) : 0;
}

// % ความสำเร็จของนิสัยหนึ่งตัวในเดือนปัจจุบัน — ใช้ภายใน services เองโดย generateReport (habitRates)
export async function getMonthlyRate(uid: string, habitId: string, frequency: HabitFrequency = 'daily'): Promise<number> {
  const logs = await getHabitLogsMonth(uid, habitId);
  return calcRate(logs, frequency);
}

// ═══════════════════════════════════════════
// NOTIFICATION SERVICE
// ═══════════════════════════════════════════

// สร้างแจ้งเตือนที่ users/{uid}/notifications — เรียกจาก checkAndNotify ด้านล่างเท่านั้น
// (ไม่มีหน้าไหนเรียกตรงๆ) แจ้งเตือนที่สร้างจะไปโผล่ในหน้า app/notifications.jsx และจุดแดงใน report.jsx
export async function createNotification(
  uid: string, title: string, body: string,
  type: NotifType, refPath: string | null = null,
) {
  // กันแจ้งเตือนซ้ำ: ถ้ามี refPath ให้ dedupe ด้วย key = ประเภท + งาน/นิสัยที่อ้างถึง + วันที่
  // (checkAndNotify ถูกเรียกทุกครั้งที่เปิดหน้าแรก ถ้าไม่กันซ้ำจะสร้างแจ้งเตือนเดิมซ้ำทุกครั้ง)
  if (refPath) {
    const dedupeId = `${type}_${refPath.replace(/\//g, '_')}_${format(new Date(), 'yyyy-MM-dd')}`;
    const ref = doc(db, 'users', uid, 'notifications', dedupeId);
    const existing = await getDoc(ref);
    if (existing.exists()) return; // เคยแจ้งเรื่องนี้ไปแล้ววันนี้
    await setDoc(ref, {
      userId: uid, title, body, type, refPath,
      isRead: false, sentAt: serverTimestamp(),
    });
    return;
  }

  await addDoc(collection(db, 'users', uid, 'notifications'), {
    userId: uid, title, body, type, refPath,
    isRead: false, sentAt: serverTimestamp(),
  });
}

// ดึงแจ้งเตือนทั้งหมดของ user เรียงใหม่สุดก่อน — เรียกจาก app/notifications.jsx (load)
// และ report.jsx (useFocusEffect เช็ค isRead เพื่อโชว์/ซ่อนจุดแดงที่กระดิ่ง)
export async function getNotifications(uid: string): Promise<Notification[]> {
  const snap = await getDocs(query(
    collection(db, 'users', uid, 'notifications'), orderBy('sentAt', 'desc'),
  ));
  return snap.docs.map(d => ({
    id: d.id, userId: d.data().userId, title: d.data().title,
    body: d.data().body, type: d.data().type as NotifType,
    refPath: d.data().refPath ?? null, isRead: d.data().isRead ?? false,
    sentAt: (d.data().sentAt as Timestamp).toDate(),
  }));
}

// mark แจ้งเตือนหนึ่งอันว่าอ่านแล้ว — เรียกจาก app/notifications.jsx (handleRead)
export async function markNotificationRead(uid: string, notifId: string) {
  await updateDoc(doc(db, 'users', uid, 'notifications', notifId), { isRead: true });
}

// สแกนงาน/นิสัยของ user แล้วสร้างแจ้งเตือนที่เข้าเงื่อนไข (งานครบกำหนดวันนี้/พรุ่งนี้/เกินกำหนด,
// นิสัยที่ยังไม่ได้ทำวันนี้) ผ่าน createNotification ด้านบน — เรียกจาก home.jsx (load) ทุกครั้งที่เปิดหน้าแรก
export async function checkAndNotify(uid: string) {
  const now   = new Date();
  const today = format(now, 'yyyy-MM-dd');
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);

  // ตรวจงาน
  const todoSnap = await getDocs(query(
    collection(db, 'users', uid, 'todos'), where('status', '==', 'pending'),
  ));
  for (const d of todoSnap.docs) {
    const due = d.data().dueDatetime ? (d.data().dueDatetime as Timestamp).toDate() : null;
    if (!due) continue;
    const dueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const path = `users/${uid}/todos/${d.id}`;
    if (dueDate.getTime() === todayDate.getTime()) {
      await createNotification(uid, 'งานครบกำหนดวันนี้', `"${d.data().title}" ครบกำหนดวันนี้`, 'todo_due', path);
    } else if (dueDate.getTime() === tomorrowDate.getTime()) {
      // แจ้งเตือนล่วงหน้า 1 วันก่อนถึงกำหนด (ข้อ 1.3.2(7.1) ของขอบเขตโครงงาน)
      await createNotification(uid, 'งานใกล้ถึงกำหนด', `"${d.data().title}" ใกล้ถึงกำหนดพรุ่งนี้แล้ว เตรียมตัวไว้นะ!`, 'todo_upcoming', path);
    } else if (dueDate < todayDate) {
      await createNotification(uid, 'งานเกินกำหนด', `"${d.data().title}" เกินกำหนดแล้ว`, 'todo_overdue', path);
    }
  }

  // ตรวจนิสัย — ทุกวันเช็คแค่วันนี้ ทุกสัปดาห์เช็คทั้งสัปดาห์ (ไม่เตือนซ้ำถ้าทำไปแล้ววันก่อนในสัปดาห์นี้)
  const habitSnap = await getDocs(collection(db, 'users', uid, 'habits'));
  for (const d of habitSnap.docs) {
    const frequency = (d.data().frequency as HabitFrequency) ?? 'daily';
    const done = await isHabitDoneToday(uid, d.id, frequency);
    if (done) continue;
    const streak = await computeStreak(uid, d.id, frequency);
    const unit = frequency === 'weekly' ? 'สัปดาห์' : 'วัน';
    const periodLabel = frequency === 'weekly' ? 'สัปดาห์นี้' : 'วันนี้';
    const msg = streak >= 5
      ? `อย่าลืม "${d.data().name}" ${periodLabel} ต่อเนื่องมา ${streak} ${unit}แล้ว!`
      : `อย่าลืม "${d.data().name}" ${periodLabel}`;
    await createNotification(uid, 'นิสัยที่ยังไม่ได้ทำ', msg,
      streak >= 5 ? 'habit_streak' : 'habit_reminder',
      `users/${uid}/habits/${d.id}`,
    );
  }
}

// ═══════════════════════════════════════════
// AI SERVICE (Gemini)
// ═══════════════════════════════════════════

// ประกอบ prompt ภาษาไทยส่งให้ Gemini วิเคราะห์ — ใช้ภายใน runAiAnalysis ด้านล่างเท่านั้น
function buildPrompt(data: {
  period: string;
  totalTasks: number;
  doneTasks: number;
  successRate: number;
  incompleteTasks: number;
  peakHourRange: string | null;
  habits: { name: string; streak: number; rate: number; bestStreak: number; isInconsistent: boolean }[];
  categoryCoverage: {
    label: string; hasHabit: boolean; habitNames: string[];
    todoCount: number; doneTodoCount: number; missingSupport: boolean;
  }[];
  personalGoal: string | null;
}): string {
  const periodLabel =
    data.period === '7days'  ? '7 วันที่ผ่านมา'  :
    data.period === '30days' ? '30 วันที่ผ่านมา' : 'ทั้งหมด';

  // สรุปข้อมูลนิสัย โดยอ้างอิงช่วงเวลาเดียวกับ periodLabel (ไม่ใช่เดือนปฏิทินตายตัวอีกต่อไป)
  // ติด "⚠️ ความไม่ต่อเนื่องสูง" ต่อท้ายให้ AI อ่าน flag ที่คำนวณไว้แล้วตรงๆ ไม่ต้องคำนวณเกณฑ์ 70% เอง
  const habitText = data.habits.length > 0
    ? data.habits.map(h =>
        `  - ${h.name}: ทำสำเร็จ ${h.rate}% ในช่วง ${periodLabel} (Streak ปัจจุบัน ${h.streak} วัน, สูงสุด ${h.bestStreak} วัน)${h.isInconsistent ? ' ⚠️ ความไม่ต่อเนื่องสูง' : ''}`
      ).join('\n')
    : '  - ยังไม่มีการบันทึกนิสัยในระบบ';

  // สรุปความสอดคล้องระหว่างงาน (Todo) กับหมวดนิสัยที่เปิดใช้งานไว้ — ใช้ตรวจ "6.1 ความสอดคล้อง" และ "6.2 Proactive Advice"
  // ครอบคลุมทุกหมวดที่ระบบรองรับ (รวมหมวดที่เพิ่มใหม่ภายหลัง เช่น ทั่วไป/การทำงาน) เพราะวนตาม HABIT_CATEGORIES ทั้งหมด
  const categoryText = data.categoryCoverage.filter(c => c.hasHabit).length > 0
    ? data.categoryCoverage.filter(c => c.hasHabit).map(c => {
        const supportText = c.todoCount === 0
          ? 'ไม่มีงาน (Todo) เชื่อมโยงกับหมวดนี้เลย ⚠️ ขาดกิจกรรมสนับสนุน'
          : `มีงานเชื่อมโยง ${c.todoCount} รายการ (ทำเสร็จแล้ว ${c.doneTodoCount})`;
        return `  - ${c.label} (นิสัย: ${c.habitNames.join(', ')}): ${supportText}`;
      }).join('\n')
    : '  - ยังไม่ได้เปิดใช้งานนิสัยหมวดใดเลย';

  // หมายเหตุเฉพาะ period — ช่วง 7 วัน (ค่าเริ่มต้นของหน้านี้) ข้อมูลยังน้อย เสี่ยงฟันธง "ความไม่ต่อเนื่องสูง" เกินจริงถ้านิสัยเพิ่งสร้าง
  // ช่วง "ทั้งหมด" ให้เน้นแนวโน้มระยะยาวแทนเหตุการณ์เดี่ยวๆ ส่วน 30 วันไม่ต้องเพิ่มอะไร (ความยาวช่วงเหมาะสมอยู่แล้ว)
  const periodNote =
    data.period === '7days'
      ? '\nหมายเหตุ: ข้อมูลช่วงนี้สั้นเพียง 7 วัน หากนิสัยใดเพิ่งสร้างมาไม่นานหรือมีข้อมูลน้อยเกินไป ให้ระวังอย่าฟันธงว่า "ความไม่ต่อเนื่องสูง" เกินจริง ให้บอกตรงๆ ว่าข้อมูลยังสั้นเกินจะสรุปแทน\n'
      : data.period === 'all'
      ? '\nหมายเหตุ: นี่คือภาพรวมระยะยาวทั้งหมด ให้เน้นพูดถึงแนวโน้มการพัฒนาในภาพรวม มากกว่าเหตุการณ์เดี่ยวๆ ที่เพิ่งเกิดขึ้นล่าสุด\n'
      : '';

  return `คุณเป็น AI โค้ชด้านการจัดการเวลาและสร้างนิสัย (ภาษาไทยเป็นธรรมชาติ, กันเอง, ให้กำลังใจ)

วิเคราะห์ข้อมูลช่วง: ${periodLabel}
[เป้าหมาย]: ${data.personalGoal ?? 'พัฒนาตัวเองให้ดีขึ้น'}
[งานทั่วไป (Todo)]: ทั้งหมด ${data.totalTasks} รายการ, ทำเสร็จ ${data.doneTasks} (${data.successRate}%), ค้าง ${data.incompleteTasks}
[ช่วงเวลาที่ทำงานได้ดีที่สุด (Peak)]: ${data.peakHourRange ?? 'ยังไม่มีข้อมูลช่วงเวลาที่ชัดเจน'}
[พฤติกรรม/นิสัย (Habits) ในช่วง ${periodLabel}]:
${habitText}
[ความสอดคล้องระหว่างงาน (Todo) กับหมวดนิสัยที่เปิดใช้งานทั้งหมด]:
${categoryText}
${periodNote}
ภารกิจ:
1. วิเคราะห์สาเหตุของนิสัยที่ถูกระบุว่า "⚠️ ความไม่ต่อเนื่องสูง" ด้านบน (ใช้ flag ที่ให้มาโดยตรง ไม่ต้องคำนวณเกณฑ์เอง) ว่าน่าจะเกิดจากอะไร เช่น งาน Todo เยอะเกินไปจนเบียดบังเวลา
2. ตรวจสอบ "ความสอดคล้อง": ถ้าหมวดใดเปิดใช้งานนิสัยไว้แต่ไม่มีงาน (Todo) เชื่อมโยงเลย (missingSupport) ให้เตือนแบบเจาะจงชื่อหมวดและชื่อนิสัยนั้น ว่าขาดกิจกรรมที่ช่วยผลักดันเป้าหมายด้านนี้ (Proactive Advice) — ตรวจครบทุกหมวดที่ให้มา ไม่ข้ามหมวดไหน
3. ให้คำแนะนำการแก้ปัญหา "ทำๆ หยุดๆ": แนะนำวิธีสร้างความสม่ำเสมอ อ้างอิงจากช่วงเวลา Peak ของผู้ใช้ และแนะนำให้ผูกงาน (Todo) ใหม่เข้ากับหมวดที่ขาดกิจกรรมสนับสนุน

ตอบกลับเป็น JSON array เท่านั้น ห้ามมีข้อความอื่นนอกเหนือจาก array นี้
ต้องมีสมาชิกเท่ากับ 3 รายการเท่านั้น เรียงลำดับตามนี้เป๊ะ ห้ามสลับลำดับ ห้ามเพิ่ม/ลดจำนวน:
[
  {"type":"insight","message":"วิเคราะห์จุดที่ทำได้ดีหรือพฤติกรรมที่ 'ไม่ต่อเนื่อง' อ้างอิงตัวเลขจริง"},
  {"type":"warning","message":"คำเตือนเกี่ยวกับนิสัยที่กำลังจะหลุด หรือหมวดที่ขาดงาน (Todo) สนับสนุนเลย"},
  {"type":"tip","message":"เคล็ดลับแก้ปัญหาความไม่ต่อเนื่อง เช่น การพ่วงนิสัย (Habit Stacking) เข้ากับช่วงเวลา Peak ${data.peakHourRange ?? ''} หรือการเพิ่มงานสนับสนุนหมวดที่ขาด"}
]

กฎ: ภาษาไทยวัยรุ่นตอนปลาย (สุภาพแต่กันเอง), อ้างอิงตัวเลขจากข้อมูลจริงเสมอ, กระชับ 1-2 ประโยคต่อข้อ`;
}

// คำแนะนำสำรองแบบ rule-based (ไม่พึ่ง Gemini) ใช้ตอน generateWithFallback ลองครบทุกโมเดลในลิสต์แล้วยังไม่ผ่าน
// อิงข้อมูลจริงที่คำนวณไว้แล้วในเครื่อง (habitSummaries/categoryCoverage) เพื่อให้ยังตรงข้อ 6.1 (ความสอดคล้อง)/6.2 (Proactive Advice) อยู่
// แทนที่จะเป็นข้อความทั่วไปลอยๆ ที่ไม่เจาะจงอะไรเลย — ใช้เกณฑ์ isInconsistent เดียวกับที่ส่งให้ Gemini (กันข้อมูลน้อยเกินไปฟันธง)
function buildFallbackInsights(data: {
  successRate: number;
  incompleteTasks: number;
  peakHourRange: string | null;
  habitSummaries: { name: string; isInconsistent: boolean }[];
  categoryCoverage: { label: string; missingSupport: boolean }[];
}): Array<{ type: InsightType; message: string }> {
  const inconsistentNames = data.habitSummaries.filter(h => h.isInconsistent).map(h => h.name);
  const missingCats = data.categoryCoverage.filter(c => c.missingSupport);

  const insightMsg = `ภาพรวมตอนนี้คุณทำงานสำเร็จไปแล้ว ${data.successRate}%`
    + (data.peakHourRange ? ` และมักทำได้ดีที่สุดช่วง ${data.peakHourRange} น.` : '');

  const warningMsg = inconsistentNames.length > 0
    ? `นิสัย ${inconsistentNames.join(', ')} เริ่มขาดความต่อเนื่อง ลองกลับมาโฟกัสอีกครั้งนะ`
    : missingCats.length > 0
    ? `หมวด ${missingCats.map(c => c.label).join(', ')} เปิดใช้งานนิสัยไว้แต่ยังไม่มีงาน (Todo) เชื่อมโยงสนับสนุนเลย`
    : `ยังมีงานค้างอยู่ ${data.incompleteTasks} รายการ ลองจัดลำดับความสำคัญดูอีกครั้ง`;

  const tipMsg = missingCats.length > 0
    ? `ลองเพิ่มงาน (Todo) ที่เชื่อมกับหมวด "${missingCats[0].label}" เพื่อสนับสนุนนิสัยด้านนี้ให้ชัดเจนขึ้น`
    : `ลองพ่วงนิสัยที่หลุดบ่อยเข้ากับช่วงเวลา Peak${data.peakHourRange ? ` (${data.peakHourRange})` : ''} เพื่อสร้างวินัย`;

  return [
    { type: 'insight', message: insightMsg },
    { type: 'warning', message: warningMsg },
    { type: 'tip', message: tipMsg },
  ];
}

// วิเคราะห์พฤติกรรมผู้ใช้ด้วย Gemini: ดึง todos (getTodos) + habits (getHabits) มาสรุปสถิติ,
// ส่ง prompt ผ่าน buildPrompt ด้านบน แล้วเขียนผลลง users/{uid}/ai_analyses (+ sub-collection insights)
// เรียกจาก app/(tabs)/ai-advisor.jsx (handleAnalyze) — ผลลัพธ์ถูกเซฟเข้า useStore ผ่าน setAiResult
export async function runAiAnalysis(
  uid: string,
  period: AnalysisPeriod,
  personalGoal: string | null = null
): Promise<{ analysis: AiAnalysis; insights: AiInsight[] }> {
  const now  = new Date();
  const from = period === '7days' ? subDays(now, 7) : period === '30days' ? subDays(now, 30) : new Date(0);
  const allTodos = await getTodos(uid);
  const todos    = period === 'all' ? allTodos : allTodos.filter(t => isAfter(t.createdAt, from));
  const doneTasks = todos.filter(t => t.status === 'done').length;
  const totalTasks = todos.length;
  const successRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const incompleteTasks = todos.filter(t => t.status === 'pending').length;

  const hourCounts: Record<number, number> = {};
  todos.filter(t => t.status === 'done').forEach(t => {
    // ใช้เวลาที่ Update (ตอนติ๊กถูก) มานับช่วงเวลาทำงาน — บาง Todo เก่าอาจไม่มี updatedAt เลย fallback เป็น createdAt กัน crash
    const h = (t.updatedAt ?? t.createdAt).getHours();
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  });

  // ✅ สร้าง Array 24 ช่อง (0-23) เป็น "% สัดส่วนของงานที่เสร็จทั้งหมดในช่วงนี้" แทนจำนวนดิบ
  // เพื่อให้เทียบรูปแบบ peak hour ข้ามกัน period (7 วัน/30 วัน/ทั้งหมด) ได้ตรงไปตรงมา ไม่เพี้ยนเพราะปริมาณงานสะสมต่างกันตามความยาวช่วงเวลา
  // ข้อมูลชุดนี้จะไม่ทำให้กิน Token AI เพิ่ม เพราะเราคำนวณเองในเครื่องครับ
  const chartData = Array.from({ length: 24 }, (_, h) =>
    doneTasks > 0 ? Math.round(((hourCounts[h] ?? 0) / doneTasks) * 100) : 0
  );

  const peakEntry = Object.entries(hourCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  const peakHourRange = peakEntry
    ? `${String(peakEntry[0]).padStart(2, '0')}:00–${String(Number(peakEntry[0]) + 1).padStart(2, '0')}:00`
    : null;

  // ✅ ดึงข้อมูล Habit และคำนวณความสม่ำเสมอ "ในช่วงเวลาเดียวกับที่กรอง Todo ด้านบน" (from..now)
  // ไม่ใช้ getHabitLogsMonth เพราะตรึงเดือนปฏิทินเสมอ จะทำให้สถิตินิสัยไม่ตรงกับ period ที่ผู้ใช้เลือก (7 วัน/30 วัน/ทั้งหมด)
  const habits = await getHabits(uid);
  const habitSummaries = await Promise.all(habits.map(async h => {
    // ช่วง "ทั้งหมด" ให้นับตั้งแต่วันที่สร้างนิสัยนี้ขึ้นมาจริงๆ (ไม่ใช่ epoch) ส่วน 7/30 วัน ให้ clamp ไม่ให้ย้อนก่อนวันที่สร้างนิสัย
    const effectiveFrom = period === 'all' ? h.createdAt : (from > h.createdAt ? from : h.createdAt);
    const logs = await getHabitLogsForPeriod(uid, h.id, effectiveFrom, now);
    const rate = calcRate(logs, h.frequency);
    return {
      name: h.name,
      category: h.category,
      streak: h.streakCount,
      rate,
      bestStreak: h.bestStreak,
      // เพิ่มข้อมูล: ถ้า rate ต่ำแสดงว่ามีความไม่ต่อเนื่องสูง — ส่ง flag นี้ตรงๆ ให้ AI ใช้ ไม่ต้องให้ AI คำนวณเกณฑ์ 70% เอง
      // ต้องมีข้อมูลอย่างน้อย 5 วันก่อนถึงจะฟันธงได้ — กันฟันธงเกินจริงตอนนิสัยเพิ่งสร้างหรือช่วงที่วิเคราะห์สั้น (เช่น 7 วัน)
      // ใช้เกณฑ์เดียวกันทั้งฝั่ง Gemini (ผ่าน buildPrompt) และฝั่ง fallback แบบ rule-based ด้านล่าง ไม่ให้ 2 ทางตัดสินไม่ตรงกัน
      isInconsistent: logs.length >= 5 && rate < 70
    };
  }));

  // ✅ วิเคราะห์ความสอดคล้องระหว่าง Todo กับหมวดนิสัยที่เปิดใช้งาน (ข้อ 6.1/6.2 ของขอบเขตโครงงาน)
  const categoryCoverage = HABIT_CATEGORIES.map(cat => {
    const habitsInCat = habitSummaries.filter(h => h.category === cat);
    const linkedTodos = todos.filter(t => t.linkedCategory === cat);
    return {
      label: CATEGORY_META[cat].label,
      hasHabit: habitsInCat.length > 0,
      habitNames: habitsInCat.map(h => h.name),
      todoCount: linkedTodos.length,
      doneTodoCount: linkedTodos.filter(t => t.status === 'done').length,
      // เปิดใช้งานนิสัยหมวดนี้ไว้ แต่ไม่มีงานเลยที่เชื่อมโยงมาสนับสนุน
      missingSupport: habitsInCat.length > 0 && linkedTodos.length === 0,
    };
  });

  let insights: Array<{type: InsightType; message: string}> = [];
  try {
    // generateWithFallback จัดการ retry + สลับโมเดลสำรองให้เองถ้าเจอ 503 high-demand (ดูนิยามด้านบนไฟล์)
    // responseMimeType (ตั้งไว้ในนั้น) บังคับให้ Gemini ตอบเป็น JSON ล้วนๆ จริง ลดโอกาส parse fail จากคำพูดแทรก
    const rawText = await generateWithFallback(buildPrompt({
      period,
      totalTasks,
      doneTasks,
      successRate,
      incompleteTasks,
      peakHourRange,
      habits: habitSummaries, // ข้อมูลชุดนี้จะทำให้ AI แนะนำ Habit ที่หลุดได้แม่นยำ
      categoryCoverage, // ใช้เช็คว่าหมวดไหนเปิดนิสัยไว้แต่ไม่มี Todo สนับสนุนเลย
      personalGoal
    }));

    const raw = rawText.trim().replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    insights = JSON.parse(raw);
  } catch (error) {
    // ใช้ warn แทน error เพราะเคสนี้ถูกจัดการ (fallback) ไว้แล้ว ไม่ใช่ error ที่ทำให้แอปพัง ไม่ควรขึ้นจอแดงเต็มจอตอน dev
    console.warn("Gemini Error (ใช้ fallback insights แทน):", error);
    // ลองครบทุกโมเดลในลิสต์แล้วยังไม่ผ่าน ค่อยใช้ fallback แบบ rule-based ที่อิงข้อมูลจริง (ยังตรง 6.1/6.2/6.3 อยู่ ไม่ใช่ข้อความทั่วไปลอยๆ)
    insights = buildFallbackInsights({ successRate, incompleteTasks, peakHourRange, habitSummaries, categoryCoverage });
  }

  // ✅ บันทึก chartData (แบบ 24 ค่า) ลง Firestore
  const analysisRef = await addDoc(collection(db,'users',uid,'ai_analyses'), {
    userId: uid, 
    period, 
    taskSuccessRate: successRate,
    incompleteTaskCount: incompleteTasks, 
    peakHourRange, 
    chartData: chartData, // บันทึก 24 ช่อง
    analysedAt: serverTimestamp(),
  });

  const savedInsights: AiInsight[] = [];
  for (const ins of insights) {
    const r = await addDoc(collection(db,'users',uid,'ai_analyses',analysisRef.id,'insights'), {
      insightType: ins.type, 
      message: ins.message, 
      createdAt: serverTimestamp(),
    });
    savedInsights.push({ id: r.id, analysisId: analysisRef.id, insightType: ins.type, message: ins.message, createdAt: new Date() });
  }

  return { 
    analysis: { 
      id: analysisRef.id, 
      userId: uid, 
      period, 
      taskSuccessRate: successRate, 
      incompleteTaskCount: incompleteTasks, 
      peakHourRange, 
      chartData: chartData, // ส่งกลับ 24 ช่อง
      analysedAt: new Date() 
    }, 
    insights: savedInsights 
  };
}

// อ่านผลวิเคราะห์ล่าสุดของ period นั้นที่เคยบันทึกไว้ (ไม่เรียก Gemini ใหม่) —
// เรียกจาก ai-advisor.jsx ทุกครั้งที่เปลี่ยน period เพื่อโชว์ผลเก่าโดยไม่ต้องกด "เริ่มวิเคราะห์" ซ้ำ
export async function getLatestAnalysis(uid: string, period: AnalysisPeriod) {
  const snap = await getDocs(query(collection(db,'users',uid,'ai_analyses'), where('period','==',period), orderBy('analysedAt','desc'), limit(1)));
  if (snap.empty) return null;
  const d = snap.docs[0]; const data = d.data();
  const insSnap = await getDocs(collection(db,'users',uid,'ai_analyses',d.id,'insights'));
  
  return {
    analysis: { 
      id: d.id, userId: data.userId, period: data.period, 
      taskSuccessRate: data.taskSuccessRate, 
      incompleteTaskCount: data.incompleteTaskCount, 
      peakHourRange: data.peakHourRange ?? null, 
      chartData: data.chartData ?? [0,0,0,0,0,0,0], // ✅ [เพิ่ม] ดึงค่าที่เคยเซฟไว้ออกมา
      analysedAt: (data.analysedAt as Timestamp).toDate() 
    } as AiAnalysis,
    insights: insSnap.docs.map(i => ({ id: i.id, analysisId: d.id, insightType: i.data().insightType as InsightType, message: i.data().message, createdAt: (i.data().createdAt as Timestamp).toDate() })) as AiInsight[],
  };
}

// ═══════════════════════════════════════════
// REPORT SERVICE
// ═══════════════════════════════════════════

const MONTH_SHORT_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

// สร้างกราฟให้เหมาะกับช่วงที่เลือก: เดือนนี้ -> รายสัปดาห์ในเดือน, 3 เดือน -> รายเดือน x3, ทั้งหมด -> รายเดือนย้อนหลัง 12 เดือน
// รับ: todos ทั้งหมดของ user + period ที่เลือก + now (เวลาปัจจุบัน) -> คืนค่า: { labels, values } สำหรับวาดกราฟแท่ง
// ใช้ต่อใน: generateReport ด้านล่างเท่านั้น (ผลลัพธ์ถูกเก็บเป็น chartData.labels/values ส่งต่อให้หน้า report.jsx render)
function buildChartBuckets(todos: Todo[], period: ReportPeriod, now: Date): { labels: string[]; values: number[] } {
  const doneTodos = todos.filter(t => t.status === 'done');
  const dateOf = (t: Todo) => t.updatedAt ?? t.createdAt;

  if (period === 'this_month') {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    // แบ่งเป็นสัปดาห์ปฏิทินจริง (จันทร์เริ่ม) ไม่ใช่ทุก 7 วันนับจากวันที่ 1 — ให้ตรงกับนิยาม "สัปดาห์"
    // ที่ใช้กับนิสัยแบบทุกสัปดาห์ (ดู weekDates/computeStreak ด้านบน) กันความหมาย "สัปดาห์" เพี้ยนกันคนละที่ในแอป
    const weekStarts: string[] = [];
    const weekIndexOfDay = new Map<number, number>(); // วันที่ (1..daysInMonth) -> ลำดับสัปดาห์ในเดือนนี้
    for (let day = 1; day <= daysInMonth; day++) {
      const wk = format(startOfWeek(new Date(now.getFullYear(), now.getMonth(), day), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      let idx = weekStarts.indexOf(wk);
      if (idx === -1) { weekStarts.push(wk); idx = weekStarts.length - 1; }
      weekIndexOfDay.set(day, idx);
    }
    const values = Array(weekStarts.length).fill(0);
    doneTodos.forEach(t => {
      const d = dateOf(t);
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
        values[weekIndexOfDay.get(d.getDate())!]++;
      }
    });
    return { labels: values.map((_, i) => `สัปดาห์ ${i + 1}`), values };
  }

  const monthCount = period === '3months' ? 3 : 12;
  const values = Array(monthCount).fill(0);
  const labels: string[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    labels.push(MONTH_SHORT_TH[new Date(now.getFullYear(), now.getMonth() - i, 1).getMonth()]);
  }
  doneTodos.forEach(t => {
    const d = dateOf(t);
    const diffMonths = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (diffMonths >= 0 && diffMonths < monthCount) values[monthCount - 1 - diffMonths]++;
  });
  return { labels, values };
}

// นับจำนวนงาน/งานที่เสร็จ แยกตามหมวด (TODO_CATEGORIES) — ใช้ภายใน generateReport ด้านล่าง
// ผลลัพธ์ถูกใช้ render กราฟ "สัดส่วนตามหมวดหมู่" ในหน้า report.jsx
function buildCategoryBreakdown(todos: Todo[]): Record<TodoCategory, { total: number; done: number }> {
  const result = {} as Record<TodoCategory, { total: number; done: number }>;
  TODO_CATEGORIES.forEach(c => { result[c] = { total: 0, done: 0 }; });
  todos.forEach(t => {
    result[t.linkedCategory].total++;
    if (t.status === 'done') result[t.linkedCategory].done++;
  });
  return result;
}

// ช่วงก่อนหน้าที่ยาวเท่ากัน สำหรับเทียบ % สำเร็จ — "ทั้งหมด" ไม่มีช่วงก่อนหน้าให้เทียบ
// รับ: period ที่เลือก + now (เวลาปัจจุบัน) -> คืนค่า: { from, to } ของช่วงก่อนหน้า หรือ null ถ้า period = 'all'
// ใช้ต่อใน: generateReport ด้านล่างเท่านั้น เพื่อกรอง allTodos หาค่า comparison (เทียบ success rate เก่า-ใหม่)
function getPreviousRange(period: ReportPeriod, now: Date): { from: Date; to: Date } | null {
  if (period === 'this_month') {
    return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1) };
  }
  if (period === '3months') {
    return { from: subMonths(now, 6), to: subMonths(now, 3) };
  }
  return null;
}

// สร้างสรุปรายงาน 1 ชุดสำหรับ period ที่ระบุ: ดึง todos (getTodos) + habits (getHabits) มาคำนวณ
// success rate, กราฟรายสัปดาห์/เดือน (buildChartBuckets), แยกหมวด (buildCategoryBreakdown),
// และเทียบกับช่วงก่อนหน้า (getPreviousRange) — เขียนแคชลง users/{uid}/report_cache/{period} ด้วย
// เรียกจาก app/(tabs)/report.jsx (handleGenerate) แล้วผลถูกเก็บต่อใน useStore.reportCache[period]
export async function generateReport(uid: string, period: ReportPeriod): Promise<ReportCache> {
  const now  = new Date();
  const from = period === 'this_month' ? new Date(now.getFullYear(), now.getMonth(), 1) : period === '3months' ? subMonths(now, 3) : new Date(0);
  const allTodos = await getTodos(uid);
  const todos    = period === 'all' ? allTodos : allTodos.filter(t => isAfter(t.createdAt, from));
  const totalTasks = todos.length;
  const doneTasks  = todos.filter(t => t.status === 'done').length;
  const successRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const { labels, values } = buildChartBuckets(todos, period, now);
  const categoryBreakdown = buildCategoryBreakdown(todos);

  const habits = await getHabits(uid);
  const habitRates: Record<string,number> = {};
  for (const h of habits) habitRates[h.id] = await getMonthlyRate(uid, h.id, h.frequency);

  let comparison: ReportCache['comparison'] = null;
  const prevRange = getPreviousRange(period, now);
  if (prevRange) {
    const prevTodos = allTodos.filter(t => t.createdAt.getTime() >= prevRange.from.getTime() && t.createdAt.getTime() < prevRange.to.getTime());
    const prevTotal = prevTodos.length;
    const prevDone  = prevTodos.filter(t => t.status === 'done').length;
    comparison = { totalTasks: prevTotal, doneTasks: prevDone, successRate: prevTotal > 0 ? Math.round((prevDone / prevTotal) * 100) : 0 };
  }

  const cache = {
    period, totalTasks, doneTasks, successRate,
    chartData: { labels, values, habitRates, categoryBreakdown },
    comparison, generatedAt: serverTimestamp(),
  };
  await setDoc(doc(db,'users',uid,'report_cache',period), cache);
  return { ...cache, generatedAt: now } as ReportCache;
}
