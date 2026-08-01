import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  clearSubscribers,
  publish,
  subscribe,
  type DomainEvent,
} from "../../src/lib/domain-events.js";

function event(name: DomainEvent["name"], entityId = "e1"): DomainEvent {
  return {
    name,
    organizationId: "org-1",
    actorUserId: "user-1",
    entityType: "absence",
    entityId,
    occurredAt: new Date("2026-08-01T00:00:00.000Z"),
    payload: {},
  };
}

describe("domain-events", () => {
  beforeEach(() => {
    clearSubscribers();
  });

  it("stellt nur an die passenden Abonnenten zu", async () => {
    const approved = vi.fn();
    const rejected = vi.fn();
    subscribe("absence.approved", approved);
    subscribe("absence.rejected", rejected);

    await publish([event("absence.approved")]);

    expect(approved).toHaveBeenCalledTimes(1);
    expect(rejected).not.toHaveBeenCalled();
  });

  it("* empfängt jedes Ereignis", async () => {
    const all = vi.fn();
    subscribe("*", all);

    await publish([event("absence.approved"), event("contract.created", "e2")]);

    expect(all).toHaveBeenCalledTimes(2);
  });

  it("meldet ab", async () => {
    const handler = vi.fn();
    const unsubscribe = subscribe("absence.approved", handler);
    unsubscribe();

    await publish([event("absence.approved")]);

    expect(handler).not.toHaveBeenCalled();
  });

  it("ein defekter Handler stoppt weder publish noch die anderen Abonnenten", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = vi.fn(() => {
      throw new Error("Konnektor nicht erreichbar");
    });
    const healthy = vi.fn();
    subscribe("absence.approved", broken);
    subscribe("absence.approved", healthy);

    await expect(publish([event("absence.approved")])).resolves.toBeUndefined();

    expect(broken).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("wartet asynchrone Handler ab", async () => {
    const order: string[] = [];
    subscribe("contract.created", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push("handler");
    });

    await publish([event("contract.created")]);
    order.push("after-publish");

    expect(order).toEqual(["handler", "after-publish"]);
  });

  it("gibt dem Abonnenten den vollständigen Ereignis-Kontext", async () => {
    const received: DomainEvent[] = [];
    subscribe("*", (e) => {
      received.push(e);
    });

    await publish([event("absence.approved", "abs-42")]);

    expect(received[0]).toMatchObject({
      name: "absence.approved",
      organizationId: "org-1",
      actorUserId: "user-1",
      entityType: "absence",
      entityId: "abs-42",
    });
  });
});
