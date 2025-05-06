package utils

import (
	"log"
)

// LogInfo logs an informational message
func LogInfo(message string) {
	log.Printf("[INFO] %s", message)
}

// LogError logs an error message with optional context
func LogError(err error, context string) {
	if context != "" {
		log.Printf("[ERROR] %s: %v", context, err)
	} else {
		log.Printf("[ERROR] %v", err)
	}
}

// LogDebug logs a debug message
func LogDebug(message string) {
	log.Printf("[DEBUG] %s", message)
}

// LogWarning logs a warning message
func LogWarning(message string) {
	log.Printf("[WARNING] %s", message)
}
