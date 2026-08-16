import { z } from "zod";
import { infrai, type EmailRecord, type SendEmailInput, type SentEmail } from "./infrai_email.js";

export const deliveryRequestSchema = z.object({
  orderId: z.string().min(1),
  creator: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  asset: z.object({
    title: z.string().min(1),
    kind: z.enum(["video", "audio"]),
    sourceName: z.string().min(1),
  }),
  processing: z.discriminatedUnion("state", [
    z.object({ state: z.literal("queued"), jobId: z.string().min(1) }),
    z.object({ state: z.literal("processing"), jobId: z.string().min(1) }),
    z.object({
      state: z.literal("completed"),
      jobId: z.string().min(1),
      durationSeconds: z.number().int().positive(),
      deliveryUrl: z.string().url(),
    }),
  ]),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
});

export type DeliveryRequest = z.infer<typeof deliveryRequestSchema>;

export type EmailGateway = {
  send(input: SendEmailInput, idempotencyKey: string): Promise<SentEmail>;
  get(messageId: string): Promise<EmailRecord>;
};

export type DeliveryResult =
  | { state: "awaiting_processing"; jobId: string }
  | { state: "receipt_sent"; jobId: string; messageId: string; email: EmailRecord };

const defaultEmailGateway: EmailGateway = {
  send: (input, idempotencyKey) => infrai.email.send(input, idempotencyKey),
  get: (messageId) => infrai.email.get(messageId),
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export async function deliverCreatorReceipt(
  input: DeliveryRequest,
  email: EmailGateway = defaultEmailGateway,
): Promise<DeliveryResult> {
  if (input.processing.state !== "completed") {
    return { state: "awaiting_processing", jobId: input.processing.jobId };
  }

  const total = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: input.currency,
  }).format(input.amountCents / 100);
  const title = escapeHtml(input.asset.title);
  const creator = escapeHtml(input.creator.name);
  const deliveryUrl = escapeHtml(input.processing.deliveryUrl);

  const sent = await email.send(
    {
      to: input.creator.email,
      subject: `Receipt ${input.orderId}: ${input.asset.title} is ready`,
      html: `<h1>${title} is ready</h1><p>Hi ${creator}, your ${input.asset.kind} finished processing.</p><p><a href="${deliveryUrl}">Open creator delivery</a></p><p>Order ${escapeHtml(input.orderId)} · ${total} · ${input.processing.durationSeconds}s</p>`,
    },
    `creator-receipt:${input.orderId}:${input.processing.jobId}`,
  );

  const emailRecord = await email.get(sent.message_id);
  return {
    state: "receipt_sent",
    jobId: input.processing.jobId,
    messageId: sent.message_id,
    email: emailRecord,
  };
}
