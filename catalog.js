// dsh-alist — AList v3 端点目录表 + 纯函数（零依赖，可被 node:test 直接单测）。
// 端点以 AList v3.64.0 (server/router.go) 为准。
// AList 的响应统一为 { code, message, data }，方法几乎全是 POST，
// 因此「是否写操作」必须由目录表显式声明，不能按 HTTP 方法推导。

export const TASK_TYPES = [
  "upload",
  "copy",
  "offline_download",
  "offline_download_transfer",
  "decompress",
  "decompress_upload",
];

export const TASK_STATES = ["undone", "done", "info"];

export const TASK_ACTIONS = [
  "retry",
  "cancel",
  "delete",
  "clear_done",
  "clear_succeeded",
  "retry_failed",
  "delete_some",
  "cancel_some",
  "retry_some",
];

export const SENSITIVE_KEY =
  /(password|secret|token|passwd|privkey|private_key|private-key|ssh-keys|keyfile|otp_code)/i;

// ---------------------------------------------------------------- helpers

export function normalizeBaseUrl(input) {
  const value = String(input ?? "").trim();
  if (!value)
    throw new Error("AList base URL is not configured. Set it in Settings → Plugins.");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("AList base URL must be an absolute HTTP(S) URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("AList base URL must be an absolute HTTP(S) URL (https:// or http://).");
  if (url.username || url.password)
    throw new Error("AList base URL must not contain embedded credentials.");
  if (url.search || url.hash)
    throw new Error("AList base URL must not contain a query string or fragment.");
  return url.toString().replace(/\/+$/, "");
}

export function apiUrl(baseUrl, path) {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

// 递归脱敏：命中敏感键的值替换为 [REDACTED]。
export function sanitize(value, key) {
  if (typeof key === "string" && SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value)) out[k] = sanitize(value[k], k);
    return out;
  }
  return value;
}

// 把 args 拆成「路径占位符」「query 参数」「body 参数」。
// - 路径占位符 {xxx} 必填
// - GET 请求：全部剩余参数进 query
// - 非 GET：def.query 列出的进 query，其余进 JSON body
export function resolveArgs(def, args = {}) {
  const input = { ...(args ?? {}) };
  const pathParams = [...def.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

  let path = def.path;
  for (const key of pathParams) {
    const value = input[key];
    if (value === undefined || value === null || String(value) === "")
      throw new Error(`Required parameter "${key}" is missing.`);
    path = path.replace(`{${key}}`, encodeURIComponent(String(value)));
    delete input[key];
  }

  const query = {};
  const body = {};
  const forceQuery = def.method === "GET" ? Object.keys(input) : def.query ?? [];
  for (const key of forceQuery) {
    if (Object.hasOwn(input, key) && input[key] !== undefined) {
      query[key] = input[key];
      delete input[key];
    }
  }
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    body[key] = value;
  }

  // 必填校验：路径占位符、query、body 三处都没有就算缺失。
  for (const [key, param] of Object.entries(def.params ?? {})) {
    if (param?.required !== true) continue;
    if (pathParams.includes(key) || Object.hasOwn(query, key) || Object.hasOwn(body, key)) continue;
    throw new Error(`Required parameter "${key}" is missing.`);
  }
  return { path, query, body };
}

// 大目录裁剪字段，避免把 sign / thumb / hashinfo 之类的数据灌进上下文。
function trimContent(items, fields) {
  if (!Array.isArray(items)) return items;
  return items.map((item) => {
    if (!item || typeof item !== "object") return item;
    const out = {};
    for (const f of fields) if (Object.hasOwn(item, f)) out[f] = item[f];
    return out;
  });
}

export function formatResult(data, def) {
  if (data === null || data === undefined) return "OK (no content)";
  if (typeof data === "string") return data;
  if (def?.trim && data && typeof data === "object" && Array.isArray(data.content)) {
    const trimmed = { ...data, content: trimContent(data.content, def.trim) };
    return JSON.stringify(sanitize(trimmed), null, 2);
  }
  return JSON.stringify(sanitize(data), null, 2);
}

export function errorDetail(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && typeof parsed.message === "string")
      return parsed.message.replace(/[\r\n\t]+/g, " ").slice(0, 400);
  } catch {
    // 回退为长度受限的单行描述。
  }
  return String(text).replace(/[\r\n\t]+/g, " ").slice(0, 400) || "no error details";
}

