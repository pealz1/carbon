// One yes-or-no question at a time, asked from anywhere and answered in the layout's dialog.
export interface Question {
  title: string;
  body: string;
  ok: string;
  cancel: string;
}

class Confirmations {
  current = $state<(Question & { answer: (yes: boolean) => void }) | null>(null);

  /** Resolves with the answer; a question still open is answered "no" first. */
  ask(question: Question): Promise<boolean> {
    this.current?.answer(false);
    return new Promise((resolve) => {
      this.current = {
        ...question,
        answer: (yes) => {
          this.current = null;
          resolve(yes);
        },
      };
    });
  }
}

export const confirmations = new Confirmations();
