import pkg from '@slack/bolt';
import fs from 'fs/promises';
import path from 'path';
const { App, ExpressReceiver, LogLevel } = pkg;
import express from 'express';
import { invokeBedrockAgent, getDataSourceMetadata, syncDataSource } from './bedrock.js';
import chalk from 'chalk'; // Add this package for colored logging

// Create a colored logger
const createColoredLogger = (logger) => {
  return {
    info: (message) => logger.info(chalk.green(message)),
    warn: (message) => logger.warn(chalk.yellow(message)),
    error: (message) => logger.error(chalk.red(message)),
    debug: (message) => logger.debug(chalk.blue(message)),
    // Custom log types
    mention: (message) => logger.info(chalk.magenta(`[MENTION] ${message}`)),
    dm: (message) => logger.info(chalk.cyan(`[DM] ${message}`)),
    thread: (message) => logger.info(chalk.yellow(`[THREAD] ${message}`))
  };
};

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

async function sendAgentRequest({client, channel, timestamp, inputText, say, attachments, thread, logger}) {
  const hasAttachments = attachments && attachments.length > 0;

  try {
    // Get response from Bedrock
    const response = await invokeBedrockAgent({
      inputText: `${inputText}${hasAttachments ? ' use these files when generating your answer' : ''}`,
      attachments: hasAttachments ? attachments : null,
      sessionId: thread || timestamp,
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
  const log = createColoredLogger(logger);

  try {
    log.mention(`Processing app mention: ${event.text}`);

    // Add thinking reaction
    addReaction({
      client,
      channel: event.channel,
      timestamp: event.ts,
      name: 'thinking_face',
      logger: log
    });

    // Extract text without the mention
    const inputText = event.text.replace(/<@[^>]+>/g, '').trim();

    // Retrieve any file attachments
    const fileAttachments = await attachmentHandler({message: event, logger: log});

    // Start processing the request to send to the Bedrock Agent
    await sendAgentRequest({
      client,
      channel: event.channel,
      timestamp: event.ts,
      thread: event.thread_ts || null,
      inputText,
      say,
      logger: log,
      attachments: fileAttachments
    });
  } catch (error) {
    log.error(`Error handling app mention: ${error}`);
    addReaction({client, channel: event.channel, timestamp: event.ts, name: 'x', logger: log});
    sendSlackMessage({
      say,
      thread_ts: event.ts,
      text: `Error handling app mention: ${error}${event.client_msg_id ? `, message_id: ${event.client_msg_id}` : ''}`
    });
  }
});

// Handle direct messages
app.message(async ({ message, client, say, logger }) => {
  const log = createColoredLogger(logger);

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

    log.dm(`Processing direct message: ${message.text}`);

    // Add thinking reaction
    addReaction({
      client,
      channel: message.channel,
      timestamp: message.ts,
      name: 'thinking_face',
      logger: log
    });

    // Retrieve any file attachments
    const fileAttachments = await attachmentHandler({message, logger: log});

    // Get response from Bedrock with any attachments
    await sendAgentRequest({
      logger: log,
      say,
      client,
      channel: message.channel,
      timestamp: message.ts,
      thread: message.thread_ts || null,
      inputText: message.text,
      attachments: fileAttachments
    });
  } catch (error) {
    log.error(`Error handling direct message: ${error}`);
    addReaction({client, channel: message.channel, timestamp: message.ts, name: 'x', logger: log});
    sendSlackMessage({
      say,
      thread_ts: message.ts,
      text: `Error handling direct message: ${error}${message.client_msg_id ? `, message_id: ${message.client_msg_id}` : ''}`
    });
  }
});

// Handle thread messages with "Hey Docbot" in channels (not DMs)
app.message(async ({ message, client, say, logger }) => {
  const log = createColoredLogger(logger);

  try {
    if (!message.thread_ts ||
      message.channel_type === 'im' ||
      !message.text ||
      !message.text.toLowerCase().trim().startsWith("hey docbot") ||
      message.bot_id ||
      message.subtype) {
      return;
    }

    log.thread(`Processing thread message with "Hey Docbot": ${message.text}`);

    // Add thinking reaction
    addReaction({
      client,
      channel: message.channel,
      timestamp: message.ts,
      name: 'thinking_face',
      logger: log
    });

    // Extract text without the "Hey Docbot" prefix
    const inputText = message.text.replace(/^hey\s*docbot/i, '').trim();

    // Retrieve any file attachments
    const fileAttachments = await attachmentHandler({message, logger: log});

    // Get response from Bedrock
    await sendAgentRequest({
      logger: log,
      say,
      client,
      channel: message.channel,
      timestamp: message.ts,
      thread: message.thread_ts || null,
      inputText,
      attachments: fileAttachments
    });
  } catch (error) {
    log.error(`Error handling thread message: ${error}`);
    addReaction({client, channel: message.channel, timestamp: message.ts, name: 'x', logger: log});
    sendSlackMessage({
      say,
      thread_ts: message.ts,
      text: `Error handling thread message: ${error}${message.client_msg_id ? `, message_id: ${message.client_msg_id}` : ''}`
    });
  }
});

// Slash command for data source info
app.command('/docbot-get-datasource', async ({ command, ack, respond, logger }) => {
  const log = createColoredLogger(logger);
  await ack();

  try {
    log.info(`Processing get-datasource command from ${command.user_id}`);
    const responseData = await getDataSourceMetadata();
    await respond(responseData);
  } catch (error) {
    log.error(`Error handling get-datasource command: ${error}`);
    await respond({
      text: 'Error retrieving data source information',
      response_type: 'ephemeral'
    });
  }
});

// Slash command to sync data source
app.command('/docbot-sync-datasource', async ({ command, ack, respond, logger }) => {
  const log = createColoredLogger(logger);
  await ack();

  try {
    log.info(`Processing sync-datasource command from ${command.user_id}`);

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
    log.error(`Error handling sync-datasource command: ${error}`);
    await respond({
      text: 'Error syncing knowledge base',
      response_type: 'ephemeral'
    });
  }
});

// Slash command for usage text
app.command('/docbot-help', async ({ command, ack, respond, logger }) => {
  const log = createColoredLogger(logger);
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
    log.error(`Error handling /docbot-help command: ${error}`);
    await respond({
      text: "Sorry, I couldn't load the help documentation. Please try again later.",
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
  console.log(chalk.green(`⚡️ Slack bot is running on port ${port}`));
})();

export default app;
