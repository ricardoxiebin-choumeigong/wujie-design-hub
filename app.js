const ADMIN_AUTH_EMAIL = "admin@wujie.design";
const DEFAULT_XIAOYAZI_URL = "http://127.0.0.1:8765/";

const defaultCategories = [
  { id: "00000000-0000-4000-8000-000000000001", name: "移动端", position: 10 },
  { id: "00000000-0000-4000-8000-000000000002", name: "Web", position: 20 },
  { id: "00000000-0000-4000-8000-000000000003", name: "运营", position: 30 }
];

const defaultLinks = [
  { id: "10000000-0000-4000-8000-000000000001", name: "用户端 App · 核心流程", url: "https://www.figma.com/design/demo-user-app", category_id: defaultCategories[0].id, project: "用户产品", tags: ["首页", "下单"], position: 10 },
  { id: "10000000-0000-4000-8000-000000000002", name: "商家后台 · 数据看板", url: "https://www.figma.com/design/demo-dashboard", category_id: defaultCategories[1].id, project: "商家平台", tags: ["数据", "后台"], position: 20 },
  { id: "10000000-0000-4000-8000-000000000003", name: "订单中心 2.0", url: "https://www.figma.com/design/demo-orders", category_id: defaultCategories[1].id, project: "核心业务", tags: ["订单", "改版"], position: 30 },
  { id: "10000000-0000-4000-8000-000000000004", name: "会员成长体系", url: "https://www.figma.com/design/demo-membership", category_id: defaultCategories[0].id, project: "用户增长", tags: ["会员", "权益"], position: 40 },
  { id: "10000000-0000-4000-8000-000000000005", name: "2026 夏季营销活动", url: "https://www.figma.com/design/demo-summer", category_id: defaultCategories[2].id, project: "品牌运营", tags: ["活动页", "夏季"], position: 50 },
  { id: "10000000-0000-4000-8000-000000000006", name: "设计系统 · 基础组件", url: "https://www.figma.com/design/demo-system", category_id: defaultCategories[1].id, project: "设计系统", tags: ["组件", "规范"], position: 60 },
  { id: "10000000-0000-4000-8000-000000000007", name: "登录与账号安全", url: "https://www.figma.com/design/demo-account", category_id: defaultCategories[0].id, project: "基础体验", tags: ["登录", "安全"], position: 70 },
  { id: "10000000-0000-4000-8000-000000000008", name: "品牌素材与社媒模板", url: "https://www.figma.com/design/demo-brand", category_id: defaultCategories[2].id, project: "品牌运营", tags: ["品牌", "模板"], position: 80 }
];

