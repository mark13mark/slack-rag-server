package handlers

import (
	"fmt"
	"strings"

	"github.com/slack-go/slack"
	"github.com/slack-go/slack/slackevents"

	"slack-rag-server/src-go/services"
	"slack-rag-server/src-go/types"
	"slack-rag-server/src-go/utils"
)

// MessageHandler handles Slack message events
type MessageHandler struct {
	api            *slack.Client
	bedrockService *services.BedrockService
}

// NewMessageHandler creates a new MessageHandler
func NewMessageHandler(api *slack.Client, bedrockService *services.BedrockService) *MessageHandler {
	return &MessageHandler{
		api:            api,
		bedrockService: bedrockService,
	}
}

// HandleAppMention handles app mention events
func (h *MessageHandler) HandleAppMention(event *slackevents.AppMentionEvent) {
	utils.LogInfo(fmt.Sprintf("Processing app mention: %s", event.Text))

	// Extract text without the mention
	mentionPattern := "<@[^>]+>"
	textAfterMention := event.Text

	// Find mention and remove it
	if strings.Contains(event.Text, mentionPattern) {
		parts := strings.SplitN(event.Text, ">", 2)
		if len(parts) > 1 {
			textAfterMention = strings.TrimSpace(parts[1])
		}
	}

	// Process the message
	thread := event.ThreadTimeStamp
	if thread == "" {
		thread = event.TimeStamp
	}

	h.processMessage(event.Channel, event.TimeStamp, thread, textAfterMention, event.User)
}

// HandleDirectMessage handles direct messages
func (h *MessageHandler) HandleDirectMessage(event *slackevents.MessageEvent) {
	// Skip if not applicable
	if event.BotID != "" ||
	   (event.SubType != "" && event.SubType != "file_share") {
		return
	}

	utils.LogInfo(fmt.Sprintf("Processing direct message: %s", event.Text))

	// Process the message
	thread := event.ThreadTimeStamp
	if thread == "" {
		thread = event.TimeStamp
	}

	h.processMessage(event.Channel, event.TimeStamp, thread, event.Text, event.User)
}

// HandleThreadMessage handles thread messages
func (h *MessageHandler) HandleThreadMessage(event *slackevents.MessageEvent) {
	// Skip if not applicable
	if event.ThreadTimeStamp == "" ||
	   event.ChannelType == "im" ||
	   event.BotID != "" ||
	   event.SubType != "" ||
	   !strings.HasPrefix(strings.ToLower(event.Text), "hey ragbot") {
		return
	}

	utils.LogInfo(fmt.Sprintf("Processing thread message: %s", event.Text))

	// Extract text after "Hey Ragbot"
	textAfterHeyRagbot := strings.TrimSpace(
		strings.TrimPrefix(
			strings.TrimPrefix(event.Text, "Hey Ragbot"),
			"hey ragbot",
		),
	)

	// Process the message
	h.processMessage(event.Channel, event.TimeStamp, event.ThreadTimeStamp, textAfterHeyRagbot, event.User)
}

// processMessage processes a message and invokes the Bedrock agent
func (h *MessageHandler) processMessage(channel, timestamp, thread, text, user string) {
	// Add thinking reaction
	utils.AddReaction(h.api, channel, timestamp, "thinking_face")

	// Check for traceback flag
	includeTraceback, inputText := utils.HandleTracebackFlag(text)

	// Retrieve any file attachments
	var fileAttachments []types.FileAttachment

	// Convert the appropriate event type to retrieve attachments
	// This is a simplified version since we don't have direct access to files in events API
	// In a real implementation, you would need to retrieve files from the event

	// Get response from Bedrock with any attachments
	h.sendAgentRequest(channel, timestamp, thread, inputText, fileAttachments, includeTraceback)
}

// sendAgentRequest sends a request to the Bedrock agent and handles the response
func (h *MessageHandler) sendAgentRequest(channel, timestamp, thread, inputText string, attachments []types.FileAttachment, includeTraceback bool) {
	hasAttachments := len(attachments) > 0

	// Append attachment notice to input if needed
	fullInput := inputText
	if hasAttachments {
		fullInput = fullInput + " use these files when generating your answer"
	}

	// Get response from Bedrock
	response, err := h.bedrockService.InvokeBedrockAgent(fullInput, thread, attachments, includeTraceback)
	if err != nil {
		utils.LogError(err, "Error invoking Bedrock agent")
		utils.AddReaction(h.api, channel, timestamp, "x")
		utils.SendSlackMessage(h.api, channel, "Error invoking Bedrock agent: "+err.Error(), timestamp)
		return
	}

	// Check if the response is an error
	if errorResp, ok := response.(types.ErrorResponse); ok {
		utils.AddReaction(h.api, channel, timestamp, "x")
		utils.SendSlackMessage(h.api, channel, "Error invoking Bedrock agent: "+errorResp.Error, timestamp)
		return
	}

	// Handle successful response
	utils.AddReaction(h.api, channel, timestamp, "white_check_mark")

	// Format the response based on type
	var responseText string
	if agentResp, ok := response.(types.AgentResponse); ok {
		responseText = agentResp.Response
		if agentResp.Traceback != "" {
			responseText += "\n\n" + agentResp.Traceback
		}
	} else if stringResp, ok := response.(string); ok {
		responseText = stringResp
	} else {
		responseText = fmt.Sprintf("%v", response)
	}

	utils.SendSlackMessage(h.api, channel, responseText, timestamp)
}
