import chalk from 'chalk';
import { range, throttle, type ThrottledFunction } from 'es-toolkit';

import { ellipsisLeft, StreamManager } from '../utils/terminal';

const BAR_LENGTH = 25;
const BLOCK_CHAR = '█';

export type ProgressBarState =
  | { type: 'idle' }
  | { type: 'running'; moduleId?: string }
  | { type: 'completed'; duration: number; hasErrors: boolean }
  | { type: 'hmr-completed'; count: number; moduleId: string };

export interface RenderContext {
  label: string;
  current: number;
  total: number;
  columns: number;
}

export interface StateRenderer<S extends ProgressBarState> {
  render(state: S, context: RenderContext): string;
}

const idleRenderer: StateRenderer<{ type: 'idle' }> = {
  render(_state, context) {
    return `  ${chalk.gray('Waiting...')} ${chalk.gray(context.label)}\n`;
  },
};

const runningRenderer: StateRenderer<{ type: 'running'; moduleId: string }> = {
  render(state, context) {
    const { label, current, total, columns } = context;
    const unknownTotal = total === 0;
    const progress = unknownTotal ? 0 : (current / total) * 100;

    const width = unknownTotal ? 0 : progress * (BAR_LENGTH / 100);
    const bg = chalk.white(BLOCK_CHAR);
    const fg = chalk.cyan(BLOCK_CHAR);
    const bar = range(BAR_LENGTH)
      .map((n) => (n < width ? fg : bg))
      .join('');

    const progressLabel = unknownTotal ? '' : `(${progress.toFixed(2)}%)`;
    const moduleCountLabel = unknownTotal ? `${current} modules` : `${current}/${total} modules`;

    const line1 = [
      chalk.cyan('●'),
      bar,
      progressLabel,
      chalk.gray(moduleCountLabel),
      chalk.gray(label),
    ].join(' ');

    const line2 = state.moduleId
      ? '  ' + chalk.grey(ellipsisLeft(state.moduleId, columns - 10))
      : '';

    return `${line1}\n${line2}`;
  },
};

const completedRenderer: StateRenderer<{
  type: 'completed';
  duration: number;
  hasErrors: boolean;
}> = {
  render(state, context) {
    if (state.hasErrors) {
      const icon = chalk.red('✘');
      const line = `${icon} Build failed ${chalk.gray(context.label)}`;
      return line;
    } else {
      const icon = chalk.green('✔');
      const durationInSeconds = (state.duration / 1000).toFixed(2);
      const line1 = `${icon} Build completed ${chalk.gray(context.label)}`;
      const line2 = chalk.grey(
        `  Built in ${durationInSeconds}s (${context.current}/${context.total} modules)`,
      );
      return `${line1}\n${line2}`;
    }
  },
};

const hmrCompletedRenderer: StateRenderer<{
  type: 'hmr-completed';
  count: number;
  moduleId: string;
}> = {
  render(state, context) {
    const icon = chalk.green('✔');
    const count = chalk.yellow(`(x${state.count})`);
    const moduleId = chalk.gray(ellipsisLeft(state.moduleId, context.columns - 4));
    return `${icon} HMR Updated ${chalk.gray(context.label)} ${count}\n  ${moduleId}`;
  },
};

export class ProgressBarRenderer {
  private readonly renderers = {
    idle: idleRenderer,
    running: runningRenderer,
    completed: completedRenderer,
    'hmr-completed': hmrCompletedRenderer,
  } as const;

  render(state: ProgressBarState, context: RenderContext): string {
    const renderer = this.renderers[state.type];
    return renderer.render(state as never, context);
  }
}

export interface ProgressBarOptions {
  label: string;
  total: number;
  renderer?: ProgressBarRenderer;
}

export class ProgressBar {
  private readonly columns = (process.stderr.columns || 80) - 2;
  private readonly renderer: ProgressBarRenderer;
  private readonly label: string;

  private state: ProgressBarState = { type: 'idle' };
  private current = 0;
  private total: number;

  stale = false;

  constructor(options: ProgressBarOptions) {
    this.total = options.total;
    this.label = options.label;
    this.renderer = options.renderer ?? new ProgressBarRenderer();
  }

  get done(): boolean {
    return this.state.type === 'completed' || this.state.type === 'hmr-completed';
  }

  setCurrent(current: number): this {
    this.current = current;
    this.stale = true;
    return this;
  }

  setTotal(total: number): this {
    this.total = total;
    this.stale = true;
    return this;
  }

  start(): this {
    this.state = { type: 'running' };
    this.stale = true;
    return this;
  }

  setModuleId(moduleId: string): this {
    if (this.state.type !== 'running') {
      return this;
    }
    this.state = { type: 'running', moduleId };
    this.stale = true;
    return this;
  }

  complete(duration: number, hasErrors = false): this {
    this.state = { type: 'completed', duration, hasErrors };
    this.stale = true;
    return this;
  }

  completeHmr(moduleId: string, count: number): this {
    this.state = { type: 'hmr-completed', count, moduleId };
    this.stale = true;
    return this;
  }

  render(): string {
    this.stale = false;
    const context: RenderContext = {
      label: this.label,
      current: this.current,
      total: this.total,
      columns: this.columns,
    };
    return this.renderer.render(this.state, context);
  }
}

export class ProgressBarRenderManager {
  private static instance: ProgressBarRenderManager | null = null;
  private streamManager = new StreamManager();
  private progressBars: Map<string, ProgressBar> = new Map();
  private throttledRender: ThrottledFunction<() => void>;

  static getInstance() {
    if (!ProgressBarRenderManager.instance) {
      ProgressBarRenderManager.instance = new ProgressBarRenderManager();
    }
    return ProgressBarRenderManager.instance;
  }

  private constructor() {
    this.throttledRender = throttle(this._render.bind(this), 50);
  }

  private _render() {
    const renderedLines = Array.from(
      this.progressBars
        .values()
        .filter((progressBar) => progressBar.stale)
        .map((progressBar) => progressBar.render()),
    );

    if (renderedLines.length > 0) {
      this.streamManager.render(renderedLines.join('\n\n'));
    }
  }

  register(key: string, options: ProgressBarOptions) {
    const progressBar = this.progressBars.get(key);

    if (progressBar == null) {
      const newProgressBar = new ProgressBar(options);
      this.progressBars.set(key, newProgressBar);
      return newProgressBar;
    }

    return progressBar;
  }

  start() {
    console.log();
    this.streamManager.listen();
    this._render();
  }

  render() {
    this.throttledRender();
  }

  release() {
    if (this.progressBars.values().every((progressBar) => progressBar.done)) {
      this._render();
      this.streamManager.done();
      console.log();
    }
  }

  clear() {
    this.streamManager.clear();
  }
}
