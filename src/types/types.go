package types

import (
	"time"
)

// ErrorResponse represents an error from Bedrock service
type ErrorResponse struct {
	Error        string      `json:"error"`
	OriginalError interface{} `json:"originalError,omitempty"`
}

// AgentResponse represents a response from the Bedrock agent
type AgentResponse struct {
	Response  string `json:"response,omitempty"`
	Traceback string `json:"traceback,omitempty"`
}

// FileAttachment represents a file attached to a message
type FileAttachment struct {
	Name      string `json:"name"`
	Data      string `json:"data"`
	MediaType string `json:"mediaType"`
}

// AgentStatus represents the status of a Bedrock agent
type AgentStatus struct {
	AgentName       string      `json:"agentName"`
	AgentID         string      `json:"agentId"`
	AgentStatus     string      `json:"agentStatus"`
	FoundationModel string      `json:"foundationModel"`
	CreatedAt       time.Time   `json:"createdAt"`
	UpdatedAt       time.Time   `json:"updatedAt"`
	RawResponse     interface{} `json:"rawResponse,omitempty"`
}

// KnowledgeBaseStatus represents the status of a Bedrock knowledge base
type KnowledgeBaseStatus struct {
	Name        string      `json:"name"`
	Status      string      `json:"status"`
	CreatedAt   time.Time   `json:"createdAt"`
	UpdatedAt   time.Time   `json:"updatedAt"`
	ID          string      `json:"id"`
	RawResponse interface{} `json:"rawResponse,omitempty"`
}

// DataSourceInfo represents information about a data source
type DataSourceInfo struct {
	DataSourceID    string      `json:"dataSourceId"`
	KnowledgeBaseID string      `json:"knowledgeBaseId"`
	Description     string      `json:"description"`
	Status          string      `json:"status"`
	StartedAt       time.Time   `json:"startedAt"`
	UpdatedAt       time.Time   `json:"updatedAt"`
	RawResponse     interface{} `json:"rawResponse,omitempty"`
}

// DataSourceConfig represents the configuration of a data source
type DataSourceConfig struct {
	Name              string      `json:"name"`
	Status            string      `json:"status"`
	ConfigurationType string      `json:"configurationType"`
	CreatedAt         time.Time   `json:"createdAt"`
	UpdatedAt         time.Time   `json:"updatedAt"`
	RawResponse       interface{} `json:"rawResponse,omitempty"`
}

// DataSourceSync represents the result of a data source sync operation
type DataSourceSync struct {
	DataSourceID    string      `json:"dataSourceId"`
	KnowledgeBaseID string      `json:"knowledgeBaseId"`
	IngestionJobID  string      `json:"ingestionJobId"`
	Status          string      `json:"status"`
	RawResponse     interface{} `json:"rawResponse,omitempty"`
}

// DataSource represents a data source
type DataSource struct {
	DataSourceID string      `json:"dataSourceId"`
	Name         string      `json:"name"`
	Status       string      `json:"status"`
	UpdatedAt    time.Time   `json:"updatedAt"`
	RawResponse  interface{} `json:"rawResponse,omitempty"`
}

// DataSourceList represents a list of data sources
type DataSourceList struct {
	DataSources []DataSource `json:"dataSources"`
	Count       int          `json:"count"`
}

// IngestionJobStatus represents the status of an ingestion job
type IngestionJobStatus struct {
	IngestionJobID  string      `json:"ingestionJobId"`
	Status          string      `json:"status"`
	StartedAt       time.Time   `json:"startedAt"`
	UpdatedAt       time.Time   `json:"updatedAt"`
	Statistics      string      `json:"statistics"`
	FailureReasons  []string    `json:"failureReasons"`
	RawResponse     interface{} `json:"rawResponse,omitempty"`
}

// HealthIssue represents an issue with a service
type HealthIssue struct {
	Component string `json:"component"`
	Status    string `json:"status"`
	Message   string `json:"message"`
}

// HealthDetails contains details about the health of the service
type HealthDetails struct {
	Region            string `json:"region"`
	AgentID           string `json:"agentId"`
	AgentAliasID      string `json:"agentAliasId"`
	AgentName         string `json:"agentName,omitempty"`
	KnowledgeBaseName string `json:"knowledgeBaseName,omitempty"`
}

// HealthStatus represents the overall health status of the service
type HealthStatus struct {
	Healthy bool          `json:"healthy"`
	Issues  []HealthIssue `json:"issues"`
	Details HealthDetails `json:"details,omitempty"`
}

// MonitorIngestionJobStatus represents the status of monitoring an ingestion job
type MonitorIngestionJobStatus struct {
	Success            bool        `json:"success"`
	KnowledgeBaseID    string      `json:"knowledgeBaseId"`
	DataSourceID       string      `json:"dataSourceId"`
	IngestionJobID     string      `json:"ingestionJobId"`
	JobStatus          string      `json:"jobStatus"`
	InitialKBTimestamp time.Time   `json:"initialKBTimestamp"`
	FinalKBTimestamp   time.Time   `json:"finalKBTimestamp"`
	KBUpdated          bool        `json:"kbUpdated"`
	AgentStatus        AgentStatus `json:"agentStatus"`
	AgentReady         bool        `json:"agentReady"`
	Message            string      `json:"message"`
}
