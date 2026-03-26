/**
 * ロガー（簡易版）
 */
export class Logger {
  private prefix: string;

  constructor(prefix: string = 'CRAWLER') {
    this.prefix = prefix;
  }

  info(message: string, ...args: any[]): void {
    console.log(`[${this.prefix}] [INFO]`, message, ...args);
  }

  error(message: string, error?: any): void {
    console.error(`[${this.prefix}] [ERROR]`, message, error || '');
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`[${this.prefix}] [WARN]`, message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    if (process.env.DEBUG) {
      console.debug(`[${this.prefix}] [DEBUG]`, message, ...args);
    }
  }
}



