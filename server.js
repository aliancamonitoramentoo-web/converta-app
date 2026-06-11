const express = require("express");
const path = require("path");
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const KEY = process.env.ANTHROPIC_API_KEY;
const ULTRAMSG_INSTANCE = process.env.ULTRAMSG_INSTANCE;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const OWNER_PHONE = "5581997914939";

async function callAI(messages, system, maxTokens = 1000) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, system: system || "", messages }),
  });
  if (!r.ok) { const e = await r.text(); throw new Error("API " + r.status + ": " + e); }
  return await r.json();
}

async function notifyWhatsApp(msg) {
  if (!ULTRAMSG_INSTANCE || !ULTRAMSG_TOKEN) return;
  try {
    await fetch(`https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: ULTRAMSG_TOKEN, to: OWNER_PHONE, body: msg }),
    });
    console.log("✅ WhatsApp enviado para", OWNER_PHONE);
  } catch (e) { console.error("WhatsApp erro:", e.message); }
}

// ── LEAD ──────────────────────────────────────────────────────────────────
app.post("/api/lead", async (req, res) => {
  const { name, empresa, phone, email } = req.body;
  notifyWhatsApp(`🆕 Novo usuário Converta!\n👤 Nome: ${name}\n🏢 Empresa: ${empresa||"?"}\n📱 WhatsApp: ${phone||"?"}\n📧 Email: ${email||"?"}`).catch(() => {});
  res.json({ ok: true });
});

// ── CONSULTOR ─────────────────────────────────────────────────────────────
app.post("/api/consult", async (req, res) => {
  if (!KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY não configurada." });
  const { messages, nicho, city, userName, empresa } = req.body;
  const firstName = (userName || "").split(" ")[0] || "vendedor";

  const sys = `Você é um especialista em vendas pelo WhatsApp no mercado brasileiro. 
Analise o histórico completo da conversa com o cliente e gere 3 respostas estratégicas diferentes.
Trate o vendedor por: ${firstName}. Empresa: ${empresa || "?"}.

Retorne APENAS JSON válido:
{
  "texto": "resposta principal resumida",
  "r1": {"estrategia": "nome da estratégia", "texto": "resposta completa para colar no WhatsApp"},
  "r2": {"estrategia": "nome da estratégia", "texto": "resposta completa para colar no WhatsApp"},
  "r3": {"estrategia": "nome da estratégia", "texto": "resposta completa para colar no WhatsApp"},
  "analise": "análise do cliente em 2-3 frases com probabilidade de fechar",
  "score": "quente|morno|frio",
  "tags": ["tag1", "tag2"]
}

Regras:
- Respostas em português informal como WhatsApp real
- Nunca repita argumentos já usados no histórico
- Cada resposta com estratégia diferente
- score baseado no comportamento do cliente`;

  try {
    const data = await callAI(messages, sys, 1200);
    let raw = data.content?.map(b => b.text || "").join("") || "{}";
    const clean = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(clean.startsWith("{") ? clean : (clean.match(/\{[\s\S]*\}/) || ["{}"])[0]);
    } catch (e) {
      parsed = { texto: raw, r1: null, r2: null, r3: null, analise: "", score: "frio", tags: [] };
    }

    const lastMsg = (messages[messages.length - 1]?.content || "").substring(0, 80);
    notifyWhatsApp(`💬 ${firstName} (${empresa || nicho || "?"}) analisou: "${lastMsg}"`).catch(() => {});

    res.json({ ...parsed, searchUsed: false });
  } catch (err) {
    console.error("Consult error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── NOTIFY ────────────────────────────────────────────────────────────────
app.post("/api/notify", async (req, res) => {
  const { type, userName, detail } = req.body;
  const msgs = {
    novo_cliente: `👤 ${userName} cadastrou novo cliente: ${detail}`,
    chat: `💬 ${userName} perguntou: "${detail}"`,
  };
  if (msgs[type]) notifyWhatsApp(msgs[type]).catch(() => {});
  res.json({ ok: true });
});

// ── CATCH ALL ─────────────────────────────────────────────────────────────
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Converta online na porta", PORT));
