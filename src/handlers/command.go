package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/slack-go/slack"

	"slack-rag-server/src/services"
	"slack-rag-server/src/types"
	"slack-rag-server/src/utils"
)

// CommandHandler handles Slack slash commands
type CommandHandler struct {
	api            *slack.Client
	bedrockService *services.BedrockService
}

// NewCommandHandler creates a new CommandHandler
func NewCommandHandler(api *slack.Client, bedrockService *services.BedrockService) *CommandHandler {
	return &CommandHandler{
		api:            api,
		bedrockService: bedrockService,
	}
}

// HandleGetDataSource handles the /ragbot-get-datasource command
func (h *CommandHandler) HandleGetDataSource(cmd slack.SlashCommand) {
	utils.LogInfo(fmt.Sprintf("Processing /ragbot-get-datasource command"))

	response, err := h.bedrockService.GetDataSource()
	if err != nil {
		utils.LogError(err, "Error in /ragbot-get-datasource")
		h.respondToCommand(cmd, "Error getting data source information: "+err.Error())
		return
	}

	// Check if response contains an error
	if errorResp, ok := response.(types.ErrorResponse); ok {
		utils.LogError(fmt.Errorf(errorResp.Error), "Error in /ragbot-get-datasource")
		h.respondToCommand(cmd, "Error getting data source information: "+errorResp.Error)
		return
	}

	var formattedResponse string

	// Check if response indicates no jobs found
	if noJobsResp, ok := response.(struct {
		Status  string `json:"status"`
		Message string `json:"message"`
	}); ok && noJobsResp.Status == "NO_JOBS_FOUND" {
		formattedResponse = noJobsResp.Message
	} else if dsInfo, ok := response.(types.DataSourceInfo); ok {
		formattedResponse = fmt.Sprintf(
			"Data Source: %s\nKnowledge Base: %s\nMessage: %s\nStatus: %s\nLast sync: %s",
			dsInfo.DataSourceID,
			dsInfo.KnowledgeBaseID,
			dsInfo.Description,
			dsInfo.Status,
			utils.FormatDate(dsInfo.UpdatedAt),
		)
	} else {
		formattedResponse = fmt.Sprintf("%v", response)
	}

	h.respondToCommand(cmd, "DATA SOURCE INFORMATION:\n\n"+formattedResponse)
}

// HandleSyncDataSource handles the /ragbot-sync-datasource command
func (h *CommandHandler) HandleSyncDataSource(cmd slack.SlashCommand) {
	utils.LogInfo(fmt.Sprintf("Processing /ragbot-sync-datasource command from user %s", cmd.UserID))

	// Check user permissions - disabled for now as Go doesn't have direct role checks
	// Uncomment and implement when needed
	/*
	hasRequiredRole, err := utils.CheckUserRole(h.api, cmd.UserID, "aws-bot-maintainer")
	if err != nil {
		utils.LogError(err, "Error checking user role")
		h.respondToCommand(cmd, "Error checking permissions: "+err.Error())
		return
	}

	if !hasRequiredRole {
		h.respondToCommand(cmd, "Sorry, you do not have permission to use this command. Only users with the aws-bot-maintainer role can sync the data source.")
		return
	}
	*/

	response, err := h.bedrockService.SyncDataSource()
	if err != nil {
		utils.LogError(err, "Error in /ragbot-sync-datasource")
		h.respondToCommand(cmd, "Error syncing data source: "+err.Error())
		return
	}

	// Check if response contains an error
	if errorResp, ok := response.(types.ErrorResponse); ok {
		utils.LogError(fmt.Errorf(errorResp.Error), "Error in /ragbot-sync-datasource")
		h.respondToCommand(cmd, "Error syncing data source: "+errorResp.Error)
		return
	}

	// Format response
	var formattedResponse string
	if dsSync, ok := response.(types.DataSourceSync); ok {
		formattedResponse = fmt.Sprintf(
			"Data Source: %s\nKnowledge Base: %s\nJob ID: %s\nStatus: %s",
			dsSync.DataSourceID,
			dsSync.KnowledgeBaseID,
			dsSync.IngestionJobID,
			dsSync.Status,
		)
	} else {
		formattedResponse = fmt.Sprintf("%v", response)
	}

	h.respondToCommand(cmd, "DATA SOURCE SYNC INITIATED:\n\n"+formattedResponse)
}

