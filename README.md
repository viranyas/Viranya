# PlanWise App — React Native (Expo) + Firebase + Gemini AI
## ลิ้งก์แนะนำแอป
https://drive.google.com/file/d/1HYBcTd3tBGgGRDavIn1MomWwCK9zEImg/view?usp=drive_link


## โครงสร้างไฟล์

```
planwise-app/
├── app/
│   ├── _layout.tsx              ← Root layout + auth listener
│   ├── index.tsx                ← Redirect หน้าแรก
│   ├── profile.tsx              ← หน้าโปรไฟล์
│   ├── notifications.tsx        ← หน้าการแจ้งเตือน
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx            ← หน้าเข้าสู่ระบบ
│   │   ├── register.tsx         ← หน้าสมัครสมาชิก
│   │   └── forgot-password.tsx  ← หน้ารีเซ็ตรหัสผ่าน
│   └── (tabs)/
│       ├── _layout.tsx          ← Bottom tab navigator
│       ├── home.tsx             ← หน้าแรก / dashboard
│       ├── todos.tsx            ← To-Do List (CRUD ครบ)
│       ├── habits.tsx           ← Habit Tracker
│       ├── ai-advisor.tsx       ← AI Advisor (Gemini)
│       └── report.tsx           ← รายงาน / สถิติ
├── src/
│   ├── config/
│   │   ├── firebase.ts          ← Firebase config
│   │   └── theme.ts             ← สีและ gradient
│   ├── services/
│   │   └── index.ts             ← Services ทั้งหมด
│   ├── hooks/
│   │   └── useStore.ts          ← Zustand global state
│   └── types/
│       └── index.ts             ← TypeScript types
├── firestore.rules              ← Security rules
└── package.json
```

---

## วิธี Setup (ทำตามลำดับ)

### ขั้นที่ 1 — ติดตั้ง dependencies

```bash
npm install
```

### ขั้นที่ 2 — ตั้งค่า Firebase

1. ไปที่ https://console.firebase.google.com
2. สร้าง project ใหม่
3. เพิ่ม Web App → คัดลอก config
4. เปิด Authentication → Email/Password
5. เปิด Firestore Database → Start in production mode (เลือก asia-southeast1)
6. เปิด Storage
7. วางค่า config ใน `src/config/firebase.ts`
8. วาง Security Rules จากไฟล์ `firestore.rules` ใน Firestore → Rules

### ขั้นที่ 3 — ตั้งค่า Gemini API

1. ไปที่ https://aistudio.google.com/app/apikey
2. สร้าง API Key ใหม่
3. สร้างไฟล์ `.env` ที่ root:

```
EXPO_PUBLIC_GEMINI_API_KEY=AIzaSy...
```

### ขั้นที่ 4 — รัน

```bash
npx expo start
```

สแกน QR code ด้วย Expo Go บนมือถือ หรือรันบน Simulator

---

## ฟีเจอร์ทั้งหมด

| ฟีเจอร์ | หน้าจอ |
|---------|--------|
| สมัครสมาชิก / Login / Logout | `(auth)/` |
| รีเซ็ตรหัสผ่านทาง Email | `forgot-password.tsx` |
| แก้ไขโปรไฟล์ / รูป / เป้าหมาย | `profile.tsx` |
| To-Do List (เพิ่ม/แก้ไข/ลบ/อัปเดตสถานะ) | `todos.tsx` |
| Habit Tracker (streak / dot tracker) | `habits.tsx` |
| AI Advisor วิเคราะห์ด้วย Gemini | `ai-advisor.tsx` |
| รายงานสถิติ + กราฟ | `report.tsx` |
| การแจ้งเตือนงานและนิสัย | `notifications.tsx` |

---

## หมายเหตุ

- Gemini API Key ควรผ่าน backend ใน production
- `checkAndNotify()` เรียกอัตโนมัติทุกครั้งที่เปิดหน้าแรก
- ธีมสี: gradient purple #4C1D95 → white #FFFFFF
