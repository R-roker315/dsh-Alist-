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
    const inject = ["slots", "remote", "remote.credentials", "remote.settings"];

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
      const mustOk = (res) => {
        if (!res || res.ok === false) throw (res && res.error) ?? new Error("remote call failed");
        return res.value;
      };
      const face = {
        describe: async () => {
          const [credRes, setRes] = await Promise.all([
            ctx.remote.credentials.describe([PASSWORD_REF, TOKEN_REF]),
            ctx.remote.settings.describe(),
          ]);
          const creds = credRes?.ok ? (credRes.value ?? {}) : {};
          const namespaces = setRes?.ok ? (setRes.value?.namespaces ?? []) : [];
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
        setPassword: (v) => ctx.remote.credentials.set(PASSWORD_REF, v).then(mustOk),
        setToken: (v) => ctx.remote.credentials.set(TOKEN_REF, v).then(mustOk),
        unsetPassword: () => ctx.remote.credentials.unset(PASSWORD_REF).then(mustOk),
        unsetToken: () => ctx.remote.credentials.unset(TOKEN_REF).then(mustOk),
        setBaseUrl: (v) => ctx.remote.settings.update(SETTINGS_NS, { baseUrl: v }, undefined).then(mustOk),
        setUsername: (v) => ctx.remote.settings.update(SETTINGS_NS, { username: v }, undefined).then(mustOk),
        setAuthMode: (v) => ctx.remote.settings.update(SETTINGS_NS, { authMode: v }, undefined).then(mustOk),
        setClientId: (v) => ctx.remote.settings.update(SETTINGS_NS, { clientId: v }, undefined).then(mustOk),
        setAllowInsecureTls: (v) =>
          ctx.remote.settings.update(SETTINGS_NS, { allowInsecureTls: v }, undefined).then(mustOk),
        setMaxUploadBytes: (v) =>
          ctx.remote.settings.update(SETTINGS_NS, { maxUploadBytes: v }, undefined).then(mustOk),
        localePreference: async () => {
          const res = await ctx.remote.settings.describe();
          if (!res?.ok) return "";
          const locale = (res.value?.namespaces ?? []).find((n) => n?.ns === "locale");
          const pref = locale?.value?.preference;
          return typeof pref === "string" ? pref : "";
        },
      };

      ctx.slots.inject("settings.plugin.item", () =>
        ctx.slots.register(
          {
            name: "settings.plugin.item",
            key: "alist",
            inject: () => ({ alistCard: face }),
          },
          AlistCard,
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
