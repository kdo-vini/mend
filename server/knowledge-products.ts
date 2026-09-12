export interface SupportProduct {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  description: string;
  aliases: readonly string[];
  status: "active" | "archived";
}

export interface ProductResolution {
  productIds: readonly string[];
  primaryProductId?: string;
  confidence: number;
  source: "manual" | "conversation" | "alias" | "retrieval" | "shared";
  ambiguous: boolean;
}

const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const containsTerm = (text: string, term: string) =>
  text === term ||
  text.startsWith(`${term} `) ||
  text.endsWith(` ${term}`) ||
  text.includes(` ${term} `);

/** Resolves explicit product names and configured aliases without guessing from a generic brand word. */
export function resolveSupportProducts(
  message: string,
  products: readonly SupportProduct[],
): ProductResolution {
  const text = normalize(message);
  if (!text)
    return { productIds: [], confidence: 0, source: "shared", ambiguous: true };

  const matched = products
    .filter((product) => product.status === "active")
    .map((product) => {
      const name = normalize(product.name);
      const key = normalize(product.key);
      const exactName = containsTerm(text, name) || containsTerm(text, key);
      const alias = product.aliases
        .map(normalize)
        .filter((value) => value.length >= 3 && value !== "zelo")
        .some((value) => containsTerm(text, value));
      return exactName
        ? { product, confidence: 1 }
        : alias
          ? { product, confidence: 0.9 }
          : null;
    })
    .filter((value): value is { product: SupportProduct; confidence: number } =>
      Boolean(value),
    );

  if (!matched.length)
    return { productIds: [], confidence: 0, source: "shared", ambiguous: true };
  return {
    productIds: matched.map(({ product }) => product.id),
    ...(matched.length === 1
      ? { primaryProductId: matched[0].product.id }
      : {}),
    confidence: Math.min(...matched.map(({ confidence }) => confidence)),
    source: "alias",
    ambiguous: false,
  };
}

export function resolveProductsFromScores(
  scores: Readonly<Record<string, number>>,
  options: { threshold?: number; minimumDelta?: number } = {},
): ProductResolution {
  const threshold = options.threshold ?? 0.18;
  const minimumDelta = options.minimumDelta ?? 0.05;
  const ranked = Object.entries(scores)
    .filter(([, score]) => Number.isFinite(score) && score >= threshold)
    .sort((left, right) => right[1] - left[1]);
  if (!ranked.length)
    return {
      productIds: [],
      confidence: 0,
      source: "retrieval",
      ambiguous: true,
    };
  if (ranked[1] && ranked[0][1] - ranked[1][1] < minimumDelta)
    return {
      productIds: ranked.slice(0, 2).map(([id]) => id),
      confidence: ranked[0][1],
      source: "retrieval",
      ambiguous: true,
    };
  return {
    productIds: [ranked[0][0]],
    primaryProductId: ranked[0][0],
    confidence: ranked[0][1],
    source: "retrieval",
    ambiguous: false,
  };
}
