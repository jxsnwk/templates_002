// ------------------------------
// 文字数カウント
// ------------------------------
function countText() {
	var result = document.getElementById("countTextarea").innerText.replace(/\s+/g, '').length;
	result = Math.round(result / 100) * 100; // 100文字単位で丸める
	document.getElementById("countResult").innerText = '約' + result + '文字';
}

// ------------------------------
// コピペ時ふりがなON/OFF
// ------------------------------
function rubyToggle(kakkoFlg = true) {
	if (typeof kakkoFlg != "boolean") {
		// 想定と異なる値が渡された場合、デフォルト値「true」に書き換え
		kakkoFlg = true;
	}

	var rubyToggle = document.querySelector('input#toggle');
	if (rubyToggle.checked === true) {
		rubyOn(kakkoFlg);
	} else {
		rubyOff();
	}
}

// ルビOFF時
function rubyOff() {
	var c = document.body.className;
	if (c.match(/\s*rubyoff/)) { return }
	document.body.className = c ? c + " rubyoff" : "rubyoff";
	setTimeout(function () { document.body.className = c }, 100);
}

// ルビON時
function rubyOn(kakkoFlg) {
	const kakkoBefore = "("; // 前括弧
	const kakkoAfter = ")"; // 後括弧

	var c = document.body.className;
	if (c.match(/\s*rubyon/)) { return }
	var rubyOnHTML = new Array();
	var rubyOnText = new Array();
	var ruby = document.getElementsByTagName('ruby');
	// var rp = document.getElementsByTagName('rp');

	// 元の値を保持
	for (var i = 0; i < ruby.length; i++) {
		rubyOnHTML[i] = ruby[i].innerHTML;
		rubyOnText[i] = ruby[i].innerText;
	}

	// ルビ情報を取得・整形
	for (var i = 0; i < ruby.length; i++) {
		if (kakkoFlg == false) {
			// 括弧が不要な場合
			kakkoBefore = "";
			kakkoAfter = "";
		}
		ruby[i].innerHTML = ruby[i].innerHTML.replace("<rt>", kakkoBefore) + kakkoAfter;
		ruby[i].innerText = ruby[i].innerHTML.replace(/<r[a-z]*>|<\/r[a-z]*>/g, "");
	}

	setTimeout(function () {
		// 元の値に戻す
		document.body.className = c
		for (var i = 0; i < ruby.length; i++) {
			ruby[i].innerText = rubyOnText[i];
			ruby[i].innerHTML = rubyOnHTML[i];
		}
	}, 100);
}

// ------------------------------
// 単語置換
// ------------------------------

function changeWord() {
	var arrDefWord = new Array();
	var arrWord = new Array();

	// 置換対象の単語数（決定・リセットボタン分を数から引くため-2する）	
	var wordCount = document.change.getElementsByTagName('input').length - 2;

	for (var i = 0; i < wordCount; i++) {
		var inputItem = document.change.getElementsByTagName('input').item(i);
		arrDefWord[i] = inputItem.placeholder;// 置換前
		arrWord[i] = inputItem.value;// 置換後
	}

	// 置換処理
	for (var i = 0; i < wordCount; i++) {
		if (arrWord[i]) {
			document.body.innerHTML = document.body.innerHTML.split(arrDefWord[i]).join(arrWord[i]);
		}
		document.change.getElementsByTagName('input').item(i).setAttribute('placeholder', arrWord[i] ? arrWord[i] : arrDefWord[i]);
		document.change.getElementsByTagName('input').item(i).setAttribute('value', arrWord[i]);
	}
}

// ------------------
// ページ更新
// ------------------
function pageReload() {
	window.location.reload();
}

// ------------------
// 目次開閉制御
// ------------------
document.addEventListener("click", e => {
	const toggle = e.target.closest(".mokuji-toggle");
	if (!toggle) return;

	const li = toggle.closest(".mokuji-node");
	li.classList.toggle("open");
});


// ------------------
// ハンバーガーメニュー
// ------------------
function toggleMokuji() {
	document.getElementById("mokuji")?.classList.toggle("open");
}


// ------------------
// コピペ装飾BOX
// ------------------
function copyBox(el) {
	// ルビの処理
	const rubyToggle = document.querySelector('input#toggle');
	
	if (!rubyToggle) {
		// 要素がない場合 何もしない
	} else if (rubyToggle.checked === true) {
		rubyOn(true);
	} else {
		rubyOff();
	}

	// コピー処理
	const text = el.innerText;
	navigator.clipboard.writeText(text);

	showCopyToast(el);
}

function showCopyToast(targetEl) {
	const toast = document.createElement("div");
	toast.className = "copy-toast";
	toast.textContent = "コピーしました";

	document.body.appendChild(toast);

	// クリック要素の位置を基準にする
	const rect = targetEl.getBoundingClientRect();

	toast.style.left = `${rect.right - toast.offsetWidth}px`;
	toast.style.top = `${rect.top - 12}px`;

	// 表示トリガ
	requestAnimationFrame(() => {
		toast.classList.add("show");
	});

	// 自動消滅
	setTimeout(() => {
		toast.classList.remove("show");
		setTimeout(() => toast.remove(), 300);
	}, 1200);
}


// ------------------------------
// 脚注ツールチップ
// ------------------------------
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".footnote-ref").forEach(ref => {
        let tooltip;

        ref.addEventListener("mouseenter", () => {
            if (tooltip) return;

            tooltip = document.createElement("div");
            tooltip.className = "footnote-tooltip";
            tooltip.textContent = ref.dataset.txt || "";
            tooltip.style.visibility = "hidden";

            document.body.appendChild(tooltip);

            const refRect = ref.getBoundingClientRect();
            const ttRect = tooltip.getBoundingClientRect();

            const margin = 8;
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            let left = refRect.left + window.scrollX;
            let top = refRect.bottom + window.scrollY + 6;

            // 右はみ出し回避
            if (left + ttRect.width > vw - margin) {
                left = vw - ttRect.width - margin;
            }
            // 左はみ出し回避
            if (left < margin) {
                left = margin;
            }

            // 下はみ出し回避 上に出す
            if (top + ttRect.height > window.scrollY + vh - margin) {
                top = refRect.top + window.scrollY - ttRect.height - 6;
            }

            tooltip.style.left = left + "px";
            tooltip.style.top = top + "px";
            tooltip.style.visibility = "visible";
        });

        ref.addEventListener("mouseleave", () => {
            tooltip?.remove();
            tooltip = null;
        });
    });
});
