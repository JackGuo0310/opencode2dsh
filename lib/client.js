window.__ModuleLoader__.load({ id: "@jackguo0310/opencode2dsh", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let react = require("react");
react = __toESM(react);
let __deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
__deepseek_ai_dsh_client_ui_primitives = __toESM(__deepseek_ai_dsh_client_ui_primitives);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = __toESM(react_jsx_runtime);

//#region \0dsh-css:D:\Github\opencode2dsh\src\client\ip-pool.module.css.mjs
const css = ".rqET2W_card{border:1px solid var(--dsw-alias-border-l2,#d0d7de);background:var(--dsw-alias-bg-layer-3,#fff);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}.rqET2W_card:hover{border-color:var(--dsw-alias-label-dimmed,#8b949e)}.rqET2W_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}.rqET2W_header:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4f8cff);outline-offset:-2px}.rqET2W_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}.rqET2W_name{color:var(--dsw-alias-label-primary,#1f2329);font-size:15px;font-weight:600;line-height:1.4}.rqET2W_description{color:var(--dsw-alias-label-tertiary,#6b7280);font-size:13px;line-height:1.5}.rqET2W_chevron{color:var(--dsw-alias-label-tertiary,#6b7280);flex:none;transition:transform .16s}.rqET2W_chevronOpen{transform:rotate(180deg)}.rqET2W_body{border-top:1px solid var(--dsw-alias-border-l2,#d0d7de);flex-direction:column;gap:14px;margin:0 16px;padding:14px 0 8px;display:flex}.rqET2W_status{color:var(--dsw-alias-label-tertiary,#6b7280);margin:4px 0;font-size:13px;line-height:1.5}.rqET2W_field{flex-direction:column;gap:4px;display:flex}.rqET2W_fieldRow{gap:10px;display:flex}.rqET2W_fieldRow>.rqET2W_field{flex:1 1 0;min-width:0}.rqET2W_fieldLabel{color:var(--dsw-alias-label-primary,#1f2329);font-size:13px;font-weight:500}.rqET2W_fieldHint{color:var(--dsw-alias-label-tertiary,#6b7280);font-size:12px;line-height:1.45}.rqET2W_input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#d0d7de);background:var(--dsw-alias-bg-layer-2,#f6f8fa);width:100%;color:var(--dsw-alias-label-primary,#1f2329);color-scheme:light;border-radius:6px;padding:6px 8px;font-size:13px}.rqET2W_input:focus{outline:2px solid var(--dsw-alias-state-business-primary,#4f8cff);outline-offset:-1px}body[data-ds-dark-theme] .rqET2W_input,body[data-ds-dark-theme] .rqET2W_select{color-scheme:dark}.rqET2W_textarea{resize:vertical;min-height:56px;font-family:inherit;}.rqET2W_rowList{flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;display:flex}.rqET2W_row{align-items:center;gap:6px;display:flex}.rqET2W_rowLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-primary,#1f2329);flex:1 1 0;font-size:13px;overflow:hidden}.rqET2W_rowInput{flex:1 1 0;}.rqET2W_rowRemove{border:1px solid var(--dsw-alias-border-l2,#d0d7de);background:var(--dsw-alias-bg-layer-2,#f6f8fa);color:var(--dsw-alias-label-secondary,#4b5563);cursor:pointer;border-radius:6px;flex:none;padding:4px 8px;font-size:12px}.rqET2W_rowRemove:hover{border-color:var(--dsw-alias-state-error-primary,#d1242f);color:var(--dsw-alias-state-error-primary,#d1242f)}.rqET2W_rowAdd{border:1px dashed var(--dsw-alias-border-l3,#a6adb4);color:var(--dsw-alias-label-secondary,#4b5563);cursor:pointer;background:0 0;border-radius:6px;align-self:flex-start;padding:4px 10px;font-size:12px}.rqET2W_rowAdd:hover{border-color:var(--dsw-alias-state-business-primary,#4f8cff);color:var(--dsw-alias-state-business-primary,#4f8cff)}.rqET2W_footer{align-items:center;gap:10px;margin-top:2px;display:flex}.rqET2W_primaryButton{background:var(--dsw-alias-button-primary-fill,#4f8cff);color:var(--dsw-alias-label-primary-foreground,#fff);cursor:pointer;border:none;border-radius:6px;padding:6px 14px;font-size:13px;font-weight:500}.rqET2W_primaryButton:hover{background:var(--dsw-alias-button-primary-hover,#3b76e0)}.rqET2W_primaryButton:disabled{opacity:.6;cursor:default}.rqET2W_ghostButton{border:1px solid var(--dsw-alias-border-l2,#d0d7de);background:var(--dsw-alias-bg-layer-2,#f6f8fa);color:var(--dsw-alias-label-secondary,#4b5563);cursor:pointer;border-radius:6px;padding:6px 12px;font-size:13px}.rqET2W_ghostButton:hover{border-color:var(--dsw-alias-border-l3,#a6adb4)}.rqET2W_saveStatus{font-size:12px;line-height:1.4}.rqET2W_saveStatusOk{color:var(--dsw-alias-state-success-primary,#1a7f37)}.rqET2W_saveStatusError{color:var(--dsw-alias-state-error-primary,#d1242f)}.rqET2W_overviewBar{border:1px solid var(--dsw-alias-border-l2,#d0d7de);background:var(--dsw-alias-bg-layer-2,#f6f8fa);color:var(--dsw-alias-label-secondary,#4b5563);border-radius:8px;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:8px 10px;font-size:12px;display:flex}.rqET2W_badge{border:1px solid var(--dsw-alias-border-l2,#d0d7de);color:var(--dsw-alias-label-secondary,#4b5563);white-space:nowrap;border-radius:999px;align-items:center;gap:4px;padding:2px 8px;font-size:11px;line-height:1.5;display:inline-flex}.rqET2W_badgeHealthy{border-color:var(--dsw-alias-state-success-primary,#1a7f37);color:var(--dsw-alias-state-success-primary,#1a7f37)}.rqET2W_badgeWarning{border-color:var(--dsw-alias-state-warning-primary,#9a6700);color:var(--dsw-alias-state-warning-primary,#9a6700)}.rqET2W_badgeCritical,.rqET2W_badgeEmergency{border-color:var(--dsw-alias-state-error-primary,#d1242f);color:var(--dsw-alias-state-error-primary,#d1242f)}.rqET2W_badgePinned{border-color:var(--dsw-alias-state-business-primary,#4f8cff);color:var(--dsw-alias-state-business-primary,#4f8cff)}.rqET2W_table{border:1px solid var(--dsw-alias-border-l2,#d0d7de);border-radius:8px;display:block;overflow-x:auto}.rqET2W_tableGrid{border-collapse:collapse;width:100%;font-size:12px}.rqET2W_tableGrid th,.rqET2W_tableGrid td{border-bottom:1px solid var(--dsw-alias-border-l2,#d0d7de);text-align:left;color:var(--dsw-alias-label-secondary,#4b5563);white-space:nowrap;padding:6px 8px}.rqET2W_tableGrid th{color:var(--dsw-alias-label-primary,#1f2329);background:var(--dsw-alias-bg-layer-2,#f6f8fa);font-weight:600}.rqET2W_tableGrid tr:last-child td{border-bottom:none}.rqET2W_mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.rqET2W_stateOk{color:var(--dsw-alias-state-success-primary,#1a7f37)}.rqET2W_stateCooling{color:var(--dsw-alias-state-warning-primary,#9a6700)}.rqET2W_stateDead{color:var(--dsw-alias-state-error-primary,#d1242f)}.rqET2W_stateUnknown{color:var(--dsw-alias-label-tertiary,#6b7280)}.rqET2W_section{border:1px solid var(--dsw-alias-border-l2,#d0d7de);background:var(--dsw-alias-bg-layer-2,#f6f8fe80);border-radius:8px;flex-direction:column;gap:8px;padding:10px 12px;display:flex}.rqET2W_sectionTitle{color:var(--dsw-alias-label-primary,#1f2329);font-size:13px;font-weight:600}.rqET2W_radio{color:var(--dsw-alias-label-secondary,#4b5563);cursor:pointer;align-items:center;gap:6px;font-size:13px;display:flex}.rqET2W_compliance{color:var(--dsw-alias-label-tertiary,#6b7280);border-top:1px dashed var(--dsw-alias-border-l2,#d0d7de);padding-top:10px;font-size:11px;line-height:1.5}.rqET2W_collapseToggle{color:var(--dsw-alias-state-business-primary,#4f8cff);cursor:pointer;background:0 0;border:none;align-self:flex-start;padding:2px 8px;font-size:12px}";
const tagId = "@jackguo0310/opencode2dsh/ip-pool.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
	const tag = document.createElement("style");
	tag.dataset.plugin = "@jackguo0310/opencode2dsh";
	tag.dataset.pluginCss = tagId;
	tag.textContent = css;
	document.head.appendChild(tag);
}
var ip_pool_module_css_default = {
	"name": "rqET2W_name",
	"badge": "rqET2W_badge",
	"rowList": "rqET2W_rowList",
	"badgeCritical": "rqET2W_badgeCritical",
	"mono": "rqET2W_mono",
	"stateUnknown": "rqET2W_stateUnknown",
	"rowRemove": "rqET2W_rowRemove",
	"headText": "rqET2W_headText",
	"badgePinned": "rqET2W_badgePinned",
	"tableGrid": "rqET2W_tableGrid",
	"card": "rqET2W_card",
	"select": "rqET2W_select",
	"section": "rqET2W_section",
	"overviewBar": "rqET2W_overviewBar",
	"fieldHint": "rqET2W_fieldHint",
	"chevron": "rqET2W_chevron",
	"rowInput": "rqET2W_rowInput",
	"badgeEmergency": "rqET2W_badgeEmergency",
	"textarea": "rqET2W_textarea",
	"chevronOpen": "rqET2W_chevronOpen",
	"input": "rqET2W_input",
	"row": "rqET2W_row",
	"footer": "rqET2W_footer",
	"table": "rqET2W_table",
	"fieldLabel": "rqET2W_fieldLabel",
	"sectionTitle": "rqET2W_sectionTitle",
	"stateOk": "rqET2W_stateOk",
	"field": "rqET2W_field",
	"status": "rqET2W_status",
	"description": "rqET2W_description",
	"rowLabel": "rqET2W_rowLabel",
	"saveStatus": "rqET2W_saveStatus",
	"saveStatusOk": "rqET2W_saveStatusOk",
	"fieldRow": "rqET2W_fieldRow",
	"ghostButton": "rqET2W_ghostButton",
	"saveStatusError": "rqET2W_saveStatusError",
	"badgeHealthy": "rqET2W_badgeHealthy",
	"header": "rqET2W_header",
	"compliance": "rqET2W_compliance",
	"stateCooling": "rqET2W_stateCooling",
	"stateDead": "rqET2W_stateDead",
	"radio": "rqET2W_radio",
	"badgeWarning": "rqET2W_badgeWarning",
	"collapseToggle": "rqET2W_collapseToggle",
	"rowAdd": "rqET2W_rowAdd",
	"body": "rqET2W_body",
	"primaryButton": "rqET2W_primaryButton"
};

//#endregion
//#region src/client/IpPoolCard.tsx
/** The bridge prefix (same-origin, loopback-only on the host). */
const BRIDGE_PREFIX = "/api/opencode2dsh/ip-pool";
const DEFAULTS = {
	enabled: false,
	probeModels: [],
	maxConcurrentProbes: 3,
	free: {
		enabled: true,
		targetSize: 20,
		blockedCountries: ["CN"]
	},
	manual: [],
	subscription: {
		urls: [],
		refreshMs: 30 * 6e4
	},
	singbox: { path: "sing-box" },
	pinnedExitId: "",
	pinnedStrict: false,
	proxyHosts: []
};
/** Subscription URLs never render in full — the settings doc is the only
*  place they exist in plaintext (docs §5.1 redaction boundary). */
function redactUrl(url) {
	if (url.length <= 24) return url;
	return url.slice(0, 12) + "…" + url.slice(-6);
}
/** JSON deep-equal over the card's plain values. */
function deepEqual(a, b) {
	return JSON.stringify(a) === JSON.stringify(b);
}
function emptyForm() {
	return {
		enabled: DEFAULTS.enabled,
		freeEnabled: DEFAULTS.free.enabled,
		targetSize: String(DEFAULTS.free.targetSize),
		blockedCountries: DEFAULTS.free.blockedCountries.join(","),
		manual: [],
		subscriptionUrls: [],
		refreshMs: String(DEFAULTS.subscription.refreshMs),
		singboxPath: DEFAULTS.singbox.path,
		pinnedExitId: "",
		pinnedStrict: DEFAULTS.pinnedStrict,
		probeModels: [],
		maxConcurrentProbes: String(DEFAULTS.maxConcurrentProbes)
	};
}
function formFromValue(value) {
	return {
		enabled: value.enabled,
		freeEnabled: value.free.enabled,
		targetSize: String(value.free.targetSize),
		blockedCountries: value.free.blockedCountries.join(","),
		manual: [...value.manual],
		subscriptionUrls: [...value.subscription.urls],
		refreshMs: String(value.subscription.refreshMs),
		singboxPath: value.singbox.path,
		pinnedExitId: value.pinnedExitId,
		pinnedStrict: value.pinnedStrict,
		probeModels: [...value.probeModels],
		maxConcurrentProbes: String(value.maxConcurrentProbes)
	};
}
function diffWrites(form, snapshot) {
	const value = snapshot.value;
	const base = snapshot.base;
	const writes = [];
	const push = (field, next, current, baseValue) => {
		if (deepEqual(next, current)) return;
		if (deepEqual(next, baseValue)) return;
		writes.push({
			field,
			op: "set",
			value: next
		});
	};
	push("enabled", form.enabled, value?.enabled, base?.enabled);
	push("free", {
		enabled: form.freeEnabled,
		targetSize: Number(form.targetSize),
		blockedCountries: splitCsv(form.blockedCountries)
	}, value?.free, base?.free);
	push("manual", form.manual, value?.manual, base?.manual);
	push("subscription", {
		urls: form.subscriptionUrls,
		refreshMs: Number(form.refreshMs)
	}, value?.subscription, base?.subscription);
	push("singbox", { path: form.singboxPath }, value?.singbox, base?.singbox);
	push("pinnedExitId", form.pinnedExitId, value?.pinnedExitId, base?.pinnedExitId);
	push("pinnedStrict", form.pinnedStrict, value?.pinnedStrict, base?.pinnedStrict);
	push("probeModels", form.probeModels, value?.probeModels, base?.probeModels);
	push("maxConcurrentProbes", Number(form.maxConcurrentProbes), value?.maxConcurrentProbes, base?.maxConcurrentProbes);
	return writes;
}
function splitCsv(line) {
	return line.split(",").map((part) => part.trim().toUpperCase()).filter((part) => part.length > 0);
}
/** One-line live refill progress: stage + counters (docs §5.3). */
function refillProgressLine(progress, t) {
	const parts = [{
		fetch: t("refillStageFetch"),
		coarse: t("refillStageCoarse"),
		admit: t("refillStageAdmit"),
		idle: t("refillStageIdle")
	}[progress.stage]];
	if (progress.stage === "fetch") {
		const sources = t("refillCountSources").replace("{done}", String(progress.sourcesDone)).replace("{total}", String(progress.sourcesTotal));
		const rows = t("refillCountFetched").replace("{n}", String(progress.fetched));
		parts.push(sources + " · " + rows);
	}
	if (progress.stage === "coarse") parts.push(t("refillCountCoarse").replace("{done}", String(progress.coarseDone)).replace("{total}", String(progress.candidates)).replace("{passed}", String(progress.coarsePassed)));
	if (progress.stage === "admit") parts.push(t("refillCountAdmit").replace("{done}", String(progress.admissions)).replace("{admitted}", String(progress.admitted)));
	return parts.join(" · ");
}
/** One labeled input. */
function TextField(props) {
	const { label, hint, value, onChange, placeholder, testId, type = "text", min, max, step } = props;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
		className: ip_pool_module_css_default.field,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: ip_pool_module_css_default.fieldLabel,
				children: label
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
				className: ip_pool_module_css_default.input,
				type,
				value,
				placeholder,
				min,
				max,
				step,
				"data-testid": testId,
				onChange: (event) => onChange(event.target.value)
			}),
			hint !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: ip_pool_module_css_default.fieldHint,
				children: hint
			})
		]
	});
}
/** One editable string-list (manual proxies / subscription URLs / probe models). */
function StringList(props) {
	const { label, hint, values, placeholder, testId, redacted, onChange } = props;
	const [draft, setDraft] = (0, react.useState)("");
	const add = () => {
		const entry = draft.trim();
		if (entry === "" || values.includes(entry)) return;
		onChange([...values, entry]);
		setDraft("");
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: ip_pool_module_css_default.field,
		"data-testid": testId,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: ip_pool_module_css_default.fieldLabel,
				children: label
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: ip_pool_module_css_default.fieldHint,
				children: hint
			}),
			values.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
				className: ip_pool_module_css_default.rowList,
				children: values.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
					className: ip_pool_module_css_default.row,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ip_pool_module_css_default.rowLabel,
						title: redacted ? entry : void 0,
						children: redacted ? redactUrl(entry) : entry
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: ip_pool_module_css_default.rowRemove,
						onClick: () => onChange(values.filter((v) => v !== entry)),
						children: "✕"
					})]
				}, entry))
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ip_pool_module_css_default.row,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					className: ip_pool_module_css_default.rowInput,
					value: draft,
					placeholder,
					onChange: (event) => setDraft(event.target.value),
					onKeyDown: (event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							add();
						}
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: ip_pool_module_css_default.rowAdd,
					onClick: add,
					children: "+"
				})]
			})
		]
	});
}
/**
* Probe-model multi-select over the bridge /models rows: selected models as
* removable chips above a dropdown of S3-verified + live-catalog options
* (docs §5.2 探活模型). Empty selection = the S3-first default (big-pickle).
*/
function ModelPicker(props) {
	const { value, hint, models, loading, t, onChange } = props;
	const toggle = (id) => {
		onChange(value.includes(id) ? value.filter((entry) => entry !== id) : [...value, id]);
	};
	const options = models.filter((row) => !value.includes(row.id));
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: ip_pool_module_css_default.field,
		"data-testid": "field-probeModels",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: ip_pool_module_css_default.fieldLabel,
				children: t("probeModels")
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: ip_pool_module_css_default.fieldHint,
				children: hint
			}),
			value.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
				className: ip_pool_module_css_default.rowList,
				children: value.map((id) => {
					const row = models.find((m) => m.id === id);
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
						className: ip_pool_module_css_default.row,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: ip_pool_module_css_default.rowLabel,
							children: [id, row?.verified === false ? ` · ${t("probeModelUnverified")}` : ""]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: ip_pool_module_css_default.rowRemove,
							"aria-label": "remove",
							onClick: () => toggle(id),
							children: "✕"
						})]
					}, id);
				})
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: ip_pool_module_css_default.row,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
					className: ip_pool_module_css_default.select,
					"data-testid": "probe-model-select",
					value: "",
					disabled: options.length === 0,
					onChange: (event) => {
						const id = event.target.value;
						if (id !== "") toggle(id);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
						value: "",
						children: loading ? t("statusLoading") : options.length === 0 ? "—" : t("probeModelPick")
					}), options.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
						value: row.id,
						children: [row.id, row.verified === false ? ` · ${t("probeModelUnverified")}` : ""]
					}, row.id))]
				})
			}),
			value.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: ip_pool_module_css_default.fieldHint,
				children: t("probeModelsDefault")
			})
		]
	});
}
/** Pool overview strip: four-state badge + counts + pinned badge. */
function OverviewBar(props) {
	const { status, t } = props;
	if (status === null) return null;
	const stateLabel = {
		healthy: t("poolStateHealthy"),
		warning: t("poolStateWarning"),
		critical: t("poolStateCritical"),
		emergency: t("poolStateEmergency")
	};
	const stateClass = {
		healthy: ip_pool_module_css_default.badgeHealthy,
		warning: ip_pool_module_css_default.badgeWarning,
		critical: ip_pool_module_css_default.badgeCritical,
		emergency: ip_pool_module_css_default.badgeEmergency
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: ip_pool_module_css_default.overviewBar,
		"data-testid": "ip-pool-overview",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: `${ip_pool_module_css_default.badge} ${stateClass[status.state]}`,
				children: stateLabel[status.state]
			}),
			status.deferredReason !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: `${ip_pool_module_css_default.badge} ${ip_pool_module_css_default.badgeCritical}`,
				children: t("deferredNotice").replace("{reason}", status.deferredReason)
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("poolAvailable").replace("{available}", String(status.availableFree)).replace("{capacity}", String(status.targetSize)) }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("poolSources").replace("{free}", String(status.bySource.free)).replace("{manual}", String(status.bySource.manual)).replace("{subscription}", String(status.bySource.subscription)) }),
			status.pinned !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: `${ip_pool_module_css_default.badge} ${ip_pool_module_css_default.badgePinned}`,
				children: [t("pinnedBadge"), status.pinned.strict ? " (" + t("pinnedStrict") + ")" : ""]
			})
		]
	});
}
/** The exit table + ban list. */
function ExitTable(props) {
	const { status, t, onProbe, onPin, busy } = props;
	const [bansOpen, setBansOpen] = (0, react.useState)(false);
	if (status === null) return null;
	const stateCell = (exit) => {
		if (exit.state === "dead") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			className: ip_pool_module_css_default.stateDead,
			children: t("stateDead")
		});
		if (exit.cooling) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			className: ip_pool_module_css_default.stateCooling,
			children: t("stateCooling")
		});
		if (exit.state === "ok") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			className: ip_pool_module_css_default.stateOk,
			children: t("stateOk")
		});
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			className: ip_pool_module_css_default.stateUnknown,
			children: t("stateUnknown")
		});
	};
	const allBans = status.exits.flatMap((exit) => exit.bannedModels.map((ban) => ({
		exitId: exit.id,
		...ban
	})));
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: ip_pool_module_css_default.table,
		"data-testid": "ip-pool-exits",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
			className: ip_pool_module_css_default.tableGrid,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("exitAddress") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("exitSource") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("exitLocation") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("exitLatency") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("exitQuality") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("exitIp") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("exitState") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("exitPassive") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {})
			] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tbody", { children: [status.exits.map((exit) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", {
					className: ip_pool_module_css_default.mono,
					children: [exit.id, exit.pinned ? ` · ${t("exitPinnedMark")}` : ""]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: exit.source }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: exit.exitLocation || "—" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: exit.latencyMs > 0 ? `${exit.latencyMs}ms` : "—" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: exit.latencyMs > 0 ? exit.quality : "—" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
					className: ip_pool_module_css_default.mono,
					children: exit.exitIP || "—"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: stateCell(exit) }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
					className: ip_pool_module_css_default.mono,
					children: exit.passive.ok > 0 || exit.passive.limited > 0 || exit.passive.refused > 0 || exit.passive.dead > 0 || exit.passive.transport > 0 ? `✓${exit.passive.ok} 429:${exit.passive.limited} 401/403:${exit.passive.refused} ✗:${exit.passive.dead + exit.passive.transport}` : "—"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: ip_pool_module_css_default.rowRemove,
					disabled: busy,
					onClick: () => onProbe(exit.id),
					children: t("exitProbe")
				}), !exit.pinned && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: ip_pool_module_css_default.rowRemove,
					disabled: busy,
					onClick: () => onPin(exit.id),
					children: t("exitPin")
				})] })
			] }, exit.id)), status.exits.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
				colSpan: 9,
				className: ip_pool_module_css_default.status,
				children: t("statusUnavailable")
			}) })] })]
		})
	}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: ip_pool_module_css_default.section,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			type: "button",
			className: ip_pool_module_css_default.collapseToggle,
			onClick: () => setBansOpen((open) => !open),
			children: [
				t(bansOpen ? "collapse" : "expand"),
				" · ",
				t("sectionBans"),
				" (",
				allBans.length,
				")"
			]
		}), bansOpen && (allBans.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			className: ip_pool_module_css_default.status,
			children: t("bansEmpty")
		}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
			className: ip_pool_module_css_default.rowList,
			children: allBans.map((ban) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
				className: ip_pool_module_css_default.row,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: ip_pool_module_css_default.rowLabel,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: ban.state === "banned" ? ip_pool_module_css_default.stateDead : ip_pool_module_css_default.stateCooling,
							children: ban.state === "banned" ? t("banBanned") : t("banSuspect")
						}),
						" · ",
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: ip_pool_module_css_default.mono,
							children: ban.exitId
						}),
						" × ",
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: ip_pool_module_css_default.mono,
							children: ban.model
						})
					]
				})
			}, `${ban.exitId}|${ban.model}`))
		}))]
	})] });
}
/** The card body. */
function CardBody(props) {
	const { scope, useSnapshot, t } = props;
	const snapshot = useSnapshot();
	const [form, setForm] = (0, react.useState)(() => emptyForm());
	const [saving, setSaving] = (0, react.useState)(false);
	const [saved, setSaved] = (0, react.useState)(false);
	const [error, setError] = (0, react.useState)(null);
	const [status, setStatus] = (0, react.useState)(null);
	const [statusError, setStatusError] = (0, react.useState)(null);
	const [probeModelRows, setProbeModelRows] = (0, react.useState)([]);
	const [probeModelsLoading, setProbeModelsLoading] = (0, react.useState)(false);
	const [actionBusy, setActionBusy] = (0, react.useState)(false);
	const hydratedRef = (0, react.useRef)(false);
	const formRef = (0, react.useRef)(form);
	formRef.current = form;
	(0, react.useEffect)(() => {
		if (snapshot.status === "ready" && !hydratedRef.current && snapshot.value !== void 0) {
			hydratedRef.current = true;
			setForm(formFromValue(snapshot.value));
		}
	}, [snapshot.status, snapshot.value]);
	(0, react.useEffect)(() => {
		let cancelled = false;
		setProbeModelsLoading(true);
		fetch(`${BRIDGE_PREFIX}/models`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}"
		}).then((response) => response.json()).then((body) => {
			if (!cancelled && body.ok && body.value) setProbeModelRows(body.value.models);
		}).catch(() => {}).finally(() => {
			if (!cancelled) setProbeModelsLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, []);
	const probing = status !== null && status.prober.queued + status.prober.inFlight > 0;
	const refilling = status?.refill?.progress.running === true;
	const refreshStatus = (0, react.useCallback)(async () => {
		try {
			const body = await (await fetch(`${BRIDGE_PREFIX}/status`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{}"
			})).json();
			if (body.ok && body.value) {
				setStatus(body.value);
				setStatusError(null);
			} else setStatusError(t("refreshError"));
		} catch {
			setStatusError(t("refreshError"));
		}
	}, [t]);
	(0, react.useEffect)(() => {
		if (snapshot.status !== "ready" || !hydratedRef.current || !form.enabled) return;
		refreshStatus();
		const interval = setInterval(() => void refreshStatus(), probing || refilling ? 1e3 : 3e3);
		return () => clearInterval(interval);
	}, [
		snapshot.status,
		form.enabled,
		probing,
		refilling,
		refreshStatus,
		hydratedRef.current
	]);
	if (snapshot.status === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
		className: ip_pool_module_css_default.status,
		children: t("statusLoading")
	});
	if (snapshot.status === "unavailable") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
		className: ip_pool_module_css_default.status,
		children: t("statusUnavailable")
	});
	const validate = () => {
		const size = Number(form.targetSize);
		if (!/^\d+$/.test(form.targetSize.trim()) || size < 1 || size > 100) return t("invalidRange");
		const conc = Number(form.maxConcurrentProbes);
		if (!/^\d+$/.test(form.maxConcurrentProbes.trim()) || conc < 1 || conc > 8) return t("invalidRange");
		const refresh = Number(form.refreshMs);
		if (!/^\d+$/.test(form.refreshMs.trim()) || refresh < 6e4) return t("invalidRange");
		for (const entry of form.manual) if (!/^https?:\/\/[^\s:]+:\d{1,5}$|^socks5:\/\/[^\s:]+:\d{1,5}$|^socks5h?:\/\/\[[^\]]+\]:\d{1,5}$/.test(entry)) return t("invalidProxy");
		for (const url of form.subscriptionUrls) if (!/^https?:\/\/.+/.test(url)) return t("invalidUrl");
		for (const country of splitCsv(form.blockedCountries)) if (!/^[A-Z]{2}$/.test(country)) return t("invalidCountry");
		for (const model of form.probeModels) if (model.trim() === "") return t("invalidModel");
		return null;
	};
	const handleSave = async () => {
		const validation = validate();
		if (validation !== null) {
			setSaved(false);
			setError(validation);
			return;
		}
		const writes = diffWrites(formRef.current, snapshot);
		if (writes.length === 0) {
			setSaved(true);
			setError(null);
			return;
		}
		setSaving(true);
		setError(null);
		let firstFailure = null;
		for (const write of writes) try {
			await scope.set(write.field, write.value);
		} catch (err) {
			firstFailure ??= err instanceof Error ? err.message : t("saveError");
		}
		setSaving(false);
		if (firstFailure === null) setSaved(true);
		else {
			setSaved(false);
			setError(firstFailure);
		}
	};
	const handleReset = async () => {
		setSaving(true);
		setError(null);
		let firstFailure = null;
		for (const field of [
			"enabled",
			"free",
			"manual",
			"subscription",
			"singbox",
			"pinnedExitId",
			"pinnedStrict",
			"probeModels",
			"maxConcurrentProbes"
		]) try {
			await scope.unset(field);
		} catch (err) {
			firstFailure ??= err instanceof Error ? err.message : t("saveError");
		}
		setSaving(false);
		if (firstFailure === null) {
			setForm(formFromValue({
				...DEFAULTS,
				...snapshot.base
			}));
			setSaved(true);
		} else {
			setSaved(false);
			setError(firstFailure);
		}
	};
	/** One bridge action (/probe). */
	const bridgeAction = async (body) => {
		setActionBusy(true);
		try {
			await fetch(`${BRIDGE_PREFIX}/probe`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body)
			});
			await refreshStatus();
		} catch {
			setStatusError(t("refreshError"));
		} finally {
			setActionBusy(false);
		}
	};
	/** Pin an exit from the table: writes pinnedExitId and saves immediately. */
	const pinExit = async (exitId) => {
		setActionBusy(true);
		try {
			await scope.set("pinnedExitId", exitId);
			setForm((current) => ({
				...current,
				pinnedExitId: exitId
			}));
		} catch (err) {
			setError(err instanceof Error ? err.message : t("saveError"));
		} finally {
			setActionBusy(false);
		}
	};
	const probeDone = status !== null ? status.prober.completed : 0;
	const probeTotal = status !== null ? status.prober.enqueued : 0;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: ip_pool_module_css_default.body,
		"data-testid": "ip-pool-form",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(OverviewBar, {
				status: form.enabled ? status : null,
				t
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: ip_pool_module_css_default.radio,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					type: "checkbox",
					checked: form.enabled,
					"data-testid": "field-enabled",
					onChange: (event) => {
						setSaved(false);
						setForm({
							...form,
							enabled: event.target.checked
						});
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: ip_pool_module_css_default.fieldLabel,
					children: t("enabled")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: ip_pool_module_css_default.fieldHint,
					children: [" ", t("enabledHint")]
				})] })]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ip_pool_module_css_default.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ip_pool_module_css_default.sectionTitle,
						children: t("sectionFree")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: ip_pool_module_css_default.radio,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: form.freeEnabled,
							"data-testid": "field-freeEnabled",
							onChange: (event) => {
								setSaved(false);
								setForm({
									...form,
									freeEnabled: event.target.checked
								});
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: ip_pool_module_css_default.fieldLabel,
							children: t("freeEnabled")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: ip_pool_module_css_default.fieldHint,
							children: [" ", t("freeEnabledHint")]
						})] })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: ip_pool_module_css_default.fieldRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextField, {
							label: t("freeTargetSize"),
							hint: t("freeTargetSizeHint"),
							value: form.targetSize,
							testId: "field-targetSize",
							type: "number",
							min: 1,
							max: 100,
							step: 1,
							onChange: (value) => {
								setSaved(false);
								setForm({
									...form,
									targetSize: value
								});
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextField, {
							label: t("freeBlockedCountries"),
							hint: t("freeBlockedCountriesHint"),
							value: form.blockedCountries,
							testId: "field-blockedCountries",
							onChange: (value) => {
								setSaved(false);
								setForm({
									...form,
									blockedCountries: value
								});
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: ip_pool_module_css_default.ghostButton,
						"data-testid": "refill-now",
						disabled: actionBusy || !form.enabled || refilling,
						onClick: () => {
							bridgeAction({ scope: "refill" });
						},
						children: refilling ? t("refillRunning") : t("refillNow")
					}),
					refilling && status?.refill?.progress !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ip_pool_module_css_default.status,
						"data-testid": "refill-progress",
						children: refillProgressLine(status.refill.progress, t)
					}),
					!refilling && status?.refill?.progress.stage === "idle" && (status.refill.progress.admitted > 0 || status.refill.progress.admissions > 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ip_pool_module_css_default.status,
						children: t("refillSummary").replace("{admitted}", String(status.refill.progress.admitted)).replace("{fetched}", String(status.refill.progress.candidates))
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ip_pool_module_css_default.section,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: ip_pool_module_css_default.sectionTitle,
					children: t("sectionManual")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StringList, {
					label: t("sectionManual"),
					hint: t("manualHint"),
					values: form.manual,
					placeholder: t("manualPlaceholder"),
					testId: "field-manual",
					onChange: (next) => {
						setSaved(false);
						setForm({
							...form,
							manual: next
						});
					}
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ip_pool_module_css_default.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ip_pool_module_css_default.sectionTitle,
						children: t("sectionSubscription")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StringList, {
						label: t("sectionSubscription"),
						hint: t("subscriptionHint"),
						values: form.subscriptionUrls,
						placeholder: t("subscriptionPlaceholder"),
						testId: "field-subscriptions",
						redacted: true,
						onChange: (next) => {
							setSaved(false);
							setForm({
								...form,
								subscriptionUrls: next
							});
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: ip_pool_module_css_default.fieldRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextField, {
							label: t("subscriptionRefreshMs"),
							hint: t("subscriptionRefreshMsHint"),
							value: form.refreshMs,
							testId: "field-refreshMs",
							type: "number",
							min: 6e4,
							step: 1,
							onChange: (value) => {
								setSaved(false);
								setForm({
									...form,
									refreshMs: value
								});
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: ip_pool_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: ip_pool_module_css_default.fieldLabel,
								children: " "
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: ip_pool_module_css_default.ghostButton,
								"data-testid": "refresh-subscriptions",
								disabled: actionBusy || !form.enabled,
								onClick: () => {
									bridgeAction({ scope: "refill" });
								},
								children: t("subscriptionRefreshNow")
							})]
						})]
					}),
					status?.subscription !== null && status?.subscription !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: ip_pool_module_css_default.status,
						children: [
							t("sectionSubscription"),
							": ",
							status.subscription.pendingConversion,
							" 待转换 · ",
							status.subscription.convertedAdmitted,
							" 已转换入池",
							status.subscription.lastError !== "" ? ` · ${status.subscription.lastError}` : ""
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextField, {
						label: t("singboxPath"),
						hint: t("singboxPathHint"),
						value: form.singboxPath,
						testId: "field-singboxPath",
						onChange: (value) => {
							setSaved(false);
							setForm({
								...form,
								singboxPath: value
							});
						}
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ip_pool_module_css_default.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ip_pool_module_css_default.sectionTitle,
						children: t("sectionPinned")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextField, {
						label: t("pinnedAddress"),
						hint: t("pinnedAddressHint"),
						value: form.pinnedExitId,
						placeholder: t("manualPlaceholder"),
						testId: "field-pinnedExitId",
						onChange: (value) => {
							setSaved(false);
							setForm({
								...form,
								pinnedExitId: value
							});
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ip_pool_module_css_default.fieldLabel,
						children: t("pinnedStrict")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ip_pool_module_css_default.fieldHint,
						children: t("pinnedStrictHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: ip_pool_module_css_default.radio,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "radio",
							name: "ip-pool-strict",
							checked: !form.pinnedStrict,
							onChange: () => {
								setSaved(false);
								setForm({
									...form,
									pinnedStrict: false
								});
							}
						}), t("pinnedStrictOff")]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: ip_pool_module_css_default.radio,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "radio",
							name: "ip-pool-strict",
							checked: form.pinnedStrict,
							"data-testid": "field-pinnedStrict",
							onChange: () => {
								setSaved(false);
								setForm({
									...form,
									pinnedStrict: true
								});
							}
						}), t("pinnedStrictOn")]
					}),
					form.pinnedExitId !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: ip_pool_module_css_default.ghostButton,
						"data-testid": "unpin",
						disabled: saving,
						onClick: () => {
							setSaved(false);
							setForm({
								...form,
								pinnedExitId: ""
							});
						},
						children: t("pinnedUnset")
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ip_pool_module_css_default.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ip_pool_module_css_default.sectionTitle,
						children: t("sectionProbe")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelPicker, {
						value: form.probeModels,
						hint: t("probeModelsHint"),
						models: probeModelRows,
						loading: probeModelsLoading,
						t,
						onChange: (next) => {
							setSaved(false);
							setForm({
								...form,
								probeModels: next
							});
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextField, {
						label: t("probeConcurrency"),
						hint: t("probeConcurrencyHint"),
						value: form.maxConcurrentProbes,
						testId: "field-maxConcurrentProbes",
						type: "number",
						min: 1,
						max: 8,
						step: 1,
						onChange: (value) => {
							setSaved(false);
							setForm({
								...form,
								maxConcurrentProbes: value
							});
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: ip_pool_module_css_default.ghostButton,
						"data-testid": "probe-all",
						disabled: actionBusy || !form.enabled,
						onClick: () => {
							bridgeAction({ scope: "all" });
						},
						children: probing ? t("probeRunning").replace("{done}", String(probeDone)).replace("{total}", String(probeTotal)) : t("probeAll")
					})
				]
			}),
			form.enabled && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: ip_pool_module_css_default.field,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: ip_pool_module_css_default.fieldLabel,
					children: t("sectionExits")
				})
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ExitTable, {
				status,
				t,
				busy: actionBusy,
				onProbe: (id) => {
					bridgeAction({
						scope: "exit",
						exitId: id
					});
				},
				onPin: (id) => {
					pinExit(id);
				}
			})] }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ip_pool_module_css_default.footer,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: ip_pool_module_css_default.primaryButton,
						"data-testid": "save-ip-pool",
						disabled: saving || !snapshot.writable,
						onClick: () => {
							handleSave();
						},
						children: saving ? t("saving") : t("save")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: ip_pool_module_css_default.ghostButton,
						"data-testid": "reset-ip-pool",
						disabled: saving || !snapshot.writable,
						onClick: () => {
							handleReset();
						},
						children: t("reset")
					}),
					statusError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ip_pool_module_css_default.saveStatusError,
						children: statusError
					}),
					saved && !error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: `${ip_pool_module_css_default.saveStatus} ${ip_pool_module_css_default.saveStatusOk}`,
						children: t("saved")
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: `${ip_pool_module_css_default.saveStatus} ${ip_pool_module_css_default.saveStatusError}`,
						children: [
							t("saveError"),
							"：",
							error
						]
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: ip_pool_module_css_default.compliance,
				children: t("copyCompliance")
			})
		]
	});
}
/**
* The IP 池 plugin card. Renders nothing until the slot outlet supplies the
* inject face; the section stacks cards and reports their count.
*/
function IpPoolCard(props) {
	const { scope, useSnapshot, t } = props;
	const [open, setOpen] = (0, react.useState)(false);
	(0, react.useMemo)(() => void 0, []);
	if (scope === void 0 || useSnapshot === void 0 || t === void 0) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
		className: ip_pool_module_css_default.card,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			type: "button",
			className: ip_pool_module_css_default.header,
			"aria-expanded": open,
			"aria-label": `${t(open ? "collapse" : "expand")}: ${t("title")}`,
			"data-testid": "ip-pool-card-header",
			onClick: () => setOpen((current) => !current),
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: ip_pool_module_css_default.headText,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: ip_pool_module_css_default.name,
					children: t("title")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: ip_pool_module_css_default.description,
					children: t("description")
				})]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: ip_pool_module_css_default.chevron + (open ? ` ${ip_pool_module_css_default.chevronOpen}` : "") })]
		}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CardBody, {
			scope,
			useSnapshot,
			t
		})]
	});
}

