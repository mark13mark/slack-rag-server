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
  handleJobStatus,
  handleHealthCheck
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

// Register slash commands
app.command('/ragbot-get-datasource', handleGetDataSource);
app.command('/ragbot-sync-datasource', handleSyncDataSource);
app.command('/ragbot-help', handleHelp);
app.command('/ragbot-kb-status', handleKbStatus);
app.command('/ragbot-ds-config', handleDsConfig);
app.command('/ragbot-agent-status', handleAgentStatus);
app.command('/ragbot-list-datasources', handleListDataSources);
app.command('/ragbot-job-status', handleJobStatus);
app.command('/ragbot-health-check', handleHealthCheck);

// Start the app
(async () => {
  await app.start(process.env.PORT || 8082);
  console.log('⚡️ RagBot is running!');
})();
