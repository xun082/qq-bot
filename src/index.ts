import WebSocket from "ws";

// ── 配置（已写死默认值，无需 .env；需要改时用环境变量覆盖即可）────────
const ONEBOT_WS_URL = process.env.ONEBOT_WS_URL ?? "ws://127.0.0.1:18742";
const RWKV_BASE_URL = process.env.RWKV_BASE_URL ?? "http://154.37.222.49:8193";
const RWKV_PASSWORD = process.env.RWKV_PASSWORD ?? "RWKV_7batch";
const AI_SYSTEM =
  process.env.AI_SYSTEM_PROMPT ??
  "你是一个有帮助的 QQ 群/私聊机器人，回答简洁友好，使用中文。";
const RWKV_MAX_TOKENS = Number(process.env.RWKV_MAX_TOKENS ?? "512");
const HISTORY_LIMIT = Number(process.env.HISTORY_LIMIT ?? "20");
const GROUP_LOG_LIMIT = Number(process.env.GROUP_LOG_LIMIT ?? "30");

// ── OneBot v11 消息结构类型 ──────────────────────────────────────
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
  role: "system" | "user" | "assistant";
  content: string;
}

// 群消息日志条目
interface GroupLogEntry {
  nickname: string;
  text: string;
}

// ── 对话历史管理 ─────────────────────────────────────────────────
const histories = new Map<string, ChatMessage[]>();

// ── 群消息滚动日志（每个群独立保存最近 N 条明文消息）────────────
const groupLogs = new Map<number, GroupLogEntry[]>();

function appendGroupLog(groupId: number, nickname: string, text: string): void {
  if (!groupLogs.has(groupId)) groupLogs.set(groupId, []);
  const log = groupLogs.get(groupId)!;
  log.push({ nickname, text });
  if (log.length > GROUP_LOG_LIMIT) log.splice(0, log.length - GROUP_LOG_LIMIT);
}

function getGroupLogContext(groupId: number, excludeLast = false): string {
  const log = groupLogs.get(groupId);
  if (!log || log.length === 0) return "";

  const effectiveLog =
    excludeLast && log.length > 0 ? log.slice(0, log.length - 1) : log;
  if (effectiveLog.length === 0) return "";

  const lines = effectiveLog.map((e) => `${e.nickname}: ${e.text}`).join("\n");
  return `以下是群里最近 ${effectiveLog.length} 条消息记录（供你参考）：\n${lines}`;
}

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
  // 保留最近 N 条（按条数，每轮对话占 2 条）
  if (h.length > HISTORY_LIMIT) h.splice(0, h.length - HISTORY_LIMIT);
}

// 用户输入规范化：去首尾空白、统一换行、合并连续换行
function normalizeInput(text: string): string {
  return text.trim().replace(/\r\n/g, "\n").replace(/\n+/g, "\n");
}

// 把回复里的 Markdown 转成纯文本
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

// ── 公司 RWKV 模型 API 调用 ──────────────────────────────────────
async function callAI(
  historyKey: string,
  userText: string,
  groupContext?: string,
): Promise<string> {
  pushHistory(historyKey, "user", userText);

  const systemContent = [
    AI_SYSTEM,
    groupContext ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // RWKV 是纯文本生成模型，把对话历史拼成结构化文本 prompt
  let prompt = `System: ${systemContent}\n\n`;
  for (const msg of getHistory(historyKey)) {
    if (msg.role === "user") {
      prompt += `User: ${msg.content}\n\n`;
    } else if (msg.role === "assistant") {
      prompt += `Assistant: ${msg.content}\n\n`;
    }
  }
  prompt += "Assistant:";

  console.log("[QQ-BOT][AI 调用] 完整 Prompt:\n", prompt);

  const res = await fetch(`${RWKV_BASE_URL}/v2/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      contents: [prompt],
      stream: false,
      password: RWKV_PASSWORD,
      max_tokens: RWKV_MAX_TOKENS,
      temperature: 1.0,
      top_p: 0.3,
      top_k: 100,
      alpha_presence: 0.5,
      alpha_frequency: 0.5,
      alpha_decay: 0.996,
      chunk_size: 128,
      pad_zero: true,
      stop_tokens: [0, 261, 24281],
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

  console.log("[QQ-BOT][AI 返回] 原始模型输出:\n", raw);

  // 防止模型继续生成下一轮 "User:" 内容
  const stopIdx = raw.search(/\n\s*User:/i);
  const reply =
    toPlainText(stopIdx !== -1 ? raw.slice(0, stopIdx) : raw) || "（无回复）";

  pushHistory(historyKey, "assistant", reply);
  console.log("[QQ-BOT][AI 处理后回复]:", reply);
  return reply;
}

// ── 工具函数 ─────────────────────────────────────────────────────

// 把 [CQ:at,qq=X] 转成 @X 保留给 AI，其他 CQ 码（图片/表情等）直接删除
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

// ── 主逻辑 ───────────────────────────────────────────────────────
function start(): void {
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

    // ── 私聊：全部走 AI ──────────────────────────────
    if (message_type === "private") {
      const text = normalizeInput(raw_message);
      if (!text) return;

      console.log(`[私聊] ${nickname}(${user_id}): ${text}`);

      callAI(`private_${user_id}`, text)
        .then((reply) => {
          console.log(`[私聊回复] -> ${reply}`);
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

    // ── 群聊 ────────────────────────────────────────
    if (message_type === "group" && group_id !== undefined) {
      const plainText = normalizeInput(stripCQ(raw_message, self_id));

      // 所有群消息都记入滚动日志（包括未 @ 的）
      if (plainText) appendGroupLog(group_id, nickname, plainText);

      // 只有 @ 机器人才触发 AI 回复
      if (!isAtMe(raw_message, self_id)) return;

      if (!plainText) {
        sendApi(ws, "send_group_msg", {
          group_id,
          message: `[CQ:at,qq=${user_id}] 有什么事喊我~`,
        });
        return;
      }

      console.log(`[群聊] ${group_id} | ${nickname}(${user_id}): ${plainText}`);

      // 把最近 N 条群消息（不含当前这条）拼进 system prompt，让 AI 有群聊背景
      const groupContext = getGroupLogContext(group_id, true);

      callAI(`group_${group_id}_${user_id}`, plainText, groupContext)
        .then((reply) => {
          console.log(`[群聊回复] -> ${reply}`);
          // AI 的回复也记入群日志，让后续提问能看到完整对话
          appendGroupLog(group_id!, "机器人", reply);
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
