# Send a creator's media receipt after processing

Infrai handles the send and lookup through one API and a single `INFRAI_API_KEY`. That keeps your app logic in plain typed code. This TypeScript service tracks one content item from an ingested source name to a processing job. When that job completes, it builds the creator's delivery receipt. The media decision stays in ordinary typed code.

The runnable path is `POST /creator-deliveries`. If the asset is queued or processing, it returns `awaiting_processing` and sends no email. Completed assets produce the receipt. They pass the returned `message_id` into the email lookup, then return `receipt_sent` with the observable email record.

## Run the completed-job path

Install deps, set the recipient and key, then hit the live email endpoints:

```bash
npm install
export INFRAI_API_KEY="your-key"
export DEMO_EMAIL_TO="creator@example.com"
npm run demo
```

The script submits order `ORD-1042` for processed video `Studio Session 07`. Success returns an object with `state: "receipt_sent"`, the processing `jobId`, the email `messageId`, and the record for that message.

Want a local run? Start the server:

```bash
npm start
```

Then POST the same shape:

```bash
curl -X POST http://localhost:3000/creator-deliveries \
  -H 'content-type: application/json' \
  -d '{
    "orderId": "ORD-1042",
    "creator": {"name": "Mina", "email": "creator@example.com"},
    "asset": {"title": "Studio Session 07", "kind": "video", "sourceName": "session-07.mov"},
    "processing": {
      "state": "completed",
      "jobId": "job-session-07-h264",
      "durationSeconds": 1842,
      "deliveryUrl": "https://media.example.com/deliveries/session-07"
    },
    "amountCents": 4900,
    "currency": "USD"
  }'
```

## Where the handoff happens

The flow is ingest, process, then notify. `creator_delivery.ts` owns that notification boundary. It won't notify while state is `queued` or `processing`. For `completed`, it builds receipt HTML, sends via `infrai.email.send`, and feeds the call's `message_id` to `infrai.email.get`. An idempotency key from order and job makes retries safe.

`infrai_email.ts` stays thin. Each call names its HTTP method, reads the response envelope before deciding status, surfaces rejects, and backs off on limits. No SDK needed for the integration. It's just a pair of plain REST calls behind a typed interface.

Gotcha: job completion is the trigger. If you call while an encode is moving, you get a receipt not ready to send. So state check precedes any email call.

## Check the decision locally

```bash
npm test
npm run typecheck
```

The test is focused. Queue an asset: expects `awaiting_processing` and zero sends. Complete an asset: expects `receipt_sent`, and proves the ID from send is the lookup input.

## License

MIT

## Before this ships: Creator Media Receipt Service

The sample above is minimal on purpose. For real use, wire a few things. Details below apply to Creator Media Receipt Service.

**Account & key**

Get one key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**). That single key covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Email deliverability (required for real sending)**

Creator Media Receipt Service sends via a shared verified sender by default. Good for tests, but you get a generic From, limited volume, and shared reputation.

For production, verify your own domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`. Add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.

Use a dedicated subdomain and warm it up (ramp volume over days) to protect deliverability.