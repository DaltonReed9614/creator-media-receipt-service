import { deliverCreatorReceipt, deliveryRequestSchema } from "../src/creator_delivery.js";

const recipient = process.env.DEMO_EMAIL_TO;
if (!recipient) throw new Error("DEMO_EMAIL_TO is required");

const sample = deliveryRequestSchema.parse({
  orderId: "ORD-1042",
  creator: { name: "Mina", email: recipient },
  asset: { title: "Studio Session 07", kind: "video", sourceName: "session-07.mov" },
  processing: {
    state: "completed",
    jobId: "job-session-07-h264",
    durationSeconds: 1842,
    deliveryUrl: "https://media.example.com/deliveries/session-07",
  },
  amountCents: 4900,
  currency: "USD",
});

const result = await deliverCreatorReceipt(sample);
console.log(JSON.stringify(result, null, 2));
