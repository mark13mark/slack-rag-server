# AWS Bedrock Slack RAG Server (Go Implementation)

This is a Go implementation of the AWS Bedrock Slack RAG Server that integrates with Slack to provide a conversational interface to AWS Bedrock Agents.

## Features

- Handles Slack message events (mentions, direct messages, thread messages)
- Processes Slack slash commands for various Bedrock agent operations
- Invokes AWS Bedrock agents with conversational inputs
- Manages knowledge base operations (status, sync, etc.)
- Monitors ingestion jobs and knowledge base updates

## Setup

### Prerequisites

- Go 1.20 or higher
- AWS account with Bedrock access
- Slack workspace with Bot and App permissions
- Public endpoint URL for your server (for Slack events)

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret

# AWS Bedrock Configuration
AWS_BEDROCK_REGION=us-east-1
AWS_BEDROCK_AGENT_ID=your-agent-id
AWS_BEDROCK_AGENT_ALIAS_ID=your-agent-alias-id
AWS_BEDROCK_KNOWLEDGE_BASE_ID=your-knowledge-base-id
AWS_BEDROCK_DATA_SOURCE_ID=your-data-source-id

# Optional AWS Configuration
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Server Configuration
PORT=8083
```

### Building and Running

1. Install dependencies:
   ```
   go mod download
   ```

2. Build the application:
   ```
   go build
   ```

3. Run the application:
   ```
   go run main.go
   ```

## Slack Integration

### Event Subscription Setup

1. Go to your Slack App configuration page.
2. Navigate to "Event Subscriptions" and enable events.
3. Set the Request URL to `https://your-server.com/slack/events`.
4. Subscribe to bot events:
   - `message.im`
   - `app_mention`
   - `message.channels`
5. Save your changes.

### Slash Commands Setup

Set up the following slash commands in your Slack App configuration:

1. Go to "Slash Commands" and create commands:
   - Command: `/ragbot-help`
     - Request URL: `https://your-server.com/slack/commands`
   - Command: `/ragbot-kb-status`
     - Request URL: `https://your-server.com/slack/commands`
   - Command: `/ragbot-sync-datasource`
     - Request URL: `https://your-server.com/slack/commands`
   - Command: `/ragbot-list-datasources`
     - Request URL: `https://your-server.com/slack/commands`
   - Command: `/ragbot-ds-config`
     - Request URL: `https://your-server.com/slack/commands`
   - Command: `/ragbot-get-datasource`
     - Request URL: `https://your-server.com/slack/commands`
   - Command: `/ragbot-agent-status`
     - Request URL: `https://your-server.com/slack/commands`
   - Command: `/ragbot-job-status`
     - Request URL: `https://your-server.com/slack/commands`
   - Command: `/ragbot-health-check`
     - Request URL: `https://your-server.com/slack/commands`

### Required Bot Scopes

Ensure your bot has the following OAuth scopes:
- `app_mentions:read`
- `chat:write`
- `commands`
- `files:read`
- `im:history`
- `im:read`
- `im:write`
- `reactions:write`

### Message Handling

The bot responds to:

- Direct mentions in regular channels: `@RagBot how do I ...`
- Direct messages sent directly to the bot
- Thread replies: Messages in threads that start with "Hey Ragbot" (threads in the Bot's direct message channel does not need the 'Hey Ragbot' leading a sentence)

## Architecture

- `main.go` - Entry point and HTTP event handling
- `handlers/` - Slack event and command handlers
- `services/` - AWS Bedrock service integration
- `utils/` - Utility functions for logging, file handling, etc.
