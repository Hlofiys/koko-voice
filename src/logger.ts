export class Logger {
  private static logLevel = process.env.LOG_LEVEL || 'info';
  
  private static levels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  };

  private static shouldLog(level: keyof typeof Logger.levels): boolean {
    return Logger.levels[level] <= Logger.levels[Logger.logLevel as keyof typeof Logger.levels];
  }

  static error(message: string, ...args: any[]): void {
    if (Logger.shouldLog('error')) {
      console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
    }
  }

  static warn(message: string, ...args: any[]): void {
    if (Logger.shouldLog('warn')) {
      console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
    }
  }

  static info(message: string, ...args: any[]): void {
    if (Logger.shouldLog('info')) {
      console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
    }
  }

  static debug(message: string, ...args: any[]): void {
    if (Logger.shouldLog('debug')) {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args);
    }
  }
}