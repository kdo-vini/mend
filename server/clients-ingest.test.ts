import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  phoneDigits,
  buildDiagnosticoMarkdown,
  CLIENT_INGEST_PATH,
  diagnosticoSubmissionSchema,
  mountClientIngestBodyLimit,
  registerClientIngestRoute,
  type ClientIngestStore,
  type DiagnosticoSubmission,
} from "./clients-ingest.js";

const TOKEN = "t".repeat(48);
const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "33333333-3333-4333-8333-333333333333";
const EXTERNAL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const submission = {
  area: "odontologia",
  areaLabel: "Odontologia",
  especialidade: "ortodontia",
  especialidadeLabel: "Ortodontia",
  nome: "Helena Martins",
  chamado: "Helena",
  whatsapp: "(11) 98765-4321",
  registro: "CRO-SP 123456",
  rqe: "ainda-nao",
  ref: "carla-ortodontia",
  utm: {
    source: "instagram",
    medium: "bio",
    campaign: "diag-nov",
    term: "",
    content: "",
  },
  respostas: [
    {
      questionId: "como-descrevem",
      section: "sobre",
      sectionTitle: "Sobre você",
      title: "Como os pacientes descrevem você?",
      answer: "Paciente, didática",
    },
    {
      questionId: "diferenciais",
      section: "sobre",
      sectionTitle: "Sobre você",
      title: "O que te diferencia?",
      answer: "Alinhadores, Plano em vídeo",
      items: ["Alinhadores", "Plano em vídeo"],
    },
    {
      questionId: "publico",
      section: "publico",
      sectionTitle: "Seu público",
      title: "Quem você atende?",
      answer: "Adultos",
    },
  ],
};
const payload = {
  externalId: EXTERNAL_ID,
  enviadoEm: "2026-11-04T12:42:00.000Z",
  submission,
};

function fakeStore(overrides: Partial<ClientIngestStore> = {}) {
  const store: ClientIngestStore = {
    findDiagnosticoEntry: vi.fn(async () => null),
    findClientByPhone: vi.fn(async () => null),
    createClient: vi.fn(async () => ({ id: CLIENT_ID })),
    insertDiagnosticoEntry: vi.fn(async () => "inserted" as const),
    ...overrides,
  };
  return store;
}

function buildApp(
  store: ClientIngestStore | null,
  options: { token?: string | undefined; appBaseUrl?: string } = {},
) {
  const app = express();
  // Same order as server/index.ts: the route's own limit before the global one.
  mountClientIngestBodyLimit(app);
  app.use(express.json({ limit: "13mb" }));
  registerClientIngestRoute(app, {
    store,
    token: "token" in options ? options.token : TOKEN,
    internalWorkspace: { resolve: async () => WORKSPACE },
    appBaseUrl: options.appBaseUrl ?? "https://mend.example.com/",
    now: () => new Date("2026-11-04T15:00:00.000Z"),
  });
  return app;
}

const post = (app: express.Express, body: unknown = payload, token = TOKEN) =>
  request(app)
    .post(CLIENT_INGEST_PATH)
    .set("authorization", `Bearer ${token}`)
    .send(body as object);

