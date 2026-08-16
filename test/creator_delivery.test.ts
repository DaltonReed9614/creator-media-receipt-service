import assert from "node:assert/strict";
import test from "node:test";
import { deliverCreatorReceipt, deliveryRequestSchema, type EmailGateway } from "../src/creator_delivery.js";

function requestFor(state: "queued" | "completed") {
  return deliveryRequestSchema.parse({
    orderId: "ORD-77",
    creator: { name: "Kai", email: "kai@example.com" },
    asset: { title: "Live Cut", kind: "video", sourceName: "live-cut.mov" },
    processing:
      state === "completed"
        ? {
            state,
            jobId: "job-77",
            durationSeconds: 300,
            deliveryUrl: "https://media.example.com/deliveries/live-cut",
          }
        : { state, jobId: "job-77" },
    amountCents: 2500,
    currency: "usd",
  });
}

test("a queued asset waits without sending a receipt", async () => {
  let sends = 0;
  const email: EmailGateway = {
    async send() {
      sends += 1;
      return { message_id: "unused" };
    },
    async get() {
      throw new Error("get should not run");
    },
  };

  const result = await deliverCreatorReceipt(requestFor("queued"), email);
  assert.deepEqual(result, { state: "awaiting_processing", jobId: "job-77" });
  assert.equal(sends, 0);
});

test("a completed asset sends one receipt and looks up that message", async () => {
  const calls: string[] = [];
  const email: EmailGateway = {
    async send(input, idempotencyKey) {
      calls.push(`send:${input.to}:${idempotencyKey}`);
      assert.match(input.html, /Open creator delivery/);
      return { message_id: "msg-77" };
    },
    async get(messageId) {
      calls.push(`get:${messageId}`);
      return { message_id: messageId, status: "accepted" };
    },
  };

  const result = await deliverCreatorReceipt(requestFor("completed"), email);
  assert.equal(result.state, "receipt_sent");
  assert.deepEqual(calls, ["send:kai@example.com:creator-receipt:ORD-77:job-77", "get:msg-77"]);
});
