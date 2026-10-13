import test from "node:test";
import assert from "node:assert/strict";
import {
  CATALOG,
  BY_NAME,
  TASK_TYPES,
  SENSITIVE_KEY,
  SPECIAL_WRITE_NAMES,
  normalizeBaseUrl,
  apiUrl,
  sanitize,
  resolveArgs,
  prepare,
  buildBody,
  toArrayValue,
  toStructuredValue,
  formatResult,
  errorDetail,
  isWriteName,
  approvalReason,
  READ_ONLY_COUNT,
  WRITE_COUNT,
  ADMIN_COUNT,
} from "../catalog.js";

test("normalizeBaseUrl accepts http(s) and strips trailing slash", () => {
  assert.equal(normalizeBaseUrl("http://127.0.0.1:5244/"), "http://127.0.0.1:5244");
  assert.equal(normalizeBaseUrl("  https://alist.example.com  "), "https://alist.example.com");
});

test("normalizeBaseUrl rejects malformed or credential-bearing URLs", () => {
  assert.throws(() => normalizeBaseUrl(""), /not configured/);
  assert.throws(() => normalizeBaseUrl("ftp://x.example"), /absolute HTTP\(S\)/);
  assert.throws(() => normalizeBaseUrl("https://user:pass@h.example"), /credentials/);
  assert.throws(() => normalizeBaseUrl("https://h.example/?x=1"), /query string/);
  assert.throws(() => normalizeBaseUrl("https://h.example/#frag"), /fragment/);
});

test("apiUrl joins base and path safely", () => {
  assert.equal(apiUrl("http://h:5244", "/api/me"), "http://h:5244/api/me");
  assert.equal(apiUrl("http://h:5244", "api/me"), "http://h:5244/api/me");
});

test("sanitize redacts sensitive keys recursively", () => {
  const out = sanitize({
    password: "x",
    token: "y",
    otp_code: "123456",
    keep: 1,
    nested: { secret: "z", ok: 2 },
    list: [{ privkey: "k", name: "n" }],
  });
  assert.equal(out.password, "[REDACTED]");
  assert.equal(out.token, "[REDACTED]");
  assert.equal(out.otp_code, "[REDACTED]");
  assert.equal(out.keep, 1);
  assert.equal(out.nested.secret, "[REDACTED]");
  assert.equal(out.nested.ok, 2);
  assert.equal(out.list[0].privkey, "[REDACTED]");
  assert.equal(out.list[0].name, "n");
});

test("resolveArgs fills path placeholders and splits query/body", () => {
  const def = BY_NAME.get("alist_task_list");
  const { path, query, body } = resolveArgs(def, { type: "upload", state: "info", tid: "abc" });
  assert.equal(path, "/api/task/upload/info");
  assert.deepEqual(query, { tid: "abc" }, "GET requests send every remaining param as a query string");
  assert.deepEqual(body, {});
  const get = resolveArgs(BY_NAME.get("alist_admin_storage_get"), { id: 7 });
  assert.equal(get.path, "/api/admin/storage/get");
  assert.deepEqual(get.query, { id: 7 });
});

test("resolveArgs requires path params", () => {
  assert.throws(() => resolveArgs(BY_NAME.get("alist_task_list"), { state: "done" }), /Required parameter "type"/);
});

test("resolveArgs URL-encodes path params", () => {
  const { path } = resolveArgs({ path: "/api/task/{type}/done", method: "GET", params: {} }, { type: "a/b" });
  assert.equal(path, "/api/task/a%2Fb/done");
});

test("formatResult pretty-prints, sanitizes and trims listing fields", () => {
  const listDef = BY_NAME.get("alist_fs_list");
  const out = formatResult(
    { content: [{ name: "a.mp4", size: 10, is_dir: false, sign: "s", thumb: "t", modified: "x", type: 4 }], total: 1 },
    listDef,
  );
  const parsed = JSON.parse(out);
  assert.equal(parsed.content[0].name, "a.mp4");
  assert.equal(parsed.content[0].size, 10);
  assert.equal(parsed.total, 1);
  assert.deepEqual(
    Object.keys(parsed.content[0]),
    ["name", "size", "is_dir", "modified", "type"],
    "listing rows must be trimmed to the five useful fields (sign/thumb dropped)",
  );
  assert.equal(formatResult(null, listDef), "OK (no content)");
  assert.equal(formatResult("plain", listDef), "plain");
});

