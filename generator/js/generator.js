// =====================================================
// generator.js
// TXT → HTML 変換 & プレビュー生成
// =====================================================



// =====================================================
// アプリ全体設定・定数
// =====================================================

// -------------------------------
// 実行時設定
// -------------------------------
const runtimeConfig = {
    outputName: "scenario",
    mokujiLevel: 3,
    furigana: false,
    tango: false,
features: {
    countText: true,
}
};

// -------------------------------
// BOX定義（装飾ブロック）
// -------------------------------
const BOX_DEFS = {
    fold: {
        mark: ">",
        state: "inFoldBox",
        classBase: "fold",
        useDetails: true,
        closeHtml: "</div></details>"
    },
    deco: {
        mark: "d",
        state: "inDecoBox",
        classBase: "deco",
        closeHtml: "</div></div>"
    },
    copy: {
        mark: "=",
        state: "inCopyBox",
        classBase: "copy",
        clickable: true,
        closeHtml: "</div></div>"
    },
    info: {
        mark: "i",
        state: "inInfoBox",
        classBase: "info",
        useInfo: true,
        closeHtml: "</div></div>"
    },
    style: {
        closeHtml: "</div>"
    }
};




// =====================================================
// DOM取得・UI要素
// =====================================================

// -------------------------------
// プレビュー関連
// -------------------------------
const preview = document.getElementById("preview");
const toggleBtn = document.getElementById("togglePreviewBtn");
const layout = document.getElementById("layout");

// -------------------------------
// 入力・操作系
// -------------------------------
const input = document.getElementById("txtInput");
const btn = document.getElementById("generateBtn");
const editor = document.getElementById("textEditor");

// -------------------------------
// 設定UI
// -------------------------------
const outputNameInput = document.getElementById("outputName");
const mokujiSelect = document.getElementById("mokujiLevel");
const mokujiAutoNumChk = document.getElementById("mokujiAutoNumFlg");
const furiganaChk = document.getElementById("furiganaOnOffFlg");
const tangoChk = document.getElementById("tangoHenkanFlg");



// =====================================================
// UI設定同期・イベント登録
// =====================================================

// -------------------------------
// 設定同期
// -------------------------------
function syncConfig() {
    runtimeConfig.outputName = outputNameInput.value || "scenario";
    runtimeConfig.mokujiLevel = Number(mokujiSelect.value);
    runtimeConfig.mokujiAutoNum = mokujiAutoNumChk.checked;
    runtimeConfig.furigana = furiganaChk.checked;
    runtimeConfig.tango = tangoChk.checked;
}

// 設定変更時は即プレビュー更新
[outputNameInput, mokujiSelect, mokujiAutoNumChk, furiganaChk, tangoChk].forEach(el =>
    el.addEventListener("change", updatePreview)
);



// =====================================================
// プレビュー制御
// =====================================================

let previewVisible = true;
let previewTimer = null;

// ------------------------------
// プレビュー更新
// ------------------------------
function updatePreview() {
    const iframe = preview;

    // 先にスクロール位置を取得
    const prevScroll =
        iframe.contentWindow?.scrollY ??
        iframe.contentDocument?.documentElement?.scrollTop ??
        0;

    syncConfig();

    const text = editor.value;
    if (!text) {
        iframe.srcdoc = "";
        return;
    }

    // srcdoc 更新
    iframe.srcdoc = buildHtml(text, prev = false);

    // load は once で登録
    iframe.addEventListener(
        "load",
        () => {
            const win = iframe.contentWindow;
            const doc = iframe.contentDocument;
            if (!win || !doc) return;

            const html = doc.documentElement;

            // スクロール復元
            html.style.scrollBehavior = "auto";
            requestAnimationFrame(() => {
                win.scrollTo(0, prevScroll);
                requestAnimationFrame(() => {
                    html.style.scrollBehavior = "";
                });
            });

            // アンカー押下時の遷移制御
            setupAnchorNavigation(win, doc);
        },
        { once: true }
    );


}

// ------------------------------
// プレビュー表示切替
// ------------------------------
toggleBtn.addEventListener("click", () => {
    previewVisible = !previewVisible;

    if (previewVisible) {
        preview.style.display = "block";
        layout.classList.remove("hide-preview");
        toggleBtn.textContent = "ON";
    } else {
        preview.style.display = "none";
        layout.classList.add("hide-preview");
        toggleBtn.textContent = "OFF";
    }
});

// -------------------------------
// エディタ入力（リアルタイムプレビュー）
// -------------------------------
editor.addEventListener("input", () => {
    if (!editor.value.trim()) {
        preview.srcdoc = "";
        return;
    }
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 300);
});

// -------------------------------
// TXTファイル読込
// -------------------------------
input.addEventListener("change", () => {
    const reader = new FileReader();
    reader.onload = () => {
        editor.value = reader.result;
        updatePreview();
    };
    reader.readAsText(input.files[0], "utf-8");
});

