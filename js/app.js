/**
 * app.js
 * 謎解きアプリ フロントエンドロジック
 * トークン節約および保守性向上のため、HTMLから分離しています。
 */

// GASアプリの公開URLを設定 (デプロイ後に書き換えます)
const API_URL = "https://script.google.com/macros/s/AKfycbym_h8GSfxjQxteDX7tac686nYfzGDaQr5wrmm94VSg-UMXmjtGISVnIJ2qzF37oI6bBw/exec";

// =======================
// [設定] ゲームモード
// =======================
const GAME_MODE = "RANDOM"; // "SEQUENTIAL"（連番） または "RANDOM"（ランダム）
const REQUIRED_CLEAR_COUNT = 0; // 0なら無限モード（スコア競争）、数字ならその問数でクリア判定

// ローカルストレージからの履歴の復元
let solvedHistory = JSON.parse(localStorage.getItem('mystery_solved_history')) || [];

// 初期の問題データ（ローカルストレージから復元、または初回はAUTOとしてサーバーに委ねる）
let currentQuestionData = JSON.parse(localStorage.getItem('mystery_current_question')) || {
  id: "AUTO",
  lat: 0,
  lng: 0,
  radiusMeters: 20000,
  text: ""
};

/**
 * 初回ロード時にサーバーから現在の問題データを取得してセットする
 */
async function loadCurrentQuestion() {
  const requestData = {
    action: "getQuestion",
    questionId: currentQuestionData.id,
    mode: GAME_MODE,
    history: solvedHistory
  };
  try {
    const response = await fetchWithRetry(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(requestData),
      redirect: "follow"
    }, 3, 1000);
    const result = await response.json();
    if (result.success && result.question) {
      // 取得したデータで更新（緯度経度・問題文）
      currentQuestionData.lat = result.question.lat;
      currentQuestionData.lng = result.question.lng;
      currentQuestionData.text = result.question.text;

      // UIの更新（モードに応じたスコア表示）
      const qTitle = document.getElementById("q-title");
      const qText = document.getElementById("q-text");
      if (qTitle) {
        if (REQUIRED_CLEAR_COUNT > 0) {
          const remaining = REQUIRED_CLEAR_COUNT - solvedHistory.length;
          qTitle.textContent = `QUEST: ${currentQuestionData.id} (残り: ${remaining}問)`;
        } else {
          qTitle.textContent = `SCORE: ${solvedHistory.length} | QUEST: ${currentQuestionData.id}`;
        }
      }
      if (qText) qText.textContent = currentQuestionData.text;

      // バックアップとしてローカルストレージに保存
      localStorage.setItem('mystery_current_question', JSON.stringify(currentQuestionData));
      console.log("問題データを読み込み完了");

    } else if (result.success && !result.question) {
      // 問題が残っていない場合（ロード時のクリア発火）
      const container = document.getElementById("question-container");
      if (container) {
        container.innerHTML = `<h2 class='text-2xl font-bold text-teal-800 mb-4'>🎉 GAME CLEARED!</h2>
        <p class='text-lg font-bold'>最終スコア: ${solvedHistory.length}問</p>
        <p class='text-gray-600 mt-4'>全問制覇しました！おめでとうございます！</p>`;
      }
    }
  } catch (err) {
    console.error("初期問題データの取得に失敗", err);
  }
}
window.addEventListener("DOMContentLoaded", loadCurrentQuestion);

/**
 * ハバーサイン公式による距離計算
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // メートル単位
}

/**
 * GPS判定ロジック
 */
function checkLocation() {
  const statusEl = document.getElementById("status");
  statusEl.textContent = "GPSを取得中...";

  if (!navigator.geolocation) {
    statusEl.textContent = "このブラウザはGPSをサポートしていません。";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;
      const dist = calculateDistance(userLat, userLng, currentQuestionData.lat, currentQuestionData.lng);

      if (dist <= currentQuestionData.radiusMeters) {
        statusEl.textContent = `到着しました！（誤差: ${Math.round(dist)}m）`;
        // クラスを綺麗に適用するためclassNameで上書き
        statusEl.className = "mb-4 text-sm font-bold text-green-700 bg-green-50 p-3 rounded-xl border border-green-200 min-h-[50px] flex items-center justify-center drop-shadow-sm";

        // (問題文は最初から表示されるため、ここで独自に上書きする処理は撤去しました)
      } else {
        statusEl.textContent = `まだ目的地から離れています（距離: ${Math.round(dist)}m）`;
        statusEl.classList.remove("text-green-600");
        statusEl.classList.add("text-red-500");
      }
    },
    (error) => {
      console.error(error);
      statusEl.textContent = "GPSの取得に失敗しました。スマホの設定を確認してください。";
    },
    { enableHighAccuracy: true }
  );
}

/**
 * fetchをリトライ付きで実行するヘルパー関数
 * 通信の不安定さやGAS側の同時実行処理制限(500エラー等)に対応
 */
