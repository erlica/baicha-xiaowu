/* ============================================
   共读 App - 核心应用逻辑（白茶小屋）
   ============================================ */

// ========== 全局状态 ==========
const state = {
  user: null,
  currentPage: 'auth',
  currentBook: null,
  currentGroup: null,
  isLoginMode: true,
  // 阅读器状态
  bookContent: null,
  bookParagraphs: [],
  highlights: [],
  annotations: [],
  // 实时订阅
  subscriptions: [],
  // 用于批注的选中文本
  pendingAnnotation: null,
};

// ========== DOM 引用 ==========
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ========== 工具函数 ==========
function toast(msg, type = 'info') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  setTimeout(() => el.classList.add('hidden'), 2500);
}

function showLoading() {
  $('#loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
  $('#loadingOverlay').classList.add('hidden');
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getUsername(user) {
  if (!user) return '未知';
  return user.user_metadata?.username || user.email?.split('@')[0] || '未知';
}

// ========== 页面导航 ==========
function navigateTo(page, data = null) {
  hideAllPages();
  state.currentPage = page;

  const pageEl = $(`#page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  // 导航栏控制
  if (page === 'auth') {
    $('#navbar').classList.add('hidden');
  } else {
    $('#navbar').classList.remove('hidden');
    const titles = {
      bookshelf: '我的书架',
      'book-detail': '书籍详情',
      reader: '阅读器',
    };
    $('#navTitle').textContent = titles[page] || '白茶小屋';
  }

  // 返回按钮
  if (page === 'bookshelf') {
    $('#navBack').style.display = 'none';
  } else {
    $('#navBack').style.display = 'block';
    $('#navBack').onclick = () => {
      if (page === 'reader') {
        navigateTo('book-detail', state.currentBook);
      } else if (page === 'book-detail') {
        navigateTo('bookshelf');
      }
    };
  }

  // 页面初始化
  if (page === 'bookshelf') loadBooks();
  if (page === 'book-detail' && data) {
    state.currentBook = data;
    loadBookDetail(data);
  }
}

function hideAllPages() {
  $$('.page').forEach(p => p.classList.remove('active'));
}

// ========== 认证模块 ==========
async function checkSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    state.user = data.session.user;
    $('#navUser').textContent = getUsername(state.user);
    navigateTo('bookshelf');
  }
}

async function handleAuth(e) {
  e.preventDefault();
  const email = $('#authEmail').value.trim();
  const password = $('#authPassword').value;
  const username = $('#authUsername').value.trim();

  if (!email || !password) return toast('请填写邮箱和密码', 'error');
  if (password.length < 6) return toast('密码至少6位', 'error');

  showLoading();
  try {
    if (state.isLoginMode) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast('登录成功！', 'success');
    } else {
      if (!username) return toast('请填写昵称', 'error');
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      if (error) throw error;
      toast('注册成功！请检查邮箱确认（或直接登录）', 'success');
    }
    await checkSession();
  } catch (err) {
    toast(err.message || '操作失败', 'error');
  } finally {
    hideLoading();
  }
}

async function logout() {
  state.subscriptions.forEach(sub => supabase.removeChannel(sub));
  state.subscriptions = [];
  await supabase.auth.signOut();
  state.user = null;
  state.currentBook = null;
  state.currentGroup = null;
  navigateTo('auth');
}

// ========== 书架模块 ==========
async function loadBooks() {
  const container = $('#booksList');
  container.innerHTML = '<div class="empty-state">📚<br>加载中...</div>';

  const { data, error } = await supabase
    .from('books')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = '<div class="empty-state">❌<br>加载失败，请刷新重试</div>';
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state">📚<br>还没有书籍，上传一本开始读书吧</div>';
    return;
  }

  container.innerHTML = data.map(book => `
    <div class="book-card" onclick="navigateTo('book-detail', ${JSON.stringify(book).replace(/"/g, '&quot;')})">
      <div class="book-card-title">${escapeHtml(book.title)}</div>
      <div class="book-card-author">${escapeHtml(book.author || '未知作者')}</div>
      <div class="book-card-meta">${formatDate(book.created_at)} 上传</div>
    </div>
  `).join('');
}

// ========== 上传书籍模块 ==========
let selectedFile = null;
let currentUploadMethod = 'file';

// 上传方式切换
$$('.upload-method-tab')?.forEach(tab => {
  tab.addEventListener('click', () => {
    currentUploadMethod = tab.dataset.method;
    $$('.upload-method-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    $$('.upload-method-panel').forEach(p => p.classList.remove('active'));
    if (currentUploadMethod === 'file') {
      $('#uploadMethodFile').classList.add('active');
    } else {
      $('#uploadMethodPaste').classList.add('active');
    }
  });
});

// 拖拽上传
const dropzone = $('#uploadDropzone');
const fileInput = $('#bookFileInput');

if (dropzone) {
  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFileSelect(files[0]);
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
  });
}

function handleFileSelect(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const supported = ['epub', 'txt', 'md', 'markdown', 'pdf'];
  if (!supported.includes(ext)) {
    toast('不支持的文件格式，请上传 EPUB、Markdown、TXT 或 PDF 文件', 'error');
    return;
  }
  selectedFile = file;
  $('#fileName').textContent = `${file.name} (${formatFileSize(file.size)})`;
  $('#fileInfo').classList.remove('hidden');
  $('#uploadDropzone').style.display = 'none';

  // 自动从文件名提取书名
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').trim();
  if (!$('#bookTitle').value) {
    $('#bookTitle').value = name;
  }
}

$('#btnRemoveFile')?.addEventListener('click', () => {
  selectedFile = null;
  fileInput.value = '';
  $('#fileInfo').classList.add('hidden');
  $('#uploadDropzone').style.display = '';
});

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// 文件上传
$('#btnUploadFile')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const title = $('#bookTitle').value.trim();
  const author = $('#bookAuthor').value.trim();

  if (!title) return toast('请填写书名', 'error');
  if (!selectedFile) return toast('请选择文件', 'error');

  showLoading();
  try {
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    let content = '';

    if (ext === 'txt') {
      content = await readFileAsText(selectedFile);
    } else if (ext === 'epub') {
      content = await parseEpub(selectedFile);
    } else if (ext === 'md' || ext === 'markdown') {
      content = await readFileAsText(selectedFile);
      // Markdown 保留原样，阅读器可直接显示
    } else if (ext === 'pdf') {
      content = await parsePdf(selectedFile);
    }

    if (!content || content.trim().length < 10) {
      toast('无法提取文件内容，文件可能为空或格式不支持', 'error');
      hideLoading();
      return;
    }

    await saveBookToDb(title, author, content);
  } catch (err) {
    console.error('上传错误:', err);
    toast('上传失败: ' + (err.message || '未知错误'), 'error');
  } finally {
    hideLoading();
  }
});

// 粘贴文本上传
$('#btnUploadPaste')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const title = $('#bookTitle2').value.trim();
  const author = $('#bookAuthor2').value.trim();
  const content = $('#bookContent').value.trim();

  if (!title) return toast('请填写书名', 'error');
  if (!content || content.length < 10) return toast('请粘贴书籍内容', 'error');

  showLoading();
  try {
    await saveBookToDb(title, author, content);
  } catch (err) {
    toast('上传失败: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
});

async function saveBookToDb(title, author, content) {
  const cover = $('#bookCover')?.value?.trim() || '';
  const { data, error } = await supabase.from('books').insert({
    title,
    author: author || '未知',
    content,
    cover_url: cover,
    created_by: state.user.id,
  }).select().single();

  if (error) throw error;

  toast('上传成功！', 'success');
  resetUploadForm();
  closeModal('uploadModal');

  // 刷新并跳转到新书
  await loadBooks();
  if (data) navigateTo('book-detail', data);
}

function resetUploadForm() {
  selectedFile = null;
  if (fileInput) fileInput.value = '';
  $('#fileInfo')?.classList.add('hidden');
  if ($('#uploadDropzone')) $('#uploadDropzone').style.display = '';
  $('#bookTitle').value = '';
  $('#bookAuthor').value = '';
  $('#bookCover').value = '';
  $('#bookTitle2').value = '';
  $('#bookAuthor2').value = '';
  $('#bookContent').value = '';
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file, 'UTF-8');
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ========== EPUB 解析 ==========
async function parseEpub(file) {
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const zip = await JSZip.loadAsync(arrayBuffer);

  // 1. 找到 container.xml 获取 OPF 路径
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) throw new Error('无效的 EPUB 文件');

  const opfMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfMatch) throw new Error('无法找到 EPUB 内容索引');

  const opfPath = opfMatch[1];
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  // 2. 解析 OPF 文件获取章节列表
  const opfXml = await zip.file(opfPath)?.async('text');
  if (!opfXml) throw new Error('无法读取 OPF 文件');

  const parser = new DOMParser();
  const opfDoc = parser.parseFromString(opfXml, 'text/xml');

  // 获取所有 spine 条目
  const spineItems = [];
  const items = {};
  opfDoc.querySelectorAll('manifest > item').forEach(item => {
    items[item.getAttribute('id')] = item.getAttribute('href');
  });

  const spine = opfDoc.querySelectorAll('spine > itemref');
  spine.forEach(ref => {
    const id = ref.getAttribute('idref');
    if (items[id]) {
      spineItems.push(opfDir + items[id]);
    }
  });

  // 如果 spine 为空，尝试所有 HTML/XHTML 文件
  if (spineItems.length === 0) {
    const allFiles = Object.keys(zip.files);
    for (const name of allFiles) {
      const ext = name.split('.').pop()?.toLowerCase();
      if (ext === 'html' || ext === 'htm' || ext === 'xhtml') {
        spineItems.push(name);
      }
    }
  }

  // 3. 逐个读取章节内容
  let fullText = '';
  for (const path of spineItems) {
    try {
      let html = await zip.file(path)?.async('text');
      if (!html) continue;

      // 处理可能的路径问题
      if (!html && zip.file(path.replace(/^\//, ''))) {
        html = await zip.file(path.replace(/^\//, '')).async('text');
      }

      if (html) {
        // 提取纯文本
        const doc = parser.parseFromString(html, 'text/html');
        const body = doc.querySelector('body');
        if (body) {
          let text = body.textContent || '';
          // 清理多余空白
          text = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
          if (text) fullText += text + '\n\n';
        }
      }
    } catch (e) {
      console.warn('跳过章节:', path, e);
    }
  }

  if (!fullText.trim()) throw new Error('未能从 EPUB 中提取到文字内容');
  return fullText.trim();
}

// ========== PDF 解析 ==========
async function parsePdf(file) {
  const arrayBuffer = await readFileAsArrayBuffer(file);

  // 设置 pdf.js worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    if (pageText.trim()) {
      fullText += pageText + '\n\n';
    }
  }

  if (!fullText.trim()) throw new Error('未能从 PDF 中提取到文字内容（可能是扫描版 PDF，不含文字层）');
  return fullText.trim();
}

// ========== 书籍详情 / 小组模块 ==========
async function loadBookDetail(book) {
  $('#detailBookTitle').textContent = book.title;
  $('#detailBookAuthor').textContent = book.author || '未知作者';

  // 加载该书的小组列表
  const container = $('#groupsList');
  container.innerHTML = '<div class="empty-state">👥<br>加载中...</div>';

  const { data: groups, error } = await supabase
    .from('groups')
    .select('*, group_members(count)')
    .eq('book_id', book.id)
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = '<div class="empty-state">❌<br>加载失败</div>';
    return;
  }

  if (!groups || groups.length === 0) {
    container.innerHTML = '<div class="empty-state">👥<br>还没有读书小组，创建一个吧</div>';
    return;
  }

  container.innerHTML = groups.map(g => `
    <div class="group-item" onclick="enterGroup('${g.id}')">
      <div class="group-item-left">
        <span class="group-item-name">${escapeHtml(g.name)}</span>
        <span class="group-item-code">成员: ${g.group_members?.[0]?.count || 1}</span>
      </div>
      <span class="group-item-invite-code" onclick="event.stopPropagation(); copyInviteCode('${g.invite_code}')" title="点击复制邀请码">${g.invite_code}</span>
    </div>
  `).join('');
}

async function createGroup(e) {
  e.preventDefault();
  const name = $('#groupName').value.trim();
  if (!name) return toast('请输入小组名称', 'error');

  showLoading();
  try {
    // 创建小组
    const { data: group, error } = await supabase
      .from('groups')
      .insert({
        name,
        book_id: state.currentBook.id,
        created_by: state.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // 自动将创建者加入小组
    await supabase.from('group_members').insert({
      group_id: group.id,
      user_id: state.user.id,
    });

    toast(`小组创建成功！邀请码: ${group.invite_code}`, 'success');
    closeModal('createGroupModal');
    $('#createGroupForm').reset();
    loadBookDetail(state.currentBook);
  } catch (err) {
    toast(err.message || '创建失败', 'error');
  } finally {
    hideLoading();
  }
}

async function joinGroup(e) {
  e.preventDefault();
  const code = $('#inviteCode').value.trim().toLowerCase();
  if (!code) return toast('请输入邀请码', 'error');

  showLoading();
  try {
    const { data: group, error } = await supabase
      .from('groups')
      .select('*')
      .eq('invite_code', code)
      .single();

    if (error || !group) {
      toast('未找到该小组，请检查邀请码', 'error');
      hideLoading();
      return;
    }

    // 检查是否已加入
    const { data: existing } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', group.id)
      .eq('user_id', state.user.id)
      .maybeSingle();

    if (existing) {
      toast('你已经在这个小组里了！', 'info');
      closeModal('joinGroupModal');
      $('#joinGroupForm').reset();
      navigateTo('book-detail', { id: group.book_id, title: '', author: '' });
      // 加载正确的书籍信息
      const { data: book } = await supabase.from('books').select('*').eq('id', group.book_id).single();
      if (book) navigateTo('book-detail', book);
      hideLoading();
      return;
    }

    // 加入小组
    await supabase.from('group_members').insert({
      group_id: group.id,
      user_id: state.user.id,
    });

    toast('加入成功！', 'success');
    closeModal('joinGroupModal');
    $('#joinGroupForm').reset();

    // 跳转回书籍详情
    const { data: book } = await supabase.from('books').select('*').eq('id', group.book_id).single();
    if (book) {
      navigateTo('book-detail', book);
    } else {
      navigateTo('bookshelf');
    }
  } catch (err) {
    toast(err.message || '加入失败', 'error');
  } finally {
    hideLoading();
  }
}

function copyInviteCode(code) {
  navigator.clipboard.writeText(code).then(() => {
    toast('邀请码已复制: ' + code, 'success');
  }).catch(() => {
    toast('邀请码: ' + code, 'info');
  });
}

async function enterGroup(groupId) {
  showLoading();
  try {
    const { data: group, error } = await supabase
      .from('groups')
      .select('*, books(*)')
      .eq('id', groupId)
      .single();

    if (error) throw error;
    state.currentGroup = group;
    state.currentBook = group.books;

    // 取消之前的订阅
    state.subscriptions.forEach(sub => supabase.removeChannel(sub));
    state.subscriptions = [];

    // 加载书籍内容
    await loadReaderContent(group);
    navigateTo('reader');
  } catch (err) {
    toast('进入小组失败', 'error');
  } finally {
    hideLoading();
  }
}

// ========== 阅读器模块 ==========
async function loadReaderContent(group) {
  const book = group.books;
  const content = book.content || '';

  // 按段落分割
  state.bookParagraphs = content.split(/\n\n+/).filter(p => p.trim());
  state.bookContent = content;

  // 加载已有的划线和批注
  await loadHighlightsAndAnnotations(group);

  // 渲染段落
  renderParagraphs();

  // 建立实时订阅
  setupRealtimeSubscriptions(group);

  // 加载成员和讨论
  loadMembers(group);
  loadAnnotations(group);
  loadComments(group);

  // 上报当前进度
  reportProgress(group);
}

function renderParagraphs() {
  const container = $('#readerContent');
  const paragraphs = state.bookParagraphs;
  const highlights = state.highlights;

  container.innerHTML = paragraphs.map((p, idx) => {
    // 计算该段落在全文中的偏移
    let offset = 0;
    for (let i = 0; i < idx; i++) {
      offset += paragraphs[i].length + 2; // +2 for \n\n
    }

    // 检查是否有划线覆盖此段落
    const paraEnd = offset + p.length;
    const paraHighlights = highlights.filter(h =>
      (h.start_offset >= offset && h.start_offset < paraEnd) ||
      (h.end_offset > offset && h.end_offset <= paraEnd) ||
      (h.start_offset <= offset && h.end_offset >= paraEnd)
    );

    if (paraHighlights.length === 0) {
      return `<p data-offset="${offset}">${escapeHtml(p)}</p>`;
    }

    // 有划线的段落，需要分段渲染
    let html = '';
    let cursor = offset;
    const sorted = paraHighlights.sort((a, b) => a.start_offset - b.start_offset);

    for (const hl of sorted) {
      const relStart = hl.start_offset - offset;
      const relEnd = hl.end_offset - offset;

      // 划线前的文本
      if (hl.start_offset > cursor) {
        html += escapeHtml(contentSlice(cursor, hl.start_offset));
      }

      // 划线文本
      const isMine = hl.user_id === state.user.id;
      const hasAnnotation = state.annotations.some(a => a.highlight_id === hl.id);
      const cls = `highlight-span${isMine ? '' : ' other-user'}${hasAnnotation ? ' has-annotation' : ''}`;
      html += `<span class="${cls}" data-hl-id="${hl.id}" data-offset="${hl.start_offset}" data-end="${hl.end_offset}" data-user="${hl.user_id}" title="${isMine ? '我的划线' : '朋友的划线'}${hasAnnotation ? ' (有批注)' : ''}">${escapeHtml(hl.selected_text)}</span>`;

      cursor = hl.end_offset;
    }

    // 最后一段划线后的文本
    if (cursor < paraEnd) {
      html += escapeHtml(contentSlice(cursor, paraEnd));
    }

    return `<p data-offset="${offset}">${html}</p>`;
  }).join('');

  // 绑定点击事件
  container.querySelectorAll('.highlight-span').forEach(span => {
    span.addEventListener('click', (e) => {
      e.stopPropagation();
      const hlId = span.dataset.hlId;
      const annotation = state.annotations.find(a => a.highlight_id === hlId);
      if (annotation) {
        showAnnotationPopup(annotation, span);
      }
    });
  });

  // 绑定文本选择事件
  container.addEventListener('mouseup', handleTextSelection);
}

function contentSlice(start, end) {
  return state.bookContent.substring(start, end);
}

async function handleTextSelection(e) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return;

  const selectedText = selection.toString().trim();
  if (selectedText.length < 2) return;

  // 计算选择在全文中的偏移
  const range = selection.getRangeAt(0);
  const container = $('#readerContent');

  // 找到选区起始位置
  const startOffset = getTextOffset(container, range);
  const endOffset = startOffset + selectedText.length;

  if (startOffset < 0) return;

  // 保存划线
  await saveHighlight(selectedText, startOffset, endOffset);
  selection.removeAllRanges();
}

function getTextOffset(container, range) {
  // 简单方式：遍历所有段落节点计算偏移
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let offset = 0;
  let node;

  while ((node = walker.nextNode())) {
    if (node === range.startContainer) {
      return offset + range.startOffset;
    }
    offset += node.textContent.length;
  }

  return -1;
}

async function saveHighlight(text, startOffset, endOffset) {
  if (!state.currentGroup) return;

  try {
    const { data, error } = await supabase
      .from('highlights')
      .insert({
        book_id: state.currentBook.id,
        group_id: state.currentGroup.id,
        user_id: state.user.id,
        start_offset: startOffset,
        end_offset: endOffset,
        selected_text: text,
      })
      .select()
      .single();

    if (error) throw error;

    state.highlights.push(data);
    renderParagraphs();

    // 提示可以写批注
    toast('划线已保存！点击划线可以写批注', 'success');

    // 自动弹出批注输入框
    setTimeout(() => {
      openAnnotationModal(data);
    }, 500);
  } catch (err) {
    console.error('Save highlight error:', err);
    // 静默失败，可能重复划线
  }
}

// ========== 批注模块 ==========
function openAnnotationModal(highlight) {
  state.pendingAnnotation = highlight;
  $('#annotationQuote').textContent = '「' + highlight.selected_text + '」';
  $('#annotationContent').value = '';
  $('#annotationForm').onsubmit = saveAnnotation;
  openModal('annotationModal');
}

async function saveAnnotation(e) {
  e.preventDefault();
  const content = $('#annotationContent').value.trim();
  if (!content || !state.pendingAnnotation) return;

  showLoading();
  try {
    const hl = state.pendingAnnotation;
    const { data, error } = await supabase
      .from('annotations')
      .insert({
        highlight_id: hl.id,
        book_id: state.currentBook.id,
        group_id: state.currentGroup.id,
        user_id: state.user.id,
        start_offset: hl.start_offset,
        end_offset: hl.end_offset,
        content,
      })
      .select()
      .single();

    if (error) throw error;

    state.annotations.push(data);
    renderParagraphs();
    loadAnnotations(state.currentGroup);
    closeModal('annotationModal');
    state.pendingAnnotation = null;
    toast('批注已保存！', 'success');
  } catch (err) {
    toast(err.message || '保存失败', 'error');
  } finally {
    hideLoading();
  }
}

function showAnnotationPopup(annotation, spanEl) {
  // 简单实现：在侧边栏切换到批注面板并高亮
  switchPanelTab('annotations');
  // 滚动到对应批注
  setTimeout(() => {
    const items = $$('#annotationsList .annotation-item');
    items.forEach(item => {
      if (item.dataset.id === annotation.id) {
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        item.style.background = 'var(--gold-light)';
        setTimeout(() => item.style.background = '', 2000);
      }
    });
  }, 100);
}

// ========== 实时同步 ==========
function setupRealtimeSubscriptions(group) {
  // 订阅划线变更
  const hlSub = supabase
    .channel('highlights-' + group.id)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'highlights',
      filter: `group_id=eq.${group.id}`,
    }, (payload) => {
      if (payload.eventType === 'INSERT') {
        state.highlights.push(payload.new);
        renderParagraphs();
      } else if (payload.eventType === 'DELETE') {
        state.highlights = state.highlights.filter(h => h.id !== payload.old.id);
        renderParagraphs();
      }
    })
    .subscribe();

  state.subscriptions.push(hlSub);

  // 订阅批注变更
  const annSub = supabase
    .channel('annotations-' + group.id)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'annotations',
      filter: `group_id=eq.${group.id}`,
    }, (payload) => {
      if (payload.eventType === 'INSERT') {
        state.annotations.push(payload.new);
        renderParagraphs();
        loadAnnotations(group);
      } else if (payload.eventType === 'DELETE') {
        state.annotations = state.annotations.filter(a => a.id !== payload.old.id);
        renderParagraphs();
        loadAnnotations(group);
      } else if (payload.eventType === 'UPDATE') {
        const idx = state.annotations.findIndex(a => a.id === payload.new.id);
        if (idx >= 0) state.annotations[idx] = payload.new;
        loadAnnotations(group);
      }
    })
    .subscribe();

  state.subscriptions.push(annSub);

  // 订阅阅读进度
  const progSub = supabase
    .channel('progress-' + group.id)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'reading_progress',
      filter: `group_id=eq.${group.id}`,
    }, () => {
      loadMembers(group);
    })
    .subscribe();

  state.subscriptions.push(progSub);

  // 订阅评论
  const comSub = supabase
    .channel('comments-' + group.id)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'comments',
      filter: `group_id=eq.${group.id}`,
    }, () => {
      loadComments(group);
    })
    .subscribe();

  state.subscriptions.push(comSub);
}

// ========== 阅读进度 ==========
async function reportProgress(group) {
  const container = $('#readerContent');
  if (!container) return;

  const scrollTop = container.scrollTop;
  const scrollHeight = container.scrollHeight - container.clientHeight;
  const percentage = scrollHeight > 0 ? Math.min(100, Math.round((scrollTop / scrollHeight) * 100)) : 0;

  $('#readerProgressText').textContent = percentage + '%';

  try {
    await supabase
      .from('reading_progress')
      .upsert({
        book_id: state.currentBook.id,
        group_id: group.id,
        user_id: state.user.id,
        scroll_percentage: percentage,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'book_id,group_id,user_id' });
  } catch (err) {
    // 静默失败
  }
}

let progressTimer = null;
// 使用事件委托监听阅读器滚动
document.addEventListener('scroll', (e) => {
  if (e.target.id === 'readerContent' && state.currentGroup) {
    if (progressTimer) clearTimeout(progressTimer);
    progressTimer = setTimeout(() => {
      if (state.currentGroup) reportProgress(state.currentGroup);
    }, 2000);
  }
}, true);

// ========== 右侧面板 ==========
function switchPanelTab(tab) {
  $$('.panel-tab').forEach(t => t.classList.remove('active'));
  $$('.panel-page').forEach(p => p.classList.remove('active'));
  document.querySelector(`.panel-tab[data-panel="${tab}"]`)?.classList.add('active');
  $(`#panel-${tab}`)?.classList.add('active');
}

