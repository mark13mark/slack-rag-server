package services

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	bedrockagent "github.com/aws/aws-sdk-go-v2/service/bedrockagent"
	bedrockagentruntime "github.com/aws/aws-sdk-go-v2/service/bedrockagentruntime"
	bedrockagentruntime_types "github.com/aws/aws-sdk-go-v2/service/bedrockagentruntime/types"

	"slack-rag-server/src/types"
)

// BedrockService provides methods for interacting with AWS Bedrock
type BedrockService struct {
	agentClient       *bedrockagent.Client
	agentRuntimeClient *bedrockagentruntime.Client
	region            string
	agentID           string
	agentAliasID      string
	knowledgeBaseID   string
	dataSourceID      string
}

// NewBedrockService creates a new BedrockService
func NewBedrockService() (*BedrockService, error) {
	// Get AWS region from environment
	region := os.Getenv("AWS_BEDROCK_REGION")
	if region == "" {
		return nil, fmt.Errorf("AWS_BEDROCK_REGION environment variable is not set")
	}

	// Load AWS configuration
	cfg, err := config.LoadDefaultConfig(context.Background(), config.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	// Create Bedrock agent client
	agentClient := bedrockagent.NewFromConfig(cfg)

	// Create Bedrock agent runtime client
	agentRuntimeClient := bedrockagentruntime.NewFromConfig(cfg)

	// Get required IDs from environment
	agentID := os.Getenv("AWS_BEDROCK_AGENT_ID")
	if agentID == "" {
		return nil, fmt.Errorf("AWS_BEDROCK_AGENT_ID environment variable is not set")
	}

	agentAliasID := os.Getenv("AWS_BEDROCK_AGENT_ALIAS_ID")
	if agentAliasID == "" {
		return nil, fmt.Errorf("AWS_BEDROCK_AGENT_ALIAS_ID environment variable is not set")
	}

	// Knowledge base and data source IDs are optional
	knowledgeBaseID := os.Getenv("AWS_BEDROCK_KNOWLEDGE_BASE_ID")
	dataSourceID := os.Getenv("AWS_BEDROCK_DATA_SOURCE_ID")

	return &BedrockService{
		agentClient:       agentClient,
		agentRuntimeClient: agentRuntimeClient,
		region:            region,
		agentID:           agentID,
		agentAliasID:      agentAliasID,
		knowledgeBaseID:   knowledgeBaseID,
		dataSourceID:      dataSourceID,
	}, nil
}

// FormatTraceback formats the traceback information in a Slack-friendly way
func FormatTraceback(traceback interface{}) string {
	if traceback == nil {
		return "No traceback information available"
	}

	// This is a simplified version as the Go SDK for Bedrock doesn't provide
	// the same structure as JavaScript. You may need to adjust this once you
	// have actual traceback data.
	formattedOutput := "```\n🤖 Agent Traceback\n================\n"

	// Here you would format the steps in the traceback
	// This is just a placeholder
	formattedOutput += "Traceback data not fully implemented in Go version\n"

	formattedOutput += "```"
	return formattedOutput
}

// InvokeBedrockAgent invokes the Bedrock agent with the provided input
func (s *BedrockService) InvokeBedrockAgent(inputText, sessionID string, attachments []types.FileAttachment, includeTraceback bool) (interface{}, error) {
	fmt.Printf("Session Sample ID: %s\n", sessionID)

	// Check agent health
	healthStatus, err := s.CheckBedrockAgentHealth()
	if err != nil {
		return types.ErrorResponse{
			Error:        fmt.Sprintf("Failed to check agent health: %v", err),
			OriginalError: err,
		}, nil
	}

	if !healthStatus.Healthy {
		issues := ""
		for _, issue := range healthStatus.Issues {
			issues += fmt.Sprintf("%s: %s\n", issue.Component, issue.Message)
		}
		return types.ErrorResponse{
			Error: fmt.Sprintf("AWS Bedrock agent service is not healthy: \n%s", issues),
		}, nil
	}

	// Set up the parameters for the InvokeAgent operation
	input := &bedrockagentruntime.InvokeAgentInput{
		AgentAliasId: aws.String(s.agentAliasID),
		AgentId:      aws.String(s.agentID),
		SessionId:    aws.String(sessionID),
		InputText:    aws.String(inputText),
		EnableTrace:  aws.Bool(true),
	}

	// Note: The API has changed and file attachments are no longer supported in the same way.
	// If you need file attachments, you'll need to update this code based on the new AWS SDK version.
	if len(attachments) > 0 {
		fmt.Println("Warning: File attachments are not supported in the current SDK version. Ignoring attachments.")
	}

	// Create and execute the InvokeAgent command
	output, err := s.agentRuntimeClient.InvokeAgent(context.Background(), input)
	if err != nil {
		return types.ErrorResponse{
			Error:        err.Error(),
			OriginalError: err,
		}, nil
	}

	// Get the event stream from the output
	stream := output.GetStream()
	if stream == nil {
		return "No response stream available from the agent", nil
	}

	// Read all events from the stream
	var responseText string
	var traceInfo interface{}

	// Channel to receive events
	eventsChan := stream.Events()

	// Process all events from the stream
	for event := range eventsChan {
		// Type switch to handle different event types
		switch v := event.(type) {
		case *bedrockagentruntime_types.ResponseStreamMemberChunk:
			// This is a chunk of the response text
			if v.Value.Bytes != nil && len(v.Value.Bytes) > 0 {
				// Convert bytes to string and append to response text
				responseText += string(v.Value.Bytes)
			}
		case *bedrockagentruntime_types.ResponseStreamMemberTrace:
			// This contains the trace information
			traceInfo = v.Value
		default:
			// Skip other event types (Files, ReturnControl, etc.)
			fmt.Printf("Received event of type: %T\n", v)
		}
	}

	// Check for any errors during stream processing
	if err := stream.Err(); err != nil {
		return types.ErrorResponse{
			Error:        fmt.Sprintf("Error processing stream: %v", err),
			OriginalError: err,
		}, nil
	}

	// Close the stream
	if err := stream.Close(); err != nil {
		fmt.Printf("Warning: Error closing stream: %v\n", err)
	}

	// If we didn't get any response text, use a fallback message
	if responseText == "" {
		responseText = fmt.Sprintf("Invoked agent successfully with session ID: %s, but received no response text.", sessionID)
	}

	fmt.Println("AWS Bedrock agent response:", responseText)

	// Return both response and formatted traceback if requested
	if includeTraceback {
		return types.AgentResponse{
			Response:  responseText,
			Traceback: FormatTraceback(traceInfo),
		}, nil
	}

	return responseText, nil
}

// GetKnowledgeBaseStatus gets the status of the knowledge base
func (s *BedrockService) GetKnowledgeBaseStatus() (interface{}, error) {
	if s.knowledgeBaseID == "" {
		return types.ErrorResponse{
			Error: "Knowledge base ID is not configured",
		}, nil
	}

	input := &bedrockagent.GetKnowledgeBaseInput{
		KnowledgeBaseId: aws.String(s.knowledgeBaseID),
	}

	resp, err := s.agentClient.GetKnowledgeBase(context.Background(), input)
	if err != nil {
		return types.ErrorResponse{
			Error:        err.Error(),
			OriginalError: err,
		}, nil
	}

	// Convert the response to the expected format
	return types.KnowledgeBaseStatus{
		Name:        *resp.KnowledgeBase.Name,
		Status:      string(resp.KnowledgeBase.Status),
		CreatedAt:   *resp.KnowledgeBase.CreatedAt,
		UpdatedAt:   *resp.KnowledgeBase.UpdatedAt,
		ID:          *resp.KnowledgeBase.KnowledgeBaseId,
		RawResponse: resp.KnowledgeBase,
	}, nil
}

// GetAgentStatus gets the status of the agent
func (s *BedrockService) GetAgentStatus() (interface{}, error) {
	input := &bedrockagent.GetAgentInput{
		AgentId: aws.String(s.agentID),
	}

	resp, err := s.agentClient.GetAgent(context.Background(), input)
	if err != nil {
		return types.ErrorResponse{
			Error:        err.Error(),
			OriginalError: err,
		}, nil
	}

	// Convert the response to the expected format
	foundationModel := ""
	if resp.Agent.FoundationModel != nil {
		foundationModel = *resp.Agent.FoundationModel
	}

	return types.AgentStatus{
		AgentName:       *resp.Agent.AgentName,
		AgentID:         *resp.Agent.AgentId,
		AgentStatus:     string(resp.Agent.AgentStatus),
		FoundationModel: foundationModel,
		CreatedAt:       *resp.Agent.CreatedAt,
		UpdatedAt:       *resp.Agent.UpdatedAt,
		RawResponse:     resp.Agent,
	}, nil
}

// GetDataSource gets information about the data source
func (s *BedrockService) GetDataSource() (interface{}, error) {
	if s.knowledgeBaseID == "" || s.dataSourceID == "" {
		return types.ErrorResponse{
			Error: "Knowledge base ID or data source ID is not configured",
		}, nil
	}

	// Retrieve the last ingestion job for the data source
	input := &bedrockagent.ListIngestionJobsInput{
		KnowledgeBaseId: aws.String(s.knowledgeBaseID),
		DataSourceId:    aws.String(s.dataSourceID),
		MaxResults:      aws.Int32(1),
		// SortBy is not available in the current version, so we're not setting it
	}

	resp, err := s.agentClient.ListIngestionJobs(context.Background(), input)
	if err != nil {
		return types.ErrorResponse{
			Error:        err.Error(),
			OriginalError: err,
		}, nil
	}

	// Check if we have ingestion jobs
	if resp.IngestionJobSummaries == nil || len(resp.IngestionJobSummaries) == 0 {
		return struct {
			Status  string `json:"status"`
			Message string `json:"message"`
		}{
			Status:  "NO_JOBS_FOUND",
			Message: "No data sources found for this knowledge base.",
		}, nil
	}

	// Return information about the most recent job
	job := resp.IngestionJobSummaries[0]
	return types.DataSourceInfo{
		DataSourceID:    *job.DataSourceId,
		KnowledgeBaseID: *job.KnowledgeBaseId,
		Description:     *job.Description,
		Status:          string(job.Status),
		StartedAt:       *job.StartedAt,
		UpdatedAt:       *job.UpdatedAt,
		RawResponse:     job,
	}, nil
}

// SyncDataSource triggers a synchronization of the data source
func (s *BedrockService) SyncDataSource() (interface{}, error) {
	if s.knowledgeBaseID == "" || s.dataSourceID == "" {
		return types.ErrorResponse{
			Error: "Knowledge base ID or data source ID is not configured",
		}, nil
	}

	input := &bedrockagent.StartIngestionJobInput{
		KnowledgeBaseId: aws.String(s.knowledgeBaseID),
		DataSourceId:    aws.String(s.dataSourceID),
		Description:     aws.String("Manual sync triggered on " + time.Now().Format(time.RFC3339)),
	}

	resp, err := s.agentClient.StartIngestionJob(context.Background(), input)
	if err != nil {
		return types.ErrorResponse{
			Error:        err.Error(),
			OriginalError: err,
		}, nil
	}

	return types.DataSourceSync{
		DataSourceID:    *resp.IngestionJob.DataSourceId,
		KnowledgeBaseID: *resp.IngestionJob.KnowledgeBaseId,
		IngestionJobID:  *resp.IngestionJob.IngestionJobId,
		Status:          string(resp.IngestionJob.Status),
		RawResponse:     resp.IngestionJob,
	}, nil
}

// GetDataSourceConfig gets the configuration of the data source
func (s *BedrockService) GetDataSourceConfig() (interface{}, error) {
	if s.knowledgeBaseID == "" || s.dataSourceID == "" {
		return types.ErrorResponse{
			Error: "Knowledge base ID or data source ID is not configured",
		}, nil
	}

	input := &bedrockagent.GetDataSourceInput{
		KnowledgeBaseId: aws.String(s.knowledgeBaseID),
		DataSourceId:    aws.String(s.dataSourceID),
	}

	resp, err := s.agentClient.GetDataSource(context.Background(), input)
	if err != nil {
		return types.ErrorResponse{
			Error:        err.Error(),
			OriginalError: err,
		}, nil
	}

	return types.DataSourceConfig{
		Name:              *resp.DataSource.Name,
		Status:            string(resp.DataSource.Status),
		ConfigurationType: string(resp.DataSource.DataSourceConfiguration.Type),
		CreatedAt:         *resp.DataSource.CreatedAt,
		UpdatedAt:         *resp.DataSource.UpdatedAt,
		RawResponse:       resp.DataSource,
	}, nil
}

// ListDataSources lists all data sources
func (s *BedrockService) ListDataSources() (interface{}, error) {
	if s.knowledgeBaseID == "" {
		return types.ErrorResponse{
			Error: "Knowledge base ID is not configured",
		}, nil
	}

	input := &bedrockagent.ListDataSourcesInput{
		KnowledgeBaseId: aws.String(s.knowledgeBaseID),
	}

	resp, err := s.agentClient.ListDataSources(context.Background(), input)
	if err != nil {
		return types.ErrorResponse{
			Error:        err.Error(),
			OriginalError: err,
		}, nil
	}

	dataSources := []types.DataSource{}
	for _, source := range resp.DataSourceSummaries {
		dataSources = append(dataSources, types.DataSource{
			DataSourceID: *source.DataSourceId,
			Name:         *source.Name,
			Status:       string(source.Status),
			UpdatedAt:    *source.UpdatedAt,
			RawResponse:  source,
		})
	}

	return types.DataSourceList{
		DataSources: dataSources,
		Count:       len(dataSources),
	}, nil
}

// GetIngestionJobStatus gets the status of an ingestion job
func (s *BedrockService) GetIngestionJobStatus(jobID string) (interface{}, error) {
	if s.knowledgeBaseID == "" || s.dataSourceID == "" {
		return types.ErrorResponse{
			Error: "Knowledge base ID or data source ID is not configured",
		}, nil
	}

	input := &bedrockagent.GetIngestionJobInput{
		KnowledgeBaseId: aws.String(s.knowledgeBaseID),
		DataSourceId:    aws.String(s.dataSourceID),
		IngestionJobId:  aws.String(jobID),
	}

	resp, err := s.agentClient.GetIngestionJob(context.Background(), input)
	if err != nil {
		return types.ErrorResponse{
			Error:        err.Error(),
			OriginalError: err,
		}, nil
	}

	failureReasons := []string{}
	for _, reason := range resp.IngestionJob.FailureReasons {
		failureReasons = append(failureReasons, reason)
	}

	statistics := ""
	if resp.IngestionJob.Statistics != nil {
		// Format statistics based on what's available in the current SDK version
		statistics = fmt.Sprintf("Status: %s", resp.IngestionJob.Status)
	}

	return types.IngestionJobStatus{
		IngestionJobID:  *resp.IngestionJob.IngestionJobId,
		Status:          string(resp.IngestionJob.Status),
		StartedAt:       *resp.IngestionJob.StartedAt,
		UpdatedAt:       *resp.IngestionJob.UpdatedAt,
		Statistics:      statistics,
		FailureReasons:  failureReasons,
		RawResponse:     resp.IngestionJob,
	}, nil
}

// CheckBedrockAgentHealth checks the health of the Bedrock agent
func (s *BedrockService) CheckBedrockAgentHealth() (types.HealthStatus, error) {
	issues := []types.HealthIssue{}
	details := types.HealthDetails{
		Region:       s.region,
		AgentID:      s.agentID,
		AgentAliasID: s.agentAliasID,
	}

	// Check agent status
	agentStatusResp, err := s.GetAgentStatus()
	if err != nil {
		return types.HealthStatus{}, err
	}

	// Check if response contains an error
	if errorResp, ok := agentStatusResp.(types.ErrorResponse); ok {
		issues = append(issues, types.HealthIssue{
			Component: "Agent",
			Status:    "ERROR",
			Message:   fmt.Sprintf("Failed to check Agent status: %s", errorResp.Error),
		})
	} else if agentStatus, ok := agentStatusResp.(types.AgentStatus); ok {
		details.AgentName = agentStatus.AgentName

		if agentStatus.AgentStatus != "PREPARED" && agentStatus.AgentStatus != "READY" {
			issues = append(issues, types.HealthIssue{
				Component: "Agent",
				Status:    agentStatus.AgentStatus,
				Message:   fmt.Sprintf("Agent is not in a ready state. Current status: %s", agentStatus.AgentStatus),
			})
		}
	}

	// Check knowledge base status if configured
	if s.knowledgeBaseID != "" {
		kbStatusResp, err := s.GetKnowledgeBaseStatus()
		if err != nil {
			return types.HealthStatus{}, err
		}

		// Check if response contains an error
		if errorResp, ok := kbStatusResp.(types.ErrorResponse); ok {
			issues = append(issues, types.HealthIssue{
				Component: "Knowledge Base",
				Status:    "ERROR",
				Message:   fmt.Sprintf("Failed to check Knowledge Base status: %s", errorResp.Error),
			})
		} else if kbStatus, ok := kbStatusResp.(types.KnowledgeBaseStatus); ok {
			details.KnowledgeBaseName = kbStatus.Name

			if kbStatus.Status != "ACTIVE" {
				issues = append(issues, types.HealthIssue{
					Component: "Knowledge Base",
					Status:    kbStatus.Status,
					Message:   fmt.Sprintf("Knowledge Base is not active. Current status: %s", kbStatus.Status),
				})
			}
		}
	}

	// Return final health status
	return types.HealthStatus{
		Healthy: len(issues) == 0,
		Issues:  issues,
		Details: details,
	}, nil
}

// MonitorIngestionJob monitors an ingestion job
func (s *BedrockService) MonitorIngestionJob(jobID string, maxWaitMinutes int) (interface{}, error) {
	// Store initial KB timestamp
	kbStatusResp, err := s.GetKnowledgeBaseStatus()
	if err != nil {
		return types.ErrorResponse{
			Error:        fmt.Sprintf("Failed to get initial knowledge base status: %v", err),
			OriginalError: err,
		}, nil
	}

	var initialKBTimestamp time.Time
	if kbStatus, ok := kbStatusResp.(types.KnowledgeBaseStatus); ok {
		initialKBTimestamp = kbStatus.UpdatedAt
	} else {
		return types.ErrorResponse{
			Error: "Failed to get initial knowledge base timestamp",
		}, nil
	}

	// Monitor the job
	jobComplete := false
	var jobStatusString string

	// Set timeout
	timeout := time.Now().Add(time.Duration(maxWaitMinutes) * time.Minute)

	// Poll every 30 seconds
	for time.Now().Before(timeout) && !jobComplete {
		jobStatusResp, err := s.GetIngestionJobStatus(jobID)
		if err != nil {
			return types.ErrorResponse{
				Error:        fmt.Sprintf("Failed to get job status: %v", err),
				OriginalError: err,
			}, nil
		}

		// Check if response contains an error
		if errorResp, ok := jobStatusResp.(types.ErrorResponse); ok {
			return errorResp, nil
		}

		if jobStatus, ok := jobStatusResp.(types.IngestionJobStatus); ok {
			jobStatusString = jobStatus.Status

			// Check if job is complete
			if jobStatus.Status == "COMPLETE" || jobStatus.Status == "FAILED" || jobStatus.Status == "STOPPED" {
				jobComplete = true
				break
			}
		}

		// Wait before checking again
		time.Sleep(30 * time.Second)
	}

	if !jobComplete {
		return types.ErrorResponse{
			Error: fmt.Sprintf("Job monitoring timed out after %d minutes", maxWaitMinutes),
		}, nil
	}

	// Get final KB timestamp
	kbStatusResp, err = s.GetKnowledgeBaseStatus()
	if err != nil {
		return types.ErrorResponse{
			Error:        fmt.Sprintf("Failed to get final knowledge base status: %v", err),
			OriginalError: err,
		}, nil
	}

	var finalKBTimestamp time.Time
	var kbID string
	if kbStatus, ok := kbStatusResp.(types.KnowledgeBaseStatus); ok {
		finalKBTimestamp = kbStatus.UpdatedAt
		kbID = kbStatus.ID
	} else {
		return types.ErrorResponse{
			Error: "Failed to get final knowledge base timestamp",
		}, nil
	}

	// Check if KB was updated
	kbUpdated := finalKBTimestamp.After(initialKBTimestamp)

	// Get agent status to ensure it's ready
	agentStatusResp, err := s.GetAgentStatus()
	if err != nil {
		return types.ErrorResponse{
			Error:        fmt.Sprintf("Failed to get agent status: %v", err),
			OriginalError: err,
		}, nil
	}

	var agentReady bool
	var agentStatus types.AgentStatus
	if agentStatusVal, ok := agentStatusResp.(types.AgentStatus); ok {
		agentStatus = agentStatusVal
		agentReady = agentStatusVal.AgentStatus == "READY" || agentStatusVal.AgentStatus == "PREPARED"
	} else {
		return types.ErrorResponse{
			Error: "Failed to get agent status",
		}, nil
	}

	// Determine success message
	message := ""
	if jobStatusString == "COMPLETE" && kbUpdated && agentReady {
		message = "Knowledge base successfully updated and agent is ready"
	} else if jobStatusString == "COMPLETE" && !kbUpdated {
		message = "Job completed but knowledge base timestamp was not updated"
	} else if jobStatusString == "COMPLETE" && !agentReady {
		message = "Job completed but agent is not in a ready state"
	} else {
		message = fmt.Sprintf("Job status: %s", jobStatusString)
	}

	// Return monitoring results
	return types.MonitorIngestionJobStatus{
		Success:            jobStatusString == "COMPLETE" && kbUpdated && agentReady,
		KnowledgeBaseID:    kbID,
		DataSourceID:       s.dataSourceID,
		IngestionJobID:     jobID,
		JobStatus:          jobStatusString,
		InitialKBTimestamp: initialKBTimestamp,
		FinalKBTimestamp:   finalKBTimestamp,
		KBUpdated:          kbUpdated,
		AgentStatus:        agentStatus,
		AgentReady:         agentReady,
		Message:            message,
	}, nil
}
