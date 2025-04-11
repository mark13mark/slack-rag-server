// Logging utility functions
export function logInfo(logger, message) {
  logger.info(message);
}

export function logError(logger, error, context = '') {
  logger.error(`${context}${context ? ': ' : ''}${error}`);
}

export function logDebug(logger, message) {
  logger.debug(message);
}

export function logWarning(logger, message) {
  logger.warn(message);
}
