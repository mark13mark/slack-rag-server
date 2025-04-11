import pkg from '@slack/bolt';
import fs from 'fs/promises';
import path from 'path';
const { App, ExpressReceiver, LogLevel } = pkg;
import express from 'express';
import { invokeBedrockAgent, getDataSourceMetadata, syncDataSource, getKnowledgeBaseStatus, getDataSourceConfig, getAgentStatus, listDataSources, getIngestionJobStatus } from './bedrock.js';

// Helper function to determine file type based on extension
function getFileType(fileName) {
  const extension = fileName.split('.').pop().toLowerCase();
  const mimeTypes = {
    'js': 'application/javascript',
    'pdf': 'application/pdf',
    'txt': 'text/plain',
    'csv': 'text/csv',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };

  return mimeTypes[extension] || 'application/octet-stream';
}

// Create a custom ExpressReceiver
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  processBeforeResponse: false,
  customRoutes: [
    {
      path: '/health-check',
      method: ['GET'],
      handler: (req, res) => {
        res.writeHead(200);
        res.end('Health check passed');
      },
    },
  ],
});

// Initialize the app with the receiver
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
  // logLevel: LogLevel.DEBUG, // Uncomment for debugging
});

async function attachmentHandler({message, logger}) {
  // Check for file attachments
  let attachments = [];
  if (!message.files || message.files.length === 0) {
    return attachments;
  }

  logger.info(`Message has ${message.files.length} attachments`);

  // Process each file (limit to first file for simplicity)
  const file = message.files[0];

  try {
    // Download the file content
    const fileResponse = await fetch(file.url_private, {
      headers: {
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`
      }
    });

    if (!fileResponse.ok) {
      throw new Error(`Failed to download file: ${fileResponse.status}`);
    }

    // Get file as buffer
    const fileBuffer = await fileResponse.arrayBuffer();

    // Convert to base64
    const base64File = Buffer.from(fileBuffer).toString('base64');

    // Add to attachments
    attachments.push({
      name: file.name,
      data: base64File,
      mediaType: file.mimetype || getFileType(file.name)
    });

    logger.info(`Successfully processed file: ${file.name}`);
  } catch (fileError) {
    logger.error(`Error processing file attachment: ${fileError}`);
  }

  return attachments;
}

async function sendAgentRequest({client, channel, timestamp, inputText, say, attachments, thread, logger, includeTraceback = false}) {
  const hasAttachments = attachments && attachments.length > 0;

  try {
    // Get response from Bedrock
    const response = await invokeBedrockAgent({
      inputText: `${inputText}${hasAttachments ? ' use these files when generating your answer' : ''}`,
      attachments: hasAttachments ? attachments : null,
      sessionId: thread || timestamp,
      includeTraceback
    });

    // Post the response in thread
    addReaction({client, channel, timestamp, name: 'white_check_mark', logger});
    sendSlackMessage({say, thread_ts: timestamp, text: response});
  } catch (error) {
    // Handle Bedrock agent invocation error
    addReaction({client, channel, timestamp, name: 'x', logger});
    sendSlackMessage({say, thread_ts: timestamp, text: `Error invoking Bedrock agent: ${error}`});
  }
}

function addReaction({client, channel, timestamp, name, logger}) {
  try {
    client.reactions.add({
      channel,
      timestamp,
      name
    });
  } catch (error) {
    if (error.data?.error !== 'already_reacted') {
      logger.error(`Error adding ${name} reaction: ${error}`);
    }
  }
}

function sendSlackMessage({say, thread_ts, text}) {
  try {
    say({
      text,
      thread_ts,
      blocks: [{
        type: "section",
        text: {
          type: "mrkdwn",
          text
        }
      }]
    });
  } catch (error) {
    logger.error(`Error sending Slack message: ${error}`);
  }
}

// Handle app mentions
app.event('app_mention', async ({ event, client, say, logger }) => {
  try {
    logger.info(`Processing app mention: ${event.text}`);

    // Add thinking reaction
    addReaction({
      client,
      channel: event.channel,
      timestamp: event.ts,
      name: 'thinking_face',
      logger
    });

    // Extract text without the mention and check for traceback flag
    const mentionPattern = /<@[^>]+>/;
    const mentionMatch = event.text.match(mentionPattern);
    const textAfterMention = event.text.slice(mentionMatch.index + mentionMatch[0].length).trim();

    // Check if the first word after mention is --traceback
    const words = textAfterMention.split(/\s+/);
    const includeTraceback = words[0] === '--traceback';

    // Remove the flag if present and get the actual input text
    const inputText = includeTraceback ? words.slice(1).join(' ') : textAfterMention;

    // Retrieve any file attachments
    const fileAttachments = await attachmentHandler({message: event, logger});

    // Process the regular request
    await sendAgentRequest({
      client,
      channel: event.channel,
      timestamp: event.ts,
      thread: event.thread_ts || null,
      inputText,
      say,
      logger,
      attachments: fileAttachments,
      includeTraceback
    });
  } catch (error) {
    logger.error(`Error handling app mention: ${error}`);
    addReaction({client, channel: event.channel, timestamp: event.ts, name: 'x', logger});
    sendSlackMessage({
      say,
      thread_ts: event.ts,
      text: `Error handling app mention: ${error}${event.client_msg_id ? `, message_id: ${event.client_msg_id}` : ''}`
    });
  }
});

// Handle direct messages
app.message(async ({ message, client, say, logger }) => {
  try {
    // Handles case if message is a direct message or a thread in a direct message
    const isDM = message.channel_type === 'im';
    const isThreadInDM = message.thread_ts && message.channel_type === 'im';

    // Skip if not a relevant message
    if ((!isDM && !isThreadInDM) ||
        message.bot_id ||
        (message.subtype && message.subtype !== 'file_share')) {
      return;
    }

    logger.info(`Processing direct message: ${message.text}`);

    // Add thinking reaction
    addReaction({
      client,
      channel: message.channel,
      timestamp: message.ts,
      name: 'thinking_face',
      logger
    });

    // Check for traceback flag
    const words = message.text.trim().split(/\s+/);
    const includeTraceback = words[0] === '--traceback';
    const inputText = includeTraceback ? words.slice(1).join(' ') : message.text;

    // Retrieve any file attachments
    const fileAttachments = await attachmentHandler({message, logger});

    // Get response from Bedrock with any attachments
    await sendAgentRequest({
      logger,
      say,
      client,
      channel: message.channel,
      timestamp: message.ts,
      thread: message.thread_ts || null,
      inputText,
      attachments: fileAttachments,
      includeTraceback
    });
  } catch (error) {
    logger.error(`Error handling direct message: ${error}`);
    addReaction({client, channel: message.channel, timestamp: message.ts, name: 'x', logger});
    sendSlackMessage({
      say,
      thread_ts: message.ts,
      text: `Error handling direct message: ${error}${message.client_msg_id ? `, message_id: ${message.client_msg_id}` : ''}`
    });
  }
});

// Handle thread messages with "Hey Docbot" in channels (not DMs)
app.message(async ({ message, client, say, logger }) => {
  try {
    if (!message.thread_ts ||
      message.channel_type === 'im' ||
      !message.text ||
      !message.text.toLowerCase().trim().startsWith("hey docbot") ||
      message.bot_id ||
      message.subtype) {
      return;
    }

    logger.info(`Processing thread message: ${message.text}`);

    // Add thinking reaction
    addReaction({
      client,
      channel: message.channel,
      timestamp: message.ts,
      name: 'thinking_face',
      logger
    });

    // Extract text after "Hey Docbot" and check for traceback flag
    const textAfterHeyDocbot = message.text.slice(message.text.toLowerCase().indexOf("hey docbot") + "hey docbot".length).trim();
    const words = textAfterHeyDocbot.split(/\s+/);
    const includeTraceback = words[0] === '--traceback';
    const inputText = includeTraceback ? words.slice(1).join(' ') : textAfterHeyDocbot;

    // Retrieve any file attachments
    const fileAttachments = await attachmentHandler({message, logger});

    // Get response from Bedrock with any attachments
    await sendAgentRequest({
      logger,
      say,
      client,
      channel: message.channel,
      timestamp: message.ts,
      thread: message.thread_ts || null,
      inputText,
      attachments: fileAttachments,
      includeTraceback
    });
  } catch (error) {
    logger.error(`Error handling thread message: ${error}`);
    addReaction({client, channel: message.channel, timestamp: message.ts, name: 'x', logger});
    sendSlackMessage({
      say,
      thread_ts: message.ts,
      text: `Error handling thread message: ${error}${message.client_msg_id ? `, message_id: ${message.client_msg_id}` : ''}`
    });
  }
});

// Slash command for data source info
app.command('/docbot-get-datasource', async ({ command, ack, respond, logger }) => {
  await ack();

  try {
    logger.info(`Processing get-datasource command from ${command.user_id}`);
    const responseData = await getDataSourceMetadata();
    await respond(responseData);
  } catch (error) {
    logger.error(`Error handling get-datasource command: ${error}`);
    await respond({
      text: 'Error retrieving data source information',
      response_type: 'ephemeral'
    });
  }
});

// Slash command to sync data source
app.command('/docbot-sync-datasource', async ({ command, ack, respond, logger }) => {
  await ack();

  try {
    logger.info(`Processing sync-datasource command from ${command.user_id}`);

    await respond({
      text: 'Starting knowledge base sync...',
      response_type: 'ephemeral'
    });

    const result = await syncDataSource();

    await respond({
      text: `Knowledge base sync completed: ${result}`,
      response_type: 'in_channel'
    });
  } catch (error) {
    logger.error(`Error handling sync-datasource command: ${error}`);
    await respond({
      text: 'Error syncing knowledge base',
      response_type: 'ephemeral'
    });
  }
});

// Slash command for usage text
app.command('/docbot-help', async ({ command, ack, respond, logger }) => {
  await ack();

  try {
    // Read the markdown file
    const helpFilePath = path.join(process.cwd(), 'docbot-help.md');
    const helpContent = await fs.readFile(helpFilePath, 'utf8');

    // Send the help content as a response
    await respond({
      text: helpContent, // Fallback text
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: helpContent
          }
        }
      ]
    });
  } catch (error) {
    logger.error(`Error handling /docbot-help command: ${error}`);
    await respond({
      text: "Sorry, I couldn't load the help documentation. Please try again later.",
      response_type: 'ephemeral'
    });
  }
});

// Slash command for knowledge base status
app.command('/docbot-kb-status', async ({ command, ack, respond, logger }) => {
  await ack();

  try {
    logger.info(`Processing kb-status command from ${command.user_id}`);
    const status = await getKnowledgeBaseStatus();
    await respond({
      text: `Knowledge Base Status:\n${JSON.stringify(status, null, 2)}`,
      response_type: 'ephemeral'
    });
  } catch (error) {
    logger.error(`Error handling kb-status command: ${error}`);
    await respond({
      text: 'Error retrieving knowledge base status',
      response_type: 'ephemeral'
    });
  }
});

// Slash command for data source configuration
app.command('/docbot-ds-config', async ({ command, ack, respond, logger }) => {
  await ack();

  try {
    logger.info(`Processing ds-config command from ${command.user_id}`);
    const config = await getDataSourceConfig();
    await respond({
      text: `Data Source Configuration:\n${JSON.stringify(config, null, 2)}`,
      response_type: 'ephemeral'
    });
  } catch (error) {
    logger.error(`Error handling ds-config command: ${error}`);
    await respond({
      text: 'Error retrieving data source configuration',
      response_type: 'ephemeral'
    });
  }
});

// Slash command for agent status
app.command('/docbot-agent-status', async ({ command, ack, respond, logger }) => {
  await ack();

  try {
    logger.info(`Processing agent-status command from ${command.user_id}`);
    const status = await getAgentStatus();
    await respond({
      text: `Agent Status:\n${JSON.stringify(status, null, 2)}`,
      response_type: 'ephemeral'
    });
  } catch (error) {
    logger.error(`Error handling agent-status command: ${error}`);
    await respond({
      text: 'Error retrieving agent status',
      response_type: 'ephemeral'
    });
  }
});

// Slash command to list data sources
app.command('/docbot-list-datasources', async ({ command, ack, respond, logger }) => {
  await ack();

  try {
    logger.info(`Processing list-datasources command from ${command.user_id}`);
    const dataSources = await listDataSources();
    await respond({
      text: `Available Data Sources:\n${JSON.stringify(dataSources, null, 2)}`,
      response_type: 'ephemeral'
    });
  } catch (error) {
    logger.error(`Error handling list-datasources command: ${error}`);
    await respond({
      text: 'Error listing data sources',
      response_type: 'ephemeral'
    });
  }
});

// Slash command to check ingestion job status
app.command('/docbot-job-status', async ({ command, ack, respond, logger }) => {
  await ack();

  try {
    logger.info(`Processing job-status command from ${command.user_id}`);
    const jobId = command.text.trim();
    if (!jobId) {
      await respond({
        text: 'Please provide a job ID. Usage: /docbot-job-status <job_id>',
        response_type: 'ephemeral'
      });
      return;
    }

    const status = await getIngestionJobStatus(jobId);
    await respond({
      text: `Ingestion Job Status:\n${JSON.stringify(status, null, 2)}`,
      response_type: 'ephemeral'
    });
  } catch (error) {
    logger.error(`Error handling job-status command: ${error}`);
    await respond({
      text: 'Error retrieving ingestion job status',
      response_type: 'ephemeral'
    });
  }
});

// Set up Express app
const expressApp = receiver.app;
expressApp.use(express.json());
expressApp.use(express.urlencoded({ extended: true }));

expressApp.get('/', (req, res) => {
  res.send('Slack Bot is running!');
});

// Start the server
(async () => {
  const port = process.env.PORT || 8081;
  await app.start(port);
  console.log(`⚡️ Slack bot is running on port ${port}`);
})();

export default app;
