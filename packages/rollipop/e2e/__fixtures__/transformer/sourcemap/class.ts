class ThrowingService {
  #enabled: boolean;

  constructor(enabled: boolean) {
    this.#enabled = enabled;
  }

  run(): void {
    if (this.#enabled) {
      throw new Error('private field failure');
    }
  }
}

globalThis.runSourcemapCase = () => new ThrowingService(true).run();