//#endregion
//#region src/client/locales.ts
/**
* The `settings.ip-pool` locale dictionaries for the IP 池 card (docs/ip-pool.md
* §5.2 block table). Keys track exactly the UI-surfaced strings.
*/
/** Simplified Chinese dictionary (the key-set source of truth). */
const zh = {
	nav: "IP 池",
	title: "IP 池（opencode2dsh）",
	description: "多出口调度免费模型的可用性：出口间自动轮换、429 冷却、按出口×模型探活。",
	statusLoading: "加载中…",
	statusUnavailable: "设置服务不可用，无法读写 IP 池配置。",
	enabled: "启用 IP 池（enabled）",
	enabledHint: "关闭后全部流量直连，行为与本插件未装 IP 池时完全一致。",
	poolState: "池状态",
	poolStateHealthy: "健康",
	poolStateWarning: "偏低",
	poolStateCritical: "告急",
	poolStateEmergency: "枯竭",
	poolAvailable: "可用 {available}/{capacity}",
	poolSources: "出口来源：免费 {free} · 手填 {manual} · 订阅 {subscription}",
	pinnedBadge: "固定主力",
	deferredNotice: "路由已退避：{reason}",
	sectionFree: "免费源（free）",
	freeEnabled: "免费源抓取",
	freeEnabledHint: "从公共免费代理清单抓取并准入；关闭后只用下述两类出口。",
	freeTargetSize: "目标容量（targetSize）",
	freeTargetSizeHint: "免费池要补到的可用出口数（1-100，默认 20）。",
	freeBlockedCountries: "地理黑名单（blockedCountries）",
	freeBlockedCountriesHint: "ISO 国家码（逗号分隔），命中的出口不收。默认 CN。",
	refillNow: "立即补充",
	refillRunning: "补充中…",
	refillStageFetch: "① 拉取免费源清单",
	refillStageCoarse: "② 粗筛存活",
	refillStageAdmit: "③ 准入探测",
	refillStageIdle: "完成",
	refillCountSources: "已拉取 {done}/{total} 个源",
	refillCountFetched: "共 {n} 条",
	refillCountCoarse: "已筛 {done}/{total} · 存活 {passed}",
	refillCountAdmit: "已探 {done} · 入池 {admitted}",
	refillSummary: "上轮补充：入池 {admitted} 个（候选 {fetched}）",
	sectionManual: "手填代理（manual）",
	manualHint: "一行一个：http://host:port 或 socks5://host:port。适合自备节点/专线。",
	manualAdd: "添加代理",
	manualPlaceholder: "http://127.0.0.1:7897",
	sectionSubscription: "订阅（subscription）",
	subscriptionHint: "机场/自建 Clash·V2ray 订阅 URL，一行一个；明文节点直拨，加密节点经 sing-box 转换。",
	subscriptionAdd: "添加订阅",
	subscriptionPlaceholder: "https://…",
	subscriptionRefreshMs: "刷新间隔（毫秒）",
	subscriptionRefreshMsHint: "默认 1,800,000（30 分钟）。订阅只低频拉取，绝不并发轰炸。",
	subscriptionRefreshNow: "立即刷新",
	singboxPath: "sing-box 路径（singbox.path）",
	singboxPathHint: "加密节点的转换核心：PATH 名或绝对路径。未装则加密节点停在「待转换」。",
	sectionPinned: "固定主力出口（pinned）",
	pinnedAddress: "主力出口地址",
	pinnedAddressHint: "例如 Clash 混合端口 http://127.0.0.1:7897，或专线 http://host:port。即填即固定。",
	pinnedStrict: "绝对固定（pinnedStrict）",
	pinnedStrictHint: "开启后失败原样透传：不换出口、不直连。适合「这个出口必须用」的场景。",
	pinnedStrictOn: "绝对固定：失败也不换、不直连",
	pinnedStrictOff: "主力+备胎：429/断线自动切换，恢复后回归",
	pinnedUnset: "解除固定",
	sectionProbe: "探活（probe）",
	probeModels: "探活模型（probeModels）",
	probeModelsHint: "从列表选择探活模型；不选 = 默认 big-pickle。同一出口内多模型串行探测。",
	probeModelPick: "选择模型…",
	probeModelUnverified: "未验证",
	probeModelsDefault: "当前使用默认探活模型：big-pickle（S3 已验证清单首个）。",
	probeConcurrency: "并发上限（maxConcurrentProbes）",
	probeConcurrencyHint: "不同出口并发探测的上限（1-8，默认 3）；同一出口永远串行。",
	probeAll: "批量探活",
	probeRunning: "探活中 {done}/{total}…",
	sectionExits: "出口列表",
	exitAddress: "地址",
	exitSource: "来源",
	exitLocation: "位置",
	exitLatency: "延迟",
	exitQuality: "质量",
	exitIp: "出口 IP",
	exitState: "状态",
	exitPassive: "真实流量",
	stateOk: "ok",
	stateCooling: "冷却中",
	stateDead: "dead",
	stateUnknown: "未探活",
	exitProbe: "探测",
	exitPin: "固定为主力",
	exitPinnedMark: "主力",
	sectionBans: "模型封禁列表",
	bansEmpty: "没有已封禁的 (出口 × 模型) 对。",
	banBanned: "已封禁",
	banSuspect: "疑似",
	copyCompliance: "匿名配额受上游限流；多出口不绕过配额，只在出口间调度。固定/订阅节点优先；公共免费代理有安全与合规风险。",
	save: "保存",
	saving: "保存中…",
	saved: "已保存，立即生效",
	reset: "恢复默认",
	saveError: "保存失败",
	invalidRange: "数值超出允许范围。",
	invalidProxy: "代理地址格式应为 http://host:port 或 socks5://host:port。",
	invalidUrl: "请填写合法的 http(s) URL。",
	invalidCountry: "国家码应为两个字母（如 CN），逗号分隔。",
	invalidModel: "模型 id 不能为空。",
	refreshError: "状态获取失败",
	expand: "展开",
	collapse: "收起"
};
/** English dictionary, checked complete against the zh key set. */
const en = {
	nav: "IP Pool",
	title: "IP Pool (opencode2dsh)",
	description: "Schedules free-model availability across exit IPs: rotation, 429 cooldown, per-exit×model probes.",
	statusLoading: "Loading…",
	statusUnavailable: "Settings service unavailable; the IP pool configuration cannot be read or written.",
	enabled: "Enable IP pool (enabled)",
	enabledHint: "Off = every request goes direct, exactly as if the pool were not installed.",
	poolState: "Pool state",
	poolStateHealthy: "healthy",
	poolStateWarning: "low",
	poolStateCritical: "critical",
	poolStateEmergency: "depleted",
	poolAvailable: "{available}/{capacity} usable",
	poolSources: "Sources: free {free} · manual {manual} · subscription {subscription}",
	pinnedBadge: "pinned",
	deferredNotice: "Routing deferred: {reason}",
	sectionFree: "Free sources (free)",
	freeEnabled: "Free-source fetching",
	freeEnabledHint: "Fetch public free-proxy lists and admit survivors; off uses only the sources below.",
	freeTargetSize: "Target size (targetSize)",
	freeTargetSizeHint: "Usable free exits the pool refills to (1-100, default 20).",
	freeBlockedCountries: "Geo blocklist (blockedCountries)",
	freeBlockedCountriesHint: "ISO country codes, comma-separated; matching exits are refused. Default CN.",
	refillNow: "Refill now",
	refillRunning: "Refilling…",
	refillStageFetch: "① fetching source lists",
	refillStageCoarse: "② coarse screening",
	refillStageAdmit: "③ admission probes",
	refillStageIdle: "done",
	refillCountSources: "{done}/{total} sources answered",
	refillCountFetched: "{n} rows",
	refillCountCoarse: "screened {done}/{total} · {passed} alive",
	refillCountAdmit: "probed {done} · admitted {admitted}",
	refillSummary: "last round: admitted {admitted} (of {fetched} candidates)",
	sectionManual: "Manual proxies (manual)",
	manualHint: "One per line: http://host:port or socks5://host:port. For your own nodes.",
	manualAdd: "Add proxy",
	manualPlaceholder: "http://127.0.0.1:7897",
	sectionSubscription: "Subscriptions (subscription)",
	subscriptionHint: "Airport/self-hosted Clash·V2ray subscription URLs, one per line; plaintext nodes dial directly, encrypted ones convert via sing-box.",
	subscriptionAdd: "Add subscription",
	subscriptionPlaceholder: "https://…",
	subscriptionRefreshMs: "Refresh interval (ms)",
	subscriptionRefreshMsHint: "Default 1,800,000 (30 min). Subscriptions are pulled gently, never fanned out.",
	subscriptionRefreshNow: "Refresh now",
	singboxPath: "sing-box path (singbox.path)",
	singboxPathHint: "Conversion core for encrypted nodes: PATH name or absolute path. Without it they stay \"pending conversion\".",
	sectionPinned: "Pinned primary exit (pinned)",
	pinnedAddress: "Primary exit address",
	pinnedAddressHint: "e.g. a Clash mixed port http://127.0.0.1:7897, or a leased line. Pins on save.",
	pinnedStrict: "Absolute pinning (pinnedStrict)",
	pinnedStrictHint: "Failures pass through verbatim: no rotation, no direct fallback. For \"this exit must be used\".",
	pinnedStrictOn: "Absolute: never rotate, never direct",
	pinnedStrictOff: "Primary + fallback: rotate on 429/drop, return when recovered",
	pinnedUnset: "Unpin",
	sectionProbe: "Probing (probe)",
	probeModels: "Probe models (probeModels)",
	probeModelsHint: "Pick probe models from the list; none selected = default big-pickle. Multiple models stay serial per exit.",
	probeModelPick: "Pick a model…",
	probeModelUnverified: "unverified",
	probeModelsDefault: "Using the default probe model: big-pickle (first of the S3 verified list).",
	probeConcurrency: "Concurrency cap (maxConcurrentProbes)",
	probeConcurrencyHint: "Cross-exit probe cap (1-8, default 3); one exit is always serial.",
	probeAll: "Probe all",
	probeRunning: "Probing {done}/{total}…",
	sectionExits: "Exits",
	exitAddress: "Address",
	exitSource: "Source",
	exitLocation: "Location",
	exitLatency: "Latency",
	exitQuality: "Quality",
	exitIp: "Exit IP",
	exitState: "State",
	exitPassive: "Live traffic",
	stateOk: "ok",
	stateCooling: "cooling",
	stateDead: "dead",
	stateUnknown: "unprobed",
	exitProbe: "Probe",
	exitPin: "Pin",
	exitPinnedMark: "primary",
	sectionBans: "Model bans",
	bansEmpty: "No banned (exit × model) pairs.",
	banBanned: "banned",
	banSuspect: "suspect",
	copyCompliance: "Anonymous quota is upstream-rate-limited; multiple exits do not bypass quota, they schedule across it. Pinned/subscription nodes first; public free proxies carry security and compliance risk.",
	save: "Save",
	saving: "Saving…",
	saved: "Saved, applied live",
	reset: "Reset to defaults",
	saveError: "Save failed",
	invalidRange: "A value is out of range.",
	invalidProxy: "Expected http://host:port or socks5://host:port.",
	invalidUrl: "Enter a valid http(s) URL.",
	invalidCountry: "Country codes are two letters (e.g. CN), comma-separated.",
	invalidModel: "Model id must not be empty.",
	refreshError: "Status fetch failed",
	expand: "Expand",
	collapse: "Collapse"
};

