package utils

import (
	"encoding/base64"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/slack-go/slack"
)

// GetFileType determines the MIME type based on file extension
func GetFileType(fileName string) string {
	extension := strings.ToLower(filepath.Ext(fileName))

	// Remove the dot from extension
	if len(extension) > 0 {
		extension = extension[1:]
	}

	mimeTypes := map[string]string{
		"js":   "application/javascript",
		"pdf":  "application/pdf",
		"txt":  "text/plain",
		"csv":  "text/csv",
		"json": "application/json",
		"png":  "image/png",
		"jpg":  "image/jpeg",
		"jpeg": "image/jpeg",
		"docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	}

	if mime, ok := mimeTypes[extension]; ok {
		return mime
	}

	return "application/octet-stream"
}

// FileAttachment represents a file attachment
type FileAttachment struct {
	Name      string
	Data      string
	MediaType string
}

// AttachmentHandler processes file attachments from a Slack message
func AttachmentHandler(message *slack.MessageEvent) ([]FileAttachment, error) {
	attachments := []FileAttachment{}

	// Check if there are any files in the message
	if message.Files == nil || len(message.Files) == 0 {
		return attachments, nil
	}

	LogInfo(fmt.Sprintf("Message has %d attachments", len(message.Files)))

	// Process only the first file for simplicity
	file := message.Files[0]

	// Skip files with no URL
	if file.URLPrivate == "" {
		return attachments, nil
	}

	// Create a new HTTP client
	client := &http.Client{}

	// Create a new request
	req, err := http.NewRequest("GET", file.URLPrivate, nil)
	if err != nil {
		LogError(err, "Error creating request for file")
		return attachments, err
	}

	// Add authentication header
	req.Header.Add("Authorization", "Bearer "+os.Getenv("SLACK_BOT_TOKEN"))

	// Execute the request
	resp, err := client.Do(req)
	if err != nil {
		LogError(err, "Error downloading file")
		return attachments, err
	}
	defer resp.Body.Close()

	// Check response status
	if resp.StatusCode != http.StatusOK {
		LogError(err, "Failed to download file: "+resp.Status)
		return attachments, err
	}

	// Read the file content
	fileBytes, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		LogError(err, "Error reading file content")
		return attachments, err
	}

	// Convert to base64
	base64File := base64.StdEncoding.EncodeToString(fileBytes)

	// Determine media type
	mediaType := file.Mimetype
	if mediaType == "" {
		mediaType = GetFileType(file.Name)
	}

	// Add to attachments
	attachments = append(attachments, FileAttachment{
		Name:      file.Name,
		Data:      base64File,
		MediaType: mediaType,
	})

	LogInfo("Successfully processed file: " + file.Name)

	return attachments, nil
}
