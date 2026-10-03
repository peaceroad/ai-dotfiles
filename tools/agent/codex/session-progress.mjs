// @ai-dotfiles agent-dev-runtime managed

// Nested operations share one transient line. Persistent messages and prompts clear it first.
const reporter = Symbol('session-progress');
export function createProgress(log = console.log, {
  stream = process.stdout,
  terminal = log === console.log && Boolean(stream.isTTY) && process.env.TERM !== 'dumb',
  now = Date.now,
} = {}) {
  if (log[reporter]) return log[reporter];
  let label = '', completed = null, total = null, last = -Infinity, visible = false, previous = '';
  const mib = value => `${(value / 1024 ** 2).toFixed(1)} MiB`;
  const summary = () => `Progress: ${label}${total !== null ? ` ${completed}/${total}` : ''}`;
  const clear = () => {
    if (visible) { stream.write('\r\x1b[2K'); visible = false; previous = ''; }
  };
  const render = (message, force = false) => {
    const time = now();
    if (message === previous || (!force && time - last < (terminal ? 250 : 30000))) return;
    if (terminal) {
      const width = Math.max(1, (stream.columns || 80) - 1);
      stream.write(`\r\x1b[2K${message.slice(0, width)}`);
      visible = true;
    } else log(message);
    previous = message; last = time;
  };
  const progress = {
    log(...values) { clear(); log(...values); },
    clear,
    phase(next, done = null, count = null) {
      const changed = next !== label;
      label = next; completed = done; total = count;
      render(summary(), (changed && count === null) || (count !== null && done === count));
    },
    bytes(read, size = null) {
      if (now() - last < (terminal ? 250 : 30000)) return;
      render(`${summary()}; reading ${mib(read)}${size !== null ? ` / ${mib(size)}` : ''}`);
    },
  };
  Object.defineProperty(progress.log, reporter, { value: progress });
  return progress;
}
