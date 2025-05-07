package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"github.com/slack-go/slack"
	"github.com/slack-go/slack/slackevents"

	"slack-rag-server/src/handlers"
	"slack-rag-server/src/services"
)

func main() {
	// Load environment variables from .env file
	err := godotenv.Load()
	if err != nil {
		log.Println("Warning: Error loading .env file:", err)
	}

	// Get required environment variables
	botToken := os.Getenv("SLACK_BOT_TOKEN")
	signingSecret := os.Getenv("SLACK_SIGNING_SECRET")

	if botToken == "" || signingSecret == "" {
		log.Fatal("Missing required environment variables")
	}

	// Create a new Slack API client
	api := slack.New(
		botToken,
		slack.OptionLog(log.New(os.Stdout, "slack-bot: ", log.Lshortfile|log.LstdFlags)),
	)

	// Create Bedrock service
	bedrockService, err := services.NewBedrockService()
	if err != nil {
		log.Fatalf("Failed to initialize Bedrock service: %v", err)
	}

	// Initialize handlers
	messageHandler := handlers.NewMessageHandler(api, bedrockService)
	commandHandler := handlers.NewCommandHandler(api, bedrockService)

	// Set up HTTP server with endpoints for Slack events and slash commands

	// Health check endpoint
	http.HandleFunc("/health-check", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Health check passed"))
	})

	// Slack events endpoint
	http.HandleFunc("/slack/events", func(w http.ResponseWriter, r *http.Request) {
		// Read the request body
		body, err := io.ReadAll(r.Body)
		if err != nil {
			log.Printf("Error reading request body: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		// Log the body for debugging
		bodyString := string(body)
		if len(bodyString) > 0 {
			previewLength := len(bodyString)
			if previewLength > 300 {
				previewLength = 300
			}
			log.Printf("Received event. Body preview: %s", bodyString[:previewLength])
		}

		// Check if this is actually a form-encoded request (slash command) that was sent to the wrong endpoint
		contentType := r.Header.Get("Content-Type")
		if contentType == "application/x-www-form-urlencoded" || strings.Contains(bodyString, "command=") {
			log.Printf("Received form-encoded request to /slack/events, redirecting to command handler")

			// Reset the body for the command handler
			r.Body = io.NopCloser(bytes.NewReader(body))

			// Call the command handler directly
			handleSlashCommand(w, r, signingSecret, commandHandler)
			return
		}

		// Handle URL verification (required for setting up Events API)
		// Check if it's a URL verification request before doing signature verification
		if len(body) > 0 {
			var requestData map[string]interface{}
			if err := json.Unmarshal(body, &requestData); err == nil {
				// If we can parse it as JSON, check if it's a URL verification request
				if requestType, ok := requestData["type"].(string); ok && requestType == "url_verification" {
					challenge, ok := requestData["challenge"].(string)
					if ok {
						log.Printf("Responding to URL verification challenge")
						w.Header().Set("Content-Type", "text/plain")
						w.Write([]byte(challenge))
						return
					}
				}
			} else {
				log.Printf("Request body is not valid JSON: %v", err)
				// This might be a form-encoded request, not a JSON request
				w.WriteHeader(http.StatusBadRequest)
				return
			}
		}

		// Verify request comes from Slack for non-verification requests
		sv, err := slack.NewSecretsVerifier(r.Header, signingSecret)
		if err != nil {
			log.Printf("Error creating secrets verifier: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		sv.Write(body)
		if err := sv.Ensure(); err != nil {
			log.Printf("Invalid request signature: %v", err)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		// Parse the raw JSON to access the event property
		var slackEvent map[string]interface{}
		if err := json.Unmarshal(body, &slackEvent); err != nil {
			log.Printf("Error parsing event JSON: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		// Process events in a separate goroutine to respond to Slack quickly
		go func() {
			// Extract the event object from the JSON
			eventObj, ok := slackEvent["event"].(map[string]interface{})
			if !ok {
				log.Printf("No event object found in request")
				return
			}

			// Get the event type
			eventType, ok := eventObj["type"].(string)
			if !ok {
				log.Printf("No event type found in event object")
				return
			}

			log.Printf("Processing event type: %s", eventType)

			// Handle different event types
			switch eventType {
			case "app_mention":
				// Convert the event back to JSON to parse it into the correct struct
				eventBytes, err := json.Marshal(eventObj)
				if err != nil {
					log.Printf("Error marshalling app_mention event: %v", err)
					return
				}

				var appMentionEvent slackevents.AppMentionEvent
				if err := json.Unmarshal(eventBytes, &appMentionEvent); err != nil {
					log.Printf("Error parsing app_mention event: %v", err)
					return
				}

				log.Printf("Handling app mention from user %s: %s", appMentionEvent.User, appMentionEvent.Text)
				messageHandler.HandleAppMention(&appMentionEvent)

			case "message":
				// Convert the event back to JSON to parse it into the correct struct
				eventBytes, err := json.Marshal(eventObj)
				if err != nil {
					log.Printf("Error marshalling message event: %v", err)
					return
				}

				var messageEvent slackevents.MessageEvent
				if err := json.Unmarshal(eventBytes, &messageEvent); err != nil {
					log.Printf("Error parsing message event: %v", err)
					return
				}

				log.Printf("Received message event from user %s in channel %s", messageEvent.User, messageEvent.Channel)
				if messageEvent.ThreadTimeStamp != "" {
					if messageEvent.ChannelType == "im" {
						messageHandler.HandleDirectThreadMessage(&messageEvent)
					} else {
						messageHandler.HandleThreadMessage(&messageEvent)
					}
				} else if messageEvent.ChannelType == "im" {
					messageHandler.HandleDirectMessage(&messageEvent)
				}

			default:
				log.Printf("Unhandled event type: %s", eventType)
			}
		}()

		// Acknowledge receipt of the event
		w.WriteHeader(http.StatusOK)
	})

	// Slash commands endpoint
	http.HandleFunc("/slack/commands", func(w http.ResponseWriter, r *http.Request) {
		handleSlashCommand(w, r, signingSecret, commandHandler)
	})

	// Get port from environment variable, default to 8083
	port := os.Getenv("PORT")
	if port == "" {
		port = "8083"
	}

	// Start HTTP server
	log.Printf("Starting HTTP server on port %s", port)
	log.Println("⚡️ RagBot is running!")

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Error starting HTTP server: %v", err)
	}
}

// handleSlashCommand processes Slack slash commands
func handleSlashCommand(w http.ResponseWriter, r *http.Request, signingSecret string, commandHandler *handlers.CommandHandler) {
	// Save a copy of the original body for verification before parsing the form
	var bodyString string
	if r.Body != nil {
		bodyBytes, err := io.ReadAll(r.Body)
		if err != nil {
			log.Printf("Error reading request body: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		bodyString = string(bodyBytes)
		log.Printf("Raw body: %s", bodyString)

		// Reset the body so it can be read again for form parsing
		r.Body = io.NopCloser(bytes.NewReader(bodyBytes))
	}

	// Verify request comes from Slack using the X-Slack-Signature and X-Slack-Request-Timestamp
	sv, err := slack.NewSecretsVerifier(r.Header, signingSecret)
	if err != nil {
		log.Printf("Error creating secrets verifier: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	// Write the original body to the verifier
	if bodyString != "" {
		sv.Write([]byte(bodyString))
		if err := sv.Ensure(); err != nil {
			log.Printf("Invalid request signature: %v", err)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
	}

	// Now parse the form data
	if err := r.ParseForm(); err != nil {
		log.Printf("Error parsing form: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	// Log the form data for debugging
	log.Printf("Slash command received - Form data: %+v", r.Form)

	// Get command directly from form
	command := r.Form.Get("command")
	if command == "" {
		log.Printf("No command found in form data")
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	// Create a slash command struct manually
	s := slack.SlashCommand{
		Command:      command,
		Text:         r.Form.Get("text"),
		ResponseURL:  r.Form.Get("response_url"),
		TriggerID:    r.Form.Get("trigger_id"),
		UserID:       r.Form.Get("user_id"),
		UserName:     r.Form.Get("user_name"),
		ChannelID:    r.Form.Get("channel_id"),
		ChannelName:  r.Form.Get("channel_name"),
		TeamID:       r.Form.Get("team_id"),
		TeamDomain:   r.Form.Get("team_domain"),
		EnterpriseID: r.Form.Get("enterprise_id"),
	}

	// Log the command for debugging
	log.Printf("Processing slash command: %s from user %s", s.Command, s.UserID)

	// Process commands in a separate goroutine
	go func() {
		switch s.Command {
		case "/ragbot-get-datasource":
			commandHandler.HandleGetDataSource(s)
		case "/ragbot-sync-datasource":
			commandHandler.HandleSyncDataSource(s)
		case "/ragbot-help":
			commandHandler.HandleHelp(s)
		case "/ragbot-kb-status":
			commandHandler.HandleKbStatus(s)
		case "/ragbot-ds-config":
			commandHandler.HandleDsConfig(s)
		case "/ragbot-agent-status":
			commandHandler.HandleAgentStatus(s)
		case "/ragbot-list-datasources":
			commandHandler.HandleListDataSources(s)
		case "/ragbot-job-status":
			commandHandler.HandleJobStatus(s)
		case "/ragbot-health-check":
			commandHandler.HandleHealthCheck(s)
		default:
			log.Printf("Unknown command: %s", s.Command)
		}
	}()

	// Acknowledge receipt of the command to Slack (required within 3 seconds)
	// Don't send any content since we'll use the response_url to send the actual response
	w.WriteHeader(http.StatusOK)
}
