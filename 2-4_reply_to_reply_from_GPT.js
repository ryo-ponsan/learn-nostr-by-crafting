const { currUnixtime } = require("./utils.js");
const {
  relayInit,
  getPublicKey,
  getEventHash,
  getSignature,
  finishEvent,
  nip19
} = require("nostr-tools");
require("websocket-polyfill");
require('dotenv').config();
const OpenAI = require('openai');

/* Bot用の秘密鍵をここに設定 */
const BOT_PRIVATE_KEY_HEX = process.env.BOT_PRIVATE_KEY_HEX;
const relayUrl = "wss://relay-jp.nostr.wirednet.jp";
const openai = new OpenAI(process.env.OPENAI_API_KEY);
// const relayUrl = "wss://r.kojira.io";

/**
 * テキスト投稿イベント(リプライ)を組み立てる
 * @param {string} content 投稿内容
 * @param {import("nostr-tools").Event} targetEvent リプライ対象のイベント
 */
const composeReplyPost = (content, targetEvent) => {
  /* Q-1: これまで学んだことを思い出しながら、
          リプライを表現するイベントを組み立てよう */
  const ev = {
    kind: 1,
    content: content,
    tags: [
      ["p", targetEvent.pubkey, ""],
      ["e", targetEvent.id, ""],
    ],
    created_at: currUnixtime(),
  }
  // イベントのハッシュ値を算出
  // const id = getEventHash(ev);
  // // イベントの署名を生成
  // const sig = getSignature(ev,BOT_PRIVATE_KEY_HEX);

  // return {...ev, id, sig} // イベントにID(ハッシュ値)と署名を設定

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

/* 暴走・無限リプライループ対策 */
// リプライクールタイム
const COOL_TIME_DUR_SEC = 60

// 公開鍵ごとに、最後にリプライを返した時刻(unixtime)を保持するMap
const lastReplyTimePerPubkey = new Map()

// 引数のイベントにリプライしても安全か?
// 対象の発行時刻が古すぎる場合・最後にリプライを返した時点からクールタイム分の時間が経過していない場合、安全でない
const isSafeToReply = ({ pubkey, created_at }) => {
  const now = currUnixtime()
  if (created_at < now - COOL_TIME_DUR_SEC) {
    return false;
  }

  const lastReplyTime = lastReplyTimePerPubkey.get(pubkey)
  if (lastReplyTime !== undefined && now - lastReplyTime < COOL_TIME_DUR_SEC) {
    return false;
  }
  lastReplyTimePerPubkey.set(pubkey, now)
  return true;
}

// OpenAI APIを呼び出して返答を生成する関数
const getOpenAIResponse = async (inputText) => {
  try {
    const completion = await openai.chat.completions.create({
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: inputText }
      ],
      model: "gpt-3.5-turbo",
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return "I'm sorry, I couldn't process your request.";
  }
};

// メイン関数
const main = async () => {
  const relay = relayInit(relayUrl);
  relay.on("error", () => {
    console.error("failed to connect");
  });

  await relay.connect();
  console.log("connected to relay");

  /* Q-2: 「このBotの公開鍵へのリプライ」を絞り込むフィルタを設定して、イベントを購読しよう */
  // ヒント: nostr-toolsのgetPublicKey()関数を使って、秘密鍵(BOT_PRIVATE_KEY_HEX)から公開鍵を得ることができます
  const botPubkey = getPublicKey(BOT_PRIVATE_KEY_HEX);
  const sub = relay.sub([{ kinds: [1], "#p": [botPubkey]}]);

  sub.on("event", async (ev) => {
    try {
      // リプライしても安全なら、リプライイベントを組み立てて送信する
      if (isSafeToReply(ev)) {
        const openAIResponse = await getOpenAIResponse(ev.content);
        console.log(ev.content);
        const replyPost = composeReplyPost(openAIResponse, ev);
        console.log(openAIResponse);
        publishToRelay(relay, replyPost);
      }
    } catch (err) {
      console.error(err);
    }
  });
};
main().catch((e) => console.error(e));