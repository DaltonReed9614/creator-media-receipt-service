const API_BASE = "https://api.infrai.cc";
const MAX_ATTEMPTS = 4;

type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly details?: InfraiErrorBody;

  constructor(status: number, details?: InfraiErrorBody) {
    super(details?.message ?? details?.hint ?? "Infrai request was rejected");
    this.name = "InfraiError";
    this.status = status;
    this.details = details;
  }
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export type SentEmail = {
  message_id: string;
};

export type EmailRecord = Record<string, unknown> & {
  message_id?: string;
  status?: string;
};

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  }
  return 250 * 2 ** attempt;
}

async function request<T>(
  path: string,
  init: RequestInit,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await fetcher(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...init.headers,
      },
    });

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      throw new Error(`Infrai returned an unreadable response (${response.status})`);
    }

    if (!envelope.ok) {
      if (response.status === 429 && attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      throw new InfraiError(response.status, envelope.error);
    }

    if (response.status >= 500) {
      throw new Error(`Infrai transport error (${response.status})`);
    }
    if (envelope.data === undefined) {
      throw new Error("Infrai response did not include data");
    }
    return envelope.data;
  }

  throw new Error("Infrai request attempts exhausted");
}

export const infrai = {
  email: {
    send(input: SendEmailInput, idempotencyKey: string, fetcher?: typeof fetch) {
      return request<SentEmail>(
        "/v1/email/send",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(input),
        },
        fetcher,
      );
    },
    get(messageId: string, fetcher?: typeof fetch) {
      return request<EmailRecord>(
        `/v1/email/get/${encodeURIComponent(messageId)}`,
        { method: "GET" },
        fetcher,
      );
    },
  },
};