//#endregion
//#region src/client/index.ts
/** Dictionary namespace owned by this plugin. */
const NS = "settings.ip-pool";
/** The settings namespace this card edits (mirrors the Host half). */
const SETTINGS_NAMESPACE = "ip-pool";
/** Required services (cordis fiber inject). */
const inject = [
	"slots",
	"locale",
	"settingsScope"
];
/**
* Register the IP 池 plugin card once the `settings.plugin.item` declaration
* is on the ledger, and bind the ip-pool settings scope.
* @param ctx - client root context.
*/
function apply(ctx) {
	ctx.effect(() => ctx.locale.register(NS, {
		zh,
		en
	}), "opencode2dsh: copy dictionaries");
	const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE });
	const getSnapshot = scope.getSnapshot.bind(scope);
	const subscribe = scope.subscribe.bind(scope);
	const useSnapshot = () => (0, react.useSyncExternalStore)(subscribe, getSnapshot);
	const t = ctx.locale.bind(NS);
	const injected = () => ({
		scope,
		useSnapshot,
		t
	});
	ctx.slots.inject("settings.plugin.item", function* () {
		let kind;
		try {
			kind = ctx.slots.spec("settings.plugin.item")?.kind;
		} catch {}
		const options = kind === "list" ? {
			name: "settings.plugin.item",
			id: SETTINGS_NAMESPACE,
			locale: NS,
			inject: injected
		} : {
			name: "settings.plugin.item",
			key: SETTINGS_NAMESPACE,
			locale: NS,
			inject: injected
		};
		try {
			yield ctx.slots.register(options, IpPoolCard);
		} catch (err) {
			console.warn(`opencode2dsh: settings card rejected by this DSH build (${err instanceof Error ? err.message : String(err)}) — model routing is unaffected; upgrade DSH to >= 0.1.0-rc.7 for the settings page`);
		}
	});
}

//#endregion
exports.apply = apply;
exports.inject = inject;
return module.exports; } });
//# sourceMappingURL=client.js.map