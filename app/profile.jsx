// app/profile.jsx
import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, Switch, StatusBar, Image, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useStore } from '../src/hooks/useStore';
import { updateUsername, updateAvatar, updatePersonalGoal, updateNotificationSettings, logout } from '../src/services';
import { C } from '../src/config/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, setUser } = useStore();
  const [username, setUsername] = useState(user?.username ?? '');
  const [goal,     setGoal]     = useState(user?.personalGoal ?? '');
  const [saving,   setSaving]   = useState(false);
  const [uploading, setUploading] = useState(false);

  // บันทึกชื่อ/เป้าหมายส่วนตัวลง Firestore (updateUsername, updatePersonalGoal จาก src/services)
  // แล้วอัปเดต useStore.user ทันทีด้วยค่าที่เพิ่งเซฟ ให้ทุกหน้าที่อ้างอิง user เห็นค่าใหม่โดยไม่ต้อง reload
  const handleSave = async () => {
    if (!user) return;
    if (!username.trim()) { Alert.alert('แจ้งเตือน','กรุณากรอกชื่อ'); return; }
    setSaving(true);
    try {
      await updateUsername(user.uid, username.trim());
      await updatePersonalGoal(user.uid, goal.trim());
      setUser({ ...user, username:username.trim(), personalGoal:goal.trim() });
      Alert.alert('สำเร็จ','บันทึกข้อมูลแล้ว');
    } catch { Alert.alert('ผิดพลาด','ไม่สามารถบันทึกได้'); }
    finally { setSaving(false); }
  };

  // เลือกรูปจากเครื่อง (expo-image-picker) แล้วส่งเป็น base64 ไปอัปโหลดผ่าน updateAvatar
  // (src/services -> ส่งต่อไป Cloudinary แล้วเก็บ URL ลง Firestore) จากนั้นอัปเดต useStore.user
  const handlePickAvatar = async () => {
    if (!user) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('ต้องขออนุญาต','กรุณาอนุญาตให้เข้าถึงรูปภาพในการตั้งค่าเครื่อง'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes:['images'], allowsEditing:true, aspect:[1,1], quality:0.7, base64:true });
    if (res.canceled) return;
    setUploading(true);
    try {
      const asset = res.assets[0];
      const url = await updateAvatar(user.uid, `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`);
      setUser({ ...user, avatarUrl:url });
      Alert.alert('สำเร็จ','อัปโหลดรูปแล้ว');
    } catch (e) {
      console.log('updateAvatar error:', e);
      Alert.alert('ผิดพลาด', e?.message ?? 'อัปโหลดไม่สำเร็จ');
    } finally { setUploading(false); }
  };

  // เปิด/ปิดแจ้งเตือนรายประเภท (todoEnabled/habitEnabled) -> เขียนลง Firestore ผ่าน
  // updateNotificationSettings แล้ว sync กลับเข้า useStore.user.notificationSettings
  const toggleNotif = async (key, val) => {
    if (!user) return;
    await updateNotificationSettings(user.uid, { [key]:val });
    setUser({ ...user, notificationSettings: { ...user.notificationSettings, [key]:val } });
  };

  // logout() (src/services -> Firebase Auth signOut) แล้วเคลียร์ useStore.user เอง
  // ก่อนเด้งกลับหน้า login (onAuthChanged ใน app/_layout.jsx ก็จะ setUser(null) ซ้ำให้ด้วยเช่นกัน)
  const handleLogout = () => Alert.alert('ออกจากระบบ','ต้องการออกจากระบบใช่ไหม?',[
    { text:'ยกเลิก', style:'cancel' },
    { text:'ออก', style:'destructive', onPress:async()=>{ await logout(); setUser(null); router.replace('/(auth)/login'); } },
  ]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bgHeader} />
      <View style={styles.header}>
        <TouchableOpacity onPress={()=>router.back()}>
          <Text style={styles.backText}>← กลับ</Text>
        </TouchableOpacity>
        <Text style={styles.title}>โปรไฟล์</Text>
        <View style={{width:40}} />
      </View>
      <ScrollView contentContainerStyle={{paddingBottom:40}}>
        <View style={styles.avatarSection}>
          <TouchableOpacity style={styles.avatarCircle} onPress={handlePickAvatar} disabled={uploading} activeOpacity={0.8}>
            {user?.avatarUrl
              ? <Image source={{uri:user.avatarUrl}} style={styles.avatarImage} />
              : <Text style={styles.avatarLetter}>{user?.username?.charAt(0).toUpperCase()??'?'}</Text>
            }
            {uploading && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color={C.white} />
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={handlePickAvatar} disabled={uploading}>
            <Text style={styles.changeAvatarText}>{uploading?'กำลังอัปโหลด...':'เปลี่ยนรูปโปรไฟล์'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ข้อมูลส่วนตัว</Text>
          <Text style={styles.label}>ชื่อผู้ใช้งาน</Text>
          <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="ชื่อที่แสดงในแอป" placeholderTextColor={C.textHint} />
          <Text style={styles.label}>อีเมล</Text>
          <View style={styles.inputDisabled}><Text style={styles.inputDisabledText}>{user?.email}</Text></View>
          <Text style={styles.label}>เป้าหมายส่วนบุคคล</Text>
          <TextInput style={[styles.input,styles.multiline]} value={goal} onChangeText={setGoal} placeholder="เป้าหมายของคุณ..." placeholderTextColor={C.textHint} multiline numberOfLines={3} />
          <TouchableOpacity style={[styles.saveBtn,saving&&{opacity:0.6}]} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving?'บันทึก...':'บันทึกข้อมูล'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>การแจ้งเตือน</Text>
          {[
            { key:'todoEnabled', label:'แจ้งเตือนงาน', val:user?.notificationSettings.todoEnabled??true },
            { key:'habitEnabled', label:'แจ้งเตือนนิสัย', val:user?.notificationSettings.habitEnabled??true },
          ].map(s => (
            <View key={s.key} style={styles.settingRow}>
              <Text style={styles.settingLabel}>{s.label}</Text>
              <Switch value={s.val} onValueChange={v=>toggleNotif(s.key,v)} trackColor={{true:C.primary}} thumbColor={C.white} />
            </View>
          ))}
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>ออกจากระบบ</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:         { flex:1, backgroundColor:C.bg },
  header:            { flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor:C.bgHeader, paddingHorizontal:20, paddingTop:52, paddingBottom:14 },
  backText:          { fontSize:15, color:C.primary },
  title:             { fontSize:18, fontWeight:'700', color:C.text },
  avatarSection:     { alignItems:'center', paddingVertical:24 },
  avatarCircle:      { width:80, height:80, borderRadius:40, backgroundColor:C.primary, justifyContent:'center', alignItems:'center', marginBottom:12, overflow:'hidden' },
  avatarImage:       { width:80, height:80 },
  avatarOverlay:     { ...StyleSheet.absoluteFill, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'center', alignItems:'center' },
  avatarLetter:      { fontSize:32, fontWeight:'700', color:C.white },
  changeAvatarText:  { fontSize:14, color:C.primary },
  card:              { backgroundColor:C.bgCard, borderWidth:0.5, borderColor:C.border, borderRadius:16, margin:16, marginBottom:8, padding:16 },
  cardTitle:         { fontSize:14, fontWeight:'700', color:C.text, marginBottom:14 },
  label:             { fontSize:12, fontWeight:'600', color:C.primary2, marginBottom:6 },
  input:             { backgroundColor:C.bgInput, borderWidth:0.5, borderColor:C.border, borderRadius:10, paddingHorizontal:14, paddingVertical:11, fontSize:15, color:C.text, marginBottom:12 },
  multiline:         { height:80, textAlignVertical:'top' },
  inputDisabled:     { backgroundColor:C.lavXLight, borderWidth:0.5, borderColor:C.borderL, borderRadius:10, paddingHorizontal:14, paddingVertical:11, marginBottom:12 },
  inputDisabledText: { fontSize:15, color:C.textSub },
  saveBtn:           { backgroundColor:C.primary, borderRadius:10, paddingVertical:12, alignItems:'center' },
  saveBtnText:       { color:C.white, fontSize:15, fontWeight:'700' },
  settingRow:        { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:12, borderBottomWidth:0.5, borderBottomColor:C.borderL },
  settingLabel:      { fontSize:15, color:C.text },
  logoutBtn:         { margin:16, backgroundColor:C.roseBg, borderWidth:0.5, borderColor:'#FCA5A5', borderRadius:12, paddingVertical:14, alignItems:'center' },
  logoutText:        { fontSize:15, color:C.rose, fontWeight:'700' },
});
