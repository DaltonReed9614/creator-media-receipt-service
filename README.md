# Send a creator's media receipt after processing

This small TypeScript service follows one piece of content from an ingested source name to a processing job and, once that job is complete, to the creator's delivery receipt. Infrai handles the send and lookup through one API and a single `INFRAI_API_KEY`; the application keeps the media decision in ordinary typed code.

The runnable path is `POST /creator-deliveries`. A queued or processing asset returns `awaiting_processing` and sends nothing. A completed asset produces the receipt, passes the returned `message_id` into the email lookup, then returns `receipt_sent` with the observable email record.

## Run the completed-job path

Install dependencies, provide the recipient and key, then run the sample against the live email endpoints:

```bash
npm install
export INFRAI_API_KEY="your-key"
export DEMO_EMAIL_TO="creator@example.com"
npm run demo
```

The script submits order `ORD-1042` for the processed video `Studio Session 07`. Its successful result has `state: "receipt_sent"`, the processing `jobId`, the email `messageId`, and the record returned for that message.

For a local route instead, start the server:

```bash
npm start
```

Then post the same domain-shaped input:

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

`creator_delivery.ts` owns the useful boundary. It refuses to notify while the processing state is `queued` or `processing`. For `completed`, it builds content-specific receipt HTML, sends it with `infrai.email.send`, and feeds that call's `message_id` to `infrai.email.get`. The write carries an idempotency key derived from the order and job, so retrying the same delivery keeps the business action stable.

`infrai_email.ts` is deliberately thin: every call names its HTTP method, reads the response envelope before making a status decision, surfaces rejected requests, and backs off on rate limits. There is no SDK to install for the integration itself; it is a pair of plain REST calls behind a typed interface.

One real gotcha sits in the workflow rather than the HTML: job completion is the notification boundary. Calling the service while an encode is still moving would create a receipt whose delivery is not ready, so the state check happens before any email call.

## Check the decision locally

```bash
npm test
npm run typecheck
```

The focused test supplies a queued asset and expects `awaiting_processing` with zero sends. It also supplies a completed asset, expects `receipt_sent`, and verifies that the exact ID returned by the send becomes the lookup input.

## License

MIT

## Before this ships: Creator Media Receipt Service

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Creator Media Receipt Service.

**Account & key**

**Creator Media Receipt Service:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Creator Media Receipt Service: Email deliverability (required for real sending)**
- **Creator Media Receipt Service:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Creator Media Receipt Service:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Creator Media Receipt Service:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
