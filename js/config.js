// ============================================
// 共读 App - Supabase 配置
// 请在 Supabase 项目中找到以下信息并填入
// ============================================

// 从 Supabase 项目 Settings -> API 中获取
const SUPABASE_URL = 'https://qexhdxphidxrrvoorlrv.supabase.co';       // 例如: https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFleGhkeHBoaWR4cnJ2b29ybHJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxOTE5MzAsImV4cCI6MjA5OTc2NzkzMH0.g7bBsnxy04teAwoDFK762lla-v62w7O0X9SD7BNRo0s'; // 例如: eyJhbGciOiJI...

// 创建 Supabase 客户端
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