// HandleHelp handles the /ragbot-help command
func (h *CommandHandler) HandleHelp(cmd slack.SlashCommand) {
	utils.LogInfo(fmt.Sprintf("Processing /ragbot-help command"))

	helpText := `Available commands:
    /ragbot-help - Show this help message
    /ragbot-kb-status - Check the status of the knowledge base
    /ragbot-sync-datasource - Trigger a sync of the knowledge base
    /ragbot-list-datasources - List all available data sources
    /ragbot-ds-config - Get configuration for the data source
    /ragbot-get-datasource - Get information about the current data source
    /ragbot-agent-status - Check the status of the agent
    /ragbot-job-status <job_id> - Check the status of an ingestion job
    /ragbot-health-check - Check overall health of the Bedrock agent service`

	h.respondToCommand(cmd, helpText)
}

// HandleKbStatus handles the /ragbot-kb-status command
func (h *CommandHandler) HandleKbStatus(cmd slack.SlashCommand) {
	utils.LogInfo(fmt.Sprintf("Processing /ragbot-kb-status command"))

	response, err := h.bedrockService.GetKnowledgeBaseStatus()
	if err != nil {
		utils.LogError(err, "Error in /ragbot-kb-status")
		h.respondToCommand(cmd, "Error getting knowledge base status: "+err.Error())
		return
	}

	// Check if response contains an error
	if errorResp, ok := response.(types.ErrorResponse); ok {
		utils.LogError(fmt.Errorf(errorResp.Error), "Error in /ragbot-kb-status")
		h.respondToCommand(cmd, "Error getting knowledge base status: "+errorResp.Error)
		return
	}

	// Format response
	var formattedResponse string
	if kbStatus, ok := response.(types.KnowledgeBaseStatus); ok {
		formattedResponse = fmt.Sprintf(
			"Knowledge Base: %s\nStatus: %s\nCreated At: %s\nUpdated At: %s",
			kbStatus.Name,
			kbStatus.Status,
			utils.FormatDate(kbStatus.CreatedAt),
			utils.FormatDate(kbStatus.UpdatedAt),
		)
	} else {
		formattedResponse = fmt.Sprintf("%v", response)
	}

	h.respondToCommand(cmd, "KNOWLEDGE BASE STATUS:\n\n"+formattedResponse)
}

// HandleDsConfig handles the /ragbot-ds-config command
func (h *CommandHandler) HandleDsConfig(cmd slack.SlashCommand) {
	utils.LogInfo(fmt.Sprintf("Processing /ragbot-ds-config command"))

	response, err := h.bedrockService.GetDataSourceConfig()
	if err != nil {
		utils.LogError(err, "Error in /ragbot-ds-config")
		h.respondToCommand(cmd, "Error getting data source configuration: "+err.Error())
		return
	}

	// Check if response contains an error
	if errorResp, ok := response.(types.ErrorResponse); ok {
		utils.LogError(fmt.Errorf(errorResp.Error), "Error in /ragbot-ds-config")
		h.respondToCommand(cmd, "Error getting data source configuration: "+errorResp.Error)
		return
	}

	// Format response
	var formattedResponse string
	if dsConfig, ok := response.(types.DataSourceConfig); ok {
		formattedResponse = fmt.Sprintf(
			"Data Source: %s\nStatus: %s\nConfiguration: Type: %s\nCreated At: %s\nUpdated At: %s",
			dsConfig.Name,
			dsConfig.Status,
			dsConfig.ConfigurationType,
			utils.FormatDate(dsConfig.CreatedAt),
			utils.FormatDate(dsConfig.UpdatedAt),
		)
	} else {
		formattedResponse = fmt.Sprintf("%v", response)
	}

	h.respondToCommand(cmd, "DATA SOURCE CONFIGURATION:\n\n"+formattedResponse)
}

