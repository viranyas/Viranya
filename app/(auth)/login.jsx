// app/(auth)/login.jsx
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView, StatusBar, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { login } from '../../src/services';
import { C } from '../../src/config/theme';

export default function LoginScreen() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading,  setLoading]  = useState(false);

  // login() (src/services -> Firebase Auth signInWithEmailAndPassword) แล้วให้ app/_layout.jsx
  // จับ event onAuthChanged ไปอัปเดต useStore.user เอง จากนั้นค่อยเด้งไปหน้า home
  const handleLogin = async () => {
    if (!email.trim()||!password.trim()) { Alert.alert('แจ้งเตือน','กรุณากรอก email และรหัสผ่าน'); return; }
    setLoading(true);
    try { await login(email.trim(), password); router.replace('/(tabs)/home'); }
    catch (e) { Alert.alert('ไม่สามารถเข้าสู่ระบบ', e.code==='auth/invalid-credential'?'email หรือรหัสผ่านไม่ถูกต้อง':'เกิดข้อผิดพลาด'); }
    finally { setLoading(false); }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bgHeader} />
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.logoWrap}>
            <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.tagline}>วางแผนชีวิต สร้างนิสัย ด้วย AI</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.title}>ยินดีต้อนรับ</Text>
            <Text style={styles.subtitle}>เข้าสู่ระบบเพื่อจัดการชีวิตคุณ</Text>
            <Text style={styles.label}>อีเมล</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="email@example.com" placeholderTextColor={C.textHint} keyboardType="email-address" autoCapitalize="none" />
            <Text style={styles.label}>รหัสผ่าน</Text>
            <View style={styles.passwordWrap}>
              <TextInput style={styles.passwordInput} value={password} onChangeText={setPassword} placeholder="รหัสผ่าน" placeholderTextColor={C.textHint} secureTextEntry={!showPassword} />
              <TouchableOpacity style={styles.eyeBtn} onPress={()=>setShowPassword(v=>!v)}>
                <Ionicons name={showPassword?'eye-off':'eye'} size={20} color={C.textSub} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.forgotBtn} onPress={()=>router.push('/(auth)/forgot-password')}>
              <Text style={styles.forgotText}>ลืมรหัสผ่าน?</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn,loading&&{opacity:0.6}]} onPress={handleLogin} disabled={loading}>
              <Text style={styles.btnText}>{loading?'กำลังเข้าสู่ระบบ...':'เข้าสู่ระบบ'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>router.push('/(auth)/register')}>
              <Text style={styles.linkText}>ยังไม่มีบัญชี? <Text style={styles.link}>สมัครสมาชิก</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex:1, backgroundColor:C.bg },
  scroll:     { flexGrow:1, padding:24, justifyContent:'center' },
  logoWrap:   { alignItems:'center', marginBottom:28 },
  logo:       { width:200, height:77, marginBottom:8 },
  tagline:    { fontSize:13, color:C.textSub },
  card:       { backgroundColor:C.bgCard, borderWidth:0.5, borderColor:C.border, borderRadius:20, padding:22 },
  title:      { fontSize:20, fontWeight:'700', color:C.text, marginBottom:4 },
  subtitle:   { fontSize:13, color:C.textSub, marginBottom:20 },
  label:      { fontSize:12, fontWeight:'600', color:C.primary2, marginBottom:6 },
  input:      { backgroundColor:C.bgInput, borderWidth:0.5, borderColor:C.border, borderRadius:10, paddingHorizontal:14, paddingVertical:12, fontSize:15, color:C.text, marginBottom:12 },
  passwordWrap:  { flexDirection:'row', alignItems:'center', backgroundColor:C.bgInput, borderWidth:0.5, borderColor:C.border, borderRadius:10, marginBottom:12 },
  passwordInput: { flex:1, paddingHorizontal:14, paddingVertical:12, fontSize:15, color:C.text },
  eyeBtn:        { paddingHorizontal:12, paddingVertical:12 },
  forgotBtn:  { alignSelf:'flex-end', marginBottom:18 },
  forgotText: { fontSize:13, color:C.primary },
  btn:        { backgroundColor:C.primary, borderRadius:12, paddingVertical:14, alignItems:'center', marginBottom:16 },
  btnText:    { color:C.white, fontSize:16, fontWeight:'700' },
  linkText:   { textAlign:'center', fontSize:14, color:C.textSub },
  link:       { color:C.primary, fontWeight:'700' },
});
