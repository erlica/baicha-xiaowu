# 📚 共读 App - 搭建指南

和好友一起读书，分享每一处划线、批注和阅读进度。

---

## 🚀 快速上手（约 5 分钟）

### 第一步：注册 Supabase

1. 打开 [supabase.com](https://supabase.com)，点击 **Start your project**
2. 用 GitHub 账号登录（或用邮箱注册）
3. 点击 **New project**，填写：
   - **Name**: `gongdu`（随意命名）
   - **Database Password**: 设置一个密码（记住它）
   - **Region**: 选择 `Northeast Asia (Tokyo)` 或 Singapore
4. 点击 **Create project**，等待约 1-2 分钟

### 第二步：创建数据库表

1. 进入项目后，左侧菜单点击 **SQL Editor**
2. 点击 **New query**
3. 打开本项目的 `setup.sql` 文件，**全选复制**
4. 粘贴到 SQL Editor 中，点击右下角 **Run**
5. 看到 "Success. No rows returned" 即为成功

> 💡 也可直接执行：左侧 Table Editor 会显示 7 张新表

### 第三步：配置 API 密钥

1. 左侧菜单点击 **Settings** → **API**
2. 找到两个值：
   - **Project URL** (例如 `https://xxxxx.supabase.co`)
   - **anon public key** (很长一串，以 `eyJ` 开头)
3. 打开本项目的 `js/config.js`，替换：
   ```js
   const SUPABASE_URL = 'https://xxxxx.supabase.co';  // 你的 Project URL
   const SUPABASE_ANON_KEY = 'eyJhbGciOi...';          // 你的 anon key
   ```

### 第四步：启用邮箱注册

1. 左侧菜单 **Authentication** → **Providers**
2. 确保 **Email** 已启用（默认已启用）
3. 可选：关闭 "Confirm email"（左侧 Authentication → Settings → 关闭 Confirm email），方便快速注册

### 第五步：启动应用

```bash
# 方式一：用 Python 启动本地服务器（推荐）
cd gongdu-app
python3 -m http.server 8080

# 方式二：用 VS Code 的 Live Server 插件打开 index.html

# 然后浏览器打开 http://localhost:8080
```

---

## 📖 使用流程

### 1. 注册账号
打开应用 → 切换到"注册"标签 → 填写邮箱、密码、昵称 → 注册

### 2. 上传书籍
登录后 → 点击 **📖 上传新书** → 填写书名、作者 → 粘贴书籍文本内容

> 💡 文本来源：可以在网上搜索 "红楼梦 txt 下载"，复制全文粘贴即可

### 3. 创建共读小组
点击书籍 → **✨ 创建共读小组** → 命名小组 → 获得 **6 位邀请码**

### 4. 邀请好友
将邀请码发给朋友，朋友注册后点击 **🔗 输入邀请码加入** 即可

### 5. 开始共读
- 选中文字自动划线（你和朋友都能看到）
- 点击划线可写批注
- 右侧面板查看成员进度、所有批注、小组讨论
- 进度自动同步

---

## 🔧 友情分享给朋友

你的朋友也需要：
1. 在同一台电脑或其他设备打开你的链接
2. 注册自己的账号
3. 用你分享的邀请码加入小组

> 💡 如果用 localhost，只能同一台电脑访问。建议用 ngrok 生成公网链接发给朋友：
> ```bash
> brew install ngrok    # 安装 ngrok
> ngrok http 8080        # 生成公网链接
> ```
> 把生成的 `https://xxx.ngrok-free.app` 链接发给朋友即可！

---

## 🏗️ 项目结构

```
gongdu-app/
├── index.html          # 主页面
├── css/
│   └── style.css       # 样式
├── js/
│   ├── config.js       # Supabase 配置（你只需改这个）
│   └── app.js          # 核心逻辑
├── setup.sql           # 数据库初始化
└── README.md           # 你正在看的文件
```