describe("POST /internal/clients/diagnostico-marca", () => {
  it("answers 503 when the token is missing or too short", async () => {
    for (const token of [undefined, "", "curto".repeat(5)]) {
      const store = fakeStore();
      const response = await post(buildApp(store, { token }), payload, "x");
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: "client_ingest_unavailable" });
      expect(store.createClient).not.toHaveBeenCalled();
    }
  });

  it("answers 401 for a missing or wrong bearer token", async () => {
    const store = fakeStore();
    const app = buildApp(store);
    const missing = await request(app).post(CLIENT_INGEST_PATH).send(payload);
    expect(missing.status).toBe(401);
    expect(missing.body).toEqual({ error: "client_ingest_token_invalid" });
    expect((await post(app, payload, "w".repeat(48))).status).toBe(401);
    expect((await post(app, payload, TOKEN.slice(0, -1))).status).toBe(401);
    expect(store.findDiagnosticoEntry).not.toHaveBeenCalled();
  });

  it("fails closed without the service-role store", async () => {
    expect((await post(buildApp(null))).status).toBe(503);
  });

  it("answers 400 for a body outside the contract", async () => {
    const store = fakeStore();
    const app = buildApp(store);
    for (const body of [
      {},
      { submission: {} },
      { ...payload, enviadoEm: "ontem" },
      { ...payload, externalId: "" },
      { submission: { ...submission, respostas: "nada" } },
      {
        submission: {
          ...submission,
          respostas: Array.from({ length: 121 }, () => submission.respostas[0]),
        },
      },
      {
        submission: {
          ...submission,
          respostas: [
            { ...submission.respostas[0], answer: "x".repeat(10_001) },
          ],
        },
      },
    ]) {
      const response = await post(app, body);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "invalid_body" });
    }
    const malformed = await request(app)
      .post(CLIENT_INGEST_PATH)
      .set("authorization", `Bearer ${TOKEN}`)
      .set("content-type", "application/json")
      .send("{nope");
    expect(malformed.status).toBe(400);
    expect(store.createClient).not.toHaveBeenCalled();
  });

  it("answers 413 above 256 KB without changing the global limit", async () => {
    const store = fakeStore();
    const response = await post(buildApp(store), {
      ...payload,
      submission: { ...submission, extra: "x".repeat(300 * 1024) },
    });
    expect(response.status).toBe(413);
    expect(store.createClient).not.toHaveBeenCalled();
  });

  it("creates a lead with the form data and the markdown page", async () => {
    const store = fakeStore();
    const response = await post(buildApp(store));
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      data: {
        clientId: CLIENT_ID,
        status: "created",
        url: `https://mend.example.com/clientes/${CLIENT_ID}`,
      },
    });
    expect(store.findClientByPhone).toHaveBeenCalledWith(
      WORKSPACE,
      "11987654321",
    );
    expect(store.createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE,
        name: "Helena Martins",
        contact: "Helena",
        phone: "(11) 98765-4321",
        area: "Odontologia",
        specialty: "Ortodontia",
        registration: "CRO-SP 123456",
        referral: "carla-ortodontia",
        utm: { source: "instagram", medium: "bio", campaign: "diag-nov" },
        notes: "Diagnóstico de marca · Odontologia / Ortodontia",
        externalId: EXTERNAL_ID,
        body: expect.stringContaining("## 1. Sobre você"),
      }),
    );
    expect(store.insertDiagnosticoEntry).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      clientId: CLIENT_ID,
      title: "Diagnóstico de marca recebido",
      body: "",
      authorName: "Site Diagium",
      externalId: EXTERNAL_ID,
      occurredAt: "2026-11-04T12:42:00.000Z",
    });
  });

  it("matches an existing client's phone with or without the 55 prefix", () => {
    expect(phoneDigits("+55 (11) 98765-4321")).toBe("11987654321");
    expect(phoneDigits("(11) 98765-4321")).toBe("11987654321");
    expect(phoneDigits("(11) 3222-1180")).toBe("1132221180");
  });

  it("falls back to the chamado, then 'Sem nome', and omits url without a base", async () => {
    const store = fakeStore();
    const app = buildApp(store, { appBaseUrl: "" });
    const response = await post(app, {
      submission: { ...submission, nome: "", whatsapp: "", respostas: [] },
    });
    expect(response.status).toBe(201);
    expect(response.body.data.url).toBeUndefined();
    expect(store.findClientByPhone).not.toHaveBeenCalled();
    expect(store.createClient).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Helena", externalId: null }),
    );
    await post(app, { submission: { respostas: [] } });
    expect(store.createClient).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "Sem nome", phone: null }),
    );
  });

  it("attaches to a client with the same WhatsApp instead of creating one", async () => {
    const store = fakeStore({
      findClientByPhone: vi.fn(async () => ({ id: CLIENT_ID })),
    });
    const response = await post(buildApp(store));
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      clientId: CLIENT_ID,
      status: "attached",
    });
    expect(store.createClient).not.toHaveBeenCalled();
    expect(store.insertDiagnosticoEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: CLIENT_ID,
        title: "Diagnóstico de marca",
        authorName: "Site Diagium",
        externalId: EXTERNAL_ID,
      }),
    );
  });

  it("is idempotent on externalId", async () => {
    const store = fakeStore({
      findDiagnosticoEntry: vi.fn(async () => ({ clientId: CLIENT_ID })),
    });
    const response = await post(buildApp(store));
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      clientId: CLIENT_ID,
      status: "duplicate",
    });
    expect(store.createClient).not.toHaveBeenCalled();
    expect(store.insertDiagnosticoEntry).not.toHaveBeenCalled();
  });

  it("treats a unique-constraint race as a duplicate", async () => {
    const store = fakeStore({
      insertDiagnosticoEntry: vi.fn(async () => "duplicate" as const),
    });
    const created = await post(buildApp(store));
    expect(created.status).toBe(200);
    expect(created.body.data.status).toBe("duplicate");

    const attached = fakeStore({
      findClientByPhone: vi.fn(async () => ({ id: CLIENT_ID })),
      insertDiagnosticoEntry: vi.fn(async () => "duplicate" as const),
    });
    expect((await post(buildApp(attached))).body.data.status).toBe("duplicate");
  });

  it("answers 503 when the store fails", async () => {
    const store = fakeStore({
      createClient: vi.fn(async () => {
        throw new Error("down");
      }),
    });
    const response = await post(buildApp(store));
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "client_ingest_unavailable" });
  });

  it("rate limits at 30 calls per minute", async () => {
    const app = buildApp(fakeStore());
    let last = 0;
    for (let call = 0; call < 31; call += 1)
      last = (await post(app, payload, "w".repeat(48))).status;
    expect(last).toBe(429);
  });
});

