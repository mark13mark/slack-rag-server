import { logError } from './logging.js';

// Helper function to handle traceback flag
export function handleTracebackFlag(text) {
  const words = text.trim().split(/\s+/);
  const includeTraceback = words[0] === '--traceback';
  const inputText = includeTraceback ? words.slice(1).join(' ') : text;
  return { includeTraceback, inputText };
}

// Helper function for adding reactions
export function addReaction({client, channel, timestamp, name, logger}) {
  try {
    client.reactions.add({
      channel,
      timestamp,
      name
    });
  } catch (error) {
    if (error.data?.error !== 'already_reacted') {
      logError(logger, error, `Error adding ${name} reaction`);
    }
  }
}

// Helper function for sending messages
export function sendSlackMessage({say, thread_ts, text, logger}) {
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
    logError(logger, error, 'Error sending Slack message');
  }
}

// Helper function for error handling
export async function handleError({ error, client, channel, timestamp, say, logger, messageId = null }) {
  logError(logger, error);
  addReaction({client, channel, timestamp, name: 'x', logger});
  sendSlackMessage({
    say,
    thread_ts: timestamp,
    text: `Error: ${error}${messageId ? `, message_id: ${messageId}` : ''}`,
    logger
  });
}

// Helper function to check if user has required role
export async function checkUserRole({ client, userId, requiredRole }) {
  try {
    const result = await client.users.info({
      user: userId
    });

    if (!result.ok) {
      throw new Error('Failed to get user info');
    }

    const user = result.user;
    return user.roles?.includes(requiredRole) || false;
  } catch (error) {
    logError(logger, error, 'Error checking user role');
    return false;
  }
}