// ---------------------------------------------------------------- 参数强转

// AList 的多数写端点要的是数组（names / urls），而工具参数在 schema 里是字符串，
// 因此统一在这里做「模型友好 → API 友好」的转换。
export function toArrayValue(value, key) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string")
    throw new Error(`Parameter "${key}" must be an array, or a JSON array / comma-separated string.`);
  const trimmed = value.trim();
  if (trimmed === "") throw new Error(`Parameter "${key}" must not be empty.`);
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) throw new Error("not an array");
      return parsed;
    } catch {
      throw new Error(`Parameter "${key}" is not a valid JSON array.`);
    }
  }
  return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
}

export function toStructuredValue(value, key) {
  if (value !== null && typeof value === "object") return value;
  if (typeof value !== "string")
    throw new Error(`Parameter "${key}" must be a JSON object string.`);
  try {
    const parsed = JSON.parse(value.trim());
    if (parsed === null || typeof parsed !== "object") throw new Error("not an object");
    return parsed;
  } catch {
    throw new Error(
      `Parameter "${key}" must be a valid JSON object string, e.g. {"mount_path":"/x","driver":"Local"}.`,
    );
  }
}

// 把 resolveArgs 得到的原始 body 转成 AList 真正要的形态：
// - arrayParams: 字符串 → 数组
// - jsonParams: JSON 字符串 → 对象/数组
// - bodyFrom: 某个参数解析后**整体上作为**请求体（如 storage / settings / message）
export function buildBody(def, rawBody = {}) {
  const body = { ...rawBody };
  if (def.bodyFrom) {
    const key = def.bodyFrom;
    if (body[key] === undefined) throw new Error(`Parameter "${key}" is required.`);
    const parsed = toStructuredValue(body[key], key);
    if (Array.isArray(parsed))
      throw new Error(`Parameter "${key}" must be a JSON object, not an array.`);
    return parsed;
  }
  for (const key of def.arrayParams ?? [])
    if (body[key] !== undefined) body[key] = toArrayValue(body[key], key);
  for (const key of def.jsonParams ?? [])
    if (body[key] !== undefined) body[key] = toStructuredValue(body[key], key);
  return body;
}

// AList 路径没有盘符、没有相对路径，一律以挂载点开头的绝对路径。
const DIRECTORY_KEYS = new Set(["path", "src_dir", "dst_dir", "dir", "parent"]);

export function validatePathArgs(def, args) {
  for (const key of DIRECTORY_KEYS) {
    if (!def.params?.[key]) continue;
    const value = args?.[key];
    if (typeof value !== "string" || value === "") continue;
    if (!value.startsWith("/"))
      throw new Error(
        `Parameter "${key}" must be an absolute AList path starting with "/" and a mount point (got ${JSON.stringify(value)}). Use alist_fs_list on "/" first to discover mount points.`,
      );
  }
}

// 工具执行入口统一走这里：绝对路径校验 → 解析路径/query → body 强转。
export function prepare(def, args) {
  validatePathArgs(def, args ?? {});
  const { path, query, body } = resolveArgs(def, args ?? {});
  return { path, query, body: buildBody(def, body) };
}

// ---------------------------------------------------------------- 参数片段

const PATH = (desc = "AList path, starting with a mount point, e.g. /local or /aliyun/foo.") => ({
  path: { type: "string", required: true, description: desc },
});
const PASSWORD = {
  password: {
    type: "string",
    description: "Password of a password-protected directory, if required.",
  },
};
const PAGE = {
  page: { type: "number", description: "Page number (>=1, normalized server-side)." },
  per_page: { type: "number", description: "Page size (1-500, default 200)." },
  refresh: { type: "boolean", description: "Force refresh the upstream listing cache." },
};
const SRC_DIR = {
  src_dir: { type: "string", required: true, description: "Source directory." },
};
const DST_DIR = {
  dst_dir: { type: "string", required: true, description: "Destination directory." },
};
// names / urls 用字符串承载（兼容所有 schema 实现），由 buildBody 转成数组。
const NAMES = {
  names: {
    type: "string",
    required: true,
    description:
      'File/directory names to operate on. JSON array or comma-separated, e.g. ["a.mp4","b"] or a.mp4,b.',
  },
};
const ID = {
  id: { type: "number", required: true, description: "Numeric id (storage / user / role / meta / setting)." },
};
const TASK_TYPE = {
  type: {
    type: "string",
    required: true,
    enum: TASK_TYPES,
    description: `Task type. One of: ${TASK_TYPES.join(", ")}.`,
  },
};
// JSON 字符串参数：由 buildBody / jsonParams / bodyFrom 解析成真正的对象。
const JSON_OBJECT = (name, desc, required = true) => ({
  [name]: {
    type: "string",
    ...(required ? { required: true } : {}),
    description: required ? `${desc} Pass it as a JSON string.` : `Optional. ${desc} Pass it as a JSON string.`,
  },
});

