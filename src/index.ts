import WebSocket from "ws";

// ── 配置 ──────────────────────────────────────────────────────────
const ONEBOT_WS_URL = process.env.ONEBOT_WS_URL ?? "ws://127.0.0.1:18742";
const RWKV_BASE_URL = process.env.RWKV_BASE_URL ?? "http://154.37.222.49:8193";
const RWKV_PASSWORD = process.env.RWKV_PASSWORD ?? "RWKV_7batch";
const AI_SYSTEM = `你是 RWKV，一个运行在 QQ 群聊和私聊中的中文机器人。

默认使用中文回答。只在被用户明确提问、艾特或触发时回复，不主动插话。
回复风格简洁、自然、友好、克制，优先直接回答问题，不要啰嗦，不要刷屏。
对不确定的信息要明确说明，不要编造。技术问题先给结论，再给必要解释。
当用户问“你是谁”“你是什么”“你是哪个模型”时，请回答：
“我是 RWKV，一个基于 RWKV 模型的 QQ 聊天机器人。”
不要声称自己是别的模型，不要冒充真人，不要夸大自己的能力。`;

const RWKV_MAX_TOKENS = Number(process.env.RWKV_MAX_TOKENS ?? "512");

// 每人独立保留最近 20 条消息（10 轮对话）
const HISTORY_LIMIT = 20;

const RWKV_TEMPERATURE = 0.8;
const RWKV_TOP_P = 0.6;
const RWKV_TOP_K = 50;
const RWKV_ALPHA_PRESENCE = 1.0;
const RWKV_ALPHA_FREQUENCY = 0.1;
const RWKV_ALPHA_DECAY = 0.99;
const RWKV_CHUNK_SIZE = 128;

// ── 类型定义 ──────────────────────────────────────────────────────
interface Sender {
  user_id: number;
  nickname?: string;
  card?: string;
  role?: string;
}

interface OneBotMessage {
  post_type: string;
  message_type: "private" | "group";
  self_id: number;
  user_id: number;
  group_id?: number;
  raw_message: string;
  sender: Sender;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ── 每人独立对话历史 ──────────────────────────────────────────────
// key: "private_{user_id}" 或 "group_{group_id}_{user_id}"
const histories = new Map<string, ChatMessage[]>();

function getHistory(key: string): ChatMessage[] {
  if (!histories.has(key)) histories.set(key, []);
  return histories.get(key)!;
}

function pushHistory(
  key: string,
  role: ChatMessage["role"],
  content: string,
): void {
  const h = getHistory(key);
  h.push({ role, content });
  if (h.length > HISTORY_LIMIT) h.splice(0, h.length - HISTORY_LIMIT);
}

// ── 工具函数 ──────────────────────────────────────────────────────
function normalizeInput(text: string): string {
  return text.trim().replace(/\r\n/g, "\n").replace(/\n+/g, "\n");
}

function toPlainText(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/^```\w*\n?|```$/g, "").trim())
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripCQ(raw: string, selfId?: number): string {
  return raw
    .replace(/\[CQ:at,qq=(\d+)\]/g, (_, qq) =>
      selfId && qq === String(selfId) ? "" : `@${qq}`,
    )
    .replace(/\[CQ:[^\]]+\]/g, "")
    .trim();
}

function isAtMe(raw: string, selfId: number): boolean {
  return raw.includes(`[CQ:at,qq=${selfId}]`);
}

function sendApi(
  ws: WebSocket,
  action: string,
  params: Record<string, unknown>,
): void {
  ws.send(JSON.stringify({ action, params, echo: `${action}-${Date.now()}` }));
}