test("errorDetail extracts the message from an AList error body", () => {
  assert.equal(errorDetail('{"code":403,"message":"permission denied"}'), "permission denied");
  assert.match(errorDetail("not json at all"), /not json at all/);
});

test("catalog integrity: unique alist_-prefixed names, declared params, write flags", () => {
  const seen = new Set();
  for (const d of CATALOG) {
    assert.ok(!seen.has(d.name), `duplicate tool name ${d.name}`);
    seen.add(d.name);
    assert.ok(d.name.startsWith("alist_"), `${d.name} must use the alist_ prefix`);
    assert.ok(d.method, `${d.name} missing method`);
    assert.ok(typeof d.description === "string" && d.description.length > 0, `${d.name} missing description`);
    assert.ok(d.path.startsWith("/api/"), `${d.name} path must start with /api/`);
    for (const p of [...d.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))
      assert.ok(d.params[p], `${d.name}: path placeholder {${p}} has no matching param`);
    for (const [pname, p] of Object.entries(d.params))
      assert.ok(typeof p.description === "string" && p.description.length > 0, `${d.name}.${pname} missing description`);
    if (d.query?.length) for (const q of d.query) assert.ok(d.params[q], `${d.name}: query ${q} not declared`);
  }
  assert.ok(READ_ONLY_COUNT > 0 && WRITE_COUNT > 0 && ADMIN_COUNT > 0);
  assert.equal(READ_ONLY_COUNT + WRITE_COUNT, CATALOG.length);
  assert.ok(BY_NAME.get("alist_fs_list").write === false);
  assert.ok(BY_NAME.get("alist_fs_remove").write === true);
  assert.ok(BY_NAME.get("alist_admin_storage_list").admin === true);
});

test("fs tools never claim to be read-only by accident", () => {
  const readOnly = new Set([
    "alist_me",
    "alist_public_settings",
    "alist_public_offline_tools",
    "alist_fs_list",
    "alist_fs_get",
    "alist_fs_dirs",
    "alist_fs_search",
    "alist_fs_archive_meta",
    "alist_fs_archive_list",
    "alist_fs_link",
    "alist_task_list",
    "alist_share_list",
    "alist_label_list",
    "alist_label_get",
    "alist_label_files",
  ]);
  for (const d of CATALOG.filter((x) => x.path.startsWith("/api/fs/") || x.name.startsWith("alist_task")))
    assert.equal(d.write, !readOnly.has(d.name), `${d.name} write flag mismatch`);
});

test("write detection and approval reason", () => {
  assert.equal(isWriteName("alist_fs_remove", BY_NAME.get("alist_fs_remove")), true);
  assert.equal(isWriteName("alist_fs_list", BY_NAME.get("alist_fs_list")), false);
  for (const n of SPECIAL_WRITE_NAMES) assert.equal(isWriteName(n, undefined), true);

  const reason = approvalReason(
    { name: "alist_fs_remove", arguments: { dir: "/local", names: ["a.txt"], password: "p" } },
    BY_NAME.get("alist_fs_remove"),
  );
  assert.match(reason, /DESTRUCTIVE/);
  assert.match(reason, /alist_fs_remove/);
  assert.ok(!reason.includes("\"p\""), "password must be redacted in the approval prompt");
  assert.match(reason, /\[REDACTED\]/);

  const uploadReason = approvalReason({ name: "alist_fs_put", arguments: { localPath: "/tmp/a", path: "/local/a" } }, undefined);
  assert.match(uploadReason, /file upload/);
});

test("toArrayValue accepts arrays, JSON arrays and comma-separated strings", () => {
  assert.deepEqual(toArrayValue(["a", "b"], "names"), ["a", "b"]);
  assert.deepEqual(toArrayValue('["a","b"]', "names"), ["a", "b"]);
  assert.deepEqual(toArrayValue("a.mp4, b ,c", "names"), ["a.mp4", "b", "c"]);
  assert.deepEqual(toArrayValue('["one"]', "urls"), ["one"]);
  assert.throws(() => toArrayValue("", "names"), /must not be empty/);
  assert.throws(() => toArrayValue('["unterminated', "names"), /valid JSON array/);
  assert.throws(() => toArrayValue(42, "names"), /array/);
});

