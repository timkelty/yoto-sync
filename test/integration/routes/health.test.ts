import { describe, it, expect } from "vitest";
import { health } from "../../../src/routes/health.js";

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await health.request("/health");

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
  });
});
