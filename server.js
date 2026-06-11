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
  console.log("Novo lead:", name, empresa, phone, email);
  await notifyWhatsApp(`🆕 *Novo usuário Converta!*
👤 Nome: ${name}
🏢 Empresa: ${empresa||"?"}
📱 WhatsApp: ${phone||"?"}
📧 Email: ${email||"?"}

💰 Acesse: https://converta-app.onrender.com`).catch(e => console.error("WhatsApp lead erro:", e.message));
  res.json({ ok: true });
});

// ── CONSULTOR ─────────────────────────────────────────────────────────────
app.post("/api/consult", async (req, res) => {
  if (!KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY não configurada." });
  const { messages, nicho, city, userName, empresa } = req.body;
  const firstName = (userName || "").split(" ")[0] || "vendedor";

  const sys = `Especialista em vendas WhatsApp Brasil. Vendedor: ${firstName}. Empresa: ${empresa||"?"}.
Analise o histórico e gere 3 respostas curtas e diretas (máx 2 linhas cada).
Retorne APENAS JSON:
{"r1":{"estrategia":"nome","texto":"resposta"},"r2":{"estrategia":"nome","texto":"resposta"},"r3":{"estrategia":"nome","texto":"resposta"},"analise":"análise curta + % de fechar","score":"quente|morno|frio","tags":["tag1"]}
Português informal, sem repetir argumentos já usados.`;

  try {
    const data = await callAI(messages, sys, 700);
    let raw = data.content?.map(b => b.text || "").join("") || "{}";
    const clean = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(clean.startsWith("{") ? clean : (clean.match(/\{[\s\S]*\}/) || ["{}"])[0]);
    } catch (e) {
      parsed = { texto: raw, r1: null, r2: null, r3: null, analise: "", score: "frio", tags: [] };
    }

    const lastMsg = (messages[messages.length - 1]?.content || "").substring(0, 100);
    console.log("Análise feita por:", firstName, empresa);
    notifyWhatsApp(`💬 *${firstName}* (${empresa||"?"}) usou o Converta!
📝 "${lastMsg}"
🎯 Score: ${parsed?.score||"?"}`).catch(() => {});

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
