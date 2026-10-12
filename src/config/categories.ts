// src/config/categories.ts
// หมวดหมู่นิสัย/งาน ตามขอบเขตโครงงาน ข้อ 1.3.2(4.6) และ (5.1)
import { C } from './theme';
import type { HabitCategory, TodoCategory } from '../types';

// นิสัยเลือกได้ 6 หมวด รวม "ทั่วไป" สำหรับนิสัยที่ไม่ได้สนับสนุนด้านใดด้านหนึ่งโดยเฉพาะ
export const HABIT_CATEGORIES: HabitCategory[] = ['general', 'finance', 'health', 'relationship', 'self_development', 'work'];

// งาน (Todo) ใช้ชุดหมวดเดียวกับนิสัย
export const TODO_CATEGORIES: TodoCategory[] = HABIT_CATEGORIES;

// รูปร่างข้อมูล meta ของหนึ่งหมวด — label ไว้โชว์, icon ใช้กับ <Ionicons name=.../>, color/bg ใช้แต่งสี badge
interface CategoryMeta {
  label: string;
  icon: string; // ชื่อไอคอนจาก @expo/vector-icons/Ionicons
  color: string;
  bg: string;
}

// ข้อมูลแสดงผลของแต่ละหมวด ใช้ใน todos.jsx/habits.jsx (ปุ่มเลือกหมวด) และ report.jsx (กราฟแยกหมวด)
export const CATEGORY_META: Record<TodoCategory, CategoryMeta> = {
  general:          { label: 'ทั่วไป',       icon: 'apps-outline',        color: C.textSub,  bg: C.bgInput },
  finance:          { label: 'การเงิน',      icon: 'cash-outline',        color: C.amber,    bg: C.amberBg },
  health:           { label: 'สุขภาพ',       icon: 'fitness-outline',     color: C.green,    bg: C.greenBg },
  relationship:     { label: 'ความสัมพันธ์', icon: 'people-outline',      color: C.rose,     bg: C.roseBg },
  self_development: { label: 'พัฒนาตนเอง',  icon: 'trending-up-outline', color: C.primary2, bg: C.primaryL },
  work:             { label: 'การทำงาน',     icon: 'briefcase-outline',   color: C.violet,   bg: C.lavLight },
};