// def(name, method, path, description, params, opts)
// opts: { write, admin, query, trim, arrayParams, jsonParams, bodyFrom }
//   arrayParams — 字符串转数组（names / urls）
//   jsonParams  — JSON 字符串转对象（rename_objects / write / permissions）
//   bodyFrom    — 该参数解析后整体作为请求体（storage / settings / message）
function def(name, method, path, description, params = {}, opts = {}) {
  return {
    name,
    method,
    path,
    description,
    params,
    write: opts.write === true,
    admin: opts.admin === true,
    query: opts.query ?? [],
    trim: opts.trim,
    arrayParams: opts.arrayParams ?? [],
    jsonParams: opts.jsonParams ?? [],
    bodyFrom: opts.bodyFrom,
  };
}

const LIST_TRIM = ["name", "size", "is_dir", "modified", "type"];

// ---------------------------------------------------------------- 目录表

export const CATALOG = [
  // ---- 连接与身份（只读）----
  def(
    "alist_me",
    "GET",
    "/api/me",
    "Get the current AList user: id, username, base_path, role, permission and per-path permissions. Use this first to verify connectivity and whether the token is an admin. Read-only.",
  ),
  def(
    "alist_public_settings",
    "GET",
    "/api/public/settings",
    "Get public site settings (site title, version, enabled features). No authentication required. Read-only.",
  ),
  def(
    "alist_public_offline_tools",
    "GET",
    "/api/public/offline_download_tools",
    "List the offline-download tools available on this AList instance (aria2 / SimpleHttp / qBittorrent / transmission). Read-only.",
  ),

  // ---- 文件浏览（只读）----
  def(
    "alist_fs_list",
    "POST",
    "/api/fs/list",
    "List a directory. Returns content[], total, has_more and the provider. Read-only.",
    { ...PATH(), ...PASSWORD, ...PAGE },
    { trim: LIST_TRIM },
  ),
  def(
    "alist_fs_get",
    "POST",
    "/api/fs/get",
    "Get metadata of one file or directory, including size, modified, provider and raw_url. Read-only.",
    { ...PATH(), ...PASSWORD },
  ),
  def(
    "alist_fs_dirs",
    "POST",
    "/api/fs/dirs",
    "List only the sub-directories of a path (faster than a full listing). Read-only.",
    { ...PATH(), ...PASSWORD, force_root: { type: "boolean", description: "Force listing from the root." } },
  ),
  def(
    "alist_fs_search",
    "POST",
    "/api/fs/search",
    "Search files/directories by keyword under a parent path. Read-only.",
    {
      parent: { type: "string", required: true, description: "Directory to search under." },
      keywords: { type: "string", required: true, description: "Search keyword." },
      scope: { type: "number", enum: [0, 1, 2], description: "0=all, 1=folder, 2=file (default 0)." },
      page: { type: "number", description: "Page number." },
      per_page: { type: "number", description: "Page size (1-500)." },
      ...PASSWORD,
    },
    { trim: ["parent", "name", "is_dir", "size", "type"] },
  ),
  def(
    "alist_fs_archive_meta",
    "POST",
    "/api/fs/archive/meta",
    "Inspect an archive file (zip/tar/...) and return its internal tree without extracting it. Read-only.",
    { ...PATH("Path of the archive file."), ...PASSWORD, archive_pass: { type: "string", description: "Archive password, if encrypted." } },
  ),
  def(
    "alist_fs_archive_list",
    "POST",
    "/api/fs/archive/list",
    "List the contents of a directory inside an archive. Read-only.",
    {
      ...PATH("Path inside the archive, e.g. /a.zip/folder."),
      ...PASSWORD,
      archive_pass: { type: "string", description: "Archive password, if encrypted." },
      ...PAGE,
    },
    { trim: LIST_TRIM },
  ),
  def(
    "alist_fs_link",
    "POST",
    "/api/fs/link",
    "Get a direct (signed) download link for a file. REQUIRES AN ADMIN TOKEN on AList v3. Read-only but admin-gated.",
    { ...PATH(), ...PASSWORD },
    { admin: true },
  ),

  // ---- 文件写操作 ----
  def(
    "alist_fs_mkdir",
    "POST",
    "/api/fs/mkdir",
    "Create a directory. WRITE OPERATION: triggers a mandatory approval prompt.",
    { ...PATH("Full path of the directory to create.") },
    { write: true },
  ),
  def(
    "alist_fs_rename",
    "POST",
    "/api/fs/rename",
    "Rename one file or directory (the new name must not contain '/'). WRITE OPERATION.",
    { ...PATH("Current full path."), name: { type: "string", required: true, description: "New name (no '/')." } },
    { write: true },
  ),
  def(
    "alist_fs_batch_rename",
    "POST",
    "/api/fs/batch_rename",
    "Rename many files at once. WRITE OPERATION.",
    {
      ...SRC_DIR,
      rename_objects: {
        type: "string",
        required: true,
        description: 'JSON array of {src_name, new_name}, e.g. [{"src_name":"a.txt","new_name":"b.txt"}].',
      },
    },
    { write: true, jsonParams: ["rename_objects"] },
  ),
  def(
    "alist_fs_regex_rename",
    "POST",
    "/api/fs/regex_rename",
    "Rename by regular expression. High blast radius — verify the regex first. WRITE OPERATION.",
    {
      ...SRC_DIR,
      src_name_regex: { type: "string", required: true, description: "Regex matched against source names." },
      new_name_regex: { type: "string", required: true, description: "Regex producing the new names." },
    },
    { write: true },
  ),
  def(
    "alist_fs_move",
    "POST",
    "/api/fs/move",
    "Move files/directories within or across storages. WRITE OPERATION.",
    { ...SRC_DIR, ...DST_DIR, ...NAMES },
    { write: true, arrayParams: ["names"] },
  ),
  def(
    "alist_fs_recursive_move",
    "POST",
    "/api/fs/recursive_move",
    "Aggregated move: move all files from src_dir into dst_dir, polling automatically. WRITE OPERATION.",
    { ...SRC_DIR, ...DST_DIR },
    { write: true },
  ),
  def(
    "alist_fs_copy",
    "POST",
    "/api/fs/copy",
    "Copy files/directories. Returns a copy task; poll it with alist_task_list (type=copy). WRITE OPERATION.",
    { ...SRC_DIR, ...DST_DIR, ...NAMES },
    { write: true, arrayParams: ["names"] },
  ),
  def(
    "alist_fs_remove",
    "POST",
    "/api/fs/remove",
    "PERMANENTLY delete files/directories. There is no recycle bin. WRITE OPERATION — maximum care required.",
    { dir: { type: "string", required: true, description: "Directory that contains the names." }, ...NAMES },
    { write: true, arrayParams: ["names"] },
  ),
  def(
    "alist_fs_remove_empty_directory",
    "POST",
    "/api/fs/remove_empty_directory",
    "Delete an empty directory only (fails if it still has content). WRITE OPERATION.",
    { ...SRC_DIR },
    { write: true },
  ),
  def(
    "alist_fs_add_offline_download",
    "POST",
    "/api/fs/add_offline_download",
    "Ask AList to download URLs into a path using aria2 / SimpleHttp / qBittorrent. WRITE OPERATION.",
    {
      path: { type: "string", required: true, description: "Destination directory on AList." },
      urls: {
        type: "string",
        required: true,
        description: 'URLs to download. JSON array or comma-separated, e.g. ["https://a/b.zip"].',
      },
      tool: { type: "string", description: "Tool: SimpleHttp, aria2 or qBittorrent (default SimpleHttp)." },
      delete_policy: {
        type: "string",
        enum: ["delete_on_upload_succeed", "delete_on_upload_failed", "delete_never", "delete_always"],
        description: "Seed/temp file deletion policy.",
      },
    },
    { write: true, arrayParams: ["urls"] },
  ),
  def(
    "alist_fs_archive_decompress",
    "POST",
    "/api/fs/archive/decompress",
    "Extract an archive to a destination path. WRITE OPERATION.",
    {
      ...PATH("Path of the archive file."),
      dst_dir: { type: "string", description: "Destination directory (defaults to the archive's own directory)." },
      archive_pass: { type: "string", description: "Archive password, if encrypted." },
      inner_path: { type: "string", description: "Only extract this inner path." },
      ...PASSWORD,
    },
    { write: true },
  ),

  // ---- 任务 ----
  def(
    "alist_task_list",
    "GET",
    "/api/task/{type}/{state}",
    "List AList tasks. state=undone (running), done (finished) or info (one task, requires tid). Read-only.",
    {
      ...TASK_TYPE,
      state: { type: "string", required: true, enum: TASK_STATES, description: "Which task set to read: undone (running), done (finished) or info (a single task)." },
      tid: { type: "string", description: "Task id — required when state=info." },
    },
  ),
  def(
    "alist_task_action",
    "POST",
    "/api/task/{type}/{action}",
    "Control tasks: retry / cancel / delete one task (tid), or clear_done / clear_succeeded / retry_failed (bulk), or delete_some / cancel_some / retry_some with a JSON array body. WRITE OPERATION.",
    {
      ...TASK_TYPE,
      action: {
        type: "string",
        required: true,
        enum: TASK_ACTIONS,
        description: "Action: retry/cancel/delete one task (needs tid), clear_done/clear_succeeded/retry_failed (bulk), or *_some (needs tids).",
      },
      tid: { type: "string", description: "Task id — required for retry / cancel / delete." },
      tids: { type: "string", description: 'JSON array of task ids — required for *_some actions, e.g. ["id1","id2"].' },
    },
    { write: true },
  ),

  // ---- 存储管理（admin）----
  def(
    "alist_admin_storage_list",
    "GET",
    "/api/admin/storage/list",
    "List all storages mounted in AList. Admin. Read-only.",
    {},
    { admin: true, trim: ["id", "mount_path", "driver", "order", "status", "disabled", "remark"] },
  ),
  def("alist_admin_storage_get", "GET", "/api/admin/storage/get", "Get one storage by id. Admin. Read-only.", { ...ID }, { admin: true, query: ["id"] }),
  def(
    "alist_admin_storage_create",
    "POST",
    "/api/admin/storage/create",
    "Mount a new storage. Use alist_admin_driver_list first to get the driver name and its fields. Admin. WRITE OPERATION.",
    {
      ...JSON_OBJECT(
        "storage",
        'Storage object (sent as the whole request body), e.g. {"mount_path":"/local","driver":"Local","order":0,"cache_expiration":30,"status":"work","addition":"{\\"root_folder_path\\":\\"/data\\"}"}. Get the field names and defaults from alist_admin_driver_info first.',
      ),
    },
    { write: true, admin: true, bodyFrom: "storage" },
  ),
  def(
    "alist_admin_storage_update",
    "POST",
    "/api/admin/storage/update",
    "Update an existing storage. Admin. WRITE OPERATION.",
    { ...JSON_OBJECT("storage", "Full storage object including its id (sent as the whole request body).") },
    { write: true, admin: true, bodyFrom: "storage" },
  ),
  def(
    "alist_admin_storage_delete",
    "POST",
    "/api/admin/storage/delete",
    "Delete a storage (unmount). Admin. WRITE OPERATION.",
    { ...ID },
    { write: true, admin: true },
  ),
  def("alist_admin_storage_enable", "POST", "/api/admin/storage/enable", "Enable a storage. Admin. WRITE OPERATION.", { ...ID }, { write: true, admin: true }),
  def("alist_admin_storage_disable", "POST", "/api/admin/storage/disable", "Disable a storage. Admin. WRITE OPERATION.", { ...ID }, { write: true, admin: true }),
  def(
    "alist_admin_storage_load_all",
    "POST",
    "/api/admin/storage/load_all",
    "Reload all storages (re-reads configuration, does not change data). Admin. WRITE OPERATION.",
    {},
    { write: true, admin: true },
  ),

  // ---- 驱动（admin，只读）----
  def("alist_admin_driver_list", "GET", "/api/admin/driver/list", "List all available drivers with their config fields. Admin. Read-only.", {}, { admin: true }),
  def("alist_admin_driver_names", "GET", "/api/admin/driver/names", "List driver names only. Admin. Read-only.", {}, { admin: true }),
  def(
    "alist_admin_driver_info",
    "GET",
    "/api/admin/driver/info",
    "Get the config schema of one driver. Admin. Read-only.",
    { driver: { type: "string", required: true, description: "Driver name, e.g. Local, AliyunDrive." } },
    { admin: true, query: ["driver"] },
  ),

  // ---- 用户（admin）----
  def(
    "alist_admin_user_list",
    "GET",
    "/api/admin/user/list",
    "List AList users. Admin. Read-only. Passwords are never returned.",
    {},
    { admin: true, trim: ["id", "username", "base_path", "role", "disabled", "permission"] },
  ),
  def("alist_admin_user_get", "GET", "/api/admin/user/get", "Get one user by id. Admin. Read-only.", { ...ID }, { admin: true, query: ["id"] }),
  def(
    "alist_admin_user_create",
    "POST",
    "/api/admin/user/create",
    "Create a user. Admin. WRITE OPERATION.",
    {
      username: { type: "string", required: true, description: "Login name of the new user." },
      password: { type: "string", required: true, description: "Plain password (redacted in logs and approval prompts)." },
      base_path: { type: "string", description: "Root path the user can see, e.g. /local." },
      role: { type: "number", description: "Role id (from alist_admin_role_list). 0=general, 1=guest, 2=admin." },
      permission: { type: "number", description: "Permission bitmask, e.g. 65535." },
      disabled: { type: "boolean", description: "Create the user in a disabled state." },
      ...JSON_OBJECT("permissions", 'Optional per-path permissions array, e.g. [{"path":"/local","permission":65535}].', false),
    },
    { write: true, admin: true, jsonParams: ["permissions"] },
  ),
  def(
    "alist_admin_user_update",
    "POST",
    "/api/admin/user/update",
    "Update a user. Admin. WRITE OPERATION.",
    {
      id: { type: "number", required: true, description: "User id to update." },
      username: { type: "string", description: "New login name (omit to keep the current one)." },
      password: { type: "string", description: "New password (redacted everywhere). Omit to keep the current one." },
      base_path: { type: "string", description: "Root path the user can see, e.g. /local." },
      role: { type: "number", description: "Role id (0=general, 1=guest, 2=admin)." },
      permission: { type: "number", description: "Permission bitmask, e.g. 65535." },
      disabled: { type: "boolean", description: "Disable or re-enable the user." },
      sso_id: { type: "string", description: "SSO subject id, if single sign-on is used." },
    },
    { write: true, admin: true },
  ),
  def("alist_admin_user_delete", "POST", "/api/admin/user/delete", "Delete a user. Admin. WRITE OPERATION.", { ...ID }, { write: true, admin: true }),
  def("alist_admin_user_cancel_2fa", "POST", "/api/admin/user/cancel_2fa", "Cancel two-factor auth for a user. Admin. WRITE OPERATION.", { ...ID }, { write: true, admin: true }),
  def("alist_admin_user_del_cache", "POST", "/api/admin/user/del_cache", "Clear cached credentials of a user's storages. Admin. WRITE OPERATION.", { ...ID }, { write: true, admin: true }),

  // ---- 角色（admin）----
  def(
    "alist_admin_role_list",
    "GET",
    "/api/admin/role/list",
    "List roles. Admin. Read-only.",
    {},
    { admin: true, trim: ["id", "name", "permission"] },
  ),
  def("alist_admin_role_get", "GET", "/api/admin/role/get", "Get one role by id. Admin. Read-only.", { ...ID }, { admin: true, query: ["id"] }),
  def(
    "alist_admin_role_create",
    "POST",
    "/api/admin/role/create",
    "Create a role. Admin. WRITE OPERATION.",
    {
      name: { type: "string", required: true, description: "Role name, e.g. admin or guest." },
      permission: { type: "number", description: "Permission bitmask, e.g. 65535 for full access." },
    },
    { write: true, admin: true },
  ),
  def(
    "alist_admin_role_update",
    "POST",
    "/api/admin/role/update",
    "Update a role. Admin. WRITE OPERATION.",
    {
      id: { type: "number", required: true, description: "Role id to update." },
      name: { type: "string", description: "New role name." },
      permission: { type: "number", description: "New permission bitmask." },
    },
    { write: true, admin: true },
  ),
  def("alist_admin_role_delete", "POST", "/api/admin/role/delete", "Delete a role. Admin. WRITE OPERATION.", { ...ID }, { write: true, admin: true }),

  // ---- 元数据 meta（admin）----
  def(
    "alist_admin_meta_list",
    "GET",
    "/api/admin/meta/list",
    "List metadata (path password / hide / readme rules). Admin. Read-only. Passwords are redacted.",
    {},
    { admin: true, trim: ["id", "path", "hide", "readme"] },
  ),
  def("alist_admin_meta_get", "GET", "/api/admin/meta/get", "Get metadata by id. Admin. Read-only.", { ...ID }, { admin: true, query: ["id"] }),
  def(
    "alist_admin_meta_create",
    "POST",
    "/api/admin/meta/create",
    "Create a metadata rule (path password, hide, readme, upload switch). Admin. WRITE OPERATION.",
    {
      path: { type: "string", required: true, description: "Directory this rule applies to, e.g. /local/private." },
      password: { type: "string", description: "Password required to open the directory (redacted everywhere)." },
      hide: { type: "string", description: "Semicolon-separated names to hide in that directory." },
      readme: { type: "string", description: "Readme text shown at the top of the directory." },
      ...JSON_OBJECT("write", 'Optional write-switch object, e.g. {"upload":true}.', false),
    },
    { write: true, admin: true, jsonParams: ["write"] },
  ),
  def(
    "alist_admin_meta_update",
    "POST",
    "/api/admin/meta/update",
    "Update a metadata rule. Admin. WRITE OPERATION.",
    {
      id: { type: "number", required: true, description: "Metadata rule id to update." },
      path: { type: "string", description: "Directory this rule applies to." },
      password: { type: "string", description: "Directory password (redacted everywhere). Omit to keep the current one." },
      hide: { type: "string", description: "Semicolon-separated names to hide in that directory." },
      readme: { type: "string", description: "Readme text shown at the top of the directory." },
    },
    { write: true, admin: true },
  ),
  def("alist_admin_meta_delete", "POST", "/api/admin/meta/delete", "Delete a metadata rule. Admin. WRITE OPERATION.", { ...ID }, { write: true, admin: true }),

  // ---- 站点设置（admin）----
  def("alist_admin_setting_list", "GET", "/api/admin/setting/list", "List site settings grouped by category. Admin. Read-only.", {}, { admin: true }),
  def(
    "alist_admin_setting_get",
    "GET",
    "/api/admin/setting/get",
    "Get one setting by key. Admin. Read-only.",
    { key: { type: "string", required: true, description: "Setting key, e.g. site_title." } },
    { admin: true, query: ["key"] },
  ),
  def(
    "alist_admin_setting_save",
    "POST",
    "/api/admin/setting/save",
    "Save one or more settings. Admin. WRITE OPERATION.",
    {
      ...JSON_OBJECT(
        "settings",
        'Settings object sent as the whole request body, e.g. {"site_title":"My AList","announcement":"hello"}. Keys come from alist_admin_setting_list.',
      ),
    },
    { write: true, admin: true, bodyFrom: "settings" },
  ),
  def(
    "alist_admin_setting_delete",
    "POST",
    "/api/admin/setting/delete",
    "Reset/delete a setting by key. Admin. WRITE OPERATION.",
    { key: { type: "string", required: true, description: "Setting key to reset, e.g. site_title." } },
    { write: true, admin: true },
  ),
  def(
    "alist_admin_setting_reset_token",
    "POST",
    "/api/admin/setting/reset_token",
    "Reset the admin token (invalidates the previously issued long-lived token). Admin. WRITE OPERATION.",
    {},
    { write: true, admin: true },
  ),

  // ---- 搜索索引（admin）----
  def(
    "alist_admin_index_progress",
    "GET",
    "/api/admin/index/progress",
    "Get search-index build progress. Admin. Read-only.",
    {},
    { admin: true },
  ),
  def("alist_admin_index_build", "POST", "/api/admin/index/build", "Build the search index. Long-running. Admin. WRITE OPERATION.", {}, { write: true, admin: true }),
  def("alist_admin_index_update", "POST", "/api/admin/index/update", "Incrementally update the search index. Admin. WRITE OPERATION.", {}, { write: true, admin: true }),
  def("alist_admin_index_stop", "POST", "/api/admin/index/stop", "Stop the running index build. Admin. WRITE OPERATION.", {}, { write: true, admin: true }),
  def("alist_admin_index_clear", "POST", "/api/admin/index/clear", "Clear the search index. Admin. WRITE OPERATION.", {}, { write: true, admin: true }),

  // ---- 会话与消息（admin）----
  def("alist_admin_session_list", "GET", "/api/admin/session/list", "List all device sessions. Admin. Read-only.", {}, { admin: true }),
  def(
    "alist_admin_session_evict",
    "POST",
    "/api/admin/session/evict",
    "Kick a device session. Admin. WRITE OPERATION.",
    { session_id: { type: "string", required: true, description: "Device session id (from alist_admin_session_list)." } },
    { write: true, admin: true },
  ),
  def("alist_admin_message_get", "POST", "/api/admin/message/get", "Read instance messages (admin channel). Read-only.", {}, { admin: true }),
  def(
    "alist_admin_message_send",
    "POST",
    "/api/admin/message/send",
    "Send a message to the instance. Admin. WRITE OPERATION.",
    { ...JSON_OBJECT("message", 'Message object sent as the whole request body, e.g. {"type":"info","content":"rebooting"}.') },
    { write: true, admin: true, bodyFrom: "message" },
  ),

  // ---- 分享（需登录，非 guest）----
  def("alist_share_list", "GET", "/api/share/list", "List existing shares. Read-only.", {}),
  def(
    "alist_share_create",
    "POST",
    "/api/share/create",
    "Create a public share link for a path. WRITE OPERATION.",
    {
      path: { type: "string", required: true, description: "Path to share." },
      expires: { type: "string", description: "Expiry, e.g. 24h / 7d. Empty = never." },
      ...PASSWORD,
    },
    { write: true },
  ),
  def(
    "alist_share_update",
    "POST",
    "/api/share/update",
    "Update a share. WRITE OPERATION.",
    {
      id: { type: "string", required: true, description: "Share id to update." },
      path: { type: "string", description: "New path the share points at." },
      expires: { type: "string", description: "New expiry, e.g. 24h / 7d. Empty = never." },
      ...PASSWORD,
    },
    { write: true },
  ),
  def(
    "alist_share_disable",
    "POST",
    "/api/share/disable",
    "Disable a share (the link stops working but the record stays). WRITE OPERATION.",
    { id: { type: "string", required: true, description: "Share id to disable." } },
    { write: true },
  ),
  def(
    "alist_share_delete",
    "POST",
    "/api/share/delete",
    "Delete a share. WRITE OPERATION.",
    { id: { type: "string", required: true, description: "Share id to delete." } },
    { write: true },
  ),

  // ---- 标签（只读）----
  def("alist_label_list", "GET", "/api/label/list", "List labels. Read-only.", {}),
  def(
    "alist_label_get",
    "GET",
    "/api/label/get",
    "Get one label by id. Read-only.",
    { id: { type: "number", required: true, description: "Label id (from alist_label_list)." } },
    { query: ["id"] },
  ),
  def(
    "alist_label_files",
    "GET",
    "/api/label_file_binding/get_file_by_label",
    "List files carrying a label. Read-only.",
    { label_id: { type: "number", required: true, description: "Label id (from alist_label_list)." } },
    { query: ["label_id"] },
  ),
];

export const BY_NAME = new Map(CATALOG.map((entry) => [entry.name, entry]));

export const READ_ONLY_COUNT = CATALOG.filter((e) => !e.write).length;
export const WRITE_COUNT = CATALOG.filter((e) => e.write).length;
export const ADMIN_COUNT = CATALOG.filter((e) => e.admin).length;

// 上传工具不在目录表里（需要读本地文件流），但同样是写操作。
export const SPECIAL_WRITE_NAMES = new Set(["alist_fs_put", "alist_fs_form"]);

export function isWriteName(toolName, def) {
  if (SPECIAL_WRITE_NAMES.has(toolName)) return true;
  return def?.write === true;
}

export function approvalReason(exec, def) {
  const shown = {};
  for (const [k, v] of Object.entries(exec?.arguments ?? {}))
    shown[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : v;
  const scary = /remove|delete|purge|reset_token|clear/i.test(exec?.name ?? "");
  const prefix = scary ? "⚠️ DESTRUCTIVE " : "";
  const target = def ? `${def.method} ${def.path}` : "file upload";
  return `${prefix}AList write operation "${exec?.name}" (${target}): ${JSON.stringify(sanitize(shown))}. This changes AList state; review and approve to proceed, reject to cancel.`;
}
