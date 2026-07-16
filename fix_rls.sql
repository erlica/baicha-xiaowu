-- ============================================
-- 白茶小屋 - RLS 权限补丁
-- 复制全部内容，粘贴到 Supabase SQL Editor 执行
-- ============================================

-- Books: 允许创建者删除
DROP POLICY IF EXISTS "Books are deletable by creator" ON books;
CREATE POLICY "Books are deletable by creator" ON books
  FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- Groups: 允许创建者删除
DROP POLICY IF EXISTS "Groups are deletable by creator" ON groups;
CREATE POLICY "Groups are deletable by creator" ON groups
  FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- Group members: 允许用户退出（删自己），也允许组长删成员
DROP POLICY IF EXISTS "Members deletable by user" ON group_members;
CREATE POLICY "Members deletable by user" ON group_members
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id
    OR auth.uid() IN (
      SELECT created_by FROM groups WHERE groups.id = group_members.group_id
    )
  );

-- Group members: 放宽读取权限，所有认证用户可查看成员
DROP POLICY IF EXISTS "Members readable by group members" ON group_members;
CREATE POLICY "Members readable by all authenticated" ON group_members
  FOR SELECT TO authenticated USING (true);
