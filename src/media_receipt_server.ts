import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { deliverCreatorReceipt, deliveryRequestSchema } from "./creator_delivery.js";
import { InfraiError } from "./infrai_email.js";

const port = Number(process.env.PORT ?? 3000);

function reply(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/creator-deliveries") {
    reply(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = deliveryRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const result = await deliverCreatorReceipt(input);
    reply(response, result.state === "receipt_sent" ? 201 : 202, result);
  } catch (error) {
    if (error instanceof ZodError) {
      reply(response, 400, { error: "invalid_delivery", issues: error.issues });
      return;
    }
    if (error instanceof SyntaxError) {
      reply(response, 400, { error: "invalid_json" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      reply(response, status, { error: "email_delivery_rejected", message: error.message });
      return;
    }
    console.error(error);
    reply(response, 500, { error: "internal_error" });
  }
});

server.listen(port, () => {
  console.log(`Media receipt service listening on http://localhost:${port}`);
});
