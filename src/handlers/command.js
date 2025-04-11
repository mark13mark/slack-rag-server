import { logInfo, logError } from '../utils/logging.js';
import { handleError, sendSlackMessage, checkUserRole } from '../utils/slack.js';
import {
  getDataSourceMetadata,
  syncDataSource,
  getKnowledgeBaseStatus,
  getDataSourceConfig,
  getAgentStatus,
  listDataSources,
  getIngestionJobStatus
} from '../services/bedrock.js';

// Handle /docbot-get-datasource command
export async function handleGetDataSource({ command, ack, respond, logger }) {
  try {
    await ack();
    logInfo(logger, `Processing /docbot-get-datasource command`);

    const metadata = await getDataSourceMetadata();
    await respond({
      text: `Current data source: ${metadata.name}\nStatus: ${metadata.status}\nLast sync: ${metadata.lastSyncTime}`
    });
  } catch (error) {
    logError(logger, error, 'Error in /docbot-get-datasource');
    await respond({
      text: `Error getting data source information: ${error}`
    });
  }
}

// Handle /docbot-sync-datasource command
export async function handleSyncDataSource({ command, ack, respond, client, logger }) {
  try {
    await ack();
    logInfo(logger, `Processing /docbot-sync-datasource command from user ${command.user_id}`);

    // Check if user has the required role
    // const hasRequiredRole = await checkUserRole({
    //   client,
    //   userId: command.user_id,
    //   requiredRole: 'aws-bot-maintainer'
    // });

    // if (!hasRequiredRole) {
    //   await respond({
    //     text: 'Sorry, you do not have permission to use this command. Only users with the aws-bot-maintainer role can sync the data source.'
    //   });
    //   return;
    // }

    const result = await syncDataSource();
    await respond({
      text: `Sync initiated: ${result.message}\nJob ID: ${result.jobId}`
    });
  } catch (error) {
    logError(logger, error, 'Error in /docbot-sync-datasource');
    await respond({
      text: `Error syncing data source: ${error}`
    });
  }
}

// Handle /docbot-help command
export async function handleHelp({ command, ack, respond, logger }) {
  try {
    await ack();
    logInfo(logger, `Processing /docbot-help command`);

    const helpText = `Available commands:
    /docbot-help - Show this help message
    /docbot-kb-status - Check the status of the knowledge base
    /docbot-sync-datasource - Trigger a sync of the knowledge base
    /docbot-list-datasources - List all available data sources
    /docbot-ds-config - Get configuration for the data source
    /docbot-get-datasource - Get information about the current data source
    /docbot-agent-status - Check the status of the agent
    /docbot-job-status <job_id> - Check the status of an ingestion job`;

    await respond({
      text: helpText
    });
  } catch (error) {
    logError(logger, error, 'Error in /docbot-help');
    await respond({
      text: `Error displaying help: ${error}`
    });
  }
}

// Handle /docbot-kb-status command
export async function handleKbStatus({ command, ack, respond, logger }) {
  try {
    await ack();
    logInfo(logger, `Processing /docbot-kb-status command`);

    const status = await getKnowledgeBaseStatus();
    await respond({
      text: `Knowledge Base Status:\n${JSON.stringify(status, null, 2)}`
    });
  } catch (error) {
    logError(logger, error, 'Error in /docbot-kb-status');
    await respond({
      text: `Error getting knowledge base status: ${error}`
    });
  }
}

// Handle /docbot-ds-config command
export async function handleDsConfig({ command, ack, respond, logger }) {
  try {
    await ack();
    logInfo(logger, `Processing /docbot-ds-config command`);

    const config = await getDataSourceConfig();
    await respond({
      text: `Data Source Configuration:\n${JSON.stringify(config, null, 2)}`
    });
  } catch (error) {
    logError(logger, error, 'Error in /docbot-ds-config');
    await respond({
      text: `Error getting data source configuration: ${error}`
    });
  }
}

// Handle /docbot-agent-status command
export async function handleAgentStatus({ command, ack, respond, logger }) {
  try {
    await ack();
    logInfo(logger, `Processing /docbot-agent-status command`);

    const status = await getAgentStatus();
    await respond({
      text: `Agent Status:\n${JSON.stringify(status, null, 2)}`
    });
  } catch (error) {
    logError(logger, error, 'Error in /docbot-agent-status');
    await respond({
      text: `Error getting agent status: ${error}`
    });
  }
}

// Handle /docbot-list-datasources command
export async function handleListDataSources({ command, ack, respond, logger }) {
  try {
    await ack();
    logInfo(logger, `Processing /docbot-list-datasources command`);

    const dataSources = await listDataSources();
    const dataSourceList = dataSources.map(ds => `- ${ds.name} (${ds.id})`).join('\n');
    await respond({
      text: `Available Data Sources:\n${dataSourceList}`
    });
  } catch (error) {
    logError(logger, error, 'Error in /docbot-list-datasources');
    await respond({
      text: `Error listing data sources: ${error}`
    });
  }
}

// Handle /docbot-job-status command
export async function handleJobStatus({ command, ack, respond, logger }) {
  try {
    await ack();
    logInfo(logger, `Processing /docbot-job-status command`);

    const jobId = command.text.trim();
    if (!jobId) {
      await respond({
        text: 'Please provide a job ID. Usage: /docbot-job-status <job_id>'
      });
      return;
    }

    const status = await getIngestionJobStatus(jobId);
    await respond({
      text: `Job Status:\n${JSON.stringify(status, null, 2)}`
    });
  } catch (error) {
    logError(logger, error, 'Error in /docbot-job-status');
    await respond({
      text: `Error getting job status: ${error}`
    });
  }
}
