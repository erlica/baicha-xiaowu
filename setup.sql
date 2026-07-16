-- ============================================
-- 共读 App - Supabase 数据库初始化脚本
-- 在 Supabase SQL Editor 中执行此文件
-- ============================================

-- 1. 书籍表
CREATE TABLE IF NOT EXISTS books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT DEFAULT '未知',
  cover_url TEXT DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 共读小组表
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  book_id UUID REFERENCES books(id) ON DELETE CASCADE NOT NULL,
  invite_code TEXT UNIQUE NOT NULL DEFAULT substring(encode(gen_random_bytes(4), 'hex'), 1, 6),
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 小组成员表
CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

-- 4. 划线表
CREATE TABLE IF NOT EXISTS highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES books(id) ON DELETE CASCADE NOT NULL,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  selected_text TEXT NOT NULL,
  color TEXT DEFAULT '#FFD700',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 批注表
CREATE TABLE IF NOT EXISTS annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  highlight_id UUID REFERENCES highlights(id) ON DELETE CASCADE,
  book_id UUID REFERENCES books(id) ON DELETE CASCADE NOT NULL,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 阅读进度表
CREATE TABLE IF NOT EXISTS reading_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES books(id) ON DELETE CASCADE NOT NULL,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  scroll_percentage INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(book_id, group_id, user_id)
);

-- 7. 评论表
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 索引
-- ============================================
CREATE INDEX IF NOT EXISTS idx_books_created_by ON books(created_by);
CREATE INDEX IF NOT EXISTS idx_groups_invite_code ON groups(invite_code);
CREATE INDEX IF NOT EXISTS idx_groups_book_id ON groups(book_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_highlights_book_group ON highlights(book_id, group_id);
CREATE INDEX IF NOT EXISTS idx_annotations_book_group ON annotations(book_id, group_id);
CREATE INDEX IF NOT EXISTS idx_reading_progress_user ON reading_progress(book_id, group_id, user_id);
CREATE INDEX IF NOT EXISTS idx_comments_group ON comments(group_id);

-- ============================================
-- Row Level Security (RLS)
-- ============================================
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Books: 所有人可读（已登录用户），创建者可修改
CREATE POLICY "Books are readable by authenticated users" ON books
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Books are insertable by authenticated users" ON books
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Books are updatable by creator" ON books
  FOR UPDATE TO authenticated USING (auth.uid() = created_by);

-- Groups: 成员可读；所有人可读（用于搜索邀请码）
CREATE POLICY "Groups readable by all authenticated" ON groups
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Groups insertable by authenticated" ON groups
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

-- Group members: 成员可读
CREATE POLICY "Members readable by group members" ON group_members
  FOR SELECT TO authenticated USING (
    auth.uid() IN (
      SELECT user_id FROM group_members gm WHERE gm.group_id = group_members.group_id
    )
  );

CREATE POLICY "Members insertable by authenticated" ON group_members
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Highlights: 同组成员可读写
CREATE POLICY "Highlights readable by group members" ON highlights
  FOR SELECT TO authenticated USING (
    auth.uid() IN (
      SELECT user_id FROM group_members gm WHERE gm.group_id = highlights.group_id
    )
  );

CREATE POLICY "Highlights insertable by group members" ON highlights
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM group_members gm WHERE gm.group_id = highlights.group_id
    )
  );

CREATE POLICY "Highlights updatable by creator" ON highlights
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Highlights deletable by creator" ON highlights
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Annotations: 同组成员可读写（与 highlights 一致的权限）
CREATE POLICY "Annotations readable by group members" ON annotations
  FOR SELECT TO authenticated USING (
    auth.uid() IN (
      SELECT user_id FROM group_members gm WHERE gm.group_id = annotations.group_id
    )
  );

CREATE POLICY "Annotations insertable by group members" ON annotations
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM group_members gm WHERE gm.group_id = annotations.group_id
    )
  );

CREATE POLICY "Annotations updatable by creator" ON annotations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Annotations deletable by creator" ON annotations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Reading progress: 同组成员可读，个人可写
CREATE POLICY "Progress readable by group members" ON reading_progress
  FOR SELECT TO authenticated USING (
    auth.uid() IN (
      SELECT user_id FROM group_members gm WHERE gm.group_id = reading_progress.group_id
    )
  );

CREATE POLICY "Progress insertable by user" ON reading_progress
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Progress updatable by user" ON reading_progress
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Comments: 同组成员可读可写
CREATE POLICY "Comments readable by group members" ON comments
  FOR SELECT TO authenticated USING (
    auth.uid() IN (
      SELECT user_id FROM group_members gm WHERE gm.group_id = comments.group_id
    )
  );

CREATE POLICY "Comments insertable by group members" ON comments
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM group_members gm WHERE gm.group_id = comments.group_id
    )
  );

-- ============================================
-- 启用 Realtime（实时同步）
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE highlights;
ALTER PUBLICATION supabase_realtime ADD TABLE annotations;
ALTER PUBLICATION supabase_realtime ADD TABLE reading_progress;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;

-- ============================================
-- 创建用户资料视图（用于显示昵称）
-- ============================================
CREATE OR REPLACE VIEW user_profiles AS
SELECT id, email, raw_user_meta_data->>'username' AS username
FROM auth.users;