test("toStructuredValue parses JSON objects and arrays", () => {
  assert.deepEqual(toStructuredValue('{"a":1}', "storage"), { a: 1 });
  assert.deepEqual(toStructuredValue('[{"path":"/x"}]', "permissions"), [{ path: "/x" }]);
  assert.deepEqual(toStructuredValue({ a: 1 }, "storage"), { a: 1 });
  assert.throws(() => toStructuredValue("nope", "storage"), /valid JSON object/);
  assert.throws(() => toStructuredValue('"scalar"', "storage"), /valid JSON object/);
});

test("prepare coerces names/urls into arrays for AList", () => {
  const move = prepare(BY_NAME.get("alist_fs_move"), {
    src_dir: "/a",
    dst_dir: "/b",
    names: "one.txt, two.txt",
  });
  assert.deepEqual(move.body, { src_dir: "/a", dst_dir: "/b", names: ["one.txt", "two.txt"] });

  const remove = prepare(BY_NAME.get("alist_fs_remove"), { dir: "/a", names: '["x","y"]' });
  assert.deepEqual(remove.body, { dir: "/a", names: ["x", "y"] });

  const od = prepare(BY_NAME.get("alist_fs_add_offline_download"), {
    path: "/local",
    urls: "https://a/1.zip,https://a/2.zip",
  });
  assert.deepEqual(od.body, { path: "/local", urls: ["https://a/1.zip", "https://a/2.zip"] });
});

test("prepare expands a JSON object parameter into the whole request body", () => {
  const created = prepare(BY_NAME.get("alist_admin_storage_create"), {
    storage: '{"mount_path":"/local","driver":"Local","addition":"{}"}',
  });
  assert.deepEqual(created.body, {
    mount_path: "/local",
    driver: "Local",
    addition: "{}",
  });

  const saved = prepare(BY_NAME.get("alist_admin_setting_save"), { settings: '{"site_title":"X"}' });
  assert.deepEqual(saved.body, { site_title: "X" });

  assert.throws(() => prepare(BY_NAME.get("alist_admin_storage_create"), {}), /Required parameter "storage"/);
  assert.throws(() => prepare(BY_NAME.get("alist_admin_storage_create"), { storage: "[1,2]" }), /must be a JSON object/);
});

test("prepare parses nested JSON parameters such as rename_objects and permissions", () => {
  const renamed = prepare(BY_NAME.get("alist_fs_batch_rename"), {
    src_dir: "/a",
    rename_objects: '[{"src_name":"a.txt","new_name":"b.txt"}]',
  });
  assert.deepEqual(renamed.body, {
    src_dir: "/a",
    rename_objects: [{ src_name: "a.txt", new_name: "b.txt" }],
  });

  const user = prepare(BY_NAME.get("alist_admin_user_create"), {
    username: "u",
    password: "p",
    permissions: '[{"path":"/local","permission":65535}]',
  });
  assert.deepEqual(user.body.permissions, [{ path: "/local", permission: 65535 }]);
  assert.equal(user.body.username, "u");
});

test("prepare rejects non-absolute AList paths", () => {
  assert.throws(
    () => prepare(BY_NAME.get("alist_fs_list"), { path: "local/movies" }),
    /must be an absolute AList path/,
  );
  assert.throws(
    () => prepare(BY_NAME.get("alist_fs_remove"), { dir: "local", names: "a.txt" }),
    /must be an absolute AList path/,
  );
  const ok = prepare(BY_NAME.get("alist_fs_list"), { path: "/local/movies" });
  assert.deepEqual(ok.body, { path: "/local/movies" });
});

test("buildBody leaves plain parameters untouched", () => {
  const def = BY_NAME.get("alist_fs_mkdir");
  assert.deepEqual(buildBody(def, { path: "/local/new" }), { path: "/local/new" });
});

test("task types cover the six AList task families", () => {
  assert.deepEqual(TASK_TYPES, [
    "upload",
    "copy",
    "offline_download",
    "offline_download_transfer",
    "decompress",
    "decompress_upload",
  ]);
  assert.ok(SENSITIVE_KEY.test("password"));
  assert.ok(SENSITIVE_KEY.test("ALIST_TOKEN"));
});
