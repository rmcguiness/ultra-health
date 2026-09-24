/**
 * Structured, privacy-safe logging.
 *
 * Rule: fields may carry identifiers, counts, durations and error messages,
 * never health values. Device logs are readable through sysdiagnose, crash
 * reporters and Xcode, so a logged heart rate is a leaked heart rate.
 */
type Fields = Record<string, string | number | boolean | undefined>;
type Level = 'debug' | 'info' | 'warn' | 'error';

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

function emit(level: Level, event: string, fields?: Fields): void {
  if (!isDev && (level === 'debug' || level === 'info')) return;
  const line = fields ? `[${event}] ${JSON.stringify(fields)}` : `[${event}]`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  // eslint-disable-next-line no-console
  else console.log(line);
}

export const logger = {
  debug: (event: string, fields?: Fields) => emit('debug', event, fields),
  info: (event: string, fields?: Fields) => emit('info', event, fields),
  warn: (event: string, fields?: Fields) => emit('warn', event, fields),
  error: (event: string, fields?: Fields) => emit('error', event, fields),
};

export type Logger = typeof logger;