// -------------------------------
// HTMLダウンロード
// -------------------------------
btn.addEventListener("click", () => {
    syncConfig();
    if (!editor.value) {
        alert("TXTを入力してください");
        return;
    }
    download(buildHtml(editor.value), runtimeConfig.outputName + ".html");
});



// =====================================================
// TXT → HTML 変換
// =====================================================

function extractBlock(txt, tag) {
    const reg = new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`);
    const match = txt.match(reg);
    return match ? match[1].trim() : "";
}

// headerブロック生成
function parseHeaderBlock(headerTxt) {
    if (!headerTxt) return "";

    const lines = headerTxt.split(/\r?\n/);
    const state = new ParseState();
    const ctx = createContext(state);

    lines.forEach(line => {
        for (const ruleDef of rules) {
            const rule = ruleDef.match(line, ctx);
            if (rule) {
                ruleDef.handle(rule, ctx, line);
                return;
            }
        }
        ruleDefault().handle(line, ctx);
    });

    ctx.flushParagraph();

    // 未クローズBOXを閉じる
    while (ctx.s.boxStack.length) {
        const box = ctx.s.boxStack.pop();
        box.buffer.push(box.def.closeHtml);
        pushHtml(ctx, box.buffer.join("\n"));
    }

    // list / table も保険で閉じる
    closeListIfNeeded(ctx);
    closeTableIfNeeded(ctx);

    return state.body.join("\n");
}

// HTML組み立て
function buildHtml(txt, prev = false) {
    // 文字数カウントのデフォルト値リセット
    runtimeConfig.features.countText = false;

    // タイトル・ヘッダーの処理
    const titleBlock = extractBlock(txt, "title");
    const headerBlock = extractBlock(txt, "header");

    txt = txt
        .replace(/\[title\][\s\S]*?\[\/title\]\r?\n?/g, "")
        .replace(/\[header\][\s\S]*?\[\/header\]\r?\n?/g, "");

    // 1行毎の処理
    const lines = txt.split(/\r?\n/);

    const state = new ParseState();


    state.title = titleBlock || "";
    state.headerHtml = parseHeaderBlock(headerBlock);

    const ctx = createContext(state);

    lines.forEach(line => {
        for (const ruleDef of rules) {
            const rule = ruleDef.match(line, ctx);
            if (rule) {
                ruleDef.handle(rule, ctx, line);
                return;
            }
        }

        // どのルールにもマッチしなかった
        ruleDefault().handle(line, ctx);
    });


    ctx.flushParagraph();

    // EOF: 未クローズBOXをすべて閉じる
    while (ctx.s.boxStack.length) {
        const box = ctx.s.boxStack.pop();
        box.buffer.push(box.def.closeHtml);
        pushHtml(ctx, box.buffer.join("\n"));
    }

    // 本文中の <sup> を定義済みの内容で更新
    let htmlBody = finalizeFootnotes(ctx, state.body.join("\n"));

    // 目次階層構築
    const mokujiTree = buildMokujiTree(state.mokuji);
    return buildDocument(
        state.title,
        htmlBody,
        state.mokuji,
        state.headerHtml
    );

}

function pushHtml(ctx, html) {
    currentContainer(ctx).push(html);
}

function currentContainer(ctx) {
    if (ctx.s.listStack?.length) {
        return ctx.s.listStack.at(-1).buffer;
    }
    if (ctx.s.boxStack.length) {
        return ctx.s.boxStack.at(-1).buffer;
    }
    return ctx.s.body;
}

function createContext(state) {
    return {
        s: state,

        flushParagraph() {
            if (!this.s.paragraph.length) return;

            const lines = this.s.paragraph;
            this.s.paragraph = [];

            const htmlLines = lines.map(l => `${l}<br>`);

            const box = this.s.currentBox();
            if (box) {
                box.buffer.push(...htmlLines);
                return;
            }

            this.s.body.push(`<p>${lines.join("<br>")}</p>`);
        },

        closeFold() {
            this.s.foldBuffer.push("</div>");
            this.s.body.push(`<details class="fold">${this.s.foldBuffer.join("\n")}</details>`);
            this.s.foldBuffer = [];
            this.s.inFoldBox = false;
        }
    };
}



// =====================================================
// ParseState
// 解析中の状態を一元管理するクラス
// =====================================================
class ParseState {
    constructor() {
        // 出力HTML本体
        this.body = [];

        // 現在構築中の段落
        this.paragraph = [];

        // 各BOXのstack
        this.boxStack = [];
        // listのstack
        this.listStack = [];
        this.listRoot = [];

        this.inList = false;
        this.listType = null;
        this.listBuffer = [];

        this.inTable = false;
        this.tableBuffer = [];
        this.tableHasHeader = false;

        this.mokuji = [];
        this.headingCounters = [0, 0, 0, 0, 0];

        this.headingCount = 0;
        this.pendingAnchor = null;

        // 脚注関連
        this.footnotes = {};       // label → { text, number }
        this.footnoteOrder = [];   // 脚注表示順を保持
        this.nextFootnoteNumber = 1; // 自動採番用
    }


    // 行を段落に追加
    pushLine(line) {
        this.paragraph.push(line);
    }

    // 段落を確定して出力
    flushParagraph() {
        if (!this.paragraph.length) return;

        const lines = this.paragraph;
        this.paragraph = [];

        // ===== BOX内 =====
        if (this.isInAnyBox()) {
            const target = this.getCurrentBoxBuffer();
            lines.forEach(line => {
                target.push(`${line}<br>`);
            });
            return;
        }

        // ===== BOX外 =====
        this.body.push(`<p>${lines.join("<br>")}</p>`);
    }


    // BOX用
    hasBox() {
        return this.boxStack.length > 0;
    }

    currentBox() {
        return this.boxStack[this.boxStack.length - 1] || null;
    }
}


// =====================================================
// ルール定義
// =====================================================

// -------------------------------
// ルール一覧
// -------------------------------

const rules = [
    ruleSeparator(),

    ruleAlignBlock(),
    ruleAlignBlockEnd(),

    ruleBoxStart("info"),
    ruleBoxEnd("info"),
    ruleInfoLine(),
    ruleBoxStart("deco"),
    ruleBoxEnd("deco"),
    ruleBoxStart("copy"),
    ruleBoxEnd("copy"),
    ruleBoxStart("fold"),
    ruleBoxEnd("fold"),

    ruleTableRow(),
    ruleList(),
    ruleMidasi(),
    ruleFootnoteDef(),
    ruleEmpty(),
];



// -------------------------------
// 区切り線/閉じタグ
// -------------------------------
function ruleSeparator() {
    return {
        match: line => {
            const SEPARATOR = line.trim() === "[---]" ? {} : null;
            return SEPARATOR;
        },
        handle: (__, ctx) => {
            ctx.flushParagraph();

            if (ctx.s.inList) {
                closeListIfNeeded(ctx);
                return;
            }

            if (ctx.s.inStyleBlock) {
                ctx.s.body.push("</div>");
                ctx.s.inStyleBlock = false;
                ctx.s.styleClass = null;
                return;
            }

            ctx.s.body.push("<hr>");
        }
    };
}

// -------------------------------
// 左寄せ/中央寄せ/右寄せ/小文字
// -------------------------------
const ALIGN_CLASS_MAP = {
    left: "left", l: "left",
    center: "center", c: "center",
    right: "right", r: "right",
    small: "small", s: "small"
};

function ruleAlignInlineBlock() {
    return {
        match: line => {
            const matched = line.match(
                /^\[(left|l|center|c|right|r|small|s)\]([\s\S]+?)\[\/\1\]$/
            );
            if (!matched) return null;

            const map = {
                left: "left", l: "left",
                center: "center", c: "center",
                right: "right", r: "right",
                small: "small", s: "small"
            };

            return {
                cls: map[matched[1]],
                text: matched[2]
            };
        },

        handle: (rule, ctx) => {
            closeListIfNeeded(ctx);
            ctx.flushParagraph();

            pushHtml(
                ctx,
                `<div class="${rule.cls}">${parseInline(rule.text, ctx)}</div>`
            );
        }
    };
}


function parseAlignTag(line) {
    const trimmed = line.trim();

    // [tag] または [tag]xxx[/tag]
    const full = trimmed.match(
        /^\[(left|l|center|c|right|r|small|s)\]([\s\S]*?)\[\/\1\]$/
    );
    if (full) {
        return {
            kind: "inline",
            tag: full[1],
            content: full[2]
        };
    }

    // [tag]
    const start = trimmed.match(
        /^\[(left|l|center|c|right|r|small|s)\]$/
    );
    if (start) {
        return {
            kind: "start",
            tag: start[1]
        };
    }

    // [/tag]
    const end = trimmed.match(
        /^\[\/(left|l|center|c|right|r|small|s)\]$/
    );
    if (end) {
        return {
            kind: "end",
            tag: end[1]
        };
    }

    return null;
}

// -------------------------------
// 装飾カード
// -------------------------------
function ruleInfoLine() {
    return {
        match: (line, ctx) => {
            const box = ctx.s.currentBox();
            if (!box || box.type !== "info") return null;
            return {};
        },

        handle: (_, ctx, line) => {
            const box = ctx.s.currentBox();
            const level = box.level || 1;
            const trimmed = line.trim();

            // 空行
            if (!trimmed) {
                box.buffer.push("<br>");
                return;
            }

            // ラベル: 値（全角：も対応）
            const matched = trimmed.match(/^(.+?)[：:]\s*(.+)$/);
            if (matched) {
                box.buffer.push(`
<div class="info-item">
  <div class="info-label">${parseInline(matched[1], ctx)}</div>
  <div class="info-value"><span>${parseInline(matched[2], ctx)}</span></div>
</div>`);
                return;
            }

            // 通常テキスト
            box.buffer.push(`${parseInline(trimmed, ctx)}<br>`);
        }
    };
}

// -------------------------------
// 装飾カード
// -------------------------------
function ruleAlignBlock() {
    return {
        match: line => {
            const info = parseAlignTag(line);
            if (!info) return null;

            if (info.kind === "inline") {
                return {
                    kind: "inline",
                    cls: ALIGN_CLASS_MAP[info.tag],
                    content: info.content
                };
            }

            if (info.kind === "start") {
                return {
                    kind: "start",
                    cls: ALIGN_CLASS_MAP[info.tag]
                };
            }

            return null;
        },

        handle: (rule, ctx) => {
            closeListIfNeeded(ctx);
            ctx.flushParagraph();

            // inline ----------
            if (rule.kind === "inline") {
                pushHtml(
                    ctx,
                    `<div class="${rule.cls}">${parseInline(rule.content, ctx)}</div>`
                );
                return;
            }

            // block start ----------
            const buffer = [
                `<div class="${rule.cls}">`
            ];

            ctx.s.boxStack.push({
                type: "style",
                def: BOX_DEFS.style,
                level: 0,
                buffer
            });
        }
    };
}

function ruleAlignBlockEnd() {
    return {
        match: line => {
            const info = parseAlignTag(line);
            return info?.kind === "end" ? {} : null;
        },

        handle: (_, ctx) => {
            closeListIfNeeded(ctx);
            ctx.flushParagraph();

            for (let i = ctx.s.boxStack.length - 1; i >= 0; i--) {
                const box = ctx.s.boxStack[i];
                if (box.type !== "style") continue;

                while (ctx.s.boxStack.length > i) {
                    const b = ctx.s.boxStack.pop();
                    b.buffer.push(b.def.closeHtml);
                    pushHtml(ctx, b.buffer.join("\n"));
                }
                return;
            }
        }
    };
}

// -------------------------------
// 装飾BOX
// -------------------------------

function ruleBoxStart(type) {
    const def = BOX_DEFS[type];
    const mark = def.mark;

    return {
        match: line => {
            const matched = line.trim().match(
                new RegExp(
                    `^\\[(?:(${mark}+)|
                        ${mark}(\\d+))\\](.*)$`.replace(/\s+/g, "")
                )
            );

            if (!matched) return null;

            // 装飾レベル
            const level = matched[1]
                ? matched[1].length        // {mark}数カウント(例：[=====])
                : Number(matched[2]);      // [{mark}数値](例：[=5])

            return matched
                ? { level: level, title: (matched[3] || "").trim() }
                : null;
        },

        handle: (rule, ctx) => {
            closeListIfNeeded(ctx);
            ctx.flushParagraph();

            const cls = `${def.classBase}-box box${rule.level}`;
            const title = escapeHtml(rule.title || "");

            const buffer = [];

            if (def.useDetails) {
                buffer.push(
                    `<details class="${cls}">`,
                    `<summary class="fold-summary box-title">${title}</summary>`,
                    `<div class="box-body">`
                );
            } else {
                const titleHtml = rule.title
                    ? `<div class="box-title">${title}</div>`
                    : "";

                buffer.push(
                    `<div class="${cls}" ${def.clickable ? 'data-copy onclick="copyBox(this)"' : ""}>
${titleHtml}
<div class="box-body">`
                );
            }

            // stack push
            ctx.s.boxStack.push({
                type,
                def,
                level: rule.level,
                buffer
            });
        }
    };
}


function ruleBoxEnd(type) {
    const ruleDef = BOX_DEFS[type];
    const mark = ruleDef.mark;

    return {
        match: line =>
            new RegExp(
                `^\\[\\/(?:${mark}+|${mark}\\d+)\\]$`
            )
                .test(line.trim())
                ? {}
                : null,

        handle: (_, ctx) => {
            // BOXを閉じる前にlistを閉じる
            closeListIfNeeded(ctx);
            ctx.flushParagraph();

            // 内側から探して該当typeを閉じる
            for (let i = ctx.s.boxStack.length - 1; i >= 0; i--) {
                const box = ctx.s.boxStack[i];
                if (box.type !== type) continue;

                // 見つかった位置まで全部閉じる
                while (ctx.s.boxStack.length > i) {
                    const b = ctx.s.boxStack.pop();
                    b.buffer.push(b.def.closeHtml);
                    pushHtml(ctx, b.buffer.join("\n"));
                }
                return;
            }

            // 見つからなかった場合は無視
        }
    };
}

// -------------------------------
// リスト/チェックリスト
// -------------------------------
function ruleList() {
    return {
        match: line => {
            const matched = line.match(/^(-+|\++|\*+)\s+(.*)$/);
            if (!matched) return null;

            const level = matched[1].length;
            const text = matched[2];

            const checkbox = text.match(/^\[( |x)\]\s*(.*)$/i);

            return {
                level,
                checkbox: !!checkbox,
                checked: checkbox?.[1].toLowerCase() === "x",
                text: checkbox ? checkbox[2] : text
            };
        },
        handle: (rule, ctx) => {
            const level = rule.level;

            ctx.flushParagraph();

            const stack = ctx.s.listStack;

            // 階層
            if (!stack.length || rule.level > stack.at(-1).level) {
                const newList = {
                    level: rule.level,
                    items: [],
                    isCheckbox: rule.checkbox
                };

                if (stack.length) {
                    // 直前の li の children にぶら下げる
                    const parentItem = stack.at(-1).items.at(-1);
                    parentItem.children.push(newList);
                } else {
                    ctx.s.listRoot.push(newList);
                }

                stack.push(newList);
            }


            // 階層閉じる
            while (stack.length && rule.level < stack.at(-1).level) {
                stack.pop();
            }

            const current = stack.at(-1);
            // 途中で checkbox が出てきたら、その ul は checkbox 扱いにする
            if (rule.checkbox) {
                current.isCheckbox = true;
            }

            const textHtml = rule.checkbox
                ? `<input type="checkbox" ${rule.checked ? "checked" : ""}> ${parseInline(rule.text, ctx)}`
                : parseInline(rule.text, ctx);

            current.items.push({
                html: textHtml,
                children: []
            });
        }
    };
}

function renderList(list) {
    const baseClass = list.isCheckbox ? "checkbox" : "list";
    const cls = `${baseClass} level-${list.level}`;

    return `
<ul class="${cls}">
${list.items.map(item => `
<li>
${item.html}
${item.children.map(renderList).join("")}
</li>
`).join("")}
</ul>`;
}

// -------------------------------
// テーブル
// -------------------------------
function ruleTableRow() {
    return {
        match: line => {
            const trimmed = line.trim();
            if (!trimmed.startsWith("|")) return null;

            const isHeader = /\|h\s*$/.test(trimmed);

            // |h を除去
            let row = trimmed.replace(/\|h\s*$/, "");

            // 末尾 | が無ければ補う
            if (!row.endsWith("|")) row += "|";

            const cells = row
                .split("|")
                .slice(1, -1)
                .map(c => c.trim());

            return { cells, isHeader };
        },

        handle: (rule, ctx) => {
            closeListIfNeeded(ctx);
            ctx.flushParagraph();

            if (!ctx.s.inTable) {
                ctx.s.inTable = true;
                ctx.s.tableBuffer = [];
                ctx.s.tableHasHeader = false;
            }

            // ヘッダー行
            if (rule.isHeader) {
                ctx.s.tableHasHeader = true;

                const ths = rule.cells.map(c =>
                    `<th>${parseInline(c, ctx)}</th>`
                ).join("");

                ctx.s.tableBuffer.push(
                    `<thead><tr>${ths}</tr></thead><tbody>`
                );
                return;
            }

            // 通常行
            const tds = rule.cells.map(c => {
                if (c.startsWith("~")) {
                    return `<td class="em">${parseInline(c.slice(1), ctx)}</td>`;
                }
                return `<td>${parseInline(c, ctx)}</td>`;
            }).join("");

            ctx.s.tableBuffer.push(`<tr>${tds}</tr>`);
        }
    };
}

// -------------------------------
// 見出し
// -------------------------------
function ruleMidasi() {
    return {
        match: line => {
            const matched = line.match(/^(#{1,5})\s*(.+)$/);
            const MIDASI = matched
                ? { level: matched[1].length, text: matched[2].trim() }
                : null;
            return MIDASI;
        },
        handle: (rule, ctx) => {
            closeListIfNeeded(ctx);
            ctx.flushParagraph();

            // アンカーID/見出し採番ID
            const id = ctx.s.pendingAnchor
                || `${generateMidasiId(rule.level, ctx.s.headingCounters)}`;

            ctx.s.pendingAnchor = null;

            let midasiTxt = `${rule.text}`;

            if (runtimeConfig.mokujiAutoNum) {
                midasiTxt = `${id}. ${rule.text}`;
            }
            if (rule.level <= runtimeConfig.mokujiLevel) {
                ctx.s.mokuji.push({ level: rule.level, text: escapeHtml(midasiTxt), id });
            }

            const h = `<h${rule.level} id="${id}">${escapeHtml(midasiTxt)}</h${rule.level}>`;
            pushHtml(ctx, h);
        }
    }
}

// 見出しID採番
function generateMidasiId(level, counters) {
    const idx = level - 1;

    // 上位レベルが 0 の場合は 1 で補完
    for (let i = 0; i < idx; i++) {
        if (counters[i] === 0) {
            counters[i] = 1;
        }
    }

    // 自分のレベルを +1
    counters[idx]++;

    // 下位レベルをリセット
    for (let i = idx + 1; i < counters.length; i++) {
        counters[i] = 0;
    }

    // 0 を除外して id 化
    return counters
        .slice(0, idx + 1)
        .filter(n => n > 0)
        .join("-");
}

// 空文字空行
function ruleEmpty() {
    return {
        match: line => {
            const matched = (line.trim() === "");
            const EMPTY = matched ? {} : null;
            return EMPTY;
        },
        handle: (__, ctx) => {
            closeTableIfNeeded(ctx);
            closeListIfNeeded(ctx);
            ctx.flushParagraph();

            pushBreak(ctx)
        }
    };
}

// デフォルト
function ruleDefault() {
    return {
        handle(line, ctx) {
            // info中はスキップ
            const box = ctx.s.currentBox();
            if (box?.type === "info") return;

            if (ctx.s.listStack.length) return;
            if (ctx.s.inList) return;

            ctx.s.paragraph.push(parseInline(line, ctx));
        }
    }
}



// =====================================================
// インライン解釈・装飾
// =====================================================

function parseInline(text, ctx) {
    let result = escapeHtml(text);

    // ---- 画像
    result = applyImage(result);

    // ---- リンク
    result = applyLink(result);

    // ---- アンカー定義
    result = applyAnchor(result);

    // ---- ふりがな
    result = applyFurigana(result);

    // ---- サイズ
    result = applySize(result);

    // ---- 文字強調表現
    result = applyDecoration(result);

    // ---- spanアイコン
    result = applySpanIcon(result);

    // ---- span装飾
    result = applySpanDecoration(result);

    // ---- 権利表示
    result = applyLicenseDisp(result);

    // ---- 文字数カウント表示
    result = applyCountTextDisp(result);

    // ---- 処理を最後に適用 ----
    // ---- 脚注
    result = applyFootnote(result, ctx);

    return result;
}

// ---- 画像 ![txt](utl)
function applyImage(text) {
    return text.replace(
        /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g,
        (_, alt, src, title) => {
            let imgSrc = src;

            // ファイル名のみの場合
            if (!/^https?:\/\//.test(src) && !src.includes("/")) {
                imgSrc = `assets/img/${src}`;
            }

            const altAttr = alt ? ` alt="${alt}"` : ` alt=""`;
            const titleAttr = title ? ` title="${title}"` : "";

            return `<img class="sc-img" src="${imgSrc}"${altAttr}${titleAttr}>`;
        }
    );
}

// ---- リンク [txt](url)
function applyLink(text) {
    // 既存の Markdown 形式リンク
    text = text.replace(
        /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g,
        (_, label, href, title) => {
            const titleAttr = title ? ` title="${title}"` : "";

            if (href.startsWith("#")) {
                return `<a href="${href}"${titleAttr}>${label}</a>`;
            }

            if (/^https?:\/\//.test(href)) {
                return `<a href="${href}" target="_blank"${titleAttr}>${label}</a>`;
            }

            return `<a href="${href}"${titleAttr}>${label}</a>`;
        }
    );

    // http / https で始まる素のURLをリンク化
    // すでに <a> 内にあるものは除外
    text = text.replace(
        /(^|[^"'=])(https?:\/\/[^\s<]+)/g,
        (_, prefix, url) => {
            return `${prefix}<a href="${url}" target="_blank">${url}</a>`;
        }
    );

    return text;
}

// ---- アンカー定義 [[#id]]
function applyAnchor(text) {
    return text.replace(/\[\[#([a-zA-Z0-9_-]+)\]\]/g,
        `<span id="$1"></span>`
    );
}

// ---- ふりがな｜もじ《よみ》
function applyFurigana(text) {
    return text.replace(/[｜|]([^《]+)《([^》]+)》/g,
        `<ruby>$1<rt>$2</rt></ruby>`
    );
}

// ---- 文字強調表現
function applyDecoration(text) {
    let result = text;

    // **太字**
    result = result.replace(/\*\*(.+?)\*\*/g, `<strong>$1</strong>`);

    // __下線__
    result = result.replace(/__(.+?)__/g, `<span class="underline">$1</span>`);

    return result;
}

// ---- サイズ [s][/s]
function applySize(text) {
    return text.replace(
        /\[(small|s)\]([^[]+?)\[\/(small|s)\]/g,
        (_, __, content) => `<span class="small">${content}</span>`
    );
}

// ---- spanアイコン [icon CSSclass]
function applySpanIcon(text) {
    return text.replace(
        /\[icon\s*([a-zA-Z0-9_-\s]+)\s*\]/g,
        (_, cls) => `<span class="icon ${cls}"></span>`
    );
}

// ---- span装飾 [span CSSclass]テキスト[/span]
function applySpanDecoration(text) {
    return text.replace(
        /\[span\s+([a-zA-Z0-9_-]+)\]([\s\S]*?)\[\/span\]/g,
        (_, cls, content) =>
            `<span class="${cls}">${content}</span>`
    );
}


// ---- ライセンス表示パーツ [[権利表示]]
function applyLicenseDisp(text) {
    return text.replace(/\[\[権利表示\]\]/g,
        `
     <!-- ライセンス表示パーツ：ここから -->
    <div class="licence"></div>
    <!-- ライセンス表示パーツ：ここまで -->`
    );
}

// ---- 文字数カウント表示パーツ [[文字数カウント]]
function applyCountTextDisp(text) {
    // パーツ使用フラグ
    runtimeConfig.features.countText = true;

    return text.replace(/\[\[文字数カウント\]\]/g,
        `
     <!-- 文字数カウント表示パーツ：ここから -->
    <span class="countTextDisp"></span>
    <!-- 文字数カウント表示パーツ：ここまで -->`
    );
}

// ---- 脚注
// 本文中の脚注参照 [^label] ※仮作成
function applyFootnote(text, ctx) {
    return text.replace(/\[\^([^\]]+)\]/g, (_, label) => {
        if (!ctx.s.footnotes[label]) {
            ctx.s.footnotes[label] = {
                text: "", // 定義は後で反映
                number: ctx.s.nextFootnoteNumber++,
            };
            ctx.s.footnoteOrder.push(label);
        }

        const fn = ctx.s.footnotes[label];

        // 仮作成 sup（data-txt は空）
        return `<sup class="footnote-ref" id="footnote-ref-${fn.number}" data-label="${label}">[${fn.number}]</sup>`;
    });
}

// 脚注定義行 [^label]: 定義内容
function ruleFootnoteDef() {
    return {
        match: line => {
            const matched = line.match(/^\[\^(.+?)\]:\s*(.+)$/);
            if (!matched) return null;
            return { label: matched[1], text: matched[2] };
        },
        handle: (rule, ctx) => {
            // 未処理段落をflush
            ctx.flushParagraph();

            const { label, text } = rule;
            // 自動採番
            if (!ctx.s.footnotes[label]) {
                ctx.s.footnotes[label] = {
                    text,
                    number: ctx.s.nextFootnoteNumber++
                };
                ctx.s.footnoteOrder.push(label);
            } else {
                ctx.s.footnotes[label].text = text;
            }

            const fn = ctx.s.footnotes[label];

            // 定義行の直後に脚注表示
            const html = `<a href="#footnote-ref-${fn.number}" id="footnote${fn.number}" class="footnote-def">[${fn.number}]</a>： ${escapeHtml(fn.text)}<br>`;
            pushHtml(ctx, html);
        }
    };
}

// 脚注定義更新用 ※buildHtml 内で本文完成後に更新をかける
function finalizeFootnotes(ctx, htmlContent) {
    let finalHtml = htmlContent;

    ctx.s.footnoteOrder.forEach(label => {
        const fn = ctx.s.footnotes[label];

        // data-label 属性で一致するものを対象とする
        const matched = new RegExp(
            `(\\<sup[^>]*data-label=["']${escapeRegExp(label)}["'][^>]*)(data-txt=["'][^"']*["'])?`,
            "g"
        );

        finalHtml = finalHtml.replace(matched, (_, prefix) => {
            return `${prefix} data-txt="${escapeHtml(fn.text)}"`;
        });
    });

    return finalHtml;
}

