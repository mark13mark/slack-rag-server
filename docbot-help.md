# DocBot Help

DocBot is a Slack bot that helps you interact with your knowledge base and get answers to your questions.

## Getting Started

1. To ask questions, mention @DocBot in a channel or DM
2. For administrative tasks, use the slash commands listed above
3. For detailed debugging information, use the `--traceback` flag right after mentioning @DocBot
4. DocBot will respond with the answer or perform the requested action

## Usage

- `@DocBot <your question>` - To ask the bot a question in a channel
- Reply to a message with `Hey Docbot <your question>` - making sure to have "Hey Docbot" at the beginning of the message to ask a question in a thread
- Send a direct message to DocBot with `<your question>` - To ask a question in DMs
- Reply to a message in a DM thread with `<your question>` - To ask a question in a DM thread



## Special Flags

- `@DocBot --traceback <your question>` - Get detailed traceback information along with the answer to your question

## Slash Commands

- `/docbot-help` - Show this help message
- `/docbot-kb-status` - Check the status of the knowledge base
- `/docbot-sync-datasource` - Trigger a sync of the knowledge base
- `/docbot-list-datasources` - List all available data sources
- `/docbot-ds-config` - Get configuration for the data source
- `/docbot-get-datasource` - Get information about the current data source
- `/docbot-agent-status` - Check the status of the agent
- `/docbot-job-status <job_id>` - Check the status of an ingestion job


## Features

- Ask questions about your documentation by mentioning @DocBot
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

Simply attach a file along with the message being sent to DocBot and it will be processed automatically.

## Troubleshooting

If you encounter any issues:
1. Check the knowledge base status using `/docbot-kb-status`
2. Try triggering a sync using `/docbot-sync-datasource`
3. For debugging, use the `--traceback` flag to get detailed information
