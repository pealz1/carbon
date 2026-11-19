import { describe, expect, it } from "vitest";
import { confirmations } from "./confirm.svelte";

const question = { title: "Replace?", body: "", ok: "Yes", cancel: "No" };

describe("confirmations", () => {
  it("resolves with the answer and closes", async () => {
    const answer = confirmations.ask(question);
    confirmations.current!.answer(true);
    expect(await answer).toBe(true);
    expect(confirmations.current).toBeNull();
  });

  it("answers an open question no when another is asked", async () => {
    const first = confirmations.ask(question);
    const second = confirmations.ask({ ...question, title: "Again?" });
    expect(await first).toBe(false);
    expect(confirmations.current?.title).toBe("Again?");
    confirmations.current!.answer(false);
    expect(await second).toBe(false);
  });
});
