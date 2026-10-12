// app/(auth)/forgot-password.jsx
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { resetPassword } from '../../src/services';
import { C } from '../../src/config/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  // ส่งอีเมลรีเซ็ตรหัสผ่านผ่าน resetPassword (src/services -> Firebase Auth sendPasswordResetEmail)
  const handleReset = async () => {
    if (!email.trim()) { Alert.alert('แจ้งเตือน','กรุณากรอกอีเมล'); return; }
    setLoading(true);
    try { await resetPassword(email.trim()); setSent(true); }
    catch { Alert.alert('ไม่สำเร็จ','ไม่พบอีเมลนี้ในระบบ'); }
    finally { setLoading(false); }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bgHeader} />
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
        <View style={styles.inner}>
          <TouchableOpacity onPress={()=>router.back()} style={{marginBottom:24}}>
            <Text style={styles.backText}>← กลับ</Text>
          </TouchableOpacity>
          <Text style={styles.title}>รีเซ็ตรหัสผ่าน</Text>
          {sent ? (
            <View style={styles.card}>
              <Text style={{fontSize:44,textAlign:'center',marginBottom:12}}>📬</Text>
              <Text style={styles.sentTitle}>ส่ง link แล้ว!</Text>
              <Text style={styles.sentDesc}>ตรวจสอบอีเมล {email} แล้วกด link เพื่อตั้งรหัสผ่านใหม่</Text>
              <TouchableOpacity style={styles.btn} onPress={()=>router.back()}>
                <Text style={styles.btnText}>กลับหน้าเข้าสู่ระบบ</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.desc}>กรอกอีเมลที่ใช้สมัคร ระบบจะส่ง link รีเซ็ตรหัสผ่านไปให้</Text>
              <Text style={styles.label}>อีเมล</Text>
              <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="email@example.com" placeholderTextColor={C.textHint} keyboardType="email-address" autoCapitalize="none" />
              <TouchableOpacity style={[styles.btn,loading&&{opacity:0.6}]} onPress={handleReset} disabled={loading}>
                <Text style={styles.btnText}>{loading?'กำลังส่ง...':'ส่ง link รีเซ็ต'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:C.bg },
  inner:     { flex:1, padding:24, paddingTop:56 },
  backText:  { fontSize:15, color:C.primary },
  title:     { fontSize:24, fontWeight:'700', color:C.text, marginBottom:24 },
  card:      { backgroundColor:C.bgCard, borderWidth:0.5, borderColor:C.border, borderRadius:18, padding:22 },
  desc:      { fontSize:14, color:C.textSub, lineHeight:22, marginBottom:18 },
  label:     { fontSize:12, fontWeight:'600', color:C.primary2, marginBottom:6 },
  input:     { backgroundColor:C.bgInput, borderWidth:0.5, borderColor:C.border, borderRadius:10, paddingHorizontal:14, paddingVertical:12, fontSize:15, color:C.text, marginBottom:20 },
  btn:       { backgroundColor:C.primary, borderRadius:12, paddingVertical:14, alignItems:'center' },
  btnText:   { color:C.white, fontSize:16, fontWeight:'700' },
  sentTitle: { fontSize:18, fontWeight:'700', color:C.text, textAlign:'center', marginBottom:10 },
  sentDesc:  { fontSize:14, color:C.textSub, textAlign:'center', lineHeight:22, marginBottom:24 },
});