// ── RWKV API 调用 ─────────────────────────────────────────────────
async function callAI(historyKey: string, userText: string): Promise<string> {
  pushHistory(historyKey, "user", userText);

  let prompt = `System: ${AI_SYSTEM}\n\n`;
  for (const msg of getHistory(historyKey)) {
    prompt +=
      msg.role === "user"
        ? `User: ${msg.content}\n\n`
        : `Assistant: ${msg.content}\n\n`;
  }
  prompt += "Assistant: <think>\n</think>\n";

  console.log("[QQ-BOT][AI 调用] Prompt:\n", prompt);

  const res = await fetch(`${RWKV_BASE_URL}/v2/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      contents: [prompt],
      max_tokens: RWKV_MAX_TOKENS,
      stop_tokens: [0, 261, 24281],
      temperature: RWKV_TEMPERATURE,
      top_k: RWKV_TOP_K,
      top_p: RWKV_TOP_P,
      alpha_presence: RWKV_ALPHA_PRESENCE,
      alpha_frequency: RWKV_ALPHA_FREQUENCY,
      alpha_decay: RWKV_ALPHA_DECAY,
      stream: false,
      chunk_size: RWKV_CHUNK_SIZE,
      password: RWKV_PASSWORD,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`RWKV API ${res.status}: ${errText}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string }; text?: string }[];
  };

  const raw = (
    json.choices?.[0]?.message?.content ??
    json.choices?.[0]?.text ??
    ""
  ).trim();

  console.log("[QQ-BOT][AI 返回] 原始输出:\n", raw);

  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const stopIdx = withoutThink.search(/\n\s*User:/i);
  const reply =
    toPlainText(
      stopIdx !== -1 ? withoutThink.slice(0, stopIdx) : withoutThink,
    ) || "（无回复）";

  pushHistory(historyKey, "assistant", reply);
  console.log("[QQ-BOT][AI 处理后回复]:", reply);
  return reply;
}

// ── 主逻辑 ────────────────────────────────────────────────────────
function start(): void {
  console.log("[QQ-BOT] 连接 OneBot:", ONEBOT_WS_URL);
  const ws = new WebSocket(ONEBOT_WS_URL);

  ws.on("open", () => {
    console.log(`[QQ-BOT] 已连接 NapCat | API: ${RWKV_BASE_URL}`);
  });

  ws.on("close", (code: number) => {
    console.log(`[QQ-BOT] 连接断开 (code=${code})，3 秒后重连...`);
    setTimeout(start, 3000);
  });

  ws.on("error", (err: Error) => {
    console.error("[QQ-BOT] 连接出错:", err.message);
  });

  ws.on("message", (data: WebSocket.RawData) => {
    let payload: OneBotMessage;
    try {
      payload = JSON.parse(data.toString()) as OneBotMessage;
    } catch {
      return;
    }

    if (payload.post_type !== "message") return;

    const { message_type, raw_message, user_id, group_id, self_id, sender } =
      payload;
    const nickname = sender?.card || sender?.nickname || String(user_id);

    // ── 私聊 ────────────────────────────────────────
    if (message_type === "private") {
      const text = normalizeInput(raw_message);
      if (!text) return;

      console.log(`[私聊] ${nickname}(${user_id}): ${text}`);

      callAI(`private_${user_id}`, text)
        .then((reply) => {
          sendApi(ws, "send_private_msg", { user_id, message: reply });
        })
        .catch((err: Error) => {
          console.error("[私聊 AI 出错]", err.message);
          sendApi(ws, "send_private_msg", {
            user_id,
            message: "抱歉，AI 暂时出了点问题，请稍后再试。",
          });
        });
    }

    // ── 群聊：每个人独立上下文，互不干扰 ──────────
    if (message_type === "group" && group_id !== undefined) {
      if (!isAtMe(raw_message, self_id)) return;

      const text = normalizeInput(stripCQ(raw_message, self_id));

      if (!text) {
        sendApi(ws, "send_group_msg", {
          group_id,
          message: `[CQ:at,qq=${user_id}] 有什么事喊我~`,
        });
        return;
      }

      console.log(`[群聊] ${group_id} | ${nickname}(${user_id}): ${text}`);

      // key 包含 group_id + user_id，群里每个人完全独立
      callAI(`group_${group_id}_${user_id}`, text)
        .then((reply) => {
          sendApi(ws, "send_group_msg", {
            group_id,
            message: `[CQ:at,qq=${user_id}] ${reply}`,
          });
        })
        .catch((err: Error) => {
          console.error("[群聊 AI 出错]", err.message);
          sendApi(ws, "send_group_msg", {
            group_id,
            message: `[CQ:at,qq=${user_id}] 抱歉，AI 暂时出了点问题，请稍后再试。`,
          });
        });
    }
  });
}

start();
