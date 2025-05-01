import { logInfo } from '../utils/logging.js';
import { handleError, addReaction, sendSlackMessage } from '../utils/slack.js';
import { attachmentHandler } from '../utils/file.js';
import { handleTracebackFlag } from '../utils/slack.js';
import { invokeBedrockAgent } from '../services/bedrock.js';

// Helper function for processing messages
async function processMessage({ message, client, say, logger, text, thread = null }) {
  // Add thinking reaction
  addReaction({
    client,
    channel: message.channel,
    timestamp: message.ts,
    name: 'thinking_face',
    logger
  });

  // Check for traceback flag
  const { includeTraceback, inputText } = handleTracebackFlag(text);

  // Retrieve any file attachments
  const fileAttachments = await attachmentHandler({message, logger});

  // Get response from Bedrock with any attachments
  await sendAgentRequest({
    logger,
    say,
    client,
    channel: message.channel,
    timestamp: message.ts,
    thread,
    inputText,
    attachments: fileAttachments,
    includeTraceback
  });
}

// Helper function for sending agent requests
async function sendAgentRequest({client, channel, timestamp, inputText, say, attachments, thread, logger, includeTraceback = false}) {
  const hasAttachments = attachments && attachments.length > 0;

  // Get response from Bedrock
  const response = await invokeBedrockAgent({
    inputText: `${inputText}${hasAttachments ? ' use these files when generating your answer' : ''}`,
    attachments: hasAttachments ? attachments : null,
    sessionId: thread || timestamp,
    includeTraceback
  });

  // Check if the response is an error
  if (response?.error) {
    // Handle Bedrock agent invocation error
    addReaction({client, channel, timestamp, name: 'x', logger});
    sendSlackMessage({
      say,
      thread_ts: timestamp,
      text: `Error invoking Bedrock agent: ${response.error}`,
      logger
    });
    return;
  }

  // Post the successful response in thread
  addReaction({client, channel, timestamp, name: 'white_check_mark', logger});
  sendSlackMessage({say, thread_ts: timestamp, text: response, logger});
}

// Handle app mentions
export function handleAppMention({ event, client, say, logger }) {
  try {
    logInfo(logger, `Processing app mention: ${event.text}`);

    // Extract text without the mention
    const mentionPattern = /<@[^>]+>/;
    const mentionMatch = event.text.match(mentionPattern);
    const textAfterMention = event.text.slice(mentionMatch.index + mentionMatch[0].length).trim();

    return processMessage({
      message: event,
      client,
      say,
      logger,
      text: textAfterMention,
      thread: event.thread_ts || null
    });
  } catch (error) {
    return handleError({
      error,
      client,
      channel: event.channel,
      timestamp: event.ts,
      say,
      logger,
      messageId: event.client_msg_id
    });
  }
}

// Handle direct messages
export function handleDirectMessage({ message, client, say, logger }) {
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

    logInfo(logger, `Processing direct message: ${message.text}`);

    return processMessage({
      message,
      client,
      say,
      logger,
      text: message.text,
      thread: message.thread_ts || null
    });
  } catch (error) {
    return handleError({
      error,
      client,
      channel: message.channel,
      timestamp: message.ts,
      say,
      logger,
      messageId: message.client_msg_id
    });
  }
}

// Handle thread messages with "Hey Ragbot" in channels (not DMs)
export function handleThreadMessage({ message, client, say, logger }) {
  try {
    if (!message.thread_ts ||
      message.channel_type === 'im' ||
      !message.text ||
      !message.text.toLowerCase().trim().startsWith("hey ragbot") ||
      message.bot_id ||
      message.subtype) {
      return;
    }

    logInfo(logger, `Processing thread message: ${message.text}`);

    // Extract text after "Hey Ragbot"
    const textAfterHeyRagbot = message.text.slice(message.text.toLowerCase().indexOf("hey ragbot") + "hey ragbot".length).trim();

    return processMessage({
      message,
      client,
      say,
      logger,
      text: textAfterHeyRagbot,
      thread: message.thread_ts
    });
  } catch (error) {
    return handleError({
      error,
      client,
      channel: message.channel,
      timestamp: message.ts,
      say,
      logger,
      messageId: message.client_msg_id
    });
  }
}