describe("buildDiagnosticoMarkdown", () => {
  const parsed = diagnosticoSubmissionSchema.parse(
    submission,
  ) as DiagnosticoSubmission;
  const sentAt = new Date("2026-11-04T12:42:00.000Z");

  it("writes the summary and one numbered section per form section", () => {
    const markdown = buildDiagnosticoMarkdown(parsed, sentAt);
    expect(markdown).toBe(
      [
        "## Resumo",
        "",
        "- **Nome:** Helena Martins",
        "- **Como quer ser chamado(a):** Helena",
        "- **Área:** Odontologia · Ortodontia",
        "- **RQE:** Ainda não",
        "- **WhatsApp:** (11) 98765-4321",
        "- **Registro:** CRO-SP 123456",
        "- **Indicação:** carla-ortodontia",
        "- **Origem:** instagram / bio / diag-nov",
        "- **Enviado em:** 04/11/2026 09:42",
        "",
        "## 1. Sobre você",
        "",
        "**Como os pacientes descrevem você?**",
        "Paciente, didática",
        "",
        "**O que te diferencia?**",
        "- Alinhadores",
        "- Plano em vídeo",
        "",
        "## 2. Seu público",
        "",
        "**Quem você atende?**",
        "Adultos",
        "",
      ].join("\n"),
    );
  });

  it("maps every RQE answer and skips empty fields", () => {
    const rqe = (value: string | null) =>
      buildDiagnosticoMarkdown({ ...parsed, rqe: value }, sentAt);
    expect(rqe("sim")).toContain("- **RQE:** Sim");
    expect(rqe("ainda-nao")).toContain("- **RQE:** Ainda não");
    expect(rqe("nao-se-aplica")).toContain("- **RQE:** Não se aplica");
    expect(rqe(null)).not.toContain("RQE");
    expect(
      buildDiagnosticoMarkdown(
        { ...parsed, ref: "", utm: { source: "", medium: "" } },
        sentAt,
      ),
    ).not.toMatch(/Indicação|Origem/);
  });

  it("keeps sections in order of first appearance even when interleaved", () => {
    const markdown = buildDiagnosticoMarkdown(
      {
        ...parsed,
        respostas: [
          { section: "a", sectionTitle: "Alfa", title: "P1", answer: "1" },
          { section: "b", sectionTitle: "Beta", title: "P2", answer: "2" },
          { section: "a", sectionTitle: "Alfa", title: "P3", answer: "3" },
        ],
      },
      sentAt,
    );
    const headings = markdown.match(/^## .*$/gm);
    expect(headings).toEqual(["## Resumo", "## 1. Alfa", "## 2. Beta"]);
    expect(markdown.indexOf("**P3**")).toBeLessThan(markdown.indexOf("## 2."));
  });

  it("neutralizes lines in answers that start with #", () => {
    const markdown = buildDiagnosticoMarkdown(
      {
        ...parsed,
        respostas: [
          {
            sectionTitle: "Sobre",
            title: "Livre",
            answer: "# Título falso\nnormal\n   ## Outro\n### Mais",
          },
          {
            sectionTitle: "Sobre",
            title: "Lista",
            answer: "x",
            items: ["# item", "dois\n## linhas"],
          },
        ],
      },
      sentAt,
    );
    expect(markdown.match(/^#+ .*$/gm)).toEqual(["## Resumo", "## 1. Sobre"]);
    expect(markdown).toContain("\\# Título falso");
    expect(markdown).toContain("   \\## Outro");
    expect(markdown).toContain("\\### Mais");
    expect(markdown).toContain("- # item");
    expect(markdown).toContain("- dois ## linhas");
  });
});
