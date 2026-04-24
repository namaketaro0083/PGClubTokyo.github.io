/**
 * app.js
 * 謎解きアプリ フロントエンドロジック
 * トークン節約および保守性向上のため、HTMLから分離しています。
 */

// GASアプリの公開URLを設定 (デプロイ後に書き換えます)
const API_URL = "https://script.google.com/macros/s/AKfycbyHAyWCeppnv4RYi_Uzl8rf1kqoTZbJBEwEzmpFfTwWKDOxjQgIaPdDCKe2F_LSBkUm3g/exec";

// 初期の問題データ (本来はページロード時等に取得・設定など)
let currentQuestionData = {
  id: "Q1",
  lat: 35.681236, // ターゲット緯度
  lng: 139.767125, // ターゲット経度
  radiusMeters: 20000
};

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
        statusEl.classList.add("text-green-600");
        statusEl.classList.remove("text-red-500");
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

  statusEl.textContent = "サーバーと通信中...";
  statusEl.classList.remove("text-red-500", "text-green-600");

  const requestData = {
    userId: "user_123", // 実際はUUIDなどを生成してLocalStorage保存
    questionId: currentQuestionData.id,
    answer: answer
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

    if (result.success && result.isCorrect) {
      alert("正解です！次の問題へ進みます！");

      if (result.nextQuestion) {
        currentQuestionData = result.nextQuestion;

        const qTitle = document.getElementById("q-title");
        const qText = document.getElementById("q-text");

        if (qTitle) qTitle.textContent = `問題: ${currentQuestionData.id}`;
        if (qText) qText.textContent = currentQuestionData.text || "新しい目的地を目指してください";
        if (answerInput) answerInput.value = "";

        statusEl.textContent = "";
      } else {
        const container = document.getElementById("question-container");
        if (container) {
          container.innerHTML = "<h2 class='text-xl font-bold'>全クリア！おめでとうございます！</h2>";
        }
      }
    } else {
      statusEl.textContent = "不正解です。もう一度考えてみましょう。";
      statusEl.classList.add("text-red-500");
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = "通信エラーが発生しました。時間をおいて再試行してください。";
    statusEl.classList.add("text-red-500");
  }
}
