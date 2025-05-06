package utils

import (
	"time"
)

// FormatDate formats a time.Time to a string using a standard format
// If date is zero, returns "No date provided"
func FormatDate(date time.Time) string {
	if date.IsZero() {
		return "No date provided"
	}

	// Format the date in a similar way to the JS version
	// Go equivalent of 'en-US' locale with year, month, day, hour, minute
	return date.Format("January 2, 2006 3:04 PM")
}