// 正規表現用エスケープ
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 脚注リストを末尾に追加する　※未使用
// function renderFootnotes(ctx) {
//     if (!ctx.s.footnoteOrder.length) return "";

//     return ctx.s.footnoteOrder.map(label => {
//         const fn = ctx.s.footnotes[label];
//         return `<a href="#footnote-ref-${fn.number}" id="footnote${fn.number}" class="footnote-def">[${fn.number}]</a>： ${escapeHtml(fn.text)}<br>`;
//     }).join("\n");
// }


// =====================================================
// HTMLドキュメント生成
// =====================================================

function buildDocument(title, body, mokuji, headerHtml) {

    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="assets/css/layout.css">
<link rel="stylesheet" href="assets/css/deco.css">
<link rel="stylesheet" href="assets/css/parts.css">
<script src="assets/js/parts.js"></script>
</head>
<body${runtimeConfig.furigana ? ` oncopy="rubyToggle()"` : ""}${runtimeConfig.features.countText ? ` onload="countText()"` : ""}>

<header id="header">
<h1 class="title">${escapeHtml(title)}</h1>
${headerHtml || ""}
</header>

<main class="${mokuji.length ? "layout-2col" : "layout-1col"}">
${mokuji.length ? buildMokuji(mokuji) : ""}
<article class="content" id="content">
${runtimeConfig.tango ? buildTangoForm() : ""}
${body}
</article>
</main>

<footer id="footer" class="center">
Template by <a href="https://jxsn-wk.booth.pm/" target="_blank">Jaxson</a>
</footer>
<div id="page_top"><a href="#header"></a></div>

</body>
</html>`;
}

// エスケープ処理
function escapeHtml(str) {
    return str.replace(/[&<>]/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])
    );
}



// =====================================================
// HTML部品生成
// =====================================================

// -------------------------------
// 目次生成
// -------------------------------
function buildMokuji(items) {
    const tree = buildMokujiTree(items);
    return `
<nav class="mokuji" id="mokuji">
  <button class="mokuji-hamburger" onclick="toggleMokuji()"><span></span></button>
  ${runtimeConfig.furigana ? buildFuriganaToggle() : ""}
  <ul class="mokuji-list">
  ${renderMokujiNodes(tree)}
  </ul>
</nav>`;
}

// 目次ツリー解釈
function buildMokujiTree(items) {
    const root = [];
    const stack = [];

    items.forEach(item => {
        const node = { ...item, children: [] };

        while (stack.length && stack[stack.length - 1].level >= item.level) {
            stack.pop();
        }

        if (stack.length === 0) {
            root.push(node);
        } else {
            stack[stack.length - 1].children.push(node);
        }

        stack.push(node);
    });

    return root;
}

// 目次組み立て
function renderMokujiNodes(nodes) {
    return nodes.map(n => {
        const levelClass = `lv${n.level}`;

        if (n.children.length) {
            return `
<li class="mokuji-item mokuji-node ${levelClass}">
  <div class="mokuji-row">
    <button class="mokuji-toggle"></button>
    <a href="#${n.id}">${n.text}</a>
  </div>
  <ul>
    ${renderMokujiNodes(n.children)}
  </ul>
</li>`;
        }

        return `
<li class="mokuji-item ${levelClass}">
  <div class="mokuji-row">
    <span class="mokuji-dummy"></span>
    <a href="#${n.id}">${n.text}</a>
  </div>
</li>`;
    }).join("");
}


// コピペ時ふりがなON/OFFパーツ
function buildFuriganaToggle() {
    return `
<!-- コピペ時ふりがなON/OFFパーツ：ここから -->
<div class="toggle_button">
<input id="toggle" class="toggle_input" type="checkbox">
<label for="toggle" class="toggle_label"><span></span></label>
</div>
<!-- コピペ時ふりがなON/OFFパーツ：ここまで -->`;
}

// 単語置換フォームパーツ
function buildTangoForm(formId = 1) {
    const arrPlaceholder = ['{PC苗字}','{PC名前}','{NPC苗字}','{NPC名前}'];
    let TangoInput = '';

    arrPlaceholder.forEach((placeholder, index, array) => {
        TangoInput += `
        単語${index+1}<input name="name${index+1}" placeholder="${placeholder}"><br>`;
});

    return `
<!-- 単語置換パーツ：ここから -->
<form class="change" id="change${formId}" name="change${formId}">
${TangoInput}
<br>
<input type="button" value="置換" onclick="changeWord(${formId})">
<input type="button" value="リセット" onclick="pageReload()">
</form>
<!-- 単語置換：ここまで -->`;
}



// =====================================================
// utility（共通処理）
// =====================================================

// ダウンロード処理
function download(content, filename) {
    const blob = new Blob([content], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}

function closeListIfNeeded(ctx) {
    if (!ctx.s.listStack.length) return;

    ctx.s.listStack = [];

    ctx.s.listRoot.forEach(list => {
        pushHtml(ctx, renderList(list));
    });

    ctx.s.listRoot = [];
}

// tableを閉じる
function closeTableIfNeeded(ctx) {
    if (!ctx.s.inTable) return;

    let html = `<table class="sc-table">`;

    if (ctx.s.tableHasHeader) {
        html += ctx.s.tableBuffer.join("\n") + "</tbody>";
    } else {
        html += "<tbody>" + ctx.s.tableBuffer.join("\n") + "</tbody>";
    }

    html += "</table>";

    pushHtml(ctx, html);

    ctx.s.inTable = false;
    ctx.s.tableBuffer = [];
    ctx.s.tableHasHeader = false;
}

// BOXを閉じる
function closeBoxUntilLevel(ctx, targetLevel) {
    while (ctx.s.boxStack.length) {
        const box = ctx.s.currentBox();
        if (box.level < targetLevel) break;

        ctx.s.boxStack.pop();
        box.buffer.push(box.def.closeHtml);
        pushHtml(ctx, box.buffer.join("\n"));
    }
}

// 改行の制御
function pushBreak(ctx) {
    const box = ctx.s.currentBox();
    if (box) {
        box.buffer.push("<br>");
    } else {
        ctx.s.body.push("<br>");
    }
}



// iframe 内アンカークリック時のスクロール制御 ※プレビュー用
function setupAnchorNavigation(win, doc) {
    doc.addEventListener("click", e => {
        const link = e.target.closest('a[href^="#"]');
        if (!link) return;

        const id = link.getAttribute("href").slice(1);
        if (!id) return;

        const target = doc.getElementById(id);
        if (!target) return;

        e.preventDefault();

        // 親ページを iframe 位置へ
        preview.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

        // iframe 内スクロール（1フレーム遅延）
        requestAnimationFrame(() => {
            target.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        });

    });
}