async function fetchWithRetry(url, options, retries = 3, backoffDelay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      // GASの場合、処理タイムアウト等の500系エラーをキャッチ
      if (!response.ok && response.status >= 500) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      // redirect="follow"を使っている場合や成功時はそのまま返す
      return response;
    } catch (error) {
      if (i < retries - 1) {
        console.warn(`Fetch failed. Retrying... (${i + 1}/${retries}):`, error);
        const statusEl = document.getElementById("status");
        if (statusEl) {
          statusEl.textContent = `サーバー混雑により再試行しています...（${i + 1}回目）`;
        }
        // 指数バックオフ (1s -> 2s -> 4s ...)で待機
        await new Promise(resolve => setTimeout(resolve, backoffDelay * Math.pow(2, i)));
      } else {
        throw error; // 最大リトライ到達
      }
    }
  }
}

/**
 * GASへの回答送信と結果受け取り
 */
async function submitAnswer() {
  const answerInput = document.getElementById("answer-input");
  const answer = answerInput ? answerInput.value : "";
  const statusEl = document.getElementById("status");

  if (!answer) {
    alert("答えを入力してください");
    return;
  }

  // 【チート防止】GPSで正しく「到着」していない場合は送信自体をブロックする
  if (statusEl.textContent.indexOf("到着しました") === -1) {
    alert("まずは「SCAN」ボタンを押して、目的地に到着したことを確認してください！");
    return;
  }

  statusEl.textContent = "サーバーと通信中...";
  statusEl.className = "mb-4 text-sm font-bold text-gray-700 bg-gray-50 p-3 rounded-xl border border-gray-200 min-h-[50px] flex items-center justify-center drop-shadow-sm";

  const requestData = {
    userId: "user_123", // 実際はUUIDなどを生成してLocalStorage保存
    questionId: currentQuestionData.id,
    answer: answer,
    mode: GAME_MODE,
    history: solvedHistory,
    requiredClearCount: REQUIRED_CLEAR_COUNT
  };

  try {
    // fetchWithRetry を利用して最大3回まで再試行
    const response = await fetchWithRetry(API_URL, {
      method: "POST",
      // CORSプリフライト回避のため text/plain を使用
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(requestData),
      // GASの302リダイレクト仕様に対応するため必須
      redirect: "follow"
    }, 3, 1000);

    const result = await response.json();

    if (result.success) {
      if (result.isCorrect) {
        alert("正解です！次の目的地へ進みます！");

        // 履歴を更新して永続化
        if (!solvedHistory.includes(currentQuestionData.id)) {
          solvedHistory.push(currentQuestionData.id);
          localStorage.setItem('mystery_solved_history', JSON.stringify(solvedHistory));
        }

        if (result.nextQuestion) {
          currentQuestionData = result.nextQuestion;
          currentQuestionData.radiusMeters = 20000;
          localStorage.setItem('mystery_current_question', JSON.stringify(currentQuestionData));

          const qTitle = document.getElementById("q-title");
          const qText = document.getElementById("q-text");

          // UIの更新（モードに応じたスコア表示）
          if (qTitle) {
            if (REQUIRED_CLEAR_COUNT > 0) {
              const remaining = REQUIRED_CLEAR_COUNT - solvedHistory.length;
              qTitle.textContent = `QUEST: ${currentQuestionData.id} (残り: ${remaining}問)`;
            } else {
              qTitle.textContent = `SCORE: ${solvedHistory.length} | QUEST: ${currentQuestionData.id}`;
            }
          }
          if (qText) qText.textContent = currentQuestionData.text;
          if (answerInput) answerInput.value = "";

          // ステータス表示を初期デザインへリセット
          statusEl.textContent = "レーダーの準備ができています";
          statusEl.className = "mb-4 text-sm font-bold text-teal-800 bg-white/70 p-3 rounded-xl border border-teal-100 min-h-[50px] flex items-center justify-center drop-shadow-sm";
        } else {
          const container = document.getElementById("question-container");
          if (container) {
            container.innerHTML = `<h2 class='text-2xl font-bold text-teal-800 mb-4'>🎉 GAME CLEARED!</h2>
            <p class='text-lg font-bold'>最終スコア: ${solvedHistory.length}問</p>
            <p class='text-gray-600 mt-4'>ミッションコンプリート！見事すべての目的を達成しました。</p>`;
          }
        }
      } else {
        statusEl.textContent = "不正解です。もう一度お試しください。";
        statusEl.className = "mb-4 text-sm font-bold text-red-600 bg-red-50 p-3 rounded-xl border border-red-200 min-h-[50px] flex items-center justify-center drop-shadow-sm";
      }
    } else {
      // サーバー側の通信エラー（排他ロック失敗など）
      statusEl.textContent = `エラー: ${result.error || "通信に失敗しました"}`;
      statusEl.className = "mb-4 text-sm font-bold text-red-600 bg-red-50 p-3 rounded-xl border border-red-200 min-h-[50px] flex items-center justify-center drop-shadow-sm";
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = "通信エラーが発生しました。時間をおいて再試行してください。";
    statusEl.classList.add("text-red-500");
  }
}
