// app/(auth)/register.jsx
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { register, logout } from '../../src/services';
import { C } from '../../src/config/theme';

export default function RegisterScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [goal,     setGoal]     = useState('');
  const [loading,  setLoading]  = useState(false);

  // register() (src/services -> สร้าง user ใน Firebase Auth + เอกสารโปรไฟล์ใน Firestore users/{uid})
  // แต่ createUserWithEmailAndPassword จะ sign-in ให้อัตโนมัติ จึงต้อง logout() ก่อน
  // แล้วค่อยแจ้งเตือนสมัครสำเร็จ + ให้ผู้ใช้กดเข้าสู่ระบบเอง (ไม่ auto-login เข้า home)
  const handleRegister = async () => {
    if (!username.trim()||!email.trim()||!password.trim()) { Alert.alert('แจ้งเตือน','กรุณากรอกชื่อ, อีเมล และรหัสผ่าน'); return; }
    if (password.length<6) { Alert.alert('แจ้งเตือน','รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
    setLoading(true);
    try {
      await register(username.trim(), email.trim(), password, goal.trim());
      await logout();
      Alert.alert('สมัครสมาชิกสำเร็จ', 'กรุณาเข้าสู่ระบบเพื่อเริ่มใช้งาน', [
        { text: 'ตกลง', onPress: () => router.replace('/(auth)/login') },
      ]);
    }
    catch (e) { Alert.alert('สมัครไม่สำเร็จ', e.code==='auth/email-already-in-use'?'อีเมลนี้ถูกใช้แล้ว':'เกิดข้อผิดพลาด'); }
    finally { setLoading(false); }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bgHeader} />
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <TouchableOpacity onPress={()=>router.back()} style={{marginBottom:16}}>
            <Text style={styles.backText}>← กลับ</Text>
          </TouchableOpacity>
          <Text style={styles.title}>สร้างบัญชีใหม่</Text>
          <Text style={styles.subtitle}>เริ่มต้นใช้งานฟรี</Text>
          <View style={styles.card}>
            {[
              { label:'ชื่อผู้ใช้งาน', value:username, set:setUsername, placeholder:'ชื่อที่แสดงในแอป' },
              { label:'อีเมล', value:email, set:setEmail, placeholder:'email@example.com', kb:'email-address' },
              { label:'รหัสผ่าน', value:password, set:setPassword, placeholder:'อย่างน้อย 6 ตัวอักษร', secure:true },
            ].map(f => (
              <View key={f.label}>
                <Text style={styles.label}>{f.label}</Text>
                {f.secure ? (
                  <View style={styles.passwordWrap}>
                    <TextInput style={styles.passwordInput} value={f.value} onChangeText={f.set} placeholder={f.placeholder} placeholderTextColor={C.textHint} autoCapitalize="none" secureTextEntry={!showPassword} />
                    <TouchableOpacity style={styles.eyeBtn} onPress={()=>setShowPassword(v=>!v)}>
                      <Ionicons name={showPassword?'eye-off':'eye'} size={20} color={C.textSub} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TextInput style={styles.input} value={f.value} onChangeText={f.set} placeholder={f.placeholder} placeholderTextColor={C.textHint} keyboardType={f.kb??'default'} autoCapitalize="none" />
                )}
              </View>
            ))}
            <Text style={styles.label}>เป้าหมายส่วนบุคคล (ไม่บังคับ)</Text>
            <TextInput style={[styles.input,styles.multiline]} value={goal} onChangeText={setGoal} placeholder="เช่น อยากเป็นคนมีวินัยมากขึ้น..." placeholderTextColor={C.textHint} multiline numberOfLines={3} />
            <TouchableOpacity style={[styles.btn,loading&&{opacity:0.6}]} onPress={handleRegister} disabled={loading}>
              <Text style={styles.btnText}>{loading?'กำลังสมัคร...':'สมัครสมาชิก'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>router.back()}>
              <Text style={styles.linkText}>มีบัญชีแล้ว? <Text style={styles.link}>เข้าสู่ระบบ</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex:1, backgroundColor:C.bg },
  scroll:     { flexGrow:1, padding:24, paddingTop:52 },
  backText:   { fontSize:15, color:C.primary },
  title:      { fontSize:24, fontWeight:'800', color:C.text, marginBottom:4 },
  subtitle:   { fontSize:13, color:C.textSub, marginBottom:20 },
  card:       { backgroundColor:C.bgCard, borderWidth:0.5, borderColor:C.border, borderRadius:20, padding:20 },
  label:      { fontSize:12, fontWeight:'600', color:C.primary2, marginBottom:6, marginTop:4 },
  input:      { backgroundColor:C.bgInput, borderWidth:0.5, borderColor:C.border, borderRadius:10, paddingHorizontal:14, paddingVertical:12, fontSize:15, color:C.text, marginBottom:10 },
  passwordWrap:  { flexDirection:'row', alignItems:'center', backgroundColor:C.bgInput, borderWidth:0.5, borderColor:C.border, borderRadius:10, marginBottom:10 },
  passwordInput: { flex:1, paddingHorizontal:14, paddingVertical:12, fontSize:15, color:C.text },
  eyeBtn:        { paddingHorizontal:12, paddingVertical:12 },
  multiline:  { height:80, textAlignVertical:'top' },
  btn:        { backgroundColor:C.primary, borderRadius:12, paddingVertical:14, alignItems:'center', marginTop:8, marginBottom:14 },
  btnText:    { color:C.white, fontSize:16, fontWeight:'700' },
  linkText:   { textAlign:'center', fontSize:14, color:C.textSub },
  link:       { color:C.primary, fontWeight:'700' },
});