const config = window.SUPABASE_CONFIG || {};
const cloud = window.supabase.createClient(config.url, config.publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

const $ = (selector) => document.querySelector(selector);
const loginView = $("#loginView");
const appView = $("#appView");
const linkList = $("#linkList");
const editDialog = $("#editDialog");
const categoryDialog = $("#categoryDialog");
const credentialsDialog = $("#credentialsDialog");
const toast = $("#toast");

const state = {
  role: "guest",
  filter: "全部",
  query: "",
  links: defaultLinks,
  categories: defaultCategories,
  adminUsername: "jiankai",
  xiaoyaziUrl: DEFAULT_XIAOYAZI_URL,
  realtimeTimer: null
};

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function categoryName(categoryId) {
  return state.categories.find((category) => category.id === categoryId)?.name || "未分类";
}

function showWorkspace() {
  loginView.hidden = true;
  appView.hidden = false;
  updateAuthUI();
  renderCategories();
  renderLinks();
}

function showLogin() {
  appView.hidden = true;
  loginView.hidden = false;
  $("#loginForm").reset();
  $("#username").focus();
  window.scrollTo(0, 0);
}

function updateAuthUI() {
  const isAdmin = state.role === "admin";
  $("#loginEntryButton").hidden = isAdmin;
  $("#adminAccount").hidden = !isAdmin;
  document.querySelectorAll(".admin-only").forEach((element) => element.hidden = !isAdmin);
}

async function loadCloudData({ silent = false } = {}) {
  const [categoriesResult, linksResult, settingsResult] = await Promise.all([
    cloud.from("categories").select("id,name,position").order("position", { ascending: true }),
    cloud.from("design_links").select("id,name,url,category_id,project,tags,position").order("position", { ascending: true }),
    cloud.from("app_settings").select("key,value")
  ]);
  const error = categoriesResult.error || linksResult.error || settingsResult.error;
  if (error) {
    if (!silent) showToast("云端数据暂时无法连接，正在显示本地预览数据");
    console.error("Supabase load failed", error);
    return false;
  }
  state.categories = categoriesResult.data || [];
  state.links = linksResult.data || [];
  const settings = Object.fromEntries((settingsResult.data || []).map((item) => [item.key, item.value]));
  state.adminUsername = settings.admin_username || "jiankai";
  state.xiaoyaziUrl = settings.xiaoyazi_url || DEFAULT_XIAOYAZI_URL;
  renderCategories();
  renderLinks();
  if (categoryDialog.open) renderCategoryManager();
  return true;
}

function scheduleCloudRefresh() {
  clearTimeout(state.realtimeTimer);
  state.realtimeTimer = setTimeout(() => loadCloudData({ silent: true }), 180);
}

function subscribeToRealtime() {
  cloud.channel("design-hub-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, scheduleCloudRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "design_links" }, scheduleCloudRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, scheduleCloudRefresh)
    .subscribe();
}

function renderCategories() {
  const names = state.categories.map((category) => category.name);
  if (state.filter !== "全部" && !names.includes(state.filter)) state.filter = "全部";
  $("#filterTabs").innerHTML = ["全部", ...names].map((name) => `
    <button class="${state.filter === name ? "active" : ""}" type="button" data-filter="${escapeHtml(name)}">${escapeHtml(name)}</button>
  `).join("");
  $("#editCategory").innerHTML = state.categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join("");
}

function renderCategoryManager() {
  $("#categoryList").innerHTML = state.categories.map((category) => {
    const count = state.links.filter((item) => item.category_id === category.id).length;
    return `
      <div class="category-row" data-id="${escapeHtml(category.id)}">
        <input class="category-name-input" value="${escapeHtml(category.name)}" maxlength="12" aria-label="分类名称 ${escapeHtml(category.name)}" />
        <span>${count} 份</span>
        <button class="icon-button rename-category" type="button" title="保存名称" aria-label="保存分类 ${escapeHtml(category.name)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
        </button>
        <button class="icon-button delete-category" type="button" title="删除分类" aria-label="删除分类 ${escapeHtml(category.name)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6" /></svg>
        </button>
      </div>`;
  }).join("");
}

function renderLinks() {
  const query = state.query.toLowerCase();
  const links = state.links.filter((item) => {
    const category = categoryName(item.category_id);
    const matchesFilter = state.filter === "全部" || category === state.filter;
    const haystack = [item.name, item.url, item.project, category, ...(item.tags || [])].join(" ").toLowerCase();
    return matchesFilter && haystack.includes(query);
  });

  linkList.innerHTML = links.map((item) => {
    const category = categoryName(item.category_id);
    return `
      <article class="link-row" data-id="${escapeHtml(item.id)}">
        <div class="design-name">
          <strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.project)} · ${escapeHtml((item.tags || []).join(" / "))}</span>
        </div>
        <div class="figma-link">
          <img class="figma-icon" src="./assets/logo.png" alt="" />
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer" title="打开 ${escapeHtml(item.name)}">${escapeHtml(item.url)}</a>
        </div>
        <span class="category-badge" data-category="${escapeHtml(category)}">${escapeHtml(category)}</span>
        <div class="row-actions">
          ${state.role === "admin" ? `<button class="icon-button edit-link" type="button" title="编辑" aria-label="编辑 ${escapeHtml(item.name)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg>
          </button>` : ""}
          <button class="icon-button copy-link" type="button" title="复制链接" aria-label="复制 ${escapeHtml(item.name)} 的链接">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" /></svg>
          </button>
        </div>
      </article>`;
  }).join("");
  $("#emptyState").hidden = links.length !== 0;
}

async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    showToast("链接已复制");
  } catch {
    const input = document.createElement("textarea");
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
    showToast("链接已复制");
  }
}

function openEditor(item = null) {
  renderCategories();
  $("#dialogTitle").textContent = item ? "编辑设计稿" : "新增设计稿";
  $("#editId").value = item?.id || "";
  $("#editName").value = item?.name || "";
  $("#editUrl").value = item?.url || "";
  $("#editCategory").value = item?.category_id || state.categories[0]?.id || "";
  $("#editProject").value = item?.project || "";
  $("#editTags").value = item?.tags?.join(", ") || "";
  editDialog.showModal();
  $("#editName").focus();
}