async function loadMembers(group) {
  const container = $('#membersList');
  if (!container) return;

  const { data: members, error } = await supabase
    .from('group_members')
    .select('user_id, joined_at')
    .eq('group_id', group.id);

  if (error || !members) {
    container.innerHTML = '<p class="text-muted">暂无成员</p>';
    return;
  }

  // 获取每个成员的进度
  const { data: progress } = await supabase
    .from('reading_progress')
    .select('user_id, scroll_percentage')
    .eq('group_id', group.id)
    .eq('book_id', state.currentBook.id);

  const progressMap = {};
  if (progress) {
    progress.forEach(p => { progressMap[p.user_id] = p.scroll_percentage; });
  }

  container.innerHTML = members.map(m => {
    const isMe = m.user_id === state.user.id;
    const prog = progressMap[m.user_id] || 0;
    return `
      <div class="member-item">
        <div style="flex:1">
          <div class="member-name${isMe ? ' me' : ''}">${isMe ? '我' : '书友'} ${m.user_id.substring(0, 6)}</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${prog}%"></div>
          </div>
        </div>
        <span class="member-progress">${prog}%</span>
      </div>
    `;
  }).join('');
}

async function loadAnnotations(group) {
  const container = $('#annotationsList');
  if (!container) return;

  const { data, error } = await supabase
    .from('annotations')
    .select('*')
    .eq('group_id', group.id)
    .eq('book_id', state.currentBook.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data || data.length === 0) {
    container.innerHTML = '<p class="text-muted">暂无批注，选中文字划线后可添加批注</p>';
    return;
  }

  container.innerHTML = data.map(a => {
    const isMe = a.user_id === state.user.id;
    // 找到对应划线文本
    const hl = state.highlights.find(h => h.id === a.highlight_id);
    const quoteText = hl?.selected_text || '';

    return `
      <div class="annotation-item" data-id="${a.id}">
        ${quoteText ? `<div class="quote">「${escapeHtml(quoteText)}」</div>` : ''}
        <div class="note">${escapeHtml(a.content)}</div>
        <div class="annotation-meta">
          <span>${isMe ? '我' : '书友 ' + a.user_id.substring(0, 6)}</span>
          <span>${formatDate(a.created_at)}</span>
        </div>
      </div>
    `;
  }).join('');
}

