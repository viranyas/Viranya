// src/config/theme.ts  —  Soft Lavender (Light)

// ชุดสีหลักของแอป (palette) — แทบทุกไฟล์ใน app/ import C ตัวนี้มาใช้ใน StyleSheet.create เพื่อให้สีตรงกันทั้งแอป
export const C = {
  // พื้นหลัง
  bg:       '#F5F3FF',   // หน้าจอหลัก
  bgCard:   '#FFFFFF',   // card
  bgInput:  '#F8F7FF',   // input field
  bgHeader: '#EDE9FE',   // header bar

  // Primary — Indigo/Violet
  primary:  '#6366F1',   // สีหลัก ปุ่ม, active
  primary2: '#4338CA',   // เข้มกว่า สำหรับ text บน bg ขาว
  primaryL: '#EEF2FF',   // พื้นหลัง badge, chip อ่อน

  // Accent
  violet:   '#7C3AED',
  lavender: '#A78BFA',
  lavLight: '#EDE9FE',
  lavXLight:'#F5F3FF',

  // Text
  text:     '#1E1B4B',   // ข้อความหลัก
  textSub:  '#6B7280',   // ข้อความรอง
  textHint: '#9CA3AF',   // placeholder

  // Border
  border:   '#E9E5FF',   // border card
  borderL:  '#F0EEFF',   // border อ่อน

  // Semantic
  green:    '#10B981',
  greenBg:  '#F0FDF4',
  greenL:   '#6EE7B7',
  amber:    '#F59E0B',
  amberBg:  '#FFFBEB',
  amberL:   '#FCD34D',
  rose:     '#F43F5E',
  roseBg:   '#FFF1F2',
  roseL:    '#FCA5A5',

  // White (สำหรับ text บนปุ่มสี)
  white:    '#FFFFFF',
};

// alias เผื่อไฟล์ไหนอยาก import ชื่อสั้นแทน C.bg/C.bgCard/C.bgHeader โดยตรง (ปัจจุบันไม่มีหน้าไหนใช้แล้ว)
export const BG       = C.bg;
export const BG_CARD  = C.bgCard;
export const BG_HDR   = C.bgHeader;

// Button — solid สีเดียว
export const BTN_COLOR = C.primary;

// Tab bar
export const TABBAR_BG     = '#FFFFFF';
export const TABBAR_BORDER = C.border;

// ── compat shim (ถ้าหน้าเก่าใช้ GRAD อยู่) ─────────────────
// LinearGradient ยังใช้ได้ แต่ใส่สีเดียวซ้ำกัน = ดูเหมือน solid
// GRAD ถูก import ใน app/index.jsx (เผื่ออนาคตอยากทำพื้นหลังไล่สีจริง ตอนนี้ยังไม่ได้ใช้ render)
export const GRAD: [string, string] = [C.bg, C.bg];
export const GRAD_BTN: [string, string] = [C.primary, C.primary];