$("#loginEntryButton").addEventListener("click", showLogin);
document.querySelectorAll(".return-workspace").forEach((button) => button.addEventListener("click", (event) => {
  event.preventDefault();
  showWorkspace();
}));

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const username = String(form.get("username")).trim();
  const password = String(form.get("password"));
  if (username !== state.adminUsername) {
    showToast("管理员账号或密码错误");
    return;
  }
  const { data, error } = await cloud.auth.signInWithPassword({ email: ADMIN_AUTH_EMAIL, password });
  if (error || data.user?.email !== ADMIN_AUTH_EMAIL) {
    showToast("管理员账号或密码错误");
    $("#password").focus();
    return;
  }
  state.role = "admin";
  showWorkspace();
  showToast("已进入管理员模式");
});

$("#togglePassword").addEventListener("click", () => {
  const input = $("#password");
  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  $("#togglePassword").setAttribute("aria-label", isPassword ? "隐藏密码" : "显示密码");
  $("#togglePassword").setAttribute("title", isPassword ? "隐藏密码" : "显示密码");
});

$("#logoutButton").addEventListener("click", async () => {
  await cloud.auth.signOut();
  state.role = "guest";
  showWorkspace();
  showToast("已退出管理员模式");
});

$("#searchInput").addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  renderLinks();
});

$("#filterTabs").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;
  state.filter = button.dataset.filter;
  renderCategories();
  renderLinks();
});

linkList.addEventListener("click", (event) => {
  const row = event.target.closest(".link-row");
  if (!row) return;
  const item = state.links.find((link) => link.id === row.dataset.id);
  if (event.target.closest(".copy-link")) copyLink(item.url);
  if (event.target.closest(".edit-link")) openEditor(item);
});

$("#addLinkButton").addEventListener("click", () => openEditor());
$("#closeDialogButton").addEventListener("click", () => editDialog.close());
$("#cancelDialogButton").addEventListener("click", () => editDialog.close());
editDialog.addEventListener("click", (event) => { if (event.target === editDialog) editDialog.close(); });

$("#editForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const rawUrl = $("#editUrl").value.trim();
  try {
    const protocol = new URL(rawUrl).protocol;
    if (!["http:", "https:"].includes(protocol)) throw new Error();
  } catch {
    showToast("请输入有效的 http 或 https 链接");
    return $("#editUrl").focus();
  }
  const id = $("#editId").value;
  const payload = {
    name: $("#editName").value.trim(),
    url: rawUrl,
    category_id: $("#editCategory").value || null,
    project: $("#editProject").value.trim(),
    tags: $("#editTags").value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean)
  };
  let result;
  if (id) {
    result = await cloud.from("design_links").update(payload).eq("id", id);
  } else {
    payload.position = Math.max(0, ...state.links.map((item) => item.position || 0)) + 10;
    result = await cloud.from("design_links").insert(payload);
  }
  if (result.error) return showToast("保存失败，请重新登录后再试");
  editDialog.close();
  await loadCloudData({ silent: true });
  showToast(id ? "设计稿已更新，团队页面将实时同步" : "设计稿已添加，团队页面将实时同步");
});

$("#manageCategoriesButton").addEventListener("click", () => {
  renderCategoryManager();
  $("#newCategoryName").value = "";
  categoryDialog.showModal();
});
$("#closeCategoryButton").addEventListener("click", () => categoryDialog.close());
categoryDialog.addEventListener("click", (event) => { if (event.target === categoryDialog) categoryDialog.close(); });

$("#categoryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("#newCategoryName").value.trim();
  if (!name) return;
  if (state.categories.some((category) => category.name === name) || name === "全部") return showToast("该分类名称已存在");
  const position = Math.max(0, ...state.categories.map((item) => item.position || 0)) + 10;
  const { error } = await cloud.from("categories").insert({ name, position });
  if (error) return showToast("分类新增失败，请稍后重试");
  $("#newCategoryName").value = "";
  await loadCloudData({ silent: true });
  showToast("分类已新增，团队页面将实时同步");
});

