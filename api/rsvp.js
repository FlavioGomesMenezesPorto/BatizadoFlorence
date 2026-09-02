const { sql } = require("@vercel/postgres");

const PRAZO = new Date(Date.UTC(2026, 9, 15, 2, 59, 59)); // 14/10/2026 23:59:59 em Brasília (UTC-3)
const ID_VALIDO = /^[a-z0-9]{6,40}$/i;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function novoId() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

async function garantirTabela() {
  await sql`
    CREATE TABLE IF NOT EXISTS rsvps (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      telefone TEXT,
      vai BOOLEAN NOT NULL,
      adultos INTEGER NOT NULL DEFAULT 0,
      criancas INTEGER NOT NULL DEFAULT 0,
      acompanhantes TEXT,
      recado TEXT,
      atrasado BOOLEAN NOT NULL DEFAULT false,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

async function tratarPost(req, res) {
  const corpo = req.body || {};
  const nome = String(corpo.nome || "").trim().slice(0, 200);
  if (nome.length < 3) {
    return res.status(400).json({ error: "nome_invalido" });
  }

  const vai = corpo.vai === true;
  const adultos = vai ? clamp(parseInt(corpo.adultos, 10) || 1, 1, 20) : 0;
  const criancas = vai ? clamp(parseInt(corpo.criancas, 10) || 0, 0, 20) : 0;
  const telefone = String(corpo.telefone || "").trim().slice(0, 40);
  const acompanhantes = vai ? String(corpo.acompanhantes || "").trim().slice(0, 500) : "";
  const recado = String(corpo.recado || "").trim().slice(0, 500);
  const id = typeof corpo.id === "string" && ID_VALIDO.test(corpo.id) ? corpo.id : novoId();
  const atrasado = new Date() > PRAZO;

  const { rows } = await sql`
    INSERT INTO rsvps (id, nome, telefone, vai, adultos, criancas, acompanhantes, recado, atrasado, atualizado_em)
    VALUES (${id}, ${nome}, ${telefone}, ${vai}, ${adultos}, ${criancas}, ${acompanhantes}, ${recado}, ${atrasado}, now())
    ON CONFLICT (id) DO UPDATE SET
      nome = EXCLUDED.nome,
      telefone = EXCLUDED.telefone,
      vai = EXCLUDED.vai,
      adultos = EXCLUDED.adultos,
      criancas = EXCLUDED.criancas,
      acompanhantes = EXCLUDED.acompanhantes,
      recado = EXCLUDED.recado,
      atrasado = EXCLUDED.atrasado,
      atualizado_em = now()
    RETURNING *
  `;

  return res.status(200).json(rows[0]);
}

async function tratarGet(req, res) {
  const { id } = req.query;

  if (id) {
    if (!ID_VALIDO.test(String(id))) {
      return res.status(400).json({ error: "id_invalido" });
    }
    const { rows } = await sql`SELECT * FROM rsvps WHERE id = ${id}`;
    return res.status(200).json(rows[0] || null);
  }

  const senha = req.headers["x-admin-password"];
  if (!process.env.ADMIN_PASSWORD || senha !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "senha_invalida" });
  }
  const { rows } = await sql`SELECT * FROM rsvps ORDER BY nome`;
  return res.status(200).json(rows);
}

async function tratarDelete(req, res) {
  const senha = req.headers["x-admin-password"];
  if (!process.env.ADMIN_PASSWORD || senha !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "senha_invalida" });
  }

  const { id } = req.query;
  if (!id || !ID_VALIDO.test(String(id))) {
    return res.status(400).json({ error: "id_invalido" });
  }

  const { rows } = await sql`DELETE FROM rsvps WHERE id = ${id} RETURNING id`;
  if (!rows[0]) {
    return res.status(404).json({ error: "nao_encontrado" });
  }
  return res.status(200).json({ ok: true });
}

module.exports = async (req, res) => {
  try {
    await garantirTabela();

    if (req.method === "POST") {
      return await tratarPost(req, res);
    }
    if (req.method === "GET") {
      return await tratarGet(req, res);
    }
    if (req.method === "DELETE") {
      return await tratarDelete(req, res);
    }
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "method_not_allowed" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server_error" });
  }
};