async function loadComments(group) {
  const container = $('#commentsList');
  if (!container) return;

  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('group_id', group.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data || data.length === 0) {
    container.innerHTML = '<p class="text-muted">暂无讨论，来发起话题吧</p>';
    return;
  }

  container.innerHTML = data.map(c => {
    const isMe = c.user_id === state.user.id;
    return `
      <div class="comment-item">
        <div>${escapeHtml(c.content)}</div>
        <div class="comment-meta">
          <span>${isMe ? '我' : '书友 ' + c.user_id.substring(0, 6)}</span>
          <span>${formatDate(c.created_at)}</span>
        </div>
      </div>
    `;
  }).join('');
}

async function sendComment() {
  const input = $('#commentInput');
  const content = input.value.trim();
  if (!content || !state.currentGroup) return;

  try {
    const { error } = await supabase
      .from('comments')
      .insert({
        group_id: state.currentGroup.id,
        user_id: state.user.id,
        content,
      });

    if (error) throw error;
    input.value = '';
  } catch (err) {
    toast('发送失败', 'error');
  }
}

async function loadHighlightsAndAnnotations(group) {
  try {
    const [hlRes, annRes] = await Promise.all([
      supabase.from('highlights').select('*').eq('group_id', group.id).eq('book_id', state.currentBook.id),
      supabase.from('annotations').select('*').eq('group_id', group.id).eq('book_id', state.currentBook.id),
    ]);

    state.highlights = hlRes.data || [];
    state.annotations = annRes.data || [];
  } catch (err) {
    console.error('Load highlights error:', err);
    state.highlights = [];
    state.annotations = [];
  }
}