$("#categoryList").addEventListener("click", async (event) => {
  const row = event.target.closest(".category-row");
  if (!row) return;
  const category = state.categories.find((item) => item.id === row.dataset.id);
  if (!category) return;

  if (event.target.closest(".rename-category")) {
    const nextName = row.querySelector(".category-name-input").value.trim();
    if (!nextName || nextName === "全部") return showToast("请输入有效的分类名称");
    if (nextName !== category.name && state.categories.some((item) => item.name === nextName)) return showToast("该分类名称已存在");
    const { error } = await cloud.from("categories").update({ name: nextName }).eq("id", category.id);
    if (error) return showToast("分类名称更新失败");
    if (state.filter === category.name) state.filter = nextName;
    await loadCloudData({ silent: true });
    showToast("分类名称已更新，团队页面将实时同步");
  }

  if (event.target.closest(".delete-category")) {
    if (state.categories.length === 1) return showToast("至少需要保留一个分类");
    const usedCount = state.links.filter((item) => item.category_id === category.id).length;
    if (usedCount && !window.confirm(`该分类下有 ${usedCount} 份设计稿，删除后将自动归入“未分类”。确定删除吗？`)) return;
    if (usedCount) {
      let uncategorized = state.categories.find((item) => item.name === "未分类");
      if (!uncategorized) {
        const position = Math.max(0, ...state.categories.map((item) => item.position || 0)) + 10;
        const created = await cloud.from("categories").insert({ name: "未分类", position }).select("id,name,position").single();
        if (created.error) return showToast("创建“未分类”失败，未删除原分类");
        uncategorized = created.data;
      }
      const moved = await cloud.from("design_links").update({ category_id: uncategorized.id }).eq("category_id", category.id);
      if (moved.error) return showToast("设计稿归类失败，未删除原分类");
    }
    const deleted = await cloud.from("categories").delete().eq("id", category.id);
    if (deleted.error) return showToast("分类删除失败");
    if (state.filter === category.name) state.filter = "全部";
    await loadCloudData({ silent: true });
    showToast("分类已删除，团队页面将实时同步");
  }
});

$("#credentialsButton").addEventListener("click", () => {
  $("#credentialsForm").reset();
  $("#newUsername").value = state.adminUsername;
  credentialsDialog.showModal();
  $("#currentPassword").focus();
});
$("#closeCredentialsButton").addEventListener("click", () => credentialsDialog.close());
$("#cancelCredentialsButton").addEventListener("click", () => credentialsDialog.close());
credentialsDialog.addEventListener("click", (event) => { if (event.target === credentialsDialog) credentialsDialog.close(); });

$("#credentialsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  if ($("#newPassword").value !== $("#confirmPassword").value) return showToast("两次输入的新密码不一致");
  const verified = await cloud.auth.signInWithPassword({ email: ADMIN_AUTH_EMAIL, password: $("#currentPassword").value });
  if (verified.error) return showToast("当前密码不正确");
  const passwordResult = await cloud.auth.updateUser({ password: $("#newPassword").value });
  if (passwordResult.error) return showToast("密码修改失败，请稍后重试");
  const usernameResult = await cloud.from("app_settings").upsert({ key: "admin_username", value: $("#newUsername").value.trim() });
  if (usernameResult.error) return showToast("账号名称修改失败");
  await cloud.auth.signOut();
  state.role = "guest";
  credentialsDialog.close();
  await loadCloudData({ silent: true });
  showWorkspace();
  showToast("账号密码已修改，请使用新信息重新登录");
});

function openXiaoyazi() {
  if (!state.xiaoyaziUrl) return showToast("小压子地址待配置");
  window.open(state.xiaoyaziUrl, "_blank", "noopener,noreferrer");
}

const designNavLink = $("#designNavLink");
const toolNavButton = $("#toolNavButton");

function setActiveNav(section) {
  const designsActive = section === "designs";
  designNavLink.classList.toggle("active", designsActive);
  toolNavButton.classList.toggle("active", !designsActive);

  if (designsActive) {
    designNavLink.setAttribute("aria-current", "page");
    toolNavButton.removeAttribute("aria-current");
  } else {
    toolNavButton.setAttribute("aria-current", "page");
    designNavLink.removeAttribute("aria-current");
  }
}

$("#xiaoyaziButton").addEventListener("click", openXiaoyazi);
designNavLink.addEventListener("click", () => setActiveNav("designs"));
toolNavButton.addEventListener("click", () => {
  setActiveNav("tools");
  $("#tools").scrollIntoView({ behavior: "smooth" });
});

const navSectionObserver = new IntersectionObserver((entries) => {
  const visibleSection = entries
    .filter((entry) => entry.isIntersecting)
    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (visibleSection) setActiveNav(visibleSection.target.id);
}, {
  rootMargin: "-68px 0px -45% 0px",
  threshold: [0, 0.25, 0.5]
});

navSectionObserver.observe($("#designs"));
navSectionObserver.observe($("#tools"));

async function initializeApp() {
  showWorkspace();
  const { data } = await cloud.auth.getSession();
  state.role = data.session?.user?.email === ADMIN_AUTH_EMAIL ? "admin" : "guest";
  updateAuthUI();
  await loadCloudData();
  subscribeToRealtime();
}

cloud.auth.onAuthStateChange((_event, session) => {
  state.role = session?.user?.email === ADMIN_AUTH_EMAIL ? "admin" : "guest";
  updateAuthUI();
  renderLinks();
});

window.addEventListener("online", () => loadCloudData({ silent: true }));
initializeApp();
