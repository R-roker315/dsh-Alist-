// dsh-alist 浏览器设置卡片。
// 鉴权两种：账号密码（settings.username + 凭证库 ALIST_PASSWORD，登录换 JWT）与
// 长期 token（凭证库 ALIST_TOKEN，管理员后台签发）。密钥只写不读；
// baseUrl / username / authMode / clientId / allowInsecureTls / maxUploadBytes 走 settings，可回显核对。
window.__ModuleLoader__.load({
  id: "dsh-alist",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const jsx = require("react/jsx-runtime");
    const react = require("react");

    const PASSWORD_REF = "ALIST_PASSWORD";
    const TOKEN_REF = "ALIST_TOKEN";
    const SETTINGS_NS = "alist";
    const MASK = "*".repeat(28);
    // 只 inject slots（对齐 dsh-pve 0.2.0）：cordis 4.0.2 中任一 inject 项缺席都会让
    // 整个 client 插件永久停在 INACTIVE，设置卡片随之消失。remote.settings /
    // remote.credentials 改为调用时 ctx.get 按需解析，缺席时卡片给出明确报错。
    const inject = ["slots"];
    const HOST_UNSUPPORTED = "当前 DSH 版本未暴露 remote.settings / remote.credentials，请升级 DSH。";

    const STRINGS = {
      zh: {
        title: "AList 文件管理",
        desc: "通过对话浏览、检索与管理 AList。密码与 Token 仅保存在本地，永远不会被显示。",
        urlLabel: "Base URL",
        userLabel: "用户名",
        authLabel: "鉴权方式",
        authPassword: "账号密码（登录换 JWT）",
        authToken: "长期 Token（管理员后台签发）",
        clientLabel: "Client-Id",
        tlsLabel: "跳过 TLS 校验",
        limitLabel: "单文件上传上限（MB）",
        passwordLabel: "密码",
        tokenLabel: "Token",
        configured: "已配置",
        notConfigured: "未配置",
        urlPlaceholder: "http://127.0.0.1:5244",
        userPlaceholder: "例如 admin",
        clientPlaceholder: "例如 dsh-alist",
        secretPlaceholder: "留空则保留当前值；输入新值以替换",
        tlsHint: "自签名证书的内网 AList 需勾选。",
        limitHint: "超过此大小的上传会被插件直接拒绝。",
        hintSecret: "存储在本地 DSH 凭证库中，凭证值永远不会被读回。",
        remove: "移除",
        saving: "保存中…",
        save: "保存",
        saved: "已保存。新会话将使用更新后的配置。",
        invalidUrl: "AList URL 必须是不含凭证、查询参数或片段的绝对 HTTP(S) 地址。",
        invalidLimit: "上传上限必须是 1 - 102400 之间的整数（MB）。",
        confirmRemove: "确定要移除已存储的值吗？",
      },
      en: {
        title: "AList file control",
        desc: "Browse, search and manage AList through conversation. Secrets are stored locally and never displayed.",
        urlLabel: "Base URL",
        userLabel: "Username",
        authLabel: "Authentication",
        authPassword: "Username / password (exchange for a JWT)",
        authToken: "Long-lived token (issued by the admin UI)",
        clientLabel: "Client-Id",
        tlsLabel: "Skip TLS verification",
        limitLabel: "Max upload size (MB)",
        passwordLabel: "Password",
        tokenLabel: "Token",
        configured: "Configured",
        notConfigured: "Not configured",
        urlPlaceholder: "http://127.0.0.1:5244",
        userPlaceholder: "e.g. admin",
        clientPlaceholder: "e.g. dsh-alist",
        secretPlaceholder: "Leave blank to keep the current value; enter a new one to replace it",
        tlsHint: "Enable for self-signed internal AList hosts.",
        limitHint: "Uploads above this size are rejected by the plugin.",
        hintSecret: "Stored in the local DSH credential store; the value is never read back.",
        remove: "Remove",
        saving: "Saving…",
        save: "Save",
        saved: "Saved. New sessions will use the updated configuration.",
        invalidUrl: "AList URL must be an absolute HTTP(S) address without credentials, query or fragment.",
        invalidLimit: "Upload limit must be an integer between 1 and 102400 (MB).",
        confirmRemove: "Remove the stored value?",
      },
    };

    const S = {
      card: {
        border: "1px solid var(--border, #d0d7de)",
        borderRadius: 8,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      },
      row: { display: "flex", flexDirection: "column", gap: 4 },
      inline: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
      label: { fontSize: 13, fontWeight: 600 },
      input: {
        padding: "6px 8px",
        borderRadius: 6,
        border: "1px solid var(--border, #d0d7de)",
        background: "var(--bg-input, transparent)",
        color: "inherit",
        minWidth: 280,
      },
      checkboxRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 13 },
      hint: { fontSize: 12, opacity: 0.65 },
      badge: { fontSize: 12, padding: "1px 6px", borderRadius: 10, border: "1px solid var(--border, #d0d7de)" },
      button: {
        padding: "6px 12px",
        borderRadius: 6,
        border: "1px solid var(--border, #d0d7de)",
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
      },
      msg: { fontSize: 13, color: "#1a7f37", margin: 0 },
      err: { fontSize: 13, color: "#cf222e", margin: 0 },
    };

    function isValidUrl(value) {
      try {
        const u = new URL(value);
        return (
          (u.protocol === "http:" || u.protocol === "https:") &&
          !u.username &&
          !u.password &&
          !u.search &&
          !u.hash
        );
      } catch {
        return false;
      }
    }

    function AlistCard(props) {
      const face = props.alistCard;
      const [lang, setLang] = (0, react.useState)("zh");
      const [state, setState] = (0, react.useState)(null);
      const [url, setUrl] = (0, react.useState)("");
      const [username, setUsername] = (0, react.useState)("");
      const [authMode, setAuthMode] = (0, react.useState)("password");
      const [clientId, setClientId] = (0, react.useState)("dsh-alist");
      const [tls, setTls] = (0, react.useState)(false);
      const [limitMb, setLimitMb] = (0, react.useState)("1024");
      const [secret, setSecret] = (0, react.useState)("");
      const [busy, setBusy] = (0, react.useState)(false);
      const [error, setError] = (0, react.useState)("");
      const [saved, setSaved] = (0, react.useState)(false);

      (0, react.useEffect)(() => {
        let alive = true;
        Promise.all([face.describe(), face.localePreference()])
          .then(([s, pref]) => {
            if (!alive) return;
            setState(s);
            setLang(pref === "en" ? "en" : "zh");
            setUrl(s.baseUrl || "");
            setUsername(s.username || "");
            setAuthMode(s.authMode === "token" ? "token" : "password");
            setClientId(s.clientId || "dsh-alist");
            setTls(s.allowInsecureTls === true);
            setLimitMb(String(Math.round((s.maxUploadBytes || 1073741824) / 1048576)));
          })
          .catch(() => {});
        return () => {
          alive = false;
        };
      }, [face]);

      const T = STRINGS[lang] || STRINGS.zh;

      async function run(fn) {
        setBusy(true);
        setError("");
        setSaved(false);
        try {
          await fn();
          const next = await face.describe();
          setState(next);
          setUrl(next.baseUrl || "");
          setUsername(next.username || "");
          setAuthMode(next.authMode === "token" ? "token" : "password");
          setClientId(next.clientId || "dsh-alist");
          setTls(next.allowInsecureTls === true);
          setLimitMb(String(Math.round((next.maxUploadBytes || 1073741824) / 1048576)));
          setSecret("");
          setSaved(true);
        } catch (e) {
          setError(String((e && e.message) || e));
        } finally {
          setBusy(false);
        }
      }

      function onSave() {
        if (url.trim() && !isValidUrl(url.trim())) return setError(T.invalidUrl);
        const limit = Number(limitMb);
        if (!Number.isInteger(limit) || limit < 1 || limit > 102400) return setError(T.invalidLimit);
        return run(async () => {
          await face.setBaseUrl(url.trim());
          await face.setUsername(username.trim());
          await face.setAuthMode(authMode);
          await face.setClientId(clientId.trim() || "dsh-alist");
          await face.setAllowInsecureTls(tls);
          await face.setMaxUploadBytes(limit * 1048576);
          if (secret.trim()) {
            if (authMode === "token") await face.setToken(secret.trim());
            else await face.setPassword(secret.trim());
          }
        });
      }

      function field(labelText, value, onChange, placeholder, extra) {
        return (0, jsx.jsxs)("div", {
          style: S.row,
          children: [
            (0, jsx.jsx)("span", { style: S.label, children: labelText }),
            (0, jsx.jsxs)("div", {
              style: S.inline,
              children: [
                (0, jsx.jsx)("input", {
                  style: S.input,
                  value,
                  placeholder,
                  onChange: (e) => onChange(e.target.value),
                }),
                extra || null,
              ],
            }),
          ],
        });
      }

      function secretField(labelText, configured, onUnset) {
        return (0, jsx.jsxs)("div", {
          style: S.row,
          children: [
            (0, jsx.jsxs)("span", {
              style: S.label,
              children: [
                labelText,
                " ",
                (0, jsx.jsx)("span", {
                  style: S.badge,
                  children: configured ? `${T.configured} ${MASK}` : T.notConfigured,
                }),
              ],
            }),
            (0, jsx.jsxs)("div", {
              style: S.inline,
              children: [
                (0, jsx.jsx)("input", {
                  style: S.input,
                  type: "password",
                  value: secret,
                  placeholder: T.secretPlaceholder,
                  onChange: (e) => setSecret(e.target.value),
                }),
                configured
                  ? (0, jsx.jsx)("button", {
                      style: S.button,
                      children: T.remove,
                      onClick: () => {
                        if (window.confirm(T.confirmRemove)) return run(onUnset);
                      },
                    })
                  : null,
              ],
            }),
            (0, jsx.jsx)("span", { style: S.hint, children: T.hintSecret }),
          ],
        });
      }

      if (!state)
        return (0, jsx.jsx)("div", { style: S.card, children: (0, jsx.jsx)("span", { children: "…" }) });

      return (0, jsx.jsxs)("div", {
        style: S.card,
        children: [
          (0, jsx.jsxs)("div", {
            style: S.row,
            children: [
              (0, jsx.jsx)("span", { style: { fontSize: 15, fontWeight: 700 }, children: T.title }),
              (0, jsx.jsx)("span", { style: S.hint, children: T.desc }),
            ],
          }),
          field(T.urlLabel, url, setUrl, T.urlPlaceholder),
          field(T.userLabel, username, setUsername, T.userPlaceholder),
          (0, jsx.jsxs)("div", {
            style: S.row,
            children: [
              (0, jsx.jsx)("span", { style: S.label, children: T.authLabel }),
              (0, jsx.jsxs)("div", {
                style: S.inline,
                children: [
                  (0, jsx.jsx)("label", {
                    style: S.checkboxRow,
                    children: [
                      (0, jsx.jsx)("input", {
                        type: "radio",
                        name: "alist-auth-mode",
                        checked: authMode === "password",
                        onChange: () => setAuthMode("password"),
                      }),
                      T.authPassword,
                    ],
                  }),
                  (0, jsx.jsx)("label", {
                    style: S.checkboxRow,
                    children: [
                      (0, jsx.jsx)("input", {
                        type: "radio",
                        name: "alist-auth-mode",
                        checked: authMode === "token",
                        onChange: () => setAuthMode("token"),
                      }),
                      T.authToken,
                    ],
                  }),
                ],
              }),
            ],
          }),
          authMode === "password"
            ? secretField(T.passwordLabel, state.passwordConfigured, face.unsetPassword)
            : secretField(T.tokenLabel, state.tokenConfigured, face.unsetToken),
          field(T.clientLabel, clientId, setClientId, T.clientPlaceholder),
          field(T.limitLabel, limitMb, setLimitMb, "1024", (0, jsx.jsx)("span", { style: S.hint, children: T.limitHint })),
          (0, jsx.jsx)("label", {
            style: S.checkboxRow,
            children: [
              (0, jsx.jsx)("input", {
                type: "checkbox",
                checked: tls,
                onChange: (e) => setTls(e.target.checked),
              }),
              T.tlsLabel,
              (0, jsx.jsx)("span", { style: S.hint, children: T.tlsHint }),
            ],
          }),
          (0, jsx.jsxs)("div", {
            style: S.inline,
            children: [
              (0, jsx.jsx)("button", {
                style: S.button,
                disabled: busy,
                children: busy ? T.saving : T.save,
                onClick: onSave,
              }),
              saved ? (0, jsx.jsx)("p", { style: S.msg, children: T.saved }) : null,
              error ? (0, jsx.jsx)("p", { style: S.err, children: error }) : null,
            ],
          }),
        ],
      });
    }

    function apply(ctx) {
      // 运行时按需解析 remote 门面（对齐 dsh-pve 0.2.0 的兼容模式）。
      const remoteNamespace = (ns) =>
        typeof ctx.get === "function" ? ctx.get(`remote.${ns}`) : undefined;
      const requireNamespace = (ns) => {
        const api = remoteNamespace(ns);
        if (!api) throw new Error(HOST_UNSUPPORTED);
        return api;
      };
      const mustOk = (res, what) => {
        if (res && typeof res === "object" && res.ok === true) return res.value;
        const message =
          (res && typeof res === "object" && res.error && res.error.message) || `${what} failed`;
        throw new Error(message);
      };
      const face = {
        describe: async () => {
          const settings = remoteNamespace("settings");
          const setRes =
            settings && typeof settings.describe === "function"
              ? await settings.describe()
              : null;
          const namespaces = setRes && setRes.ok === true ? (setRes.value?.namespaces ?? []) : [];
          let creds = {};
          const credentials = remoteNamespace("credentials");
          if (credentials && typeof credentials.describe === "function") {
            const credRes = await credentials.describe([PASSWORD_REF, TOKEN_REF]);
            if (credRes && credRes.ok === true) creds = credRes.value ?? {};
          }
          const ns = namespaces.find((n) => n?.ns === SETTINGS_NS);
          const value = ns?.value ?? {};
          const num = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
          return {
            passwordConfigured: creds[PASSWORD_REF]?.configured ?? false,
            tokenConfigured: creds[TOKEN_REF]?.configured ?? false,
            baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : "",
            username: typeof value.username === "string" ? value.username : "",
            authMode: value.authMode === "token" ? "token" : "password",
            clientId: typeof value.clientId === "string" ? value.clientId : "dsh-alist",
            allowInsecureTls: value.allowInsecureTls === true,
            maxUploadBytes: num(value.maxUploadBytes, 1073741824),
          };
        },
        setPassword: (v) =>
          requireNamespace("credentials").set(PASSWORD_REF, v).then((r) => mustOk(r, "credentials.set")),
        setToken: (v) =>
          requireNamespace("credentials").set(TOKEN_REF, v).then((r) => mustOk(r, "credentials.set")),
        unsetPassword: () =>
          requireNamespace("credentials").unset(PASSWORD_REF).then((r) => mustOk(r, "credentials.unset")),
        unsetToken: () =>
          requireNamespace("credentials").unset(TOKEN_REF).then((r) => mustOk(r, "credentials.unset")),
        setBaseUrl: (v) =>
          requireNamespace("settings").update(SETTINGS_NS, { baseUrl: v }, undefined).then((r) => mustOk(r, "settings.update")),
        setUsername: (v) =>
          requireNamespace("settings").update(SETTINGS_NS, { username: v }, undefined).then((r) => mustOk(r, "settings.update")),
        setAuthMode: (v) =>
          requireNamespace("settings").update(SETTINGS_NS, { authMode: v }, undefined).then((r) => mustOk(r, "settings.update")),
        setClientId: (v) =>
          requireNamespace("settings").update(SETTINGS_NS, { clientId: v }, undefined).then((r) => mustOk(r, "settings.update")),
        setAllowInsecureTls: (v) =>
          requireNamespace("settings").update(SETTINGS_NS, { allowInsecureTls: v }, undefined).then((r) => mustOk(r, "settings.update")),
        setMaxUploadBytes: (v) =>
          requireNamespace("settings").update(SETTINGS_NS, { maxUploadBytes: v }, undefined).then((r) => mustOk(r, "settings.update")),
        localePreference: async () => {
          const settings = remoteNamespace("settings");
          if (!settings || typeof settings.describe !== "function") return "";
          try {
            const res = await settings.describe();
            if (!res || res.ok !== true) return "";
            const locale = (res.value?.namespaces ?? []).find((n) => n?.ns === "locale");
            const pref = locale?.value?.preference;
            return typeof pref === "string" ? pref : "";
          } catch {
            return "";
          }
        },
      };

      // 对齐 dsh-pve 0.2.0 的 slot 协议：新版宿主的设置页 slot 带 kind/scope，
      // 注册前用 ctx.slots.spec() 探测；老宿主无 spec() 时回退旧式注册。
      function registerSettingsEntry(ctx2, face2) {
        const label = "AList 文件管理";
        const candidates = [
          {
            name: "settings.section",
            kind: "list",
            scope: "root",
            options: { name: "settings.section", id: "alist", order: 19, label },
            component: () => (0, react.createElement)(AlistCard, { alistCard: face2 }),
          },
          {
            name: "settings.plugins.tab",
            kind: "list",
            scope: "root",
            options: { name: "settings.plugins.tab", id: "alist", order: 103, label },
            component: () => (0, react.createElement)(AlistCard, { alistCard: face2 }),
          },
          {
            name: "settings.plugin.item",
            kind: "keyed",
            options: { name: "settings.plugin.item", key: "alist", inject: () => ({ alistCard: face2 }) },
            component: AlistCard,
          },
        ];
        if (typeof ctx2.slots.spec !== "function") {
          for (const candidate of candidates.slice(1)) {
            ctx2.slots.inject(candidate.name, () => ctx2.slots.register(candidate.options, candidate.component));
          }
          return;
        }
        ctx2.effect(() => {
          const disposers = [];
          for (const candidate of candidates) {
            try {
              disposers.push(
                ctx2.slots.inject(candidate.name, () => {
                  const spec = ctx2.slots.spec(candidate.name);
                  if (spec?.kind !== candidate.kind || (candidate.scope && spec.scope !== candidate.scope)) return;
                  return ctx2.slots.register(candidate.options, candidate.component);
                }),
              );
            } catch (error) {
              if (error?.code !== "INACTIVE_EFFECT") throw error;
            }
          }
          return () => {
            for (const dispose of disposers.reverse()) dispose?.();
          };
        });
      }

      registerSettingsEntry(ctx, face);
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