// HandleAgentStatus handles the /ragbot-agent-status command
func (h *CommandHandler) HandleAgentStatus(cmd slack.SlashCommand) {
	utils.LogInfo(fmt.Sprintf("Processing /ragbot-agent-status command"))

	response, err := h.bedrockService.GetAgentStatus()
	if err != nil {
		utils.LogError(err, "Error in /ragbot-agent-status")
		h.respondToCommand(cmd, "Error getting agent status: "+err.Error())
		return
	}

	// Check if response contains an error
	if errorResp, ok := response.(types.ErrorResponse); ok {
		utils.LogError(fmt.Errorf(errorResp.Error), "Error in /ragbot-agent-status")
		h.respondToCommand(cmd, "Error getting agent status: "+errorResp.Error)
		return
	}

	// Format response
	var formattedResponse string
	if agentStatus, ok := response.(types.AgentStatus); ok {
		formattedResponse = fmt.Sprintf(
			"Agent Name: %s\nAgent ID: %s\nStatus: %s\nFoundation Model: %s\nCreated At: %s\nUpdated At: %s",
			agentStatus.AgentName,
			agentStatus.AgentID,
			agentStatus.AgentStatus,
			agentStatus.FoundationModel,
			utils.FormatDate(agentStatus.CreatedAt),
			utils.FormatDate(agentStatus.UpdatedAt),
		)
	} else {
		formattedResponse = fmt.Sprintf("%v", response)
	}

	h.respondToCommand(cmd, "AGENT INFORMATION:\n\n"+formattedResponse)
}

// HandleListDataSources handles the /ragbot-list-datasources command
func (h *CommandHandler) HandleListDataSources(cmd slack.SlashCommand) {
	utils.LogInfo(fmt.Sprintf("Processing /ragbot-list-datasources command"))

	response, err := h.bedrockService.ListDataSources()
	if err != nil {
		utils.LogError(err, "Error in /ragbot-list-datasources")
		h.respondToCommand(cmd, "Error listing data sources: "+err.Error())
		return
	}

	// Check if response contains an error
	if errorResp, ok := response.(types.ErrorResponse); ok {
		utils.LogError(fmt.Errorf(errorResp.Error), "Error in /ragbot-list-datasources")
		h.respondToCommand(cmd, "Error listing data sources: "+errorResp.Error)
		return
	}

	// Format response
	var formattedResponse string
	if dsList, ok := response.(types.DataSourceList); ok {
		var parts []string
		for _, source := range dsList.DataSources {
			parts = append(parts, fmt.Sprintf(
				"Data Source: %s\n Name: %s\n Status: %s\n Updated At: %s\n",
				source.DataSourceID,
				source.Name,
				source.Status,
				utils.FormatDate(source.UpdatedAt),
			))
		}
		formattedResponse = strings.Join(parts, "\n")
	} else {
		formattedResponse = fmt.Sprintf("%v", response)
	}

	h.respondToCommand(cmd, "AVAILABLE DATA SOURCES:\n\n"+formattedResponse)
}

