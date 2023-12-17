const { currUnixtime, getCliArg } = require("./utils.js");
const {
  relayInit,
  getPublicKey,
  finishEvent
} = require("nostr-tools");
require("websocket-polyfill");
require('dotenv').config();
/* Bot用の秘密鍵をここに設定 */
const BOT_PRIVATE_KEY_HEX = process.env.BOT_PRIVATE_KEY_HEX;

// const relayUrl = "wss://relay-jp.nostr.wirednet.jp";
const relayUrl = "wss://r.kojira.io";

/**
 * リアクションイベントを組み立てる
 * @param {import("nostr-tools").Event} targetEvent リアクション対象のイベント
 */
const composeReaction = (targetEvent) => {
  /* Q-1: リアクションイベントのフィールドを埋めよう  */
  const ev = {
    kind: 7,
    content: "+",
    // tags: [
    //   ["e", "8d6b0540c4eca2c9647c13b212b76f31f044e8d79ba953518203e0e8a050026e",""],
    //   ["p", "f24df07133ade866751eca7f43f311b3410f711235a878a5877e263ef8a1e1dd", ""]
    // ],
    tags: [
      ["e", targetEvent,""],
    ],
    created_at: currUnixtime(),
  };
  // イベントID(ハッシュ値)計算・署名
  return finishEvent(ev, BOT_PRIVATE_KEY_HEX);
};

// リレーにイベントを送信
const publishToRelay = (relay, ev) => {
  const pub = relay.publish(ev);
  pub.on("ok", () => {
    console.log("succeess!");
  });
  pub.on("failed", () => {
    console.log("failed to send event");
  });
};

const main = async (targetWord) => {
  // 2023年12月1日の00:00:00 UTCのUNIXタイムスタンプ
  const december2023Timestamp = new Date('2023-12-08T00:00:00Z').getTime() / 1000;

  const relay = relayInit(relayUrl);
  relay.on("error", () => {
    console.error("failed to connect");
  });

  console.log("Connecting to relay...");
  await relay.connect();
  console.log("Connected to relay.");

  /* Q-2: すべてのテキスト投稿を購読しよう */
  const sub = relay.sub([{ kinds: [1] }]);
  sub.on("event", (ev) => {
    console.log("Event received:", ev);
    try {
      /* Q-3: 「受信した投稿のcontentに対象の単語が含まれていたら、
              その投稿イベントにリアクションする」ロジックを完成させよう */
      // ヒント: ある文字列に指定の単語が含まれているかを判定するには、includes()メソッドを使うとよいでしょう
      if (ev.created_at >= december2023Timestamp){
        if (ev.content.includes(targetWord)) {
          console.log(`Target word '${targetWord}' found in event.`);
          const reaction = composeReaction(ev);
          console.log("Composed reaction:", reaction);
          publishToRelay(relay, reaction);
        }
      }
    } catch (err) {
      console.error(err);
    }
  });
};

// コマンドライン引数をリアクション対象の単語とする
const targetWord = getCliArg("error: リアクション対象の単語をコマンドライン引数として設定してください");
main(targetWord).catch((e) => console.error(e));