// ========== 弹窗控制 ==========
function openModal(id) {
  $(`#${id}`).classList.add('active');
}

function closeModal(id) {
  $(`#${id}`).classList.remove('active');
}

// ========== 辅助函数 ==========
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ========== 事件绑定 ==========
document.addEventListener('DOMContentLoaded', () => {
  // 认证
  $('#authForm').addEventListener('submit', handleAuth);
  $('#navLogout').addEventListener('click', logout);

  // 认证标签切换
  function updateAuthUI() {
    $$('.auth-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === (state.isLoginMode ? 'login' : 'register'));
    });
    $('#authSubmit').textContent = state.isLoginMode ? '登录' : '注册';
    $('#usernameGroup').style.display = state.isLoginMode ? 'none' : 'flex';
    $('#authSwitch').innerHTML = state.isLoginMode
      ? '还没有账号？<a href="#" id="authSwitchLink">去注册</a>'
      : '已有账号？<a href="#" id="authSwitchLink">去登录</a>';
  }

  $$('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.isLoginMode = tab.dataset.tab === 'login';
      updateAuthUI();
    });
  });

  // 底部切换链接（使用事件委托）
  $('#authSwitch').addEventListener('click', (e) => {
    if (e.target.id === 'authSwitchLink') {
      e.preventDefault();
      state.isLoginMode = !state.isLoginMode;
      updateAuthUI();
    }
  });

  // 上传书籍
  $('#btnUploadBook').addEventListener('click', () => { resetUploadForm(); openModal('uploadModal'); });
  $('#closeUploadModal').addEventListener('click', () => closeModal('uploadModal'));

  // 创建小组
  $('#btnCreateGroup').addEventListener('click', () => openModal('createGroupModal'));
  $('#closeCreateGroupModal').addEventListener('click', () => closeModal('createGroupModal'));
  $('#createGroupForm').addEventListener('submit', createGroup);

  // 加入小组
  $('#btnJoinGroup').addEventListener('click', () => openModal('joinGroupModal'));
  $('#closeJoinGroupModal').addEventListener('click', () => closeModal('joinGroupModal'));
  $('#joinGroupForm').addEventListener('submit', joinGroup);

  // 批注弹窗
  $('#closeAnnotationModal').addEventListener('click', () => closeModal('annotationModal'));

  // 点击弹窗背景关闭
  $$('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  });

  // 右侧面板标签切换
  $$('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => switchPanelTab(tab.dataset.panel));
  });

  // 阅读器面板切换按钮
  $('#btnTogglePanel')?.addEventListener('click', () => {
    const panel = $('#readerPanel');
    panel.classList.toggle('collapsed');
    $('#btnTogglePanel').textContent = panel.classList.contains('collapsed') ? '☰ 展开面板' : '☰ 隐藏面板';
  });

  // 发送评论
  $('#btnSendComment')?.addEventListener('click', sendComment);
  $('#commentInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendComment();
  });

  // 检查登录状态
  checkSession();
});