// HandleJobStatus handles the /ragbot-job-status command
func (h *CommandHandler) HandleJobStatus(cmd slack.SlashCommand) {
	utils.LogInfo(fmt.Sprintf("Processing /ragbot-job-status command"))

	jobID := strings.TrimSpace(cmd.Text)
	if jobID == "" {
		h.respondToCommand(cmd, "Please provide a job ID. Usage: /ragbot-job-status <job_id>")
		return
	}

	response, err := h.bedrockService.GetIngestionJobStatus(jobID)
	if err != nil {
		utils.LogError(err, "Error in /ragbot-job-status")
		h.respondToCommand(cmd, "Error getting job status: "+err.Error())
		return
	}

	// Check if response contains an error
	if errorResp, ok := response.(types.ErrorResponse); ok {
		utils.LogError(fmt.Errorf(errorResp.Error), "Error in /ragbot-job-status")
		h.respondToCommand(cmd, "Error getting job status: "+errorResp.Error)
		return
	}

	// Format response
	var formattedResponse string
	if jobStatus, ok := response.(types.IngestionJobStatus); ok {
		failureText := "None"
		if len(jobStatus.FailureReasons) > 0 {
			failureText = strings.Join(jobStatus.FailureReasons, "\n")
		}

		formattedResponse = fmt.Sprintf(
			"Ingestion Job: %s\nStatus: %s\nStarted At: %s\nUpdated At: %s\nStatistics: %s\nFailure Reasons: %s",
			jobStatus.IngestionJobID,
			jobStatus.Status,
			utils.FormatDate(jobStatus.StartedAt),
			utils.FormatDate(jobStatus.UpdatedAt),
			jobStatus.Statistics,
			failureText,
		)
	} else {
		formattedResponse = fmt.Sprintf("%v", response)
	}

	h.respondToCommand(cmd, "INGESTION JOB STATUS:\n\n"+formattedResponse)
}

// HandleHealthCheck handles the /ragbot-health-check command
func (h *CommandHandler) HandleHealthCheck(cmd slack.SlashCommand) {
	utils.LogInfo(fmt.Sprintf("Processing /ragbot-health-check command"))

	healthStatus, err := h.bedrockService.CheckBedrockAgentHealth()
	if err != nil {
		utils.LogError(err, "Error in /ragbot-health-check")
		h.respondToCommand(cmd, "Error checking health status: "+err.Error())
		return
	}

	var responseText string
	if healthStatus.Healthy {
		responseText = fmt.Sprintf(
			"✅ Ragbot is healthy and ready to use.\n\nAgent: %s\nRegion: %s",
			healthStatus.Details.AgentName,
			healthStatus.Details.Region,
		)
	} else {
		var issueLines []string
		for _, issue := range healthStatus.Issues {
			issueLines = append(issueLines, fmt.Sprintf("• %s: %s", issue.Component, issue.Message))
		}
		responseText = "❌ Ragbot has issues:\n\n" + strings.Join(issueLines, "\n")
	}

	h.respondToCommand(cmd, responseText)
}

// respondToCommand responds to a slash command with a message
func (h *CommandHandler) respondToCommand(cmd slack.SlashCommand, text string) {
	// Check if we have a response URL to use
	if cmd.ResponseURL != "" {
		utils.LogInfo(fmt.Sprintf("Responding to command using response_url: %s", cmd.ResponseURL))

		// Create the message payload as a map instead of using slack.Message
		response := map[string]interface{}{
			"response_type": "in_channel", // Make the response visible to everyone in the channel
			"text":         text,
		}

		// Convert the response to JSON
		responseBytes, err := json.Marshal(response)
		if err != nil {
			utils.LogError(err, "Error marshalling response JSON")
			return
		}

		// Create HTTP client and request
		client := &http.Client{}
		req, err := http.NewRequest("POST", cmd.ResponseURL, bytes.NewBuffer(responseBytes))
		if err != nil {
			utils.LogError(err, "Error creating request for response URL")
			return
		}

		// Add headers
		req.Header.Add("Content-Type", "application/json")

		// Send the request
		resp, err := client.Do(req)
		if err != nil {
			utils.LogError(err, "Error sending response to Slack")
			return
		}
		defer resp.Body.Close()

		// Check response
		if resp.StatusCode != http.StatusOK {
			utils.LogError(fmt.Errorf("received non-200 status code: %d", resp.StatusCode), "Error from Slack API")
		}
	} else {
		// Fall back to posting a message directly
		utils.LogInfo("No response URL available, posting message directly")
		_, _, err := h.api.PostMessage(
			cmd.ChannelID,
			slack.MsgOptionText(text, false),
			slack.MsgOptionPostMessageParameters(slack.PostMessageParameters{
				Username: "RagBot",
			}),
		)

		if err != nil {
			utils.LogError(err, "Error posting command response")
		}
	}
}
