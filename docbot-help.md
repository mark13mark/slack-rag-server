# Ragbot Help

Ragbot is a Slack bot that helps you interact with your knowledge base and get answers to your questions.

## Getting Started

1. To ask questions, mention @Ragbot in a channel or DM
2. For administrative tasks, use the slash commands listed above
3. For detailed debugging information, use the `--traceback` flag right after mentioning @Ragbot
4. Ragbot will respond with the answer or perform the requested action

## Usage

- `@Ragbot <your question>` - To ask the bot a question in a channel
- Reply to a message with `Hey Ragbot <your question>` - making sure to have "Hey Ragbot" at the beginning of the message to ask a question in a thread
- Send a direct message to Ragbot with `<your question>` - To ask a question in DMs
- Reply to a message in a DM thread with `<your question>` - To ask a question in a DM thread



## Special Flags

- `@Ragbot --traceback <your question>` - Get detailed traceback information along with the answer to your question

## Slash Commands

- `/ragbot-help` - Show this help message
- `/ragbot-kb-status` - Check the status of the knowledge base
- `/ragbot-sync-datasource` - Trigger a sync of the knowledge base
- `/ragbot-list-datasources` - List all available data sources
- `/ragbot-ds-config` - Get configuration for the data source
- `/ragbot-get-datasource` - Get information about the current data source
- `/ragbot-agent-status` - Check the status of the agent
- `/ragbot-job-status <job_id>` - Check the status of an ingestion job
- `/ragbot-health-check` - Check overall health of the Bedrock agent service


## Features

- Ask questions about your documentation by mentioning @Ragbot
- Check the status of your knowledge base and data sources
- Trigger syncs of your knowledge base and agents
- View configuration and metadata for data sources
- Monitor ingestion job status
- Get detailed traceback information for debugging

## File Uploads

You can upload files to be processed and added to the knowledge base. Supported file types include:
- PDF (.pdf)
- Word documents (.docx)
- Excel spreadsheets (.xlsx)
- CSV files (.csv)
- Text files (.txt)
- JSON files (.json)
- Images (.png, .jpg, .jpeg)

Simply attach a file along with the message being sent to Ragbot and it will be processed automatically.

## Troubleshooting

If you encounter any issues:
1. Check the knowledge base status using `ragbot-kb-status`
2. Try triggering a sync using `ragbot-sync-datasource`
3. For debugging, use the `--traceback` flag to get detailed information
