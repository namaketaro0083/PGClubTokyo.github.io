const tasks = [
    { text: "ピカチュウを捕まえる", icon: "⚡" },
    { text: "レイドバトルに1回勝利する", icon: "⚔️" },
    { text: "5km歩く", icon: "🚶" },
    { text: "フレンドとギフトを交換する", icon: "🎁" },
    { text: "イーブイを進化させる", icon: "✨" },
    { text: "GOスナップショットを撮る", icon: "📸" },
    { text: "色違いのポケモンを捕まえる", icon: "🌟" },
    { text: "カーブ・グレートを5回投げる", icon: "🎯" },
    { text: "ルアーモジュールを使う", icon: "🌸" },
    { text: "アンノーンを捕まえる", icon: "❓" },
    { text: "メガシンカさせる", icon: "🧬" },
    { text: "ポケストップを10個回す", icon: "🛑" },
    { text: "おこうを使う", icon: "💨" },
    { text: "イベント限定タスクを完了する", icon: "📋" },
    { text: "伝説のポケモンを捕まえる", icon: "🐉" },
    { text: "ジムにポケモンを配置する", icon: "🏟️" },
    { text: "ステッカー付きギフトを送る", icon: "💌" },
    { text: "新しいトレーナーとフレンドになる", icon: "🤝" },
    { text: "ほしのすなを10000集める", icon: "✨" },
    { text: "5種類のタイプのポケモンを捕まえる", icon: "🌈" },
    { text: "GOロケット団を倒す", icon: "🚀" },
    { text: "相棒ポケモンの写真を撮る", icon: "🐾" },
    { text: "相棒からおみやげをもらう", icon: "💝" },
    { text: "ポケモンを交換する", icon: "🔄" }
];

// フリーマス (インデックス12)
const freeSpace = { text: "FREE SPACE<br>GO Fest Tokyo", icon: "🗼", isFreeSpace: true };

// ビンゴの勝利判定パターン (インデックス 0〜24)
const winPatterns = [
    [0,1,2,3,4], [5,6,7,8,9], [10,11,12,13,14], [15,16,17,18,19], [20,21,22,23,24], // 行
    [0,5,10,15,20], [1,6,11,16,21], [2,7,12,17,22], [3,8,13,18,23], [4,9,14,19,24], // 列
    [0,6,12,18,24], [4,8,12,16,20] // 斜め
];

document.addEventListener('DOMContentLoaded', () => {
    const board = document.getElementById('bingo-board');
    const overlay = document.getElementById('bingo-overlay');
    const resetButton = document.getElementById('reset-button');
    
    // タスクリストの構築 (フリーマスを中央に挿入)
    let boardTasks = [...tasks];
    boardTasks.splice(12, 0, freeSpace);

    let cells = [];

    // ローカルストレージから進行度を取得
    let savedProgress = JSON.parse(localStorage.getItem('goFestBingoProgress')) || new Array(25).fill(false);
    // フリーマスは常にクリア扱い
    savedProgress[12] = true;

    // グリッドの生成
    boardTasks.forEach((task, index) => {
        const cell = document.createElement('div');
        cell.className = 'bingo-cell';
        if (task.isFreeSpace) {
            cell.classList.add('free-space');
        }
        
        if (savedProgress[index]) {
            cell.classList.add('completed');
        }

        cell.innerHTML = `
            <div>
                <span class="icon">${task.icon}</span>
                <span>${task.text}</span>
            </div>
        `;
        
        cell.addEventListener('click', () => {
            // フリーマスはクリックでトグルしない
            if (task.isFreeSpace) return;
            
            cell.classList.toggle('completed');
            savedProgress[index] = cell.classList.contains('completed');
            saveProgress(savedProgress);
        });

        board.appendChild(cell);
        cells.push(cell);
    });

    function saveProgress(progress) {
        localStorage.setItem('goFestBingoProgress', JSON.stringify(progress));
        checkBingo(progress);
    }

    // ビンゴ判定
    function checkBingo(progress) {
        let hasBingo = false;
        for (let pattern of winPatterns) {
            if (pattern.every(idx => progress[idx])) {
                hasBingo = true;
                break;
            }
        }

        if (hasBingo) {
            triggerCelebration();
        }
    }

    // 紙吹雪の演出
    function triggerCelebration() {
        overlay.style.display = 'block';
        confetti({
            particleCount: 200,
            spread: 90,
            origin: { y: 0.6 },
            colors: ['#ff3366', '#00d2ff', '#ffffff', '#ffeb3b']
        });
        
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 3000);
    }

    // リセットボタンの処理
    resetButton.addEventListener('click', () => {
        if (confirm("ビンゴの進捗をリセットしますか？")) {
            savedProgress = new Array(25).fill(false);
            savedProgress[12] = true; // フリーマス
            localStorage.removeItem('goFestBingoProgress');
            
            cells.forEach((cell, idx) => {
                if (idx !== 12) {
                    cell.classList.remove('completed');
                }
            });
        }
    });
});
