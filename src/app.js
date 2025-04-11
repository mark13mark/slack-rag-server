import pkg from '@slack/bolt';
const { App, ExpressReceiver, LogLevel } = pkg;

import { handleAppMention, handleDirectMessage, handleThreadMessage } from './handlers/message.js';
import {
  handleGetDataSource,
  handleSyncDataSource,
  handleHelp,
  handleKbStatus,
  handleDsConfig,
  handleAgentStatus,
  handleListDataSources,
  handleJobStatus
} from './handlers/command.js';

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

// Register event handlers
app.event('app_mention', handleAppMention);
app.message(handleDirectMessage);
app.message(handleThreadMessage);

// Register command handlers
app.command('/docbot-get-datasource', handleGetDataSource);
app.command('/docbot-sync-datasource', handleSyncDataSource);
app.command('/docbot-help', handleHelp);
app.command('/docbot-kb-status', handleKbStatus);
app.command('/docbot-ds-config', handleDsConfig);
app.command('/docbot-agent-status', handleAgentStatus);
app.command('/docbot-list-datasources', handleListDataSources);
app.command('/docbot-job-status', handleJobStatus);

// Start the app
(async () => {
  await app.start(process.env.PORT || 8082);
  console.log('⚡️ DocBot is running!');
})();